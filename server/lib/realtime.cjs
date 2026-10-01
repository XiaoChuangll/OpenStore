/*
 * WebSocket 实时通道。
 *
 * 这条通道推送的 visitors:new / logs:new / submissions:update 等都属于后台数据，
 * 因此升级握手时必须校验管理员 JWT，未登录访客不建立连接。
 *
 * 用 attachWebSocket(server, { jwtSecret }) 挂到 http.Server 上；
 * 业务代码通过 broadcast(type, payload) 推送。
 */
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
// WebSocket server
// 这条通道推送的 visitors:new / logs:new / submissions:update 等都属于后台数据，
// 因此升级握手时必须校验管理员 JWT，未登录访客不再建立连接。
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();
wss.on('connection', (ws, request, auth) => {
  clients.add(ws);
  let expireTimer = null;
  const closeExpired = () => { try { ws.close(4401, 'token expired'); } catch {} };
  ws.on('close', () => {
    if (expireTimer) clearTimeout(expireTimer);
    clients.delete(ws);
  });

  // 连接不能比登录态活得更久：token 到期即主动断开
  const expMs = Number(auth?.exp || 0) * 1000;
  if (expMs > 0) {
    const delay = expMs - Date.now();
    if (delay <= 0) {
      closeExpired();
    } else {
      expireTimer = setTimeout(closeExpired, Math.min(delay, 2147483647));
      if (expireTimer.unref) expireTimer.unref();
    }
  }
});
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  clients.forEach((ws) => {
    try { ws.send(msg); } catch {}
  });
}

// 浏览器端 WebSocket 无法自定义请求头，所以额外接受 ?token=（与 /api/admin/live 的 SSE 用法一致）
function tokenFromUpgradeRequest(request) {
  const auth = request.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  /*
   * 浏览器无法给 WebSocket 设请求头，所以支持用子协议传 token：
   *   new WebSocket(url, ['bearer', token])
   * 这样 token 不出现在 URL 里，也就不会进 nginx 的 access_log。
   */
  const protocols = request.headers['sec-websocket-protocol'];
  if (protocols) {
    const parts = String(protocols).split(',').map((s) => s.trim());
    const at = parts.findIndex((p) => p.toLowerCase() === 'bearer');
    if (at >= 0 && parts[at + 1]) return parts[at + 1];
  }

  try {
    return new URL(request.url, 'http://localhost').searchParams.get('token') || '';
  } catch {
    return '';
  }
}

function rejectUpgrade(socket, status, text) {
  try {
    socket.write(
      `HTTP/1.1 ${status} ${text}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`
    );
  } catch {}
  socket.destroy();
}

/**
 * 把 WebSocket 升级处理挂到 http.Server 上。
 * 只接受 /ws，其余路径 404；握手必须带合法管理员 JWT（header / 子协议 / ?token= 三选一）。
 */
function attachWebSocket(server, { jwtSecret }) {
  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch {}
    if (pathname !== '/ws') return rejectUpgrade(socket, 404, 'Not Found');

    let auth = null;
    try { auth = jwt.verify(tokenFromUpgradeRequest(request), jwtSecret); } catch { auth = null; }
    if (!auth || typeof auth !== 'object') return rejectUpgrade(socket, 401, 'Unauthorized');

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, auth);
    });
  });
}

module.exports = { broadcast, attachWebSocket };
