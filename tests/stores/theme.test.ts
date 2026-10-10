import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// store 初始化会拉一次主题设置，避免真实请求
vi.mock('../../src/services/api', () => ({
  getThemeSettings: vi.fn().mockResolvedValue({})
}));

import { useThemeStore } from '../../src/stores/theme';

/** jsdom 没有 matchMedia，补一个可控的替身 */
const stubMatchMedia = (systemDark: boolean) => {
  vi.stubGlobal('matchMedia', () => ({
    matches: systemDark,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {}
  }));
};

describe('主题切换', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    stubMatchMedia(false);
  });

  it('没手动设置过时默认跟随系统', () => {
    const store = useThemeStore();
    expect(store.preference).toBe('auto');
    // 系统浅色 → 当前就是浅色
    expect(store.isDark).toBe(false);
  });

  it('跟随系统时跟得上系统深色', () => {
    stubMatchMedia(true);
    const store = useThemeStore();
    expect(store.preference).toBe('auto');
    expect(store.isDark).toBe(true);
  });

  it('切换只在浅色 / 深色之间来回，永远不会回到 auto', () => {
    const store = useThemeStore();
    store.toggleTheme();
    expect(['light', 'dark']).toContain(store.preference);

    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      store.toggleTheme();
      expect(store.preference).not.toBe('auto');
      seen.push(store.preference);
    }
    // 每次都翻面：light,dark,light,dark…
    expect(seen).toEqual(['light', 'dark', 'light', 'dark', 'light', 'dark']);
  });

  it('auto 状态下点一下，切到与当前外观相反的那一档', () => {
    const light = useThemeStore();
    light.toggleTheme();
    expect(light.preference).toBe('dark'); // 系统浅色 → 点的意图是"切深色"

    setActivePinia(createPinia());
    stubMatchMedia(true);
    const dark = useThemeStore();
    expect(dark.isDark).toBe(true);
    dark.toggleTheme();
    expect(dark.preference).toBe('light');
  });

  it('偏好会落到 localStorage', async () => {
    const store = useThemeStore();
    store.toggleTheme();
    await Promise.resolve(); // watch 是异步刷新的
    expect(localStorage.getItem('theme_mode')).toBe(store.preference);
  });
});
