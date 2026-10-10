import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, type Ref } from 'vue';

/*
 * 页面级「活动状态」。
 *
 * 前台视图被 <keep-alive> 缓存（见 App.vue 的 include 白名单）：切到别的页面时组件只是
 * 失活、并不卸载，只写在 onUnmounted 里的清理不会执行 —— 页面看不见了还在按秒探测上游、占着 SSE。
 *
 * 把「现在是不是这一页」收敛成一条信号：
 *   - setup / 从缓存切回来 → true
 *   - 被挂起（切到别的页）/ 卸载 → false
 *   没被 keep-alive 包着的页面全程为 true。
 *
 * 初始值是 true：组件能 setup 说明路由正好渲染了它；带 { immediate: true } 的 watch
 * 在 setup 里就会跑，初始为 false 会把首次执行全挡掉。
 */
export function usePageActive(): Ref<boolean> {
  const active = ref(true);

  onActivated(() => {
    active.value = true;
  });
  onDeactivated(() => {
    active.value = false;
  });
  onBeforeUnmount(() => {
    active.value = false;
  });

  return active;
}

/**
 * 跟着「当前页面是否可见」自动启停的一段副作用（轮询 / SSE / 定时器）。
 *
 * start 只在页面可见时执行，stop 在切走和卸载时各兜底一次；
 * 「是否已启动」单独用一个变量记，不能拿可见状态当依据 ——
 * 可见状态的初始值就是 true，用它去重会让首次 start 直接被跳过。
 *
 * 返回值是页面活动状态本身，需要额外判断时可以直接用
 * （例如「已经切走了就不要再重连」）。
 */
export function useActiveScope(start: () => void, stop: () => void): Ref<boolean> {
  const active = ref(true);
  let running = false;

  const begin = () => {
    active.value = true;
    if (running) return;
    running = true;
    start();
  };

  const end = () => {
    active.value = false;
    if (!running) return;
    running = false;
    stop();
  };

  onMounted(begin);
  onActivated(begin);
  onDeactivated(end);
  onBeforeUnmount(end);

  return active;
}
