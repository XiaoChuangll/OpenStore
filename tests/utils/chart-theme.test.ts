import { describe, it, expect, afterEach } from 'vitest';
import { cssVar, visitorChartColors } from '../../src/utils/chart-theme';

/*
 * 图表配色要跟着深浅色走。
 * jsdom 里没有加载 Element Plus 的样式，正好能验证「取不到变量时的兜底值」和深浅两套设计色。
 */

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('图表配色', () => {
  it('深色下地图是暗底、热力图最浅一档也是深色', () => {
    const dark = visitorChartColors(true);

    expect(dark.isDark).toBe(true);
    expect(dark.mapArea).toBe('#1a1d23');
    expect(dark.heatRange[0]).toBe('#1a1d23');
    expect(dark.heatCellBorder).toContain('0,0,0');
  });

  it('浅色下地图与热力图不能再用近黑色', () => {
    const light = visitorChartColors(false);

    expect(light.isDark).toBe(false);
    expect(light.mapArea).not.toContain('1a1d23');
    expect(light.heatRange[0]).not.toContain('1a1d23');
    // 浅色下格子描边要亮色，深色下才是暗色
    expect(light.heatCellBorder).not.toBe(visitorChartColors(true).heatCellBorder);
    expect(light.heatEmphasisBorder).not.toBe(visitorChartColors(true).heatEmphasisBorder);
  });

  it('两套配色都给出完整的渐变与文字色，不会留 undefined', () => {
    for (const isDark of [true, false]) {
      const { isDark: _flag, ...colors } = visitorChartColors(isDark);
      expect(colors.mapRange).toHaveLength(3);
      expect(colors.heatRange).toHaveLength(3);
      Object.values(colors).forEach((value) => {
        if (Array.isArray(value)) value.forEach((v) => expect(typeof v).toBe('string'));
        else expect(value).toBeTruthy();
      });
    }
  });

  it('Element Plus 的变量读不到时用兜底值，读得到时优先用它', () => {
    expect(cssVar('--not-a-real-var', '#123456')).toBe('#123456');

    document.documentElement.style.setProperty('--el-text-color-secondary', '#abcdef');
    expect(cssVar('--el-text-color-secondary', '#123456')).toBe('#abcdef');
    expect(visitorChartColors(false).text).toBe('#abcdef');
  });
});
