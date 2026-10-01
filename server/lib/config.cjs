/*
 * 进程级配置：代理信任跳数、监听端口、访问上游时的身份标识。
 */
/*
 * 线上链路是「用户 → 腾讯 EdgeOne(CDN) → nginx → Node」，也就是说前面有 **两层** 代理。
 * 默认按 2 跳信任（EdgeOne + nginx），可用 TRUST_PROXY 覆盖
 * （纯 nginx 部署填 1，没有代理填 false）。
 *
 * 注意：真正的取 IP 逻辑在 lib/client-ip.cjs，它会优先读 CDN 给出的客户端 IP 头；
 * 这里只影响 req.ip，用来做诊断。之前把默认值设成 loopback（=只信任一层），
 * 结果取到的是 EdgeOne 边缘节点的 IP，访客日志里的 IP 全错 —— 别再改回去。
 *
 * app.set('trust proxy', ...) 由 index.cjs 负责调用（app 实例在那边创建）。
 */
const TRUST_PROXY_HOPS = (() => {
  const raw = String(process.env.TRUST_PROXY ?? '2').trim();
  if (/^(loopback|linklocal|uniquelocal)$/i.test(raw)) return raw.toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;
  return 2;
})();
const PORT = process.env.PORT || 3001;

/*
 * 访问应用市场上游时用的 User-Agent —— 全站唯一一处定义，所有打上游的代码都用它。
 *
 * 上游规定：调用 API 必须带 user_agent，标准格式为「应用包名/版本号」
 * （文档里的示例是 top.rayawa.dashboard/2.0.0，那只是示例，本项目的标识见 .env 的 UPSTREAM_USER_AGENT）。
 * 所以这里不能再用浏览器 UA，也不能原样透传访客的 UA —— 上游要的是「谁在调接口」这个身份。
 * 需要换名字/版本号时改 .env 的 UPSTREAM_USER_AGENT 即可，不用动代码。
 */
const UPSTREAM_USER_AGENT =
  String(process.env.UPSTREAM_USER_AGENT || '').trim() || 'OpenStore/1.0 (+https://next.betahub.tech)';

module.exports = { TRUST_PROXY_HOPS, PORT, UPSTREAM_USER_AGENT };
