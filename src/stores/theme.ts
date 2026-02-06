import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { getThemeSettings } from '../services/api';

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

  // Computed: is the dark mode actually active?
  const isDark = computed(() => {
    if (preference.value === 'auto') {
      return systemDark.value;
    }
    return preference.value === 'dark';
  });

  // Custom theme colors
  const customTheme = ref<Record<string, string>>({});

  const applyThemeVariables = () => {
    const root = document.documentElement;
    const map: Record<string, string> = {
      'theme_primary_color': '--el-color-primary',
      'theme_success_color': '--el-color-success',
      'theme_warning_color': '--el-color-warning',
      'theme_danger_color': '--el-color-danger',
      'theme_info_color': '--el-color-info',
    };
    
    Object.entries(customTheme.value).forEach(([k, v]) => {
      if (map[k]) {
        if (v) {
          root.style.setProperty(map[k], v);
        } else {
          root.style.removeProperty(map[k]);
        }
      }
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

  const toggleTheme = () => {
    // Cycle: Auto -> Light -> Dark -> Auto
    if (preference.value === 'auto') {
      preference.value = 'light';
    } else if (preference.value === 'light') {
      preference.value = 'dark';
    } else {
      preference.value = 'auto';
    }
  };

  // Watch for changes in preference or systemDark to apply theme
  watch([preference, systemDark], () => {
    applyTheme();
    localStorage.setItem('theme_mode', preference.value);
  });

  // Initialize
  applyTheme();
  loadThemeSettings();

  return { isDark, preference, toggleTheme, customTheme, loadThemeSettings };
});
