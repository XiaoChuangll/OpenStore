/*
 * ---- 全接口性能检测 ----
 * 枚举服务端已注册的 GET 路由（跳过动态参数路由、SSE、导出、写数据的接口），
 * 用一枚短时效 token 顺序真实请求一遍，返回每个接口的耗时 / 状态 / 响应大小。
 * 顺序执行是为了让耗时接近真实单请求延迟：SQLite 是单连接，并发会互相排队。
 *
 * 这里只负责「挑出可以安全 GET 一遍的接口」，真正的请求由 index.cjs 的
 * POST /api/admin/perf-check 发起，所以 app 需要由调用方传进来。
 */
const PERF_CHECK_SKIP_PREFIXES = [
  '/api/admin/perf-check',
  '/api/admin/live',   // SSE 流，请求会一直挂着不返回
  '/api/visitors/export',
  '/api/public/track', // 会写入访问记录
  '/api/screenshot',   // 走外部服务，慢且对体检没意义
  '/api/admin/replay', // 会真的把请求重放一次
  '/api/admin/auth'
];
const PERF_CHECK_MAX_ROUTES = 80;
const PERF_CHECK_TIMEOUT_MS = 5000;
const PERF_CHECK_BUDGET_MS = 30000;

const collectPerfCheckRoutes = (app) => {
  const found = new Set();
  /*
   * Express 5 里路由栈挂在 app.router 上（旧版是 app._router）。
   * 路由拆分后，大部分接口挂在子 router 上，所以这里必须递归进子栈；
   * 子 router 一律挂到根路径（内部保留完整路径），因此前缀无需还原。
   */
  const walk = (stack) => {
    (stack || []).forEach((layer) => {
      const route = layer.route;
      if (!route) {
        const handle = layer.handle;
        if (handle && Array.isArray(handle.stack)) walk(handle.stack);
        return;
      }
      if (!route.path) return;
      if (!Object.keys(route.methods || {}).includes('get')) return;
      // Express 5 里 route.path 可能是字符串或数组（正则路由则直接跳过）
      const rawPaths = Array.isArray(route.path) ? route.path : [route.path];
      rawPaths.forEach((path) => {
        if (typeof path !== 'string') return;
        if (!path.startsWith('/api')) return;
        if (path.includes(':')) return;
        if (/stream|sse/i.test(path)) return;
        if (PERF_CHECK_SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
        found.add(path);
      });
    });
  };
  walk((app.router || app._router || {}).stack);
  return [...found].sort().slice(0, PERF_CHECK_MAX_ROUTES);
};

module.exports = { PERF_CHECK_MAX_ROUTES, PERF_CHECK_TIMEOUT_MS, PERF_CHECK_BUDGET_MS, collectPerfCheckRoutes };
