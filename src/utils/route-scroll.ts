/**
 * 判断一次导航是否「只是曲目变了」。
 *
 * 播放页和音乐页切歌时会把 ?track= 同步进地址栏，这算一次路由导航；
 * 如果照常执行「回到顶部」，用户每点一次上一首 / 下一首，页面就会被拽回顶上。
 * 所以这种情况要跳过滚动重置，而切换页面、切换 view 之类的导航仍按原样回顶部。
 */
export const onlyTrackQueryChanged = (
  to: Record<string, unknown>,
  from: Record<string, unknown>
): boolean => {
  const keys = new Set([...Object.keys(to), ...Object.keys(from)]);
  for (const key of keys) {
    if (key === 'track') continue;
    if (String(to[key] ?? '') !== String(from[key] ?? '')) return false;
  }
  return true;
};

/**
 * 子页面左上角「返回」按钮用：**优先回上一页**。
 *
 * 用 router.back() 时，上一页（比如首页）是从 keep-alive 里还原回来的，
 * 浏览器/路由也会把滚动位置恢复 —— 回到首页还是原来那一屏。
 * 而 router.push('/') 是一次全新的导航，路由的 scrollBehavior 会返回 { top: 0 }，
 * 于是「从首页进榜单页再返回」首页永远停在顶部（用户反馈的问题）。
 *
 * 只有"没有上一页"（直接打开 / 刷新进来）时才回首页。
 */
/**
 * 「这次导航是后退」的标记（存时间戳，600ms 内算数）。
 *
 * 用时间戳而不是布尔：popstate 有时会多来一次（vue-router 处理完才轮到这里），
 * 只会被 afterEach 消费一次的布尔标记就会“往后漏一拍” ——
 * 紧接着的一次 push 被误判成后退、真正的后退反而漏掉。
 * 加上时效后，多出来的那个标记会在用户下一次操作之前自动失效。
 *
 * 应用内返回按钮是确定能标上的；浏览器后退靠 popstate 尽力采一次。
 */
const BACK_FLAG_TTL_MS = 600;
let backMarkedAt = 0;
const markBackNavigation = () => {
  backMarkedAt = performance.now();
};

export const goBackOrHome = (router: { back: () => void; push: (to: string) => unknown }): void => {
  const state = window.history.state as { back?: string | null } | null;
  if (state && state.back) {
    markBackNavigation();
    router.back();
  } else {
    void router.push('/');
  }
};

/** 每个页面离开时的滚动位置（key = fullPath） */
const scrollPositions = new Map<string, number>();

/**
 * 把页面滚到指定位置。
 *
 * 要"兜"一会儿，原因有两个：
 *   1. keep-alive 还原 + 图表/图片撑高有时间差，太早滚会被文档高度限制在中间某个值；
 *   2. vue-router 自己的 scrollBehavior 会在这之后又滚一次（返回时它给的是 { top: 0 }），
 *      只滚一次会被它覆盖掉 —— 所以持续把它纠回来。
 * 用户一动滚轮/触摸/方向键就立刻停手，不跟人抢。
 */
const restoreScroll = (top: number) => {
  let stopped = false;
  const stop = () => { stopped = true; };
  window.addEventListener('wheel', stop, { once: true, passive: true });
  window.addEventListener('touchstart', stop, { once: true, passive: true });
  window.addEventListener('keydown', stop, { once: true });

  let frames = 0;
  const step = () => {
    if (stopped) return;
    window.scrollTo(0, top);
    frames += 1;
    // 约 800ms 内持续纠正；中途到达目标也再多跟几帧，防止别处紧接着又改一次
    if (frames < 8 || (Math.abs(window.scrollY - top) > 2 && frames < 50)) {
      requestAnimationFrame(step);
    } else {
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    }
  };
  requestAnimationFrame(step);
};

/**
 * 记住 / 恢复滚动位置。
 *
 * 为什么不用 vue-router 的 scrollBehavior：它把位置存在 history.state 里，
 * 实测经常取不到（返回首页时 savedPosition 是空的），页面就停在顶部。
 * 这里自己按 fullPath 记住"离开时滚到哪"，只在**浏览器后退**（popstate）时恢复 ——
 * 点链接进新页面仍然按原来的行为回到顶部。
 */
export const setupScrollMemory = (router: {
  beforeEach: (cb: (to: any, from: any) => void) => unknown;
  afterEach: (cb: (to: any) => void) => unknown;
}) => {
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      markBackNavigation();
    });
  }

  router.beforeEach((to: any, from: any) => {
    if (from?.fullPath && from.fullPath !== to?.fullPath) {
      scrollPositions.set(from.fullPath, window.scrollY);
    }
  });

  router.afterEach((to: any) => {
    const isBack = backMarkedAt > 0 && performance.now() - backMarkedAt < BACK_FLAG_TTL_MS;
    backMarkedAt = 0;
    if (!isBack) return;
    const saved = scrollPositions.get(to?.fullPath || '');
    if (saved && saved > 0) restoreScroll(saved);
  });
};
