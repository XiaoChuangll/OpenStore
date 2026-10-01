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

const lookupExtraLocation = async (ip) => {
  if (isPrivateIp(ip)) return null;
  const raw = (await lookupByZxinc(ip)) || (await lookupByPconline(ip));
  if (!raw) return null;

  const city = toEnglishName(raw.city);
  const province = toEnglishName(raw.province);
  const parts = [city, province].filter(Boolean).filter((item, index, list) => list.indexOf(item) === index);
  return parts.length ? { city, province, parts } : null;
};

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
