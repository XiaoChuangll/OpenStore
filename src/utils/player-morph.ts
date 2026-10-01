import { nextTick } from 'vue';

/**
 * 「迷你播放器 ↔ 播放页」的手写共享元素动画。
 *
 * 为什么不用 View Transitions：它补间的是两边的**截图**，
 * 而胶囊（540×60）和播放器卡片（640×208）差得太多，截图被拉伸到中间尺寸时
 * 必然出现变形的底图（"矩形遮罩"）；改成让补间层自绘面板，又拿不到真正的
 * backdrop-filter（毛玻璃晚一步出现），而且固定圆角对不上两端（收尾跳一下）。
 *
 * 这里改成 FLIP：事后拿到目标元素的真实位置/尺寸，克隆出一个"幽灵"，
 * 让它从源位置连续长到目标位置 —— 全程是真实 DOM 在动，模糊和圆角都是连续的。
 */

type Direction = 'toPlayer' | 'fromPlayer';
type Rect = { left: number; top: number; width: number; height: number };
export type MorphSource = { key: string; rect: Rect; radius: string };

/**
 * 整页切换是瞬时的（没用 View Transitions），源页面里那些"没有对应物"的内容
 * 会跟着页面瞬间消失。这里在导航前把它们克隆下来，导航后原地淡出，
 * 免得对面出现一块"里面空着"的面板。
 */
type LeaveGhost = { key: string; rect: Rect; node: HTMLElement; opacity: string };

/** 面板：一个不带内容的底板；其余：直接克隆目标元素本身，落位时与真身严丝合缝 */
const PAIRS = [
  { key: 'panel', bar: '.player-bar', player: '.controls' },
  { key: 'cover', bar: '.bar-cover', player: '.disc' },
  { key: 'title', bar: '.bar-name', player: '.track-name' },
  { key: 'artist', bar: '.bar-artist', player: '.track-artist' },
  { key: 'prev', bar: '.bar-actions .bar-btn:nth-child(1)', player: '.transport button:nth-of-type(1)' },
  { key: 'play', bar: '.bar-actions .bar-btn:nth-child(2)', player: '.transport button:nth-of-type(2)' },
  { key: 'next', bar: '.bar-actions .bar-btn:nth-child(3)', player: '.transport button:nth-of-type(3)' }
] as const;

/*
 * 面板比元素快：面板先迅速变成目标形状（胶囊/卡片就位），
 * 内容再飞进去落位。反过来的话，中途会长时间看到一块"里面空着"的大面板。
 */
const PANEL_MS = 260;
const ELEMENT_MS = 420;
/** 源页面里"没有对应物"的内容（卡片上的进度条/工具条等）用淡出处理，避免瞬间消失 */
const LEAVE_MS = 260;
/*
 * 与面板的 easeOutCubic（1 - (1-p)^3）等价的标准曲线，
 * 保证"面板长大的节奏"和"元素飞过去的节奏"完全一致，不会一前一后。
 */
const EASING = 'cubic-bezier(0.215, 0.61, 0.355, 1)';

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const selectorOf = (key: string, side: 'bar' | 'player') => {
  const pair = PAIRS.find((p) => p.key === key);
  return pair ? pair[side] : '';
};

/** 源页面里"没有对应物"、只能淡出收场的内容 */
const LEAVE_SELECTORS = ['.progress-row', '.extra-bar'];

export type MorphPlan = { sources: MorphSource[]; leave: LeaveGhost[] };

/** 导航前调用：把源页面各元素的位置记下来，并把要淡出的内容先克隆出来 */
export const captureMorphSources = (direction: Direction): MorphPlan => {
  const side = direction === 'toPlayer' ? 'bar' : 'player';
  const sources: MorphSource[] = [];
  for (const pair of PAIRS) {
    const el = document.querySelector(pair[side]);
    if (!el) continue;
    sources.push({ key: pair.key, rect: rectOf(el), radius: getComputedStyle(el).borderRadius });
  }

  const leave: LeaveGhost[] = [];
  for (const selector of LEAVE_SELECTORS) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) continue;
    const node = el.cloneNode(true) as HTMLElement;
    leave.push({ key: selector, rect: rectOf(el), node, opacity: getComputedStyle(el).opacity });
  }

  return { sources, leave };
};

/**
 * 导航后调用：按记录下来的位置生成幽灵并播放动画。
 * 返回的 promise 在动画结束后 resolve，此时幽灵已清理、真身已恢复。
 */
export const playMorph = async (direction: Direction, plan: MorphPlan): Promise<void> => {
  const { sources, leave } = plan;
  if (!sources.length || reducedMotion()) return;

  const targetSide = direction === 'toPlayer' ? 'player' : 'bar';
  const layer = document.querySelector('.player-view') || document.body;
  const ghosts: HTMLElement[] = [];
  const animations: Animation[] = [];
  const restore: (() => void)[] = [];
  /** 面板走的是 rAF 手写插值（要每帧读实时位置），用这个 promise 等它结束 */
  let panelDone: Promise<void> | null = null;

  // 源页面里没有对应物的内容：原地淡出，避免"瞬间消失"留下空面板
  for (const item of leave) {
    const node = item.node;
    const s = node.style;
    s.position = 'fixed';
    s.left = `${item.rect.left}px`;
    s.top = `${item.rect.top}px`;
    s.width = `${item.rect.width}px`;
    s.height = `${item.rect.height}px`;
    s.margin = '0';
    s.pointerEvents = 'none';
    s.zIndex = '85';
    s.opacity = item.opacity;
    document.body.appendChild(node);
    ghosts.push(node);
    animations.push(
      node.animate([{ opacity: item.opacity }, { opacity: 0 }], {
        duration: LEAVE_MS,
        easing: 'ease-out',
        fill: 'forwards'
      })
    );
  }

  const cleanup = () => {
    animations.forEach((a) => a.cancel());
    ghosts.forEach((g) => g.remove());
    restore.forEach((fn) => fn());
  };

  try {
    for (const source of sources) {
      const selector = selectorOf(source.key, targetSide);
      const target = selector ? (document.querySelector(selector) as HTMLElement | null) : null;
      if (!target) continue;

      const targetRect = rectOf(target);
      if (!targetRect.width || !targetRect.height) continue;

      const targetStyle = getComputedStyle(target);
      if (source.key === 'panel') {
        /*
         * 面板：用一层独立的"底板"（不带内容）来做补间。
         * 因为卡片是 640×208 的圆角矩形、胶囊是 540×60，靠缩放真身会把圆角拉变形，
         * 所以这里插值的是真实的 left/top/width/height 和 border-radius，
         * 毛玻璃也画在这一层上，全程连续。
         */
        const ghost = document.createElement('div');
        const g = ghost.style;
        g.position = 'fixed';
        /*
         * 必须显式声明 border-box：目标尺寸来自 getBoundingClientRect()（边框盒），
         * 而页面默认是 content-box，否则幽灵会"宽度 + 左右边框"多出 2px，
         * 收尾换回真身时就缩一下 —— 就是那一下"位置很接近但还是顿"。
         */
        g.boxSizing = 'border-box';
        g.left = `${source.rect.left}px`;
        g.top = `${source.rect.top}px`;
        g.width = `${source.rect.width}px`;
        g.height = `${source.rect.height}px`;
        g.margin = '0';
        g.pointerEvents = 'none';
        /*
         * 层级要分方向：
         * 进入播放页时，卡片里的按钮/进度条在 .player-layout 这个层叠上下文里，
         * 幽灵必须压在它下面，否则会把卡片内容盖住（之前就踩了这个坑）；
         * 退出回音乐页时没有这层上下文约束，幽灵要浮在页面内容之上。
         */
        g.zIndex = direction === 'toPlayer' ? '0' : '80';
        g.borderRadius = source.radius;
        g.background = targetStyle.background;
        g.backgroundColor = targetStyle.backgroundColor;
        g.border = targetStyle.border;
        g.boxShadow = targetStyle.boxShadow;
        g.backdropFilter = targetStyle.backdropFilter;
        g.setProperty('-webkit-backdrop-filter', targetStyle.backdropFilter);
        layer.appendChild(ghost);
        ghosts.push(ghost);

        // 真身只藏"底板"，卡片里的按钮等内容照常显示
        const prev = {
          backgroundColor: target.style.backgroundColor,
          borderColor: target.style.borderColor,
          boxShadow: target.style.boxShadow,
          backdropFilter: target.style.backdropFilter
        };
        target.style.backgroundColor = 'transparent';
        target.style.borderColor = 'transparent';
        target.style.boxShadow = 'none';
        target.style.backdropFilter = 'none';
        restore.push(() => {
          target.style.backgroundColor = prev.backgroundColor;
          target.style.borderColor = prev.borderColor;
          target.style.boxShadow = prev.boxShadow;
          target.style.backdropFilter = prev.backdropFilter;
        });

        /*
         * 这里刻意不用 WAAPI 的固定关键帧，而是每帧读一次目标的**实时**位置来插值。
         * 因为动画这 0.4 秒里页面布局可能变（歌词加载完、滚动条出现/消失都会让卡片平移十几像素），
         * 用开始时量到的固定终点，最后就会"啪"地跳一下对齐。
         */
        const startRect = source.rect;
        const startRadius = parseFloat(source.radius) || 0;
        const startedAt = performance.now();
        let rafId = 0;
        panelDone = new Promise<void>((resolve) => {
          const step = (now: number) => {
            const progress = Math.min((now - startedAt) / PANEL_MS, 1);
            // easeOutCubic，与元素的 cubic-bezier(0.22, 1, 0.36, 1) 观感一致
            const eased = 1 - Math.pow(1 - progress, 3);
            const live = rectOf(target);
            const liveRadius = parseFloat(getComputedStyle(target).borderRadius) || 0;
            g.left = `${startRect.left + (live.left - startRect.left) * eased}px`;
            g.top = `${startRect.top + (live.top - startRect.top) * eased}px`;
            g.width = `${startRect.width + (live.width - startRect.width) * eased}px`;
            g.height = `${startRect.height + (live.height - startRect.height) * eased}px`;
            g.borderRadius = `${startRadius + (liveRadius - startRadius) * eased}px`;
            if (progress < 1) rafId = requestAnimationFrame(step);
            else resolve();
          };
          rafId = requestAnimationFrame(step);
        });
        restore.push(() => cancelAnimationFrame(rafId));
        continue;
      }

      /*
       * 其余元素（封面、歌名、歌手、三个按钮）：直接对**真实元素**做 FLIP。
       * 不克隆、不隐藏，好处是：
       *   - 全程两边都不会"少一个按钮"；
       *   - 落位时不需要"幽灵换真身"，也就没有交接口那一下抖；
       *   - 主题色、继承样式、图片都是真身自己的，不会走样。
       */
      const prevStyle = {
        transform: target.style.transform,
        transformOrigin: target.style.transformOrigin,
        position: target.style.position,
        zIndex: target.style.zIndex,
        animationPlayState: target.style.animationPlayState
      };
      target.style.transformOrigin = 'top left';
      target.style.position = 'relative';
      target.style.zIndex = '90';
      // 唱片在自转：转场期间先停一下，免得动画结束后旋转角度对不上跳一下
      if (targetStyle.animationName !== 'none') target.style.animationPlayState = 'paused';
      restore.push(() => {
        target.style.transform = prevStyle.transform;
        target.style.transformOrigin = prevStyle.transformOrigin;
        target.style.position = prevStyle.position;
        target.style.zIndex = prevStyle.zIndex;
        target.style.animationPlayState = prevStyle.animationPlayState;
      });

      const dx = source.rect.left - targetRect.left;
      const dy = source.rect.top - targetRect.top;
      const scaleX = source.rect.width / targetRect.width;
      const scaleY = source.rect.height / targetRect.height;
      animations.push(
        target.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})` },
            { transform: 'none' }
          ],
          { duration: ELEMENT_MS, easing: EASING, fill: 'both' }
        )
      );
    }

    await Promise.all([
      ...animations.map((a) => a.finished.catch(() => undefined)),
      panelDone || Promise.resolve()
    ]);
  } finally {
    cleanup();
  }
};

/** 采集 → 导航 → 播放动画，页面切换时用这一句就够了 */
export const morphNavigate = async (
  direction: Direction,
  navigate: () => unknown | Promise<unknown>
): Promise<void> => {
  if (reducedMotion()) {
    await navigate();
    return;
  }
  const plan = captureMorphSources(direction);
  /*
   * 打个标记：播放页的 .player-layout 有一条 0.4s 的入场动画（淡入 + 上移 10px），
   * 它会让"导航刚完成时量到的位置"和最终位置差 10px，
   * 补间就会一路偏着走、最后"啪"地对齐一下。带这个标记进场的页面会跳过入场动画。
   */
  document.documentElement.classList.add('morph-running');
  await navigate();
  await nextTick();
  /*
   * 这里刻意**不等**额外一帧：
   * nextTick 之后 DOM 已经更新、但浏览器还没绘制，紧接着在同一个任务里
   * 量尺寸 → 藏真身 → 放幽灵 → 启动动画，浏览器第一次画出来时幽灵就已经在起点。
   * 如果中间插一次 rAF，会先画出一帧"终态页面"（元素都在最终位置），
   * 下一帧才被藏起来改从胶囊飞过去 —— 看起来就是"顿一下"。
   */
  /*
   * 给页面内容区补一个很轻的淡入（没有 View Transitions 帮忙做整页交叠）。
   *
   * 注意是淡 .main-content，**不能淡 #app**：给 #app 加透明度动画会让它变成
   * 一个新的层叠上下文，播放条的 z-index 2100 就被关在里面、不再和面板幽灵比较，
   * 结果整个页面（包括播放条的按钮）都被幽灵盖住，等淡入结束才突然闪回最前面。
   */
  const fadeTarget = document.querySelector('.main-content');
  if (fadeTarget) {
    fadeTarget.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  }
  try {
    await playMorph(direction, plan);
  } finally {
    document.documentElement.classList.remove('morph-running');
  }
};
