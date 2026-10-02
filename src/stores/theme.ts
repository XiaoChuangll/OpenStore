import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { getThemeSettings } from '../services/api';
import { buildColorVars, THEME_COLOR_TOKENS } from '../utils/theme-color';

type ThemePreference = 'light' | 'dark' | 'auto';

export const useThemeStore = defineStore('theme', () => {
  // Load preference from localStorage, default to 'auto'
  // Using 'theme_mode' key to ensure fresh default for existing users
  const storedTheme = localStorage.getItem('theme_mode') as ThemePreference | null;
  const preference = ref<ThemePreference>(
    (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'auto') 
      ? storedTheme 
      : 'auto'
  );

  // System dark mode state
  const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Update systemDark when system preference changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemChange = (e: MediaQueryListEvent) => {
    systemDark.value = e.matches;
  };
  
  // Add listener safely
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemChange);
  } else {
    // Fallback for older browsers
    mediaQuery.addListener(handleSystemChange);
  }

  /*
   * 「强制深色」：某些页面（例如播放页）固定用深色。
   * 刻意不去改 preference —— 那样会把强制值写进 localStorage，
   * 用户直接刷新播放页时偏好就被永久改成深色了。这里只影响当前渲染。
   */
  const forcedDark = ref(false);
  const setForcedDark = (value: boolean) => {
    forcedDark.value = value;
  };

  // Computed: is the dark mode actually active?
  const isDark = computed(() => {
    if (forcedDark.value) return true;
    if (preference.value === 'auto') {
      return systemDark.value;
    }
    return preference.value === 'dark';
  });

  // Custom theme colors
  const customTheme = ref<Record<string, string>>({});

  const applyThemeVariables = () => {
    const root = document.documentElement;
    const derivedNames = ['3', '5', '7', '8', '9'].map((level) => `light-${level}`);

    THEME_COLOR_TOKENS.forEach(({ key, name }) => {
      const baseVar = `--el-color-${name}`;
      const derivedVars = [...derivedNames.map((suffix) => `${baseVar}-${suffix}`), `${baseVar}-dark-2`];
      const value = customTheme.value[key];

      // 先清空，避免换成 rgba 这类算不出梯度的值时残留上一次的颜色
      [baseVar, ...derivedVars].forEach((variable) => root.style.removeProperty(variable));

      if (!value) {
        // 空值 = 使用 Element Plus 默认色，连同派生梯度一起交还给默认主题
        return;
      }

      Object.entries(buildColorVars(name, value, isDark.value)).forEach(([variable, color]) => {
        root.style.setProperty(variable, color);
      });
    });
  };

  const loadThemeSettings = async () => {
    try {
      const settings = await getThemeSettings();
      customTheme.value = settings;
      applyThemeVariables();
    } catch (e) {
      console.error(e);
    }
  };

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    applyThemeVariables();
  };

  /*
   * 只在「浅色 / 深色」之间切换。
   * 「跟随系统」是没手动设置过时的默认值（preference 初始为 auto），不进切换循环 ——
   * 所以按「当前实际显示的是不是深色」取反，而不是 auto -> light -> dark 轮转。
   */
  const toggleTheme = () => {
    const currentlyDark = preference.value === 'auto' ? systemDark.value : preference.value === 'dark';
    preference.value = currentlyDark ? 'light' : 'dark';
  };

  // Watch for changes in preference or systemDark to apply theme
  watch([preference, systemDark, forcedDark], () => {
    applyTheme();
    localStorage.setItem('theme_mode', preference.value);
  });

  // Initialize
  applyTheme();
  loadThemeSettings();

  return { isDark, preference, toggleTheme, customTheme, loadThemeSettings, setForcedDark, forcedDark };
});
