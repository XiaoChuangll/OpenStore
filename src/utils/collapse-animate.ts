import { nextTick } from 'vue';

/** 找元素所在的可滚动祖先（没有就用 window） */
const scrollContainerOf = (el: HTMLElement): HTMLElement | Window => {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const cs = getComputedStyle(node);
    if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return window;
};

/**
 * 折叠动画期间让"视角跟着走"：
 * 每帧把锚点元素相对视口的位置纠回原处，于是变高/变矮的是页面其余部分，
 * 用户盯着的那一行始终待在原地 —— 收起后不会突然跳到别的版块。
 * 锚点本来就在屏幕外时不纠（否则会莫名其妙把页面滚过去）。
 */
const keepAnchorStable = (anchor: HTMLElement, initialTop: number, durationMs: number) => {
  // 只要求锚点"在视口内或贴着边缘"：完全在屏幕外时纠了反而莫名其妙
  const slack = 40;
  if (initialTop < -slack || initialTop > window.innerHeight + slack) return;
  const container = scrollContainerOf(anchor);
  const startedAt = performance.now();

  const step = () => {
    const delta = anchor.getBoundingClientRect().top - initialTop;
    if (Math.abs(delta) > 0.5) {
      if (container === window) window.scrollBy(0, delta);
      else (container as HTMLElement).scrollTop += delta;
    }
    if (performance.now() - startedAt < durationMs) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/**
 * 折叠/展开时的高度补间。
 *
 * 折叠这类交互是"改一下状态，DOM 高度就变了"，直接切会硬跳。这里：
 *   量旧高度 → 改状态 → 等 DOM 更新 → 量新高度 → 从旧补到新 → 结束后把行内样式交还 CSS。
 * 高度是实际算出来的，所以内容多少条都能平滑收放，不依赖写死的 max-height。
 *
 * anchor 传折叠按钮：动画期间滚动位置会跟随，按钮不会从屏幕上跑掉。
 */
export const animateHeightChange = async (
  el: HTMLElement | null | undefined,
  mutate: () => void,
  anchor?: HTMLElement | null
): Promise<void> => {
  if (!el) {
    mutate();
    return;
  }

  const from = el.offsetHeight;
  const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
  mutate();
  await nextTick();
  const to = el.offsetHeight;
  // 注意别顺手把 0 也挡掉：容器收起时高度就是 0（内容 display:none），
  // 0 → N 这一下正是最需要动画的"展开"。
  if (from === to) return;

  const durationMs = 300;
  if (anchor) keepAnchorStable(anchor, anchorTop, durationMs + 80);

  el.style.overflow = 'hidden';
  /*
   * 关掉浏览器自己的 scroll anchoring。
   * 上面已经在逐帧补偿滚动位置了，如果同时让 Chrome 按"内容高度变化"自动调一次，
   * 两边各调一半 → 画面看着就是一顿一顿的（用户反馈的"跟随动效有问题"）。
   */
  el.style.overflowAnchor = 'none';
  el.style.transition = 'none';
  el.style.height = `${from}px`;
  // 读一次 layout，确保浏览器把起始高度认下来，否则下一帧的补间不会触发
  void el.offsetHeight;

  const cleanup = () => {
    el.style.transition = '';
    el.style.height = '';
    el.style.overflow = '';
    el.style.overflowAnchor = '';
    el.removeEventListener('transitionend', cleanup);
  };

  requestAnimationFrame(() => {
    el.style.transition = `height ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    el.style.height = `${to}px`;
    el.addEventListener('transitionend', cleanup);
    // 兜底：某些情况下 transitionend 不触发（元素被隐藏、动画被打断）
    window.setTimeout(cleanup, 420);
  });
};
