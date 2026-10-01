<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useThemeStore } from './stores/theme';
import { useLayoutStore } from './stores/layout';
import { usePlayerStore } from './stores/player';
import { useRouter, useRoute } from 'vue-router';
import PlayerBar from './components/PlayerBar.vue';
import RankNavigation from './components/RankNavigation.vue';
import { waitForRouteChange } from './utils/view-transition';
import { morphNavigate } from './utils/player-morph';
import { Moon, Sunny, ArrowLeft, Compass, Menu, Refresh, Collection, Close, Monitor, Edit, InfoFilled, CaretRight, Document } from '@element-plus/icons-vue';
import { useAuthStore } from './stores/auth';
import { applyPageMeta, pageShareMeta } from './utils/page-share';

const themeStore = useThemeStore();
const layoutStore = useLayoutStore();
const playerStore = usePlayerStore();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const isDockHovered = ref(false);

// Hover intent：延迟展开、延迟收起，避免鼠标路过底部 dock 时被“突袭”
const DOCK_ENTER_DELAY = 160;
const DOCK_LEAVE_DELAY = 260;
let dockEnterTimer: ReturnType<typeof setTimeout> | null = null;
let dockLeaveTimer: ReturnType<typeof setTimeout> | null = null;

const onDockEnter = () => {
  if (dockLeaveTimer) {
    clearTimeout(dockLeaveTimer);
    dockLeaveTimer = null;
  }
  if (isDockHovered.value || dockEnterTimer) return;
  dockEnterTimer = setTimeout(() => {
    dockEnterTimer = null;
    isDockHovered.value = true;
  }, DOCK_ENTER_DELAY);
};

const onDockLeave = () => {
  if (dockEnterTimer) {
    clearTimeout(dockEnterTimer);
    dockEnterTimer = null;
  }
  if (dockLeaveTimer) clearTimeout(dockLeaveTimer);
  dockLeaveTimer = setTimeout(() => {
    dockLeaveTimer = null;
    isDockHovered.value = false;
  }, DOCK_LEAVE_DELAY);
};

/*
 * Dock 是 fixed + 居中的：只要它自己变宽，居中基准就会把它整体推走。
 * 所以收起态先量出胶囊宽度，用 left: calc(50% - 宽/2) 把「左边缘」钉死，
 * 展开时只往右生长。宽度放不下一条完整胶囊时（窄窗口），次级入口改到上方浮层。
 */
const dockWrapperRef = ref<HTMLElement | null>(null);
const footerNavRef = ref<HTMLElement | null>(null);
const subDockRef = ref<HTMLElement | null>(null);
/** 叠放模式下次级入口的落点（见模板里的 .dock-sub-portal） */
const subPortalRef = ref<HTMLElement | null>(null);

const dockBaseWidth = ref(0);
const dockSubWidth = ref('301px');
const isDockStacked = ref(window.innerWidth < 1024);

/** 次级入口的净增量：主入口外侧的负外边距，用来抵消胶囊自身的 flex gap */
const DOCK_SUB_OFFSET = 4;
/** 分隔线：1px 线 + 左右各 8px 外边距 */
const DOCK_DIVIDER_WIDTH = 17;

const measureDock = () => {
  const base = footerNavRef.value;
  const sub = subDockRef.value;
  if (!base || !sub) return;

  const baseRect = base.getBoundingClientRect();
  const mainItems = Array.from(base.querySelectorAll<HTMLElement>(':scope > .nav-item'));
  const subItems = Array.from(sub.querySelectorAll<HTMLElement>('.nav-item'));
  if (!mainItems.length || !subItems.length || !baseRect.width) return;

  /*
    收起态宽度只用「主入口 + 内边距」推算，不读胶囊自身的宽度：
    展开/收起动画期间胶囊宽度一直在变，读它会量到中间值。
  */
  const first = mainItems[0].getBoundingClientRect();
  const last = mainItems[mainItems.length - 1].getBoundingClientRect();
  const inset = first.left - baseRect.left;
  const baseWidth = Math.round(last.right - first.left + inset * 2);

  const gap = 4;
  /*
   * 间距个数按「flex 子项数 - 1」算，而子项里还有一个分隔线（::before），
   * 所以真正的子项数是 subItems.length + 1，gap 数刚好等于 subItems.length。
   * 以前减了 1，容器就比内容窄 4px —— 它带 overflow: hidden，
   * 最后一个入口的右端会被裁成直角，悬停高亮就像是"戳出胶囊外面"。
   */
  const gapCount = subItems.length;
  const itemsWidth =
    subItems.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) +
    gap * gapCount;
  const subWidth = Math.ceil(itemsWidth + DOCK_DIVIDER_WIDTH);
  const growWidth = subWidth - DOCK_SUB_OFFSET;

  dockBaseWidth.value = baseWidth;
  dockSubWidth.value = `${subWidth}px`;
  // 展开后右边会不会顶出视口：会的话退回「主胶囊上方浮层」
  isDockStacked.value = window.innerWidth < baseWidth + growWidth * 2 + 24;
};

const dockWrapperStyle = computed(() =>
  dockBaseWidth.value
    ? { left: `calc(50% - ${dockBaseWidth.value / 2}px)`, transform: 'none' }
    : {}
);

// 收起之后重新量一次：路由/布局变化可能让胶囊宽度不一样了
watch(isDockHovered, (hovered) => {
  if (!hovered) nextTick(measureDock);
});

const subDockItems = [
  { path: '/submit', label: '投稿', icon: Edit },
  { path: '/articles', label: '文章', icon: Document },
  { path: '/about', label: '关于', icon: InfoFilled },
];

const adminMenuLoading = ref(false);
const isMobileMenuOpen = ref(false);
const isAuthed = computed(() => authStore.isLoggedIn());

/*
 * 应用挂载时路由还没完成首次解析，此时 route.path 还是默认的 '/'，
 * 直接按它渲染就会先画一次前台外壳（底部 Dock、移动端导航），看起来像「从首页进后台」。
 * 首屏先用真实地址判断，等路由就绪后交回 route.path。
 */
const initialPath = window.location.pathname;
const routerReady = ref(false);
router.isReady().then(() => {
  routerReady.value = true;
});
const shellPath = computed(() => (routerReady.value ? route.path : initialPath));

// 后台管理页的侧边栏需要独立固定滚动，el-main 默认的 overflow:auto 会让内部的 sticky 失效
const isAdminDashboard = computed(() => shellPath.value.startsWith('/admin/dashboard'));
/** 后台页面不展示底部 Dock 与移动端导航（后台有自己的侧边栏/顶栏导航） */
const isAdminRoute = computed(() => shellPath.value.startsWith('/admin'));
/** 四个榜单页共用一条页签条（见模板里的 .rank-nav-shell） */
const isRankRoute = computed(() => shellPath.value.startsWith('/rank'));
/** 音乐页不展示 Dock：把底部这块位置让给迷你播放条 */
const isMusicRoute = computed(() => shellPath.value === '/music');
/** 播放页同样是「播放态」页面，也不展示 Dock（页面本身就是播放器） */
const isPlaybackRoute = computed(() => isMusicRoute.value || shellPath.value === '/player');
/**
 * 播放页：沉浸式的深色页面。
 * 顶栏的主题切换按钮在这里没有意义（页面强制深色），所以隐藏掉。
 */
const isPlayerPage = computed(() => shellPath.value === '/player');
/**
 * 有歌在放时，桌面端把整条 Dock 收成移动端那种紧凑按钮，
 * 迷你播放器保持原样，单独留在左下角完整显示。
 */
const isDockCollapsed = computed(() => !!playerStore.currentTrack);

/**
 * 迷你播放条：
 * - 桌面端所有前台页面通用（播放页本身就是播放器，不再叠一条）；
 * - 移动端只在音乐页出现 —— 那页没有 dock 也没有紧凑按钮，否则底部就没有播放器了；
 *   其他页面继续用右下角那颗带唱片的紧凑按钮。
 */
const showPlayerBar = computed(
  () =>
    !isAdminRoute.value &&
    shellPath.value !== '/player' &&
    (isDesktopViewport.value || isMusicRoute.value)
);

watch(isDockCollapsed, () => {
  nextTick(updateSlider);
  nextTick(measureDock);
});

/*
 * 进入播放页强制深色、离开恢复用户原本的偏好。
 * 用 store 里的「强制」开关而不是改 preference：后者会把深色写进 localStorage，
 * 用户下次直接打开播放页时偏好就被永久改成深色了。
 */
watch(isPlayerPage, (onPlayerPage) => themeStore.setForcedDark(onPlayerPage), { immediate: true });

const activeTab = computed(() => (shellPath.value.startsWith('/articles') ? '/articles' : shellPath.value));

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
/**
 * 首次定位完成前不上过渡：
 * 刷新时滑块的初始值是 left/width 都是 0、opacity 0，定位完才跳到真实位置。
 * 如果一开始就带 transition，这一跳会被播放成「从最左边长出来 + 淡入」，
 * 看着就是整条 dock 在动。和 RankNavigation 的页签下划线同一套处理。
 */
const sliderReady = ref(false);
/** dock 本体同理：首次摆放（等价的空跳）不上过渡 */
const dockReady = ref(false);

const isScrolling = ref(false);
let scrollTimer: number | undefined;

/** 桌面宽度：迷你播放条只在桌面端出现，移动端保持原来那颗唱片按钮 */
const isDesktopViewport = ref(true);
const syncViewport = () => {
  isDesktopViewport.value = window.innerWidth > 480;
};

// Mini Player Logic（移动端紧凑按钮里的唱片）
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
  nextTick(measureDock);
  // 等首帧把滑块摆到位之后再打开过渡：进页面时它已经在正确位置，不需要"滑进来"
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sliderReady.value = true;
    dockReady.value = true;
  }));
  window.addEventListener('resize', updateSlider);
  window.addEventListener('resize', measureDock);
  syncViewport();
  window.addEventListener('resize', syncViewport);
  window.addEventListener('scroll', handleGlobalScroll, { passive: true });
  syncHeaderScrolled();
  // 字体/图标就位后胶囊宽度可能变一点，重新量一次基准
  document.fonts?.ready.then(() => nextTick(measureDock));
});

onUnmounted(() => {
  if (dockEnterTimer) clearTimeout(dockEnterTimer);
  if (dockLeaveTimer) clearTimeout(dockLeaveTimer);
  window.removeEventListener('resize', updateSlider);
  window.removeEventListener('resize', syncViewport);
  window.removeEventListener('resize', measureDock);
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
    // 播放页正文本身就是「正在播放」，顶栏同样不用再挂一个标题
    const hideHeaderTitle = isDetailPage || route.path === '/player';
    const title = hideHeaderTitle ? '' : ((route.query.title as string) || (route.meta.title as string) || 'OpenStore');
    const isRoot = ['/', '/apps', '/updates', '/topics', '/submit', '/articles', '/about'].includes(route.path);
    /*
     * 榜单页之间可以互相跳（顶部那排页签），这时浏览器历史里前一条就是「上一个榜单」，
     * 直接 router.back() 会退回上一个榜单而不是主页 —— 用户明确要求回主页，
     * 所以 /rank/* 一律返回首页；其它页面维持原来的「回上一页」。
     */
    const isRankPage = route.path.startsWith('/rank');
    layoutStore.setPageInfo(title, !isRoot, isRankPage ? () => router.push('/') : () => router.back());
    // 换页后滚动位置会重置，顶栏毛玻璃状态跟着重新算一次
    nextTick(syncHeaderScrolled);
  },
  { immediate: true }
);

const goAdminLogin = () => {
  router.push('/admin/login');
};

/*
  信息页（应用 / 更新 / 专题 / 文章详情）把「资源图片 + 文字」注册进 pageShareMeta 后，
  立刻刷新 og / twitter 卡片，这样分享出去的链接带的就是当前页面的图和文案。
*/
watch(pageShareMeta, () => {
  applyPageMeta({
    path: route.path,
    fullPath: route.fullPath,
    query: route.query as Record<string, any>,
    meta: route.meta as Record<string, any>,
  });
});

/*
 * 顶栏返回：从播放页返回时也走共享元素转场 —— 大唱片会收回到底部的迷你播放器里，
 * 和展开过去时对称。其它页面保持原来的返回行为。
 */
const handleBack = () => {
  if (isPlayerPage.value) {
    void morphNavigate('fromPlayer', async () => {
      /*
       * 这里必须等导航真正完成再让浏览器拍「新快照」：
       * router.back() 返回 void，导航发生在稍后的 popstate 里，
       * 不等的话新快照拍到的还是播放页，退场就没有补间动画了。
       */
      const navigated = waitForRouteChange(router);
      layoutStore.backAction();
      await navigated;
    });
    return;
  }
  layoutStore.backAction();
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
          @click="handleBack" 
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
        <!-- 播放页是强制深色的沉浸式页面，这里不提供主题切换 -->
        <el-button v-if="!isPlayerPage" :icon="themeIcon" circle @click="handleThemeToggle" />
      </div>
    </el-header>
    <el-main class="main-content" :class="{ 'main-content--overflow-visible': isAdminDashboard }">
      <!--
        四个榜单页共用同一条页签条：放在 keep-alive 外面，切页签时它不会被重建。
        之前每个榜单页各自渲染一份，切换时整份被换掉、下划线只能"跳"到新位置 ——
        只有跨页面复用同一个元素，transition 才有得可animate，看起来才是滑过去的。
      -->
      <div v-if="isRankRoute" class="rank-nav-shell">
        <RankNavigation />
      </div>
      <router-view v-slot="{ Component }">
        <!--
          前台页面都缓存：切走只是挂起、切回来直接复用上次的 DOM 和数据，不再重新请求。
          这里用 include 白名单列出前台视图（组件名取自文件名），后台/登录页不缓存。
          漏掉某个页面时它只是走回原来的「每次重新加载」，不会出错。
        -->
        <keep-alive
          include="HomeView,MusicView,PlayerView,AppsView,UpdatesView,TopicView,TotalRankView,GrowthRankView,HistoryRankView,NonHuaweiRankView,CategoryRankView,AppCardView,ArticlesView,AboutView,SubmissionView,SystemStatusView,ArticleDetailView,TopicDetailView,UpdatesAppDetailView,AppDashboardView,DetailView,NextAppDetailView"
          :max="30"
        >
          <component :is="Component" :key="route.path" />
        </keep-alive>
      </router-view>
    </el-main>
    <div
      v-if="!isAdminRoute && !isPlaybackRoute && !isDockCollapsed"
      ref="dockWrapperRef"
      class="dock-wrapper desktop-nav"
      :class="{ 'is-stacked': isDockStacked, 'is-ready': dockReady }"
      :style="dockWrapperStyle"
      @mouseenter="onDockEnter"
      @mouseleave="onDockLeave"
    >
      <!--
        次级入口的「传送落点」。
        叠放模式下 投稿/文章/关于 会传送到这里，成为主胶囊的兄弟节点而不是后代 ——
        因为主胶囊带 backdrop-filter，是一张 backdrop root，
        挂在它里面的元素再写 backdrop-filter 也糊不到页面（背后是空的），
        上面那块就会透出清晰的色块、和下面那块材质对不上。
        宽窗口下 Teleport 关掉，节点还在主胶囊里，靠右展开那套逻辑一行不用改。
      -->
      <div ref="subPortalRef" class="dock-sub-portal"></div>
      <div v-if="!isDockCollapsed" ref="footerNavRef" class="footer-nav">
        <!-- Dock Progress Bar -->
        <div 
          class="dock-progress-bar" 
          :style="{ width: `${playProgress}%` }"
          v-if="playerStore.currentTrack"
        ></div>

        <div class="nav-slider" :class="{ 'is-ready': sliderReady }" :style="sliderStyle"></div>
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

        <!--
          次级入口（投稿/文章/关于）是同一条胶囊的一部分：
          悬停时胶囊往右变长把它们「拉」出来，主入口一步都不动。
        -->
        <Teleport :to="subPortalRef" :disabled="!isDockStacked || !subPortalRef">
          <div
            v-if="!isDockCollapsed"
            ref="subDockRef"
            class="sub-dock-nav"
            :class="{ 'is-visible': isDockHovered }"
            :style="{ '--dock-sub-w': dockSubWidth }"
          >
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
        </Teleport>
      </div>
    </div>

    <!-- 迷你播放条：所有前台页面通用（播放页本身就是播放器，不再叠一条） -->
    <PlayerBar v-if="showPlayerBar" />

    <!-- Mobile Navigation -->
    <div
      v-if="!isAdminRoute && !isPlaybackRoute"
      class="mobile-nav-container"
      :class="{ 'is-desktop': isDockCollapsed, 'is-above-bar': showPlayerBar }"
    >
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

      <!--
        Trigger Button：移动端播放时这里就是迷你播放器（唱片 + 播放/暂停）；
        桌面端播放条由底部的 PlayerBar 承担，这里退化成导航入口。
      -->
      <div
        class="mobile-trigger-btn"
        :class="{ 'has-player': playerStore.currentTrack && !isDesktopViewport }"
        @click="toggleMobileMenu"
        ref="mobileTriggerRef"
      >
        <div
          class="trigger-logo player-trigger"
          v-if="playerStore.currentTrack && !isDesktopViewport"
          @click.stop="togglePlay"
        >
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
 * 榜单页签条的外壳：和四个榜单页自己的内容对齐（同样是 1200 居中 + 20px 内边距），
 * 只是它活在 keep-alive 外面，所以切换页签时元素不会被重建。
 */
.rank-nav-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 20px 0;
}

@media (max-width: 768px) {
  .rank-nav-shell {
    padding: 16px 12px 0;
  }
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
  /* 顶栏不用下边线：滚动时只靠毛玻璃 + 下方的渐隐过渡带和内容区分（保留 1px 透明边框是为了不影响高度） */
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
}

/*
 * 首次摆放不走过渡：初始那套「left:50% + translateX(-50%)」和量完基准后的
 * 「left:calc(50% - w/2) + none」是等价的，这一跳本来就没有位移。
 * 但胶囊背后是 backdrop-filter 的毛玻璃，固定定位元素上白跑 0.4s 的
 * left/transform 过渡，只会让这一整块每帧重新合成一遍。
 * 首次定位之后再打开过渡：字体加载完的那次重新量基准要是真有偏差，照样会补间。
 */
.dock-wrapper.is-ready {
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
  /*
    次级入口就是同一条胶囊的一部分：收起时宽度 0（被裁掉），
    展开时把胶囊整体往右拉长。负外边距抵消父级 flex gap，
    保证收起态的胶囊宽度和以前一模一样（398px）。
  */
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;

  box-sizing: content-box;
  width: 0;
  padding: 0;
  margin-left: -4px;
  border: 0 solid var(--el-border-color);
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  white-space: nowrap;

  transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1),
              padding 0.4s cubic-bezier(0.25, 1, 0.5, 1),
              border-width 0.4s cubic-bezier(0.25, 1, 0.5, 1),
              opacity 0.28s ease;
}

/* 主入口与次级入口之间的分隔线 */
.sub-dock-nav::before {
  content: '';
  flex: 0 0 auto;
  align-self: stretch;
  width: 1px;
  margin: 9px 8px;
  background-color: var(--el-border-color);
  opacity: 0;
  transition: opacity 0.2s ease 0.1s;
}

.sub-dock-nav.is-visible {
  width: var(--dock-sub-w, 300px);
  opacity: 1;
  pointer-events: auto;
}

.sub-dock-nav.is-visible::before {
  opacity: 1;
}

/*
  窄窗口放不下一条完整胶囊（展开后右边会顶出屏幕），
  退回「主胶囊上方的浮层」——同样不影响主入口位置。

  入场做成「从主胶囊里升上来」：收起时整块沉到主胶囊顶边以下，
  由 .dock-sub-portal 这道闸门裁掉；展开时一路升到主胶囊上方，收起则原路沉回去。
*/
.dock-wrapper.is-stacked .sub-dock-nav {
  position: absolute;
  left: 50%;
  top: auto;
  bottom: 10px;
  /* 84px ≈ 胶囊高度 + 上方那 10px 间隙，收起时刚好整块沉到闸门以下 */
  transform: translate(-50%, 84px);
  width: auto;
  max-width: 0;
  margin-left: 0;
  padding: 0;
  background-color: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
  backdrop-filter: blur(20px);
  border-radius: 50px;
  /* 闸门已经把它藏干净了，不需要再淡入淡出 */
  opacity: 1;
  transition: max-width 0.42s cubic-bezier(0.25, 1, 0.5, 1),
              padding 0.42s cubic-bezier(0.25, 1, 0.5, 1),
              border-width 0.42s cubic-bezier(0.25, 1, 0.5, 1),
              transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.dock-wrapper.is-stacked .sub-dock-nav.is-visible {
  transform: translate(-50%, 0);
  max-width: var(--dock-sub-w, 300px);
  padding: 6px 8px;
  border-width: 1px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.dock-wrapper.is-stacked .sub-dock-nav::before {
  display: none;
}

/* 浮层要探出胶囊外，所以叠放模式下不裁剪胶囊；进度条自己带圆角补回来 */
.dock-wrapper.is-stacked .footer-nav {
  overflow: visible;
}

.dock-wrapper.is-stacked .dock-progress-bar {
  border-radius: 50px;
}

/*
  叠放模式是两块独立的毛玻璃。两块都靠自己的 backdrop-filter 去糊页面 ——
  次级入口不能挂在主胶囊的子树里（见模板里的 .dock-sub-portal），
  否则主胶囊那张 backdrop root 会让它糊个空，透出清晰的色块。

  底色沿用普通胶囊的透光量（浅色 80% / 暗色 70%，见 .footer-nav 那几条规则），
  别把它提到 94%：底色一厚，糊没糊在肉眼上就没区别了，毛玻璃等于白做。

  下面这块占位就是次级入口的传送落点：普通布局下只是个零尺寸空盒子。
*/
.dock-sub-portal {
  width: 0;
  height: 0;
}

/*
  叠放模式下这块占位兼作「闸门」：底边贴着主胶囊的顶边，往下多余的部分全裁掉，
  收起时次级胶囊沉在闸门下面一点都露不出来，展开时从主胶囊顶边升上来。
  闸门自己不吃事件（pointer-events: none），否则那一整片会把页面的点击挡掉；
  胶囊可见时会自己把事件打开（见 .sub-dock-nav.is-visible）。
*/
.dock-wrapper.is-stacked .dock-sub-portal {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  width: auto;
  height: 260px;
  overflow: hidden;
  pointer-events: none;
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
  pointer-events: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 只有首次定位完成之后才走过渡：否则刷新时它会从最左边"长出来" */
.nav-slider.is-ready {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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

/*
 * 紧凑导航按钮：窄屏默认就用它；桌面端在「有歌在放」时把 Dock 收成同一个按钮，
 * 底部的位置让给迷你播放器。
 */
@media (max-width: 480px) {
  .desktop-nav {
    display: none !important;
  }

  .mobile-nav-container {
    display: block;
  }
}

.mobile-nav-container.is-desktop {
  display: block;
}

.mobile-nav-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2100;
}

/* 桌面端播放中：菜单按内容宽度排，别为几个字撑出一大块 */
.mobile-nav-container.is-desktop .mobile-menu-popup {
  width: max-content;
  min-width: 0;
}

/* 桌面端播放条占了底部，紧凑按钮抬到它上面，避免叠在一起 */
.mobile-nav-container.is-above-bar {
  bottom: 92px;
}

/* 移动端播放时，按钮里显示的是唱片本身（原样保留） */
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
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  backdrop-filter: blur(2px);
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


/*
  暗色下只有胶囊本身需要背景/阴影。
  次级入口内联在胶囊里（B 方案），再给它单独铺一层会叠出深浅不一的色块。
*/
html.dark .footer-nav {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
  background-color: color-mix(in srgb, var(--el-bg-color) 70%, transparent);
}

/* 窄窗口下次级入口是独立浮层，需要自己那份暗色背景与阴影（底色与主胶囊对齐） */
html.dark .dock-wrapper.is-stacked .sub-dock-nav.is-visible {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
  background-color: color-mix(in srgb, var(--el-bg-color) 70%, transparent);
}
</style>
