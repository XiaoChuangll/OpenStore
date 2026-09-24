/**
 * 访客归属地补充
 *
 * MaxMind（geoip-lite）对国内移动 / 宽带 IP 经常只有国家、没有城市（实测 region、city 都是空），
 * 所以「geoip 查不到城市」时，用国内免费接口（ip.zxinc.org 为主，whois.pconline.com.cn 兜底）
 * 补上省市，再经 cn-location-en.json 换成英文，保持与 geoip 一致的「城市 省份 国家」格式，例如：
 *   Haikou Hainan CN
 *
 * cn-location-en.json 是「中国省 / 市 / 区县中文名 → 英文名」的静态对照表（由 china-division 的
 * 行政区划数据 + 拼音生成，一次生成、离线使用），所以运行时不需要任何付费接口，也不会调用翻译服务。
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ZXINC_API = 'http://ip.zxinc.org/api.php';
const PCONLINE_API = 'https://whois.pconline.com.cn/ipJson.jsp';

const CN_EN = JSON.parse(fs.readFileSync(path.join(__dirname, 'cn-location-en.json'), 'utf8'));

const SUFFIXES = [
  '特别行政区', '自治区', '自治州', '自治县', '自治旗',
  '地区', '林区', '新区', '城区', '矿区', '盟', '省', '市', '县', '区', '旗'
];

/** 行政区划中文名 → 英文名；查不到时逐层去掉行政后缀再查，仍查不到就返回原名 */
const toEnglishName = (name) => {
  const value = String(name || '').trim();
  if (!value) return '';
  if (/^[\x20-\x7e]+$/.test(value)) return value;
  if (CN_EN[value]) return CN_EN[value];

  let base = value;
  for (const suffix of SUFFIXES) {
    if (base.endsWith(suffix) && base.length > suffix.length) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return CN_EN[base] || value;
};

const isPrivateIp = (ip) => {
  const value = String(ip || '').trim();
  if (!value) return true;
  if (value === '::1') return true;
  if (/^(fc|fd|fe80)/i.test(value)) return true;
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
};

/** zxinc：返回 "中国–海南–海口 电信"，可取到省 + 市 */
const lookupByZxinc = async (ip) => {
  try {
    const res = await axios.get(ZXINC_API, {
      params: { type: 'json', ip },
      timeout: 4000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const parts = String(res.data?.data?.country || '')
      .split(/[–—-]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length < 3) return null;
    return { province: parts[1], city: parts[2] };
  } catch {
    return null;
  }
};

/** pconline：接口返回 GBK，只有省市（zxinc 无结果时兜底） */
const lookupByPconline = async (ip) => {
  try {
    const res = await axios.get(PCONLINE_API, {
      params: { json: true, ip },
      responseType: 'arraybuffer',
      timeout: 4000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = JSON.parse(new TextDecoder('gbk').decode(res.data));
    if (data.err && data.err !== '') return null;
    const city = String(data.city || '').trim();
    const province = String(data.pro || '').trim();
    if (!city && !province) return null;
    return { province, city: city || province };
  } catch {
    return null;
  }
};

/**
 * 单个 IP 的归属地补充，返回英文的 { city, province }；
 * geoip 已有城市时不会走到这里。
 */
const lookupExtraLocation = async (ip) => {
  if (isPrivateIp(ip)) return null;
  const raw = (await lookupByZxinc(ip)) || (await lookupByPconline(ip));
  if (!raw) return null;

  const city = toEnglishName(raw.city);
  const province = toEnglishName(raw.province);
  const parts = [city, province].filter(Boolean).filter((item, index, list) => list.indexOf(item) === index);
  return parts.length ? { city, province, parts } : null;
};

/**
 * 带缓存 + 串行限速的查询器：避免并发打爆第三方接口。
 */
const createQueuedLookup = ({ intervalMs = 150, cache = new Map() } = {}) => {
  const queue = [];
  let running = false;

  const pump = () => {
    if (running || !queue.length) return;
    running = true;
    const { ip, resolve } = queue.shift();

    lookupExtraLocation(ip)
      .then((info) => {
        cache.set(ip, info);
        resolve(info);
      })
      .catch(() => resolve(null))
      .finally(() => {
        running = false;
        setTimeout(pump, intervalMs);
      });
  };

  return (ip) => {
    const key = String(ip || '').trim();
    if (!key || isPrivateIp(key)) return Promise.resolve(null);
    if (cache.has(key)) return Promise.resolve(cache.get(key));

    return new Promise((resolve) => {
      queue.push({ ip: key, resolve });
      pump();
    });
  };
};

module.exports = { isPrivateIp, lookupExtraLocation, createQueuedLookup, toEnglishName };
