/*
 * 判断一个 /api/v0/apps/query 请求是「浏览/筛选」还是「搜索」。
 *
 * 只有浏览/筛选类查询才剔除被屏蔽的应用；带搜索关键词的请求原样放行，
 * 保证被屏蔽掉的应用仍然能被搜到。
 */
/**
 * 「浏览/筛选」类查询才剔除被屏蔽的应用；
 * 带搜索关键词的请求原样放行，保证屏蔽掉的应用仍然能被搜到。
 *
 * 一开始只认「value 是 '%'」这一种形态，于是后来加的条件全被误判成搜索：
 * 非华为过滤（not_i_like）、分类筛选（kind_name eq）一进来，
 * 屏蔽列表就被整体跳过 —— 被屏蔽的应用又出现在榜单里。
 * 这里改成按条件语义逐条判定，并支持 and/or 嵌套。
 */
const BROWSE_KEY_WHITELIST = new Set([
  'listed_at',          // 上架时间区间
  'kind_name',          // 分类筛选 / 分类浏览
  'main_device_codes'   // 设备筛选
]);

const isBrowseCondition = (condition) => {
  if (!condition) return true;
  // 组合条件：由子条件递归判定
  if (Array.isArray(condition.and)) return condition.and.every(isBrowseCondition);
  if (Array.isArray(condition.or)) return condition.or.every(isBrowseCondition);
  // 负向条件（比如「排除华为」）不会是用户输入的关键词
  if (String(condition.op || '').startsWith('not_')) return true;
  if (BROWSE_KEY_WHITELIST.has(condition.key)) return true;
  // 兜底：原来的「匹配全部」条件
  return String(condition.value ?? '') === '%';
};

const isBrowseAppQuery = (body) => {
  const conditions = Array.isArray(body?.and) ? body.and : [body];
  return conditions.every(isBrowseCondition);
};

module.exports = { isBrowseAppQuery };
