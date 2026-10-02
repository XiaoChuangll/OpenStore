/**
 * 等这一次路由导航真正完成。
 *
 * router.push() 返回 Promise，await 它就够；但 router.back() / go() 返回 void，
 * 导航是在稍后的 popstate 里完成的 —— 不等它，动画拍到的快照还是旧页面。
 * 超时兜底是为了避免万一没发生导航时调用方一直挂着。
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
