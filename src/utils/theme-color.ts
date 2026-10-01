/**
 * 主题色工具。
 *
 * Element Plus 的 `--el-color-primary-light-3/5/7/8/9`、`--el-color-primary-dark-2`
 * 是写死在默认主题里的常量，只覆盖基础色会让 hover、plain、浅色背景仍然停留在默认蓝。
 * 所以自定义配色时要把整套梯度一起算出来，深色模式下梯度方向相反（向黑混合），否则对比度会反过来。
 */
export type Rgb = [number, number, number];

/** 设置项 key -> Element Plus 颜色变量名 */
export const THEME_COLOR_TOKENS: { key: string; name: string }[] = [
  { key: 'theme_primary_color', name: 'primary' },
  { key: 'theme_success_color', name: 'success' },
  { key: 'theme_warning_color', name: 'warning' },
  { key: 'theme_danger_color', name: 'danger' },
  { key: 'theme_info_color', name: 'info' },
];

const LIGHT_LEVELS = [3, 5, 7, 8, 9];

export const parseHexColor = (value?: string | null): Rgb | null => {
  if (!value) return null;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) body = body.replace(/./g, (char) => char + char);
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
};

export const mixHexColor = (from: Rgb, to: Rgb, weight: number): string =>
  `#${from
    .map((channel, index) =>
      Math.round(channel + (to[index] - channel) * weight)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

/**
 * 生成 `--el-color-{name}` 以及它的派生梯度。
 * 传入非 hex（例如 rgba）时只返回基础色，让浏览器按默认梯度处理。
 */
export const buildColorVars = (name: string, value: string, isDark: boolean): Record<string, string> => {
  const vars: Record<string, string> = { [`--el-color-${name}`]: value };
  const rgb = parseHexColor(value);
  if (!rgb) return vars;

  const lightTarget: Rgb = isDark ? [0, 0, 0] : [255, 255, 255];
  const invertTarget: Rgb = isDark ? [255, 255, 255] : [0, 0, 0];

  LIGHT_LEVELS.forEach((level) => {
    vars[`--el-color-${name}-light-${level}`] = mixHexColor(rgb, lightTarget, level / 10);
  });
  vars[`--el-color-${name}-dark-2`] = mixHexColor(rgb, invertTarget, 0.2);

  return vars;
};
