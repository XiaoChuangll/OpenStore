<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useThemeStore } from './stores/theme';
import { useLayoutStore } from './stores/layout';
import { usePlayerStore } from './stores/player';
import { useRouter, useRoute } from 'vue-router';
import MiniPlayer from './components/MiniPlayer.vue';
import { Moon, Sunny, ArrowLeft, Compass, Menu, Refresh, ArrowDown, UserFilled, Collection, Close, Monitor, Edit, InfoFilled } from '@element-plus/icons-vue';
import { useAuthStore } from './stores/auth';

const themeStore = useThemeStore();
const layoutStore = useLayoutStore();
const playerStore = usePlayerStore();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const isDockHovered = ref(false);

const subDockItems = [
  { path: '/submit', label: '投稿', icon: Edit },
  { path: '/about', label: '关于', icon: InfoFilled },
];

const adminMenuLoading = ref(false);
const isMobileMenuOpen = ref(false);
const isAuthed = computed(() => authStore.isLoggedIn());
const adminUsername = computed(() => authStore.username || '管理员');

const activeTab = computed(() => route.path);

const navItems = [
  { path: '/', label: '探索', icon: Compass },
  { path: '/apps', label: '应用', icon: Menu },
  { path: '/topics', label: '专题', icon: Collection },
  { path: '/updates', label: '更新', icon: Refresh },
];

const navItemRefs = ref<HTMLElement[]>([]);
const mobileMenuRef = ref<HTMLElement | null>(null);
const mobileTriggerRef = ref<HTMLElement | null>(null);
const sliderStyle = ref({
  left: '0px',
  width: '0px',
  opacity: 0,
});

const isScrolling = ref(false);
let scrollTimer: number | undefined;

const playProgress = computed(() => {
  if (!playerStore.duration || !playerStore.currentTrack) return 0;
  return (playerStore.currentTime / playerStore.duration) * 100;
});

const updateSlider = () => {
  const activeIndex = navItems.findIndex(item => item.path === activeTab.value);
  if (activeIndex === -1 || !navItemRefs.value[activeIndex]) {
    sliderStyle.value.opacity = 0;
    return;
  }

  const activeEl = navItemRefs.value[activeIndex];
  sliderStyle.value = {
    left: `${activeEl.offsetLeft}px`,
    width: `${activeEl.offsetWidth}px`,
    opacity: 1,
  };
};

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false;
};

const handleGlobalScroll = () => {
  isScrolling.value = true;
  
  if (isMobileMenuOpen.value) {
    closeMobileMenu();
  }

  clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    isScrolling.value = false;
  }, 150);
};

const handleTouchMove = () => {
  if (isMobileMenuOpen.value) {
    closeMobileMenu();
  }
};

const handleWindowClick = (event: Event) => {
  if (!isMobileMenuOpen.value) return;
  const target = event.target as HTMLElement;
  const isClickInsideMenu = mobileMenuRef.value?.contains(target);
  const isClickInsideTrigger = mobileTriggerRef.value?.contains(target);
  
  if (!isClickInsideMenu && !isClickInsideTrigger) {
    closeMobileMenu();
  }
};

watch(isMobileMenuOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      // scroll is handled globally now
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('click', handleWindowClick);
      window.addEventListener('touchstart', handleWindowClick, { passive: true });
    });
  } else {
    // window.removeEventListener('scroll', closeMobileMenu); // handled globally
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('click', handleWindowClick);
    window.removeEventListener('touchstart', handleWindowClick);
  }
});

watch(activeTab, () => {
  nextTick(updateSlider);
});

onMounted(() => {
  nextTick(updateSlider);
  window.addEventListener('resize', updateSlider);
  window.addEventListener('scroll', handleGlobalScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('resize', updateSlider);
  window.removeEventListener('scroll', handleGlobalScroll);
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('click', handleWindowClick);
  window.removeEventListener('touchstart', handleWindowClick);
});


const themeIcon = computed(() => {
  if (themeStore.preference === 'auto') return Monitor;
  return themeStore.isDark ? Moon : Sunny;
});

const activeIcon = computed(() => {
  switch (route.path) {
    case '/apps':
      return Menu;
    case '/topics':
      return Collection;
    case '/updates':
      return Refresh;
    case '/submit':
      return Edit;
    case '/about':
      return InfoFilled;
    default:
      return Compass;
  }
});

const navigateTo = (path: string) => {
  router.push(path);
  isMobileMenuOpen.value = false;
};

const toggleMobileMenu = (event?: Event) => {
  event?.stopPropagation();
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};

watch(
  () => [route.fullPath, route.meta.title, route.query.title],
  () => {
    const title = (route.query.title as string) || (route.meta.title as string) || 'OpenStore';
    const isRoot = ['/', '/apps', '/updates', '/topics', '/submit', '/about'].includes(route.path);
    layoutStore.setPageInfo(title, !isRoot, () => router.back());
  },
  { immediate: true }
);

const goAdminLogin = () => {
  router.push('/admin/login');
};

const goAdminDashboard = async () => {
  adminMenuLoading.value = true;
  try {
    await router.push('/admin/dashboard');
  } finally {
    adminMenuLoading.value = false;
  }
};

const handleThemeToggle = () => {
  themeStore.toggleTheme();
  const modeText = {
    'auto': '跟随系统',
    'light': '浅色模式',
    'dark': '深色模式'
  }[themeStore.preference];
  
  ElMessage({
    message: `已切换至${modeText}`,
    type: 'success',
    duration: 1500,
  });
};

const handleAdminCommand = async (command: 'dashboard' | 'logout') => {
  if (command === 'dashboard') {
    await goAdminDashboard();
    return;
  }
  authStore.logout();
  window.location.reload();
};
</script>

<template>
  <el-container class="layout-container">
    <el-header class="header">
      <div class="header-left">
        <el-button 
          v-if="layoutStore.showBackButton" 
          link 
          @click="layoutStore.backAction" 
          class="back-btn"
        >
          <el-icon :size="24"><ArrowLeft /></el-icon>
        </el-button>
        <div v-else class="logo-container">
          <div class="logo-icon mr-2" role="img" aria-label="Logo"></div>
          <span 
            class="app-title" 
            :class="{ 'is-hidden-on-mobile': layoutStore.showCustomTitle }"
          >
            OpenStore
          </span>
        </div>
      </div>

      <div class="header-center">
        <transition name="fade-slide">
          <span v-if="!layoutStore.showCustomTitle" class="page-title">{{ layoutStore.pageTitle }}</span>
        </transition>
        <div id="header-teleport-target" class="header-teleport-target"></div>
      </div>
      
      <div class="header-right">
        <el-dropdown v-if="isAuthed" trigger="click" @command="handleAdminCommand">
          <el-button :loading="adminMenuLoading">
            {{ adminUsername }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="dashboard">进入后台</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-tooltip v-else content="后台登录" placement="bottom">
          <el-button :icon="UserFilled" circle @click="goAdminLogin" />
        </el-tooltip>
        <el-button :icon="themeIcon" circle @click="handleThemeToggle" />
      </div>
    </el-header>
    <el-main class="main-content">
      <router-view v-slot="{ Component }">
        <keep-alive include="HomeView,MusicView,AppsView,UpdatesView,TopicView,TotalRankView,GrowthRankView,HistoryRankView,NonHuaweiRankView,AppCardView" :max="20">
          <component :is="Component" :key="route.path" />
        </keep-alive>
      </router-view>
    </el-main>
    <div class="dock-wrapper desktop-nav" @mouseenter="isDockHovered = true" @mouseleave="isDockHovered = false">
      <MiniPlayer />
      <div class="footer-nav">
        <!-- Dock Progress Bar -->
        <div 
          class="dock-progress-bar" 
          :style="{ width: `${playProgress}%` }"
          v-if="playerStore.currentTrack"
        ></div>

        <div class="nav-slider" :style="sliderStyle"></div>
        <div 
          v-for="(item, index) in navItems"
          :key="item.path"
          :ref="(el) => { if (el) navItemRefs[index] = el as HTMLElement }"
          class="nav-item" 
          :class="{ active: activeTab === item.path }" 
          @click="navigateTo(item.path)"
        >
          <el-icon :size="20"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </div>
      </div>

      <div class="sub-dock-nav" :class="{ 'is-visible': isDockHovered }">
        <div 
          v-for="item in subDockItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: activeTab === item.path }"
          @click="navigateTo(item.path)"
        >
          <el-icon :size="20"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </div>
      </div>
    </div>

    <!-- Mobile Navigation -->
    <div class="mobile-nav-container">
      <!-- Popup Menu -->
      <transition name="mobile-menu-fade">
        <div v-if="isMobileMenuOpen" ref="mobileMenuRef" class="mobile-menu-popup">
          <div 
            class="mobile-nav-item" 
            :class="{ active: activeTab === '/' }" 
            @click="navigateTo('/')"
          >
            <el-icon :size="20"><Compass /></el-icon>
            <span class="mobile-nav-label">探索</span>
          </div>
          <div 
            class="mobile-nav-item" 
            :class="{ active: activeTab === '/apps' }" 
            @click="navigateTo('/apps')"
          >
            <el-icon :size="20"><Menu /></el-icon>
            <span class="mobile-nav-label">应用</span>
          </div>
          <div 
            class="mobile-nav-item" 
            :class="{ active: activeTab === '/topics' }" 
            @click="navigateTo('/topics')"
          >
            <el-icon :size="20"><Collection /></el-icon>
            <span class="mobile-nav-label">专题</span>
          </div>
          <div 
            class="mobile-nav-item" 
            :class="{ active: activeTab === '/updates' }" 
            @click="navigateTo('/updates')"
          >
            <el-icon :size="20"><Refresh /></el-icon>
            <span class="mobile-nav-label">更新</span>
          </div>

          <div class="mobile-menu-divider"></div>

          <div 
            v-for="item in subDockItems"
            :key="item.path"
            class="mobile-nav-item"
            :class="{ active: activeTab === item.path }"
            @click="navigateTo(item.path)"
          >
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
            <span class="mobile-nav-label">{{ item.label }}</span>
          </div>
        </div>
      </transition>

      <!-- Trigger Button -->
      <div class="mobile-trigger-btn" @click="toggleMobileMenu" ref="mobileTriggerRef">
        <div class="trigger-logo">
           <el-icon :size="20" class="current-tab-icon">
             <component :is="activeIcon" />
           </el-icon>
        </div>
        <div class="trigger-divider"></div>
        <div class="trigger-icon">
          <el-icon :size="20">
            <Close v-if="isMobileMenuOpen" />
            <svg v-else viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
              <path fill="currentColor" d="M160 448h704a32 32 0 0 1 0 64H160a32 32 0 0 1 0-64zm0-256h704a32 32 0 0 1 0 64H160a32 32 0 0 1 0-64zm0 512h704a32 32 0 0 1 0 64H160a32 32 0 0 1 0-64z"></path>
            </svg>
          </el-icon>
        </div>
      </div>
    </div>
  </el-container>
</template>

<style scoped>
.layout-container {
  min-height: 100vh;
  transition: background-color 0.3s, color 0.3s;
  position: relative;
}

.main-content {
  padding-bottom: 100px; /* Space for floating footer */
}

.header {
  background-color: color-mix(in srgb, var(--el-bg-color) 85%, transparent);
  backdrop-filter: blur(50px);
  -webkit-backdrop-filter: blur(50px);
  /* border-bottom: 1px solid var(--el-border-color); */
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  transition: background-color 0.3s, border-color 0.3s;
  padding: 0 16px;
  position: sticky;
  top: 0;
  z-index: 2100;
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 40px;
}

/* Header Transitions - Global */
</style>

<style>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>

<style scoped>
.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: grid;
  place-items: center;
  height: 100%;
  pointer-events: none; /* Let clicks pass through container */
}

.header-center > * {
  grid-area: 1 / 1;
  pointer-events: auto; /* Re-enable clicks on children */
}

.header-teleport-target {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}


.header-right {
  display: flex;
  align-items: center;
  min-width: 40px;
  justify-content: flex-end;
  gap: 10px;
}

.back-btn {
  padding: 0;
  height: auto;
  color: var(--el-text-color-primary);
}

.logo-container {
  display: flex;
  align-items: center;
}

.app-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  transition: transform 0.25s ease, opacity 0.25s ease;
}

@media (max-width: 768px) {
  .app-title {
    display: inline-block;
    overflow: hidden;
  }

  .app-title.is-hidden-on-mobile {
    opacity: 0;
    transform: translateX(-12px);
  }
}

.logo-icon {
  width: 28px;
  height: 28px;
  background-color: var(--el-text-color-primary);
  -webkit-mask: url('/favicon.svg') no-repeat center center / contain;
  mask: url('/favicon.svg') no-repeat center center / contain;
  transition: background-color 0.3s;
}

.mr-2 {
  margin-right: 8px;
}

.dock-wrapper {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}

.footer-nav {
  position: relative;
  width: auto;
  min-width: 320px;
  max-width: 90vw;
  height: auto;
  padding: 6px 8px;
  background-color: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  backdrop-filter: blur(20px);
  border: 1px solid var(--el-border-color);
  border-radius: 50px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden; /* Ensure progress bar doesn't overflow rounded corners */
}

.dock-progress-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
  pointer-events: none;
  z-index: 0;
  transition: width 0.2s linear;
}

.sub-dock-nav {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  
  /* Initial state: hidden */
  max-width: 0;
  padding: 0;
  margin-left: 0;
  opacity: 0;
  border: 0 solid var(--el-border-color);
  overflow: hidden;
  
  background-color: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
  backdrop-filter: blur(20px);
  border-radius: 50px;
  white-space: nowrap;
  
  transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}

.sub-dock-nav.is-visible {
  max-width: 200px;
  padding: 6px 8px;
  margin-left: 12px;
  opacity: 1;
  border-width: 1px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
}

/* Removed old transition classes */

.nav-slider {
  position: absolute;
  top: 6px;
  bottom: 6px;
  background-color: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
  border-radius: 50px;
  z-index: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  padding: 6px 12px;
  border-radius: 50px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  position: relative;
  z-index: 1;
  background: transparent !important;
}

.nav-item:hover {
  /* background-color: color-mix(in srgb, var(--el-text-color-primary) 8%, transparent); */
  color: var(--el-text-color-primary);
  /* backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px); */
}

/* Add a pseudo-element for hover effect to avoid conflict with slider */
.nav-item::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50px;
  background-color: color-mix(in srgb, var(--el-text-color-primary) 8%, transparent);
  opacity: 0;
  transition: opacity 0.2s;
  z-index: -1;
}

.nav-item:hover::before {
  opacity: 1;
}

.nav-item.active:hover {
  color: var(--el-color-primary);
}

/* Hide hover background when active because slider is there */
.nav-item.active::before {
  opacity: 0 !important;
}

.nav-item .el-icon,
.nav-item .nav-label {
  transition: transform 0.15s ease-out;
}

.nav-item:hover .el-icon,
.nav-item:hover .nav-label {
  transform: scale(1.1);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-item:active {
  transform: scale(0.95);
}

.nav-item.active {
  color: var(--el-color-primary);
  /* background-color: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px); */
}

.nav-label {
  font-size: 11px;
  margin-top: 3px;
  font-weight: 500;
}

/* Mobile adaptation: Ensure it doesn't get too wide or cover important content */
.mobile-nav-container {
  display: none;
}

@media (max-width: 480px) {
  .desktop-nav {
    display: none !important;
  }

  .mobile-nav-container {
    display: block;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2100;
  }

  .mobile-trigger-btn {
    display: flex;
    align-items: center;
    background-color: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
    backdrop-filter: blur(20px);
    border: 1px solid var(--el-border-color);
    border-radius: 30px;
    padding: 8px 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .mobile-trigger-btn:active {
    transform: scale(0.95);
  }

  .mobile-trigger-btn.is-scrolling {
    padding: 8px;
    border-radius: 50%;
    width: 42px;
    height: 42px;
    justify-content: center;
    background-color: color-mix(in srgb, var(--el-bg-color) 60%, transparent);
  }

  .mobile-trigger-btn.is-scrolling .trigger-logo,
  .mobile-trigger-btn.is-scrolling .trigger-divider {
    display: none;
  }

  .trigger-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-primary);
  }

  /* Removed logo-icon-small as it is replaced by dynamic icon */


  .trigger-divider {
    width: 1px;
    height: 16px;
    background-color: var(--el-border-color);
    margin: 0 12px;
  }

  .trigger-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-primary);
  }

  .mobile-menu-popup {
    position: absolute;
    bottom: 60px;
    right: 0;
    width: 100%;
    background-color: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
    backdrop-filter: blur(50px);
    -webkit-backdrop-filter: blur(50px);
    border: 1px solid var(--el-border-color);
    border-radius: 24px;
    padding: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mobile-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-radius: 20px;
    color: var(--el-text-color-regular);
    cursor: pointer;
    transition: all 0.2s;
  }

  .mobile-nav-item:hover {
    background-color: color-mix(in srgb, var(--el-text-color-primary) 8%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .mobile-nav-item:active {
    background-color: var(--el-fill-color);
  }

  .mobile-nav-item.active {
    background-color: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
    color: var(--el-color-primary);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .mobile-nav-label {
    font-size: 14px;
    font-weight: 500;
  }

  .mobile-menu-divider {
    height: 1px;
    background-color: var(--el-border-color);
    margin: 4px 12px;
  }

  .mobile-menu-fade-enter-active,
  .mobile-menu-fade-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .mobile-menu-fade-enter-from,
  .mobile-menu-fade-leave-to {
    opacity: 0;
    transform: translateY(10px) scale(0.95);
  }
}

html.dark .footer-nav,
html.dark .sub-dock-nav {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
  background-color: color-mix(in srgb, var(--el-bg-color) 70%, transparent);
}
</style>
