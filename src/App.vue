<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useThemeStore } from './stores/theme';
import { useLayoutStore } from './stores/layout';
import { usePlayerStore } from './stores/player';
import { useRouter, useRoute } from 'vue-router';
import MiniPlayer from './components/MiniPlayer.vue';
import { Moon, Sunny, ArrowLeft, Compass, Menu, Refresh, Collection, Close, Monitor, Edit, InfoFilled, CaretRight, Document } from '@element-plus/icons-vue';
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
  { path: '/articles', label: '文章', icon: Document },
  { path: '/about', label: '关于', icon: InfoFilled },
];

const adminMenuLoading = ref(false);
const isMobileMenuOpen = ref(false);
const isAuthed = computed(() => authStore.isLoggedIn());
// 后台管理页的侧边栏需要独立固定滚动，el-main 默认的 overflow:auto 会让内部的 sticky 失效
const isAdminDashboard = computed(() => route.path.startsWith('/admin/dashboard'));

const activeTab = computed(() => route.path.startsWith('/articles') ? '/articles' : route.path);

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

// Mini Player Logic
const radius = 14;
const circumference = 2 * Math.PI * radius;
const strokeDashoffset = computed(() => {
  if (!playerStore.duration) return circumference;
  const progress = playerStore.currentTime / playerStore.duration;
  return circumference - (progress * circumference);
});

const togglePlay = () => {
  playerStore.togglePlay();
};


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

/*
  顶栏滚动联动：页面内容往上滚进顶栏区域时，给顶栏开毛玻璃 + 下方渐隐过渡带。
  只切换一个 class，具体视觉交给 CSS（300ms ease-out 过渡），滚动回调用 rAF 合并。
*/
const isHeaderScrolled = ref(false);
let headerScrollRaf = 0;

const syncHeaderScrolled = () => {
  headerScrollRaf = 0;
  isHeaderScrolled.value = window.scrollY > 2;
};

const handleGlobalScroll = () => {
  isScrolling.value = true;
  
  if (isMobileMenuOpen.value) {
    closeMobileMenu();
  }

  // 顶栏毛玻璃状态只在这里改写，用 rAF 合并同一帧内的多次滚动回调
  if (!headerScrollRaf) {
    headerScrollRaf = window.requestAnimationFrame(syncHeaderScrolled);
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
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('click', handleWindowClick);
      window.addEventListener('touchstart', handleWindowClick, { passive: true });
    });
  } else {
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
  syncHeaderScrolled();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateSlider);
  window.removeEventListener('scroll', handleGlobalScroll);
  if (headerScrollRaf) window.cancelAnimationFrame(headerScrollRaf);
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
    case '/articles':
      return Document;
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
    // 专题 / 文章详情页正文里已经有标题了，顶栏不再重复显示
    const isDetailPage = /^\/(topics|articles)\/[^/]+$/.test(route.path);
    const title = isDetailPage ? '' : ((route.query.title as string) || (route.meta.title as string) || 'OpenStore');
    const isRoot = ['/', '/apps', '/updates', '/topics', '/submit', '/articles', '/about'].includes(route.path);
    layoutStore.setPageInfo(title, !isRoot, () => router.back());
    // 换页后滚动位置会重置，顶栏毛玻璃状态跟着重新算一次
    nextTick(syncHeaderScrolled);
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
    <el-header class="header" :class="{ 'is-header-scrolled': isHeaderScrolled }">
      <div class="header-left">
        <el-button 
          v-if="layoutStore.showBackButton" 
          link 
          @click="layoutStore.backAction" 
          class="back-btn"
        >
          <el-icon :size="24"><ArrowLeft /></el-icon>
        </el-button>
        <!-- 登录入口放在左侧品牌区：未登录点击进后台登录，已登录点开后台菜单 -->
        <el-dropdown v-else-if="isAuthed" trigger="click" @command="handleAdminCommand">
          <div class="logo-container is-clickable" role="button" tabindex="0">
            <div class="logo-icon mr-2" role="img" aria-label="Logo"></div>
            <span
              class="app-title"
              :class="{ 'is-hidden-on-mobile': layoutStore.showCustomTitle }"
            >
              OpenStore
            </span>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="dashboard">进入后台</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <div
          v-else
          class="logo-container is-clickable"
          role="button"
          tabindex="0"
          @click="goAdminLogin"
          @keydown.enter.prevent="goAdminLogin"
          @keydown.space.prevent="goAdminLogin"
        >
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
        <el-button :icon="themeIcon" circle @click="handleThemeToggle" />
      </div>
    </el-header>
    <el-main class="main-content" :class="{ 'main-content--overflow-visible': isAdminDashboard }">
      <router-view v-slot="{ Component }">
        <keep-alive include="HomeView,MusicView,AppsView,UpdatesView,TopicView,TotalRankView,GrowthRankView,HistoryRankView,NonHuaweiRankView,AppCardView,ArticlesView" :max="20">
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
      <div class="mobile-trigger-btn" :class="{ 'has-player': playerStore.currentTrack }" @click="toggleMobileMenu" ref="mobileTriggerRef">
        
        <!-- Player Trigger (Replaces Logo when playing) -->
        <div class="trigger-logo player-trigger" v-if="playerStore.currentTrack" @click.stop="togglePlay">
           <svg class="progress-ring" width="32" height="32">
             <circle
               class="progress-ring__circle"
               stroke="var(--el-color-primary)"
               stroke-width="2"
               fill="transparent"
               r="14"
               cx="16"
               cy="16"
               :style="{ strokeDasharray: `${circumference} ${circumference}`, strokeDashoffset: strokeDashoffset }"
             />
           </svg>
           <div class="mini-cover-wrapper">
             <img :src="playerStore.currentTrack.al?.picUrl || playerStore.currentTrack.album?.picUrl || playerStore.currentTrack.picUrl" class="mini-cover" :class="{ spinning: playerStore.isPlaying }" />
             <div class="play-status-icon" v-if="!playerStore.isPlaying">
               <el-icon :size="12"><CaretRight /></el-icon>
             </div>
           </div>
        </div>

        <!-- Default Logo -->
        <div class="trigger-logo" v-else>
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

/*
  el-main 默认 overflow:auto，会在文档滚动之外自己变成一个滚动容器，
  导致后台侧边栏的 position:sticky 失效；后台管理页放开裁剪即可。
*/
.main-content--overflow-visible {
  overflow: visible;
  /* 底部留给悬浮 Dock 的空间改由页面内部承担（见 AdminDashboardView），
     否则这段空白会把侧边栏的 sticky 顶出可视区 */
  padding-bottom: 0;
}

.header {
  /*
    滚动联动的可调参数：
    --header-blur  顶栏毛玻璃半径，要求 12–20px
    --header-fade  顶栏下方过渡带高度，要求 8–15px
  */
  --header-blur: 16px;
  --header-fade: 12px;
  background-color: transparent;
  -webkit-backdrop-filter: blur(0px) saturate(100%);
  backdrop-filter: blur(0px) saturate(100%);
  border-bottom: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition:
    background-color 300ms ease-out,
    border-color 300ms ease-out,
    -webkit-backdrop-filter 300ms ease-out,
    backdrop-filter 300ms ease-out;
  padding: 0 16px;
  position: sticky;
  top: 0;
  /* 必须低于 Element Plus 弹层的基础层级（2000），否则下拉菜单/气泡会被顶栏盖住一部分 */
  z-index: 1500;
  height: 60px;
}

/* 内容滚进顶栏区域：顶栏起毛玻璃，文字/按钮仍然浮在毛玻璃之上 */
.header.is-header-scrolled {
  background-color: color-mix(in srgb, var(--el-bg-color) 78%, transparent);
  -webkit-backdrop-filter: blur(var(--header-blur)) saturate(140%);
  backdrop-filter: blur(var(--header-blur)) saturate(140%);
  border-bottom-color: var(--el-border-color-lighter);
}

/* 顶栏底部往下 8–15px：从完全透明渐隐到轻微模糊，和下方内容自然衔接 */
.header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: var(--header-fade);
  pointer-events: none;
  opacity: 0;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
  transition: opacity 300ms ease-out;
}

.header.is-header-scrolled::after {
  opacity: 1;
}

/* 不支持 backdrop-filter 的内核：退回纯色背景，保证顶栏内容可读 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .header.is-header-scrolled {
    background-color: var(--el-bg-color);
  }

  .header::after {
    display: none;
  }
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
  border-radius: 8px;
  padding: 4px 6px;
  margin-left: -6px;
  transition: background-color 0.2s;
}

.logo-container.is-clickable {
  cursor: pointer;
}

.logo-container.is-clickable:hover {
  background-color: var(--el-fill-color-light);
}

.logo-container:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: 2px;
}

.app-title {
  font-size: 1.0625rem;
  font-weight: 600;
  letter-spacing: -0.01em;
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
  max-width: 90vw;
  padding: 6px 8px;
  margin-left: 12px;
  opacity: 1;
  border-width: 1px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.sub-dock-nav.is-visible::-webkit-scrollbar {
  display: none;
}
.sub-dock-nav .nav-item {
  flex: 0 0 auto;
}

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
  min-width: 64px;
  padding: 6px 14px;
  border-radius: 50px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  position: relative;
  z-index: 1;
  background: transparent !important;
}

.nav-item:hover {
  color: var(--el-text-color-primary);
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
  transform: scale(1.04);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-item:active {
  transform: scale(0.95);
}

.nav-item.active {
  color: var(--el-color-primary);
}

.nav-label {
  font-size: 11px;
  margin-top: 3px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.nav-item.active .nav-label {
  font-weight: 600;
}

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

  .trigger-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-primary);
  }

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

  .mobile-trigger-btn.has-player {
    padding-left: 8px;
  }

  .player-trigger {
    position: relative;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 0;
  }

  .progress-ring {
    position: absolute;
    top: 0;
    left: 0;
    transform: rotate(-90deg);
    pointer-events: none;
  }
  
  .progress-ring__circle {
    transition: stroke-dashoffset 0.1s linear;
    transform-origin: 50% 50%;
  }

  .mini-cover-wrapper {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    overflow: hidden;
    position: relative;
    z-index: 1;
    background-color: var(--el-fill-color-darker);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mini-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .mini-cover.spinning {
    animation: spin 10s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .play-status-icon {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    backdrop-filter: blur(2px);
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
