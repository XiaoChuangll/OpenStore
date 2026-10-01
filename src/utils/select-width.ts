/**
 * 按「最长的那条选项文案」估算下拉框宽度。
 *
 * 之前这些筛选框是写死宽度的，选中短文案时两侧留白很多，
 * 换成更长的选项（例如「增长前下载量」）又会被截断。
 * 这里按中文字 13px、其它字符 7.5px、空格 4px 估宽，再加上箭头和内边距。
 */
const CJK_RE = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/;

export const selectWidthOf = (labels: Array<string | number>, extra = 44) => {
  let widest = 0;
  for (const raw of labels) {
    const label = String(raw ?? '');
    let width = 0;
    for (const char of label) {
      if (CJK_RE.test(char)) width += 13;
      else if (char === ' ') width += 4;
      else width += 7.5;
    }
    widest = Math.max(widest, width);
  }
  return `${Math.ceil(widest + extra)}px`;
};
