<template>
  <div class="admin-dashboard">
    <div class="admin-layout" :class="{ 'is-collapsed': menuCollapsed }">
      <!--
        宽屏：左侧面板式导航（分组 + 菜单项 + 底部操作）。
        窄屏：导航变成顶部栏，只列分类，点分类才展开该分类下的菜单。
        菜单项统一由 MENU_GROUPS 渲染，方便“设置菜单显示隐藏”里做勾选。
      -->
      <aside class="admin-sidebar" :class="{ 'is-collapsed': menuCollapsed, 'is-scrolled': isPageScrolled }">
      <template v-if="!isNarrow">
        <!-- 顶部品牌：logo + 站点名（logo 与顶栏同一个 mask 图案） -->
        <div class="admin-brand">
          <span class="admin-brand-logo" role="img" aria-label="OpenStore"></span>
          <span class="admin-brand-name">OpenStore</span>
        </div>

        <div class="admin-menu-wrap">
          <el-menu
            :default-active="active"
            :collapse="menuCollapsed"
            :collapse-transition="false"
            class="admin-menu"
            @select="handleSelect"
          >
            <el-menu-item-group v-for="group in visibleMenuGroups" :key="group.title" :title="group.title">
              <el-menu-item v-for="item in group.items" :key="item.key" :index="item.key">
                <el-icon><component :is="item.icon" /></el-icon>
                <template #title>{{ item.label }}</template>
              </el-menu-item>
            </el-menu-item-group>
          </el-menu>
        </div>

        <!-- 底部两个操作：伸缩菜单栏 / 设置菜单显示隐藏（宝塔面板同款） -->
        <div class="nav-actions">
          <el-tooltip :content="menuCollapsed ? '展开菜单栏' : '伸缩菜单栏'" placement="top" :show-after="150">
            <button class="nav-action" type="button" @click="toggleNavCollapsed">
              <el-icon><Expand v-if="menuCollapsed" /><Fold v-else /></el-icon>
            </button>
          </el-tooltip>

          <!-- 设置面板做成两列、从按钮往上弹，避免又高又贴底 -->
          <el-popover
            placement="top-start"
            :width="224"
            :offset="10"
            :show-arrow="false"
            trigger="click"
            popper-class="admin-nav-settings-popper"
          >
            <template #reference>
              <button class="nav-action" type="button" title="设置菜单显示隐藏">
                <el-icon><MenuSettingIcon /></el-icon>
              </button>
            </template>
            <div class="nav-settings">
              <div class="nav-settings-head">
                <span>菜单显示</span>
                <el-button link type="primary" size="small" @click="resetMenuVisibility">恢复默认</el-button>
              </div>
              <div class="nav-settings-body">
                <div v-for="group in MENU_GROUPS" :key="group.title" class="nav-settings-group">
                  <div class="nav-settings-group-title">{{ group.title }}</div>
                  <div class="nav-settings-grid">
                    <el-checkbox
                      v-for="item in group.items"
                      :key="item.key"
                      :model-value="!hiddenMenuKeys.includes(item.key)"
                      :disabled="item.key === active"
                      @change="(checked: any) => setMenuVisible(item.key, !!checked)"
                    >
                      {{ item.label }}
                    </el-checkbox>
                  </div>
                </div>
              </div>
            </div>
          </el-popover>
        </div>
      </template>

      <!-- 窄屏顶部栏：只显示分类，点分类展开该分类下的菜单 -->
      <div v-else class="topnav">
        <div class="topnav-groups">
          <button
            v-for="group in visibleMenuGroups"
            :key="group.title"
            type="button"
            class="topnav-group"
            :class="{
              'is-active': group.title === activeGroupTitle,
              'is-open': group.title === openGroupTitle,
              'is-single': group.items.length === 1
            }"
            :aria-expanded="group.items.length > 1 ? group.title === openGroupTitle : undefined"
            @click="handleGroupClick(group)"
          >
            <span>{{ group.title }}</span>
            <!-- 只有一个菜单项的分类（如“概览”）不是分类，直接进对应页面，不给下拉箭头 -->
            <el-icon v-if="group.items.length > 1" class="topnav-caret"><ArrowDown /></el-icon>
          </button>
        </div>

        <div v-if="openGroup" class="topnav-items">
          <button
            v-for="item in openGroup.items"
            :key="item.key"
            type="button"
            class="topnav-item"
            :class="{ 'is-active': item.key === active }"
            @click="selectTopnavItem(item.key)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
      </aside>

      <section class="admin-content">
        <!--
          面板标题行：与侧边栏顶部对齐，同时留出右上角位置放该面板的主操作按钮
          （视图里 .toolbar / .text-right 的按钮会被拉到这一行的右侧）
          数据总览本身就是首页，不重复写标题。
        -->
        <div v-if="active !== 'overview'" class="pane-head">
          <h2 class="pane-title">{{ currentSection.title }}</h2>
          <span class="pane-hint">{{ currentSection.hint }}</span>
        </div>
        <div v-if="active === 'overview'" class="admin-pane">
          <DashboardOverviewView @switch-tab="handleSwitchTab" />
        </div>
        <div v-else-if="active === 'music-apis'" class="admin-pane">
          <MusicApisAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'links'" class="admin-pane">
          <FriendLinksView :embedded="true" />
        </div>
        <div v-else-if="active === 'groups'" class="admin-pane">
          <GroupChatsView :embedded="true" />
        </div>
        <div v-else-if="active === 'apps'" class="admin-pane">
          <AppsAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'announcements'" class="admin-pane">
          <AnnouncementsView :embedded="true" />
        </div>
        <div v-else-if="active === 'articles'" class="admin-pane">
          <ArticlesAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'comments'" class="admin-pane">
          <CommentsAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'env'" class="admin-pane">
          <EnvManagerView :embedded="true" />
        </div>
        <div v-else-if="active === 'incidents'" class="admin-pane">
          <IncidentsAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'changelogs'" class="admin-pane">
          <ChangelogsAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'site-cards'" class="admin-pane">
          <SiteCardsAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'about'" class="admin-pane">
          <AboutManageView :embedded="true" />
        </div>
        <div v-else-if="active === 'visitors'" class="admin-pane">
          <VisitorLogsView :embedded="true" />
        </div>
        <div v-else-if="active === 'logs'" class="admin-pane">
          <SystemLogsView :embedded="true" />
        </div>
        <div v-else-if="active === 'feedbacks'" class="admin-pane">
          <FeedbackAdminView :embedded="true" />
        </div>
        <div v-else-if="active === 'settings'" class="admin-pane">
          <SystemSettingsView />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
  import type { Component } from 'vue';
  import { useRouter } from 'vue-router';
  import { useLayoutStore } from '../../stores/layout';
import {
  DataLine,
  Grid,
  Bell,
  Document,
  ChatLineSquare,
  Picture,
  InfoFilled,
  Connection,
  Link,
  ChatDotRound,
  Message,
  View,
  List,
  Key,
  Warning,
  Memo,
  Setting,
  Expand,
  Fold,
  ArrowDown,
} from '@element-plus/icons-vue';

  import FriendLinksView from './FriendLinksView.vue';
  import MenuSettingIcon from '../../components/MenuSettingIcon.vue';
import MusicApisAdminView from './MusicApisAdminView.vue';
  import GroupChatsView from './GroupChatsView.vue';
  import AppsAdminView from './AppsAdminView.vue';
  import AnnouncementsView from './AnnouncementsView.vue';
  import ArticlesAdminView from './ArticlesAdminView.vue';
import CommentsAdminView from './CommentsAdminView.vue';
  import EnvManagerView from './EnvManagerView.vue';
import VisitorLogsView from './VisitorLogsView.vue';
import SystemLogsView from './SystemLogsView.vue';
import IncidentsAdminView from './IncidentsAdminView.vue';
import ChangelogsAdminView from './ChangelogsAdminView.vue';
import SiteCardsAdminView from './SiteCardsAdminView.vue';
import AboutManageView from './AboutManageView.vue';
import FeedbackAdminView from './FeedbackAdminView.vue';
import SystemSettingsView from './SystemSettingsView.vue';
import DashboardOverviewView from './DashboardOverviewView.vue';

const active = ref<'overview' | 'links' | 'groups' | 'apps' | 'announcements' | 'articles' | 'comments' | 'env' | 'visitors' | 'logs' | 'changelogs' | 'site-cards' | 'about' | 'incidents' | 'music-apis' | 'feedbacks' | 'settings'>('overview');

// 面板标题：侧边栏只显示名称，这里补一行标题 + 一句提示，让右侧内容有明确的落点
const SECTIONS: Record<string, { title: string; hint: string }> = {
  overview: { title: '数据总览', hint: '访问、内容与实时服务状态' },
  apps: { title: '应用管理', hint: '应用上下架与审核' },
  announcements: { title: '公告管理', hint: '公告分类与发布' },
  articles: { title: '文章管理', hint: '分类、标签与文章' },
  comments: { title: '评论管理', hint: '评论审核与筛选' },
  'site-cards': { title: '首页配置', hint: '首页卡片与排序' },
  about: { title: '关于页面', hint: '站点信息与版本' },
  'music-apis': { title: '接口管理', hint: '第三方接口与可用性检测' },
  links: { title: '链接管理', hint: '友情链接' },
  groups: { title: '群聊管理', hint: '群聊信息' },
  feedbacks: { title: '用户反馈', hint: '提交记录与限频' },
  visitors: { title: '访客日志', hint: '访问记录与筛选' },
  logs: { title: '系统日志', hint: '后台操作记录' },
  env: { title: '环境变量', hint: '.env 配置项' },
  incidents: { title: '故障维护', hint: '故障与维护公告' },
  changelogs: { title: '更新日志', hint: '版本更新记录' },
  settings: { title: '系统设置', hint: '主题配色与实时预览' },
};

const currentSection = computed(() => SECTIONS[active.value] ?? { title: '', hint: '' });

// 菜单结构（分组 + 图标）：菜单渲染和“设置菜单显示隐藏”共用这份数据
const MENU_GROUPS: { title: string; items: { key: string; label: string; icon: Component }[] }[] = [
  { title: '概览', items: [{ key: 'overview', label: '数据总览', icon: DataLine }] },
  {
    title: '内容',
    items: [
      { key: 'apps', label: '应用管理', icon: Grid },
      { key: 'announcements', label: '公告管理', icon: Bell },
      { key: 'articles', label: '文章管理', icon: Document },
      { key: 'comments', label: '评论管理', icon: ChatLineSquare },
      { key: 'site-cards', label: '首页配置', icon: Picture },
      { key: 'about', label: '关于页面', icon: InfoFilled },
    ],
  },
  {
    title: '运营',
    items: [
      { key: 'music-apis', label: '接口管理', icon: Connection },
      { key: 'links', label: '链接管理', icon: Link },
      { key: 'groups', label: '群聊管理', icon: ChatDotRound },
      { key: 'feedbacks', label: '用户反馈', icon: Message },
    ],
  },
  {
    title: '数据',
    items: [
      { key: 'visitors', label: '访客日志', icon: View },
      { key: 'logs', label: '系统日志', icon: List },
    ],
  },
  {
    title: '运维',
    items: [
      { key: 'env', label: '环境变量', icon: Key },
      { key: 'incidents', label: '故障维护', icon: Warning },
      { key: 'changelogs', label: '更新日志', icon: Memo },
      { key: 'settings', label: '系统设置', icon: Setting },
    ],
  },
];

const NAV_COLLAPSED_KEY = 'admin.nav.collapsed';
const NAV_HIDDEN_KEY = 'admin.nav.hidden';

const readStoredJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

// 伸缩菜单栏 / 菜单显示隐藏 都是本地偏好，存 localStorage
const isNavCollapsed = ref(localStorage.getItem(NAV_COLLAPSED_KEY) === '1');
const hiddenMenuKeys = ref<string[]>(readStoredJson<string[]>(NAV_HIDDEN_KEY, []));
const isNarrow = ref(window.matchMedia('(max-width: 900px)').matches);
// 窄屏是横向胶囊行，折叠态没有意义，强制展开
const menuCollapsed = computed(() => isNavCollapsed.value && !isNarrow.value);

const visibleMenuGroups = computed(() =>
  MENU_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => !hiddenMenuKeys.value.includes(item.key)) }))
    .filter((group) => group.items.length > 0)
);

// 窄屏顶部栏：默认收起，点分类才展开该分类下的菜单
const openGroupTitle = ref<string | null>(null);
const activeGroupTitle = computed(
  () => visibleMenuGroups.value.find((group) => group.items.some((item) => item.key === active.value))?.title ?? ''
);
const openGroup = computed(
  () => visibleMenuGroups.value.find((group) => group.title === openGroupTitle.value) ?? null
);

const toggleMobileGroup = (title: string) => {
  openGroupTitle.value = openGroupTitle.value === title ? null : title;
};

// 只有一个菜单项的分类（如“概览”）直接进页面，不展开菜单
const handleGroupClick = (group: { title: string; items: { key: string }[] }) => {
  if (group.items.length === 1) {
    selectTopnavItem(group.items[0].key);
    return;
  }
  toggleMobileGroup(group.title);
};

const selectTopnavItem = (key: string) => {
  handleSelect(key);
  openGroupTitle.value = null;
};

/*
  窄屏那条分类顶栏也做和全站顶栏一样的滚动联动：
  内容滚到它下面时变成一块悬浮毛玻璃（圆角 + 描边 + 投影）并带下方渐隐过渡带，
  滚动回调用 rAF 合并，避免每帧都写状态。
*/
const isPageScrolled = ref(false);
let pageScrollRaf = 0;

const syncPageScrolled = () => {
  pageScrollRaf = 0;
  isPageScrolled.value = window.scrollY > 2;
};

const handlePageScroll = () => {
  if (pageScrollRaf) return;
  pageScrollRaf = window.requestAnimationFrame(syncPageScrolled);
};

// 换页（含总览里的快捷操作）时收起展开的分类
watch(active, () => {
  openGroupTitle.value = null;
});

// 展开的菜单是浮层：点空白处收起
const handleOutsideClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && target.closest('.topnav')) return;
  openGroupTitle.value = null;
};

watch(openGroupTitle, (title) => {
  if (title) document.addEventListener('click', handleOutsideClick, true);
  else document.removeEventListener('click', handleOutsideClick, true);
});

const toggleNavCollapsed = () => {
  isNavCollapsed.value = !isNavCollapsed.value;
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, isNavCollapsed.value ? '1' : '0');
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
};

const persistHiddenMenus = () => {
  try {
    localStorage.setItem(NAV_HIDDEN_KEY, JSON.stringify(hiddenMenuKeys.value));
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
};

const setMenuVisible = (key: string, visible: boolean) => {
  const next = new Set(hiddenMenuKeys.value);
  if (visible) next.delete(key);
  else next.add(key);
  hiddenMenuKeys.value = Array.from(next);
  persistHiddenMenus();
};

const resetMenuVisibility = () => {
  hiddenMenuKeys.value = [];
  persistHiddenMenus();
};

const router = useRouter();
  const layoutStore = useLayoutStore();
  const goHome = () => router.push('/');
  
// 切换面板时回到顶部：内容区是页面级滚动，不重置的话新面板会停在半截
const scrollToTop = () => {
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
};

  const handleSelect = (key: string) => {
  if (key === active.value) return;
  active.value = key as typeof active.value;
  scrollToTop();
};

const handleSwitchTab = (tabName: any) => {
    if (tabName === active.value) return;
    active.value = tabName;
    scrollToTop();
  };

  const navMediaQuery = window.matchMedia('(max-width: 900px)');
  const handleNavMediaChange = (event: MediaQueryListEvent) => {
    isNarrow.value = event.matches;
  };

  onMounted(() => {
    layoutStore.setPageInfo('后台管理', true, goHome);
    navMediaQuery.addEventListener('change', handleNavMediaChange);
    window.addEventListener('scroll', handlePageScroll, { passive: true });
    syncPageScrolled();
  });
  
  onUnmounted(() => {
    navMediaQuery.removeEventListener('change', handleNavMediaChange);
    document.removeEventListener('click', handleOutsideClick, true);
    window.removeEventListener('scroll', handlePageScroll);
    if (pageScrollRaf) window.cancelAnimationFrame(pageScrollRaf);
    layoutStore.reset();
  });
  </script>

<style scoped>
.admin-dashboard {
  padding-bottom: 12px;
}

.admin-layout {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  /* 导航栏宽度：只放得下图标 + 4 个字，不留大段空白；伸缩菜单栏时只换这个变量 */
  --nav-w: 156px;
}

.admin-layout.is-collapsed {
  --nav-w: 56px;
}

.admin-sidebar {
  /*
    固定在顶栏下面：页面上下滚动时侧边栏一动不动，
    菜单比可视区高时只有侧边栏内部滚动。
  */
  position: fixed;
  top: 76px; /* 顶栏 60 + 间距 16 */
  left: 20px; /* 与 el-main 的左右内边距一致 */
  width: var(--nav-w);
  height: calc(100vh - 92px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background-color: var(--el-fill-color-light);
  transition: width 0.2s ease;
}

/* 顶部品牌 */
.admin-brand {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.admin-brand-logo {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  background-color: var(--el-text-color-primary);
  -webkit-mask: url('/favicon.svg') no-repeat center center / contain;
  mask: url('/favicon.svg') no-repeat center center / contain;
}

.admin-brand-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
}

.admin-sidebar.is-collapsed .admin-brand {
  justify-content: center;
  padding: 0;
}

.admin-sidebar.is-collapsed .admin-brand-name {
  display: none;
}

.admin-menu-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 面板式导航的细滚动条 */
.admin-menu-wrap::-webkit-scrollbar {
  width: 6px;
}

.admin-menu-wrap::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}

.admin-menu-wrap::-webkit-scrollbar-track {
  background-color: transparent;
}

.admin-menu {
  border-right: none;
  border-radius: 0;
  background-color: transparent;
  padding: 4px 0 8px;
  overflow: hidden;
}

/* 分组之间拉一条细分隔线，和面板导航一致 */
.admin-menu :deep(.el-menu-item-group ~ .el-menu-item-group .el-menu-item-group__title) {
  border-top: 1px solid var(--el-border-color-lighter);
}

.admin-menu :deep(.el-menu-item-group__title) {
  padding: 8px 14px 2px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.admin-menu :deep(.el-menu-item) {
  height: 34px;
  line-height: 34px;
  margin: 0;
  border-radius: 0;
  border-left: 3px solid transparent;
  font-size: 13px;
  color: var(--el-text-color-regular);
  padding-left: 11px !important;
}

.admin-menu :deep(.el-menu-item:hover) {
  background-color: var(--el-fill-color);
}

.admin-menu :deep(.el-menu-item.is-active) {
  background-color: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}

/* 折叠态：只留图标 */
.admin-menu.el-menu--collapse {
  width: 100%;
}

.admin-menu.el-menu--collapse :deep(.el-menu-item-group__title) {
  display: none;
}

.admin-menu.el-menu--collapse :deep(.el-menu-item) {
  /* 左右内边距对称，图标才会和顶部 logo 在同一条中线上 */
  padding: 0 3px !important;
  justify-content: center;
}

/* 折叠后菜单项只剩一个图标：抵消 EP 内部 trigger 的左右内边距，图标才与顶部 logo 同中线 */
.admin-menu.el-menu--collapse :deep(.el-menu-item .el-menu-tooltip__trigger) {
  padding: 0;
  width: 100%;
  justify-content: center;
}

/* 底部操作：伸缩菜单栏 + 设置菜单显示隐藏 */
.nav-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  /* 两个按钮分别贴左右两边 */
  justify-content: space-between;
  padding: 5px 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.nav-action {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-regular);
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.nav-action:hover {
  background-color: var(--el-fill-color);
  color: var(--el-color-primary);
}

/* 折叠态窄，两个按钮改成上下排列 */
.admin-sidebar.is-collapsed .nav-actions {
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 0;
}

.nav-settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.nav-settings-body {
  max-height: calc(100vh - 240px);
  overflow-y: auto;
  padding: 6px 12px 10px;
}

.nav-settings-body::-webkit-scrollbar {
  width: 6px;
}

.nav-settings-body::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}

.nav-settings-group + .nav-settings-group {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.nav-settings-group-title {
  padding: 0 0 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.nav-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 8px;
}

.nav-settings :deep(.el-checkbox) {
  height: 26px;
  margin-right: 0;
}

.nav-settings :deep(.el-checkbox__label) {
  padding-left: 6px;
  font-size: 13px;
}

.admin-content {
  flex: 1;
  min-width: 0;
  /* 侧边栏是 fixed 的，用左外边距把内容让开 */
  margin-left: calc(var(--nav-w) + 16px);
  /* 悬浮 Dock 的占位放在这里（顶栏那条 main-content 的底部内边距已去掉），
     不然页面底部多出来的滚动距离会把侧边栏顶上去 */
  padding-bottom: 100px;
}

/* 面板标题行：高度固定，方便把视图里的操作按钮对齐到这一行 */
.pane-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  margin-bottom: 14px;
}

.pane-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
  color: var(--el-text-color-primary);
}

.pane-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.admin-pane {
  position: relative;
  min-width: 0;
}

/* 系统设置页自带标题和内边距，嵌进侧边栏布局后要跟其它面板对齐 */
.admin-pane :deep(.admin-page) {
  padding: 0;
  max-width: none;
  margin: 0;
}

.admin-pane :deep(.admin-page > .page-header) {
  display: none;
}

/* 主题预览原来吸顶 24px，侧边栏布局下要避开 60px 的顶栏 */
.admin-pane :deep(.preview-container) {
  top: 76px;
}

.mb-4 {
  margin-bottom: 20px;
}

/*
  桌面端：视图顶部那排操作按钮（.toolbar / .text-right）原本孤零零地悬在卡片上方，
  这里把它提到面板标题行的右侧，跟标题同一行。
  -50 = 标题行高 36 + 间距 14，再 +2 让它和标题垂直居中。
*/
@media (min-width: 901px) {
  /* toolbar--tabs（应用管理的“新增应用”）不进标题行，它留在卡片页签行里 */
  .admin-pane :deep(.admin-view > .toolbar:first-child:not(.toolbar--tabs)),
  .admin-pane :deep(.admin-view > .text-right:first-child),
  .admin-pane :deep(.music-apis-admin > .toolbar:first-child) {
    position: absolute;
    top: -48px;
    right: 0;
    z-index: 3;
    margin: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

/* 窄屏顶部栏：分类胶囊 + 展开后的菜单（宽屏不渲染，样式先写好） */
.topnav {
  /* 不设 position：展开的菜单相对整条悬浮栏定位，间隔才是按栏底边算的 */
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.topnav-groups {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.topnav-groups::-webkit-scrollbar {
  display: none;
}

.topnav-group {
  /* 平均占满一整行；窄到放不下时按内容宽度撑开并横向滚动 */
  flex: 1 1 0;
  min-width: max-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s, border-color 0.2s;
}

.topnav-group:hover {
  color: var(--el-color-primary);
}

.topnav-caret {
  font-size: 12px;
  transition: transform 0.2s ease;
}

.topnav-group.is-open .topnav-caret {
  transform: rotate(180deg);
}

.topnav-group.is-active {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

/* 键盘聚焦环画在胶囊内部：不然看起来会比别的分类高出一圈，高度不齐 */
.topnav-group:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: -2px;
}

.topnav-items {
  /* 展开的是菜单：贴在分类栏下面浮一层，不挤动页面内容 */
  position: absolute;
  /* 与分类栏留 8px 间隔，不要贴在一起 */
  top: calc(100% + 9px);
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  padding: 4px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-bg-color);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.topnav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px 0 11px;
  border: none;
  border-left: 3px solid transparent;
  border-radius: 0;
  background-color: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s, border-color 0.2s;
}

.topnav-item:hover {
  background-color: var(--el-fill-color-light);
}

.topnav-item span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topnav-item.is-active {
  background-color: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}

.topnav-item:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: -2px;
}

/* 应用管理：把“新增应用”放进卡片页签行的右侧内边距位置（宽窄屏一致） */
.admin-pane :deep(.admin-view > .toolbar--tabs) {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 3;
  height: 40px; /* 与 border-card 的页签行等高，按钮垂直居中 */
  margin: 0;
  padding-right: 12px;
  align-items: center;
  justify-content: flex-end;
}

/* 窄屏：导航变成吸在顶栏下面的分类栏 + 展开的菜单；面板按钮回到内容上方 */
@media (max-width: 900px) {
  .admin-layout {
    flex-direction: column;
    /* 列方向必须让内容区撑满宽度，否则会按 max-content 计算把页面顶宽 */
    align-items: stretch;
    gap: 12px;
  }

  .admin-content {
    width: 100%;
    margin-left: 0;
  }

  .admin-sidebar {
    /* 与全站顶栏一致的滚动联动参数：模糊半径 12–20px、过渡带高度 8–15px */
    --topnav-blur: 16px;
    --topnav-fade: 12px;
    position: sticky;
    /* 吸顶时和全站顶栏留 10px 间隙，不要贴在一起 */
    top: 70px;
    left: auto;
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
    z-index: 20;
    /* 悬浮条：左右各外扩 10px，让里面的分类胶囊依旧和下方卡片对齐 */
    margin: 0 -10px 10px;
    /* 上下内边距一致，胶囊在条里严格居中 */
    padding: 7px 10px;
    border: 1px solid transparent;
    border-radius: 12px;
    background-color: transparent;
    -webkit-backdrop-filter: blur(0px) saturate(100%);
    backdrop-filter: blur(0px) saturate(100%);
    transition:
      background-color 300ms ease-out,
      border-color 300ms ease-out,
      box-shadow 300ms ease-out,
      -webkit-backdrop-filter 300ms ease-out,
      backdrop-filter 300ms ease-out;
  }

  /* 内容滚进这条顶栏区域：变成一块悬浮毛玻璃，而不是一块方角底色把内容硬切开 */
  .admin-sidebar.is-scrolled {
    background-color: color-mix(in srgb, var(--el-bg-color) 72%, transparent);
    border-color: var(--el-border-color-lighter);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    -webkit-backdrop-filter: blur(var(--topnav-blur)) saturate(140%);
    backdrop-filter: blur(var(--topnav-blur)) saturate(140%);
  }

  /* 顶栏下方 8–15px 的渐隐过渡带：从完全透明到轻微模糊，和内容自然衔接 */
  .admin-sidebar::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: var(--topnav-fade);
    pointer-events: none;
    opacity: 0;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
    mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
    transition: opacity 300ms ease-out;
  }

  .admin-sidebar.is-scrolled::after {
    opacity: 1;
  }

  /* 不支持 backdrop-filter 的内核：退回纯色背景 */
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .admin-sidebar.is-scrolled {
      background-color: var(--el-bg-color-page);
    }

    .admin-sidebar::after {
      display: none;
    }
  }

  .pane-head {
    min-height: 0;
    margin-bottom: 10px;
    gap: 8px;
  }

  .pane-title {
    font-size: 16px;
    line-height: 24px;
  }

  .pane-hint {
    display: none;
  }

  .topnav-groups {
    /* 分类胶囊上下留白由悬浮条的内边距负责，这里不要再加，否则上下不等高 */
    padding: 0;
  }
}
</style>

<style>
/* “设置菜单显示隐藏”的弹层挂在 body 上，去不掉 scoped，这里用全局样式收紧内边距 */
.admin-nav-settings-popper {
  padding: 0 !important;
  overflow: hidden;
}
</style>
