import { nextTick } from 'vue';

type ViewTransitionLike = { finished: Promise<void> };
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => ViewTransitionLike;
};

/**
 * 浏览器是否支持 View Transitions。
 * Chrome/Edge 111+、Safari 18+ 支持；其它浏览器下面这个函数直接跳过动画，
 * 导航行为和现在完全一致（不会报错、也不会卡住）。
 */
export const supportsViewTransition = () =>
  typeof (document as ViewTransitionDocument).startViewTransition === 'function';

/**
 * 等浏览器真正绘制出一帧（两次 rAF：第一次在绘制前，第二次在绘制后）。
 *
 * 注意必须有兜底：标签页不可见时 rAF 根本不会触发，
 * 而转场回调迟迟不返回会被浏览器判定超时并中止（TimeoutError: DOM update timed out），
 * 画面就卡在半路上。所以这里加了可见性判断 + 超时兜底，绝不阻塞。
 */
const nextPaint = (timeoutMs = 100) =>
  new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      finish();
      return;
    }
    if (typeof requestAnimationFrame !== 'function') {
      finish();
      return;
    }

    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, timeoutMs);
  });

/**
 * 带「共享元素转场」执行一次导航。
 *
 * 原理：导航前后各拍一张快照，两边的 DOM 里只要给元素起了同一个
 * `view-transition-name`（见 PlayerBar 的 .bar-cover 与 PlayerView 的 .disc），
 * 浏览器就会把旧位置/旧尺寸自动补间到新位置/新尺寸 —— 也就是音乐 App 里
 * 「小播放器展开成播放页」那种效果。
 */
export const withViewTransition = async (
  navigate: () => unknown | Promise<unknown>
): Promise<void> => {
  const start = (document as ViewTransitionDocument).startViewTransition;
  /*
   * 标签页在后台时不走转场：动画本来就看不见，
   * 而后台标签的渲染会被节流（rAF 不触发、快照也可能拍不到内容），
   * 与其冒被浏览器判定超时中止的风险，不如直接普通跳转。
   */
  if (typeof start !== 'function' || document.visibilityState === 'hidden') {
    await navigate();
    return;
  }

  // 打个标记，让新页面的入场动画在这次转场里让位（否则它会和补间动画打架）
  document.documentElement.classList.add('vt-running');
  try {
    const transition = start.call(document, async () => {
      await navigate();
      // 必须等 Vue 把新页面渲染进 DOM，浏览器才能拍到「新」快照
      await nextTick();
      /*
       * 还得多等一帧：nextTick 只保证 DOM 更新完成，不保证浏览器已经绘制。
       * 不等的话新快照可能拍到"元素还没画出来"的样子 —— 表现就是退出时
       * 封面/歌名/歌手先空一拍、补间走完才冒出来。
       */
      await nextPaint();
    });
    await transition.finished;
  } catch (error) {
    // 转场本身出问题不该影响导航（导航已经发生了），记一笔就够了
    console.warn('[view-transition] 转场失败，已忽略', error);
  } finally {
    document.documentElement.classList.remove('vt-running');
  }
};

/**
 * 等这一次路由导航真正完成。
 *
 * router.push() 返回的是 Promise，await 它就够；但 router.back() / go() 返回 void，
 * 导航是在稍后的 popstate 里完成的 —— 不等它，"新快照"就会拍到旧页面，退场动画等于没有。
 * 超时兜底是为了避免万一没有发生导航时，转场的回调一直不返回、把页面卡住。
 */
export const waitForRouteChange = (
  router: { afterEach: (callback: () => void) => () => void },
  timeoutMs = 700
): Promise<void> =>
  Promise.race([
    new Promise<void>((resolve) => {
      const stop = router.afterEach(() => {
        stop();
        resolve();
      });
    }),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    })
  ]);
