import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLayoutStore = defineStore('layout', () => {
  const isScrolled = ref(false);
  const pageTitle = ref('');
  const showBackButton = ref(false);
  const backAction = ref<() => void>(() => {});
  const showCustomTitle = ref(false);

  function setHeaderState(scrolled: boolean) {
    isScrolled.value = scrolled;
  }

  function setPageInfo(title: string, showBack: boolean, onBack?: () => void) {
    pageTitle.value = title;
    showBackButton.value = showBack;
    if (onBack) backAction.value = onBack;
    showCustomTitle.value = false; // Reset custom title on navigation
  }
  
  function setCustomTitleVisible(visible: boolean) {
    showCustomTitle.value = visible;
  }
  
  function reset() {
    isScrolled.value = false;
    pageTitle.value = '';
    showBackButton.value = false;
    backAction.value = () => {};
    showCustomTitle.value = false;
  }

  return { isScrolled, pageTitle, showBackButton, backAction, showCustomTitle, setHeaderState, setPageInfo, setCustomTitleVisible, reset };
});
