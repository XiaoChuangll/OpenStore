export type WSHandler = (type: string, payload: any) => void;

let ws: WebSocket | null = null;
let wsToken = '';
let handlers: WSHandler[] = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let manualClose = false;

function readToken(): string {
  try { return localStorage.getItem('token') || '' } catch { return '' }
}

/**
 * 建立后台实时连接。
 * /ws 推送的是访客日志、操作日志、投稿等后台数据，所以未登录时不应建立连接，
 * 服务端也会在握手阶段校验 token。
 */
export function connectWS() {
  const token = readToken();
  if (!token) {
    if (ws) disconnectWS();
    return;
  }
  const alive = ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);
  if (alive && wsToken === token) return;
  if (ws) disconnectWS();

  manualClose = false;
  wsToken = token;
  // token 走子协议而不是 URL：避免它出现在 nginx 的 access_log 里
  const socket = new WebSocket(
    (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws',
    ['bearer', token]
  );
  ws = socket;

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handlers.forEach(h => h(data.type, data.payload));
    } catch {}
  };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    if (manualClose) return;
    if (!readToken()) return;
    retryTimer = setTimeout(connectWS, 1000);
  };
}

export function disconnectWS() {
  manualClose = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const socket = ws;
  ws = null;
  wsToken = '';
  if (socket) {
    socket.onclose = null;
    try { socket.close(); } catch {}
  }
}

export function onWS(handler: WSHandler) {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter(h => h !== handler);
  };
}

