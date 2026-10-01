/*
 * 音乐代理的用量护栏。
 *
 * /api/music-proxy 必须允许公网任意主机（VIP 歌曲会返回别的平台地址），
 * 所以做不了域名白名单，只能限制它被当成「公共下载器」使用时的破坏面。
 */
/* 音乐代理的用量护栏。
 * 这个接口必须允许公网任意主机（VIP 歌曲会返回别的平台地址），所以做不了域名白名单，
 * 只能限制它被当成「公共下载器」使用时的破坏面：单文件大小 + 同一 IP 的并发数。 */
const MUSIC_PROXY_MAX_BYTES = Math.max(Number(process.env.MUSIC_PROXY_MAX_BYTES) || 200 * 1024 * 1024, 1024 * 1024);
const MUSIC_PROXY_MAX_PER_IP = Math.max(Number(process.env.MUSIC_PROXY_MAX_PER_IP) || 4, 1);
const musicProxyInflight = new Map(); // ip -> 正在传输的请求数

const acquireMusicProxySlot = (ip) => {
  const used = musicProxyInflight.get(ip) || 0;
  if (used >= MUSIC_PROXY_MAX_PER_IP) return null;
  musicProxyInflight.set(ip, used + 1);
  return () => {
    const left = (musicProxyInflight.get(ip) || 1) - 1;
    if (left <= 0) musicProxyInflight.delete(ip);
    else musicProxyInflight.set(ip, left);
  };
};

module.exports = { MUSIC_PROXY_MAX_BYTES, acquireMusicProxySlot };
