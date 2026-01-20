import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

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

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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

  return { isDark, preference, toggleTheme };
});
