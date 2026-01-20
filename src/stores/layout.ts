import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLayoutStore = defineStore('layout', () => {
  const isScrolled = ref(false);
  const pageTitle = ref('');
  const showBackButton = ref(false);
  const backAction = ref<() => void>(() => {});

  function setHeaderState(scrolled: boolean) {
    isScrolled.value = scrolled;
  }

  function setPageInfo(title: string, showBack: boolean, onBack?: () => void) {
    pageTitle.value = title;
    showBackButton.value = showBack;
    if (onBack) backAction.value = onBack;
  }
  
  function reset() {
    isScrolled.value = false;
    pageTitle.value = '';
    showBackButton.value = false;
    backAction.value = () => {};
  }

  return { isScrolled, pageTitle, showBackButton, backAction, setHeaderState, setPageInfo, reset };
});
