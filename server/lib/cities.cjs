/*
 * 访客归属地 -> 国家 / 省份的映射。
 *
 * geoip 给的是英文城市串（如「Guangzhou Guangdong CN」），这里把它落到
 * 两级：extractCountryCode 取国家码，matchCnProvince / CITY_TO_PROVINCE
 * 把国内城市映射到省级行政区（用于后台国内地图分布）。
 *
 * 表里没收录的城市不计入省级分布，宁可少算也不要算错。
 */
// ---- 访客分布与时段洞察：国家分布 + 7×24 热力图 ----
const extractCountryCode = (location) => {
  const value = String(location || '').trim();
  if (!value) return 'UNKNOWN';
  const parts = value.split(/[\s,]+/);
  const last = parts[parts.length - 1].toUpperCase();
  if (/^[A-Z]{2}$/.test(last)) return last;
  const first = parts[0].toUpperCase();
  return /^[A-Z]{2}$/.test(first) ? first : 'UNKNOWN';
};

/** 英文省份 → 中国省级行政区（用于国内地图；未收录的城市不计入省级分布） */
const EN_PROVINCE_LABELS = {
  Beijing: '北京', Tianjin: '天津', Shanghai: '上海', Chongqing: '重庆',
  Hebei: '河北', Shanxi: '山西', Liaoning: '辽宁', Jilin: '吉林', Heilongjiang: '黑龙江',
  Jiangsu: '江苏', Zhejiang: '浙江', Anhui: '安徽', Fujian: '福建', Jiangxi: '江西',
  Shandong: '山东', Henan: '河南', Hubei: '湖北', Hunan: '湖南', Guangdong: '广东',
  Hainan: '海南', Sichuan: '四川', Guizhou: '贵州', Yunnan: '云南', Shaanxi: '陕西',
  Gansu: '甘肃', Qinghai: '青海', Taiwan: '台湾', 'Inner Mongolia': '内蒙古', Guangxi: '广西',
  Tibet: '西藏', Ningxia: '宁夏', Xinjiang: '新疆', 'Hong Kong': '香港', Macao: '澳门'
};

/** 归属地串里已带省份名时直接匹配（例如「Haikou Hainan CN」） */
const matchCnProvince = (location) => {
  const value = String(location || '');
  const hit = Object.keys(EN_PROVINCE_LABELS).find((name) => value.includes(name));
  return hit ? EN_PROVINCE_LABELS[hit] : '';
};

const CITY_TO_PROVINCE = {
  Guangzhou: '广东', Shenzhen: '广东', Dongguan: '广东', Zhongshan: '广东', Shantou: '广东',
  Foshan: '广东', Jiangmen: '广东', Shiqiao: '广东', Zhuhai: '广东', Huizhou: '广东',
  Wuxi: '江苏', Nanjing: '江苏', Suzhou: '江苏', Zhangjiagang: '江苏', Changzhou: '江苏',
  Kunshan: '江苏', Xuzhou: '江苏', Lianyun: '江苏', Yangzhou: '江苏', Nantong: '江苏',
  Beijing: '北京', Haidian: '北京',
  Fuzhou: '福建', Xiamen: '福建', Quanzhou: '福建',
  Qingdao: '山东', Jinan: '山东', Linyi: '山东', Yantai: '山东', Weifang: '山东',
  Shanghai: '上海', Chongqing: '重庆', Tianjin: '天津',
  Shenyang: '辽宁', Dalian: '辽宁',
  Chengdu: '四川', Hangzhou: '浙江', Ningbo: '浙江', Jiaxing: '浙江', Taizhou: '浙江',
  Jinhua: '浙江', Yiwu: '浙江', Wenzhou: '浙江', Shaoxing: '浙江',
  Wuhan: '湖北', Hwang: '湖北', Huangzhou: '湖北',
  Changsha: '湖南', Zhengzhou: '河南', Zhoukou: '河南', Luoyang: '河南', Anyang: '河南', Nanyang: '河南',
  Hefei: '安徽', Wuhu: '安徽',
  "Xi'an": '陕西', Xian: '陕西',
  Nanning: '广西', Beihai: '广西', Guilin: '广西',
  Nanchang: '江西', Kunming: '云南', Changchun: '吉林',
  'Ürümqi': '新疆', Urumqi: '新疆',
  Shijiazhuang: '河北', Baoding: '河北', Zhangjiakou: '河北',
  Guiyang: '贵州', Taiyuan: '山西', Yongning: '宁夏', Hohhot: '内蒙古',
  Harbin: '黑龙江', Lanzhou: '甘肃', Xining: '青海', Haikou: '海南', Sanya: '海南',
  Lhasa: '西藏', Yinchuan: '宁夏'
};

module.exports = { extractCountryCode, EN_PROVINCE_LABELS, matchCnProvince, CITY_TO_PROVINCE };
