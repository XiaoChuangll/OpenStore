/*
 * 本机 TCP 状态采样：内核 TCP 内存占用 / 上限、连接数分布，供后台实时面板展示。
 *
 * 单位：sockstat 的 mem 与 tcp_mem 都按 4KB 页记账（x86_64 上同单位），
 * 换 64KB 页的 ARM 机器要改 SK_MEM_QUANTUM。
 * 只读 /proc，读不到（Windows 开发、容器未挂 /proc）返回 null。
 */
const fs = require('fs');

const SOCKSTAT_PATH = '/proc/net/sockstat';
const TCP_MEM_PATH = '/proc/sys/net/ipv4/tcp_mem';
const SK_MEM_QUANTUM = 4096;
const CACHE_MS = 5000;

let cache = { at: 0, value: null };

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/** "TCP: inuse 39 orphan 0 tw 5 alloc 43 mem 1234" -> { inuse, orphan, tw, alloc, mem } */
const parseSockstat = (text) => {
  const line = String(text)
    .split('\n')
    .find((row) => row.startsWith('TCP:'));
  if (!line) return null;
  const parts = line.slice(4).trim().split(/\s+/);
  const fields = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    fields[parts[i]] = Number(parts[i + 1]);
  }
  return Number.isFinite(fields.mem) ? fields : null;
};

/** "24576 32768 49152" -> [low, pressure, hard]（单位：页） */
const parseTcpMem = (text) => {
  const nums = String(text)
    .trim()
    .split(/\s+/)
    .map(Number);
  return nums.length === 3 && nums.every((n) => Number.isFinite(n) && n > 0) ? nums : null;
};

/**
 * 读一次内核 TCP 状态，5 秒内复用结果。
 * @returns {null | {
 *   memBytes: number, limitBytes: number|null, highWaterBytes: number|null,
 *   lowWaterBytes: number|null, ratio: number|null,
 *   inuse: number|null, timeWait: number|null, orphan: number|null
 * }}
 */
const readTcpStats = () => {
  const now = Date.now();
  if (cache.value && now - cache.at < CACHE_MS) return cache.value;

  const sockstat = parseSockstat(readText(SOCKSTAT_PATH));
  let value = null;

  if (sockstat) {
    const pages = parseTcpMem(readText(TCP_MEM_PATH));
    const memBytes = (sockstat.mem || 0) * SK_MEM_QUANTUM;
    value = {
      memBytes,
      limitBytes: pages ? pages[2] * SK_MEM_QUANTUM : null,
      highWaterBytes: pages ? pages[1] * SK_MEM_QUANTUM : null,
      lowWaterBytes: pages ? pages[0] * SK_MEM_QUANTUM : null,
      // 0.7 以上说明逼近 tcp_mem 高水位
      ratio: pages && pages[2] > 0 ? Number((sockstat.mem / pages[2]).toFixed(3)) : null,
      inuse: Number.isFinite(sockstat.inuse) ? sockstat.inuse : null,
      timeWait: Number.isFinite(sockstat.tw) ? sockstat.tw : null,
      orphan: Number.isFinite(sockstat.orphan) ? sockstat.orphan : null
    };
  }

  cache = { at: now, value };
  return value;
};

module.exports = { SK_MEM_QUANTUM, readTcpStats };
