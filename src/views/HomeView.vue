<template>
  <main class="home-view" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <Teleport to="#header-teleport-target">
      <Transition name="fade-slide">
        <div v-if="isActiveHome && layoutStore.showCustomTitle" class="device-tabs header-device-tabs">
          <div 
            class="tab-glider" 
            :style="{ 
              width: 'calc(50% - 3px)',
              transform: `translateX(${homeTab === 'system' ? '100%' : '0'})`
            }"
          ></div>
          <div 
            class="device-tab" 
            :class="{ active: homeTab === 'home' }" 
            @click="homeTab = 'home'"
            :style="{ width: '50%' }"
          >
            <span class="tab-label">首页</span>
          </div>
          <div 
            class="device-tab" 
            :class="{ active: homeTab === 'system' }" 
            @click="homeTab = 'system'"
            :style="{ width: '50%' }"
          >
            <span class="tab-label">系统</span>
          </div>
        </div>
      </Transition>
    </Teleport>

    <section class="dashboard-container">
      <div class="home-toolbar" ref="toolbarRef">
        <div class="greeting-text">{{ greeting }}</div>
        <div class="device-tabs">
          <div 
            class="tab-glider" 
            :style="{ 
              width: 'calc(50% - 6px)',
              transform: `translateX(${homeTab === 'system' ? '100%' : '0'})`
            }"
          ></div>
          <div 
            class="device-tab" 
            :class="{ active: homeTab === 'home' }" 
            @click="homeTab = 'home'"
            :style="{ width: '50%' }"
          >
            <span class="tab-label">首页</span>
          </div>
          <div 
            class="device-tab" 
            :class="{ active: homeTab === 'system' }" 
            @click="homeTab = 'system'"
            :style="{ width: '50%' }"
          >
            <span class="tab-label">系统</span>
          </div>
        </div>
      </div>
      <ActiveIncidents />
      <el-row v-if="homeTab === 'system' && siteCards.length > 0" :gutter="20" class="site-cards-row">
        <el-col
          v-for="card in siteCards"
          :key="card.id"
          :span="getCardStyle(card).span"
          :xs="24"
          class="site-card-col"
        >
          <el-card class="site-card" :class="{ 'music-card-wrapper': card.key === 'music' }" shadow="hover">
            <template #header>
              <div class="site-card-header">
                <div class="header-left">
                  <div class="accent-bar" :class="card.key === 'music' ? 'bg-red' : getCardStyle(card).accent"></div>
                  <span class="card-title">{{ card.title }}</span>
                </div>
               </div>
            </template>

            <template v-if="card.key === 'music'">
              <div class="music-card-content" @click.stop="goMusic">
                <div class="music-actions">
                  <div class="music-action-btn">每日推荐</div>
                  <div class="music-action-btn">雷达歌单</div>
                  <div class="music-action-btn">推荐歌单</div>
                  <div class="music-action-btn">排行榜单</div>
                </div>
                <img src="/music.png" class="music-card-img" alt="Music" />
              </div>
            </template>

            <template v-else-if="card.key === 'friend_links'">
              <div v-if="friendLinks.length > 0" class="friend-links-grid">
                <a
                  v-for="item in friendLinks"
                  :key="item.id"
                  class="friend-link-item"
                  :href="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img :src="friendLinkIcon(item)" class="friend-link-icon" alt="" />
                  <span class="friend-link-name">{{ item.name }}</span>
                </a>
              </div>
              <div v-else class="empty-text">暂无链接</div>
            </template>

            <template v-else-if="card.key === 'group_chats'">
              <div v-if="groupChats.length > 0" class="group-chats-grid">
                <template v-for="item in groupChats" :key="item.id">
                  <a
                    v-if="item.link"
                    class="group-chat-item"
                    :href="item.link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <el-avatar :size="32" :src="item.avatar_url || undefined">
                      {{ item.name?.slice(0, 1) }}
                    </el-avatar>
                    <span class="group-chat-name">{{ item.name }}</span>
                  </a>
                  <div v-else class="group-chat-item is-disabled">
                    <el-avatar :size="32" :src="item.avatar_url || undefined">
                      {{ item.name?.slice(0, 1) }}
                    </el-avatar>
                    <span class="group-chat-name">{{ item.name }}</span>
                  </div>
                </template>
              </div>
              <div v-else class="empty-text">暂无群聊</div>
            </template>

            <template v-else-if="card.key === 'announcements'">
              <div v-if="announcements.length > 0" class="announcements-list">
                <div v-for="item in announcements" :key="item.id" class="announcement-item">
                  <div class="announcement-title">{{ item.title }}</div>
                  <div class="announcement-content markdown-body" v-html="item.content_html" />
                </div>
              </div>
              <div v-else class="empty-text">暂无公告</div>
            </template>

            <template v-else-if="card.key === 'apps'">
              <div v-if="publicApps.length > 0" class="apps-list" @click="router.push({ name: 'app-cards' })">
                <template v-for="item in publicApps" :key="item.id">
                  <img
                    v-if="getAppIconUrl(item) && !failedIcons.has(item.id)"
                    :src="getAppIconUrl(item)"
                    class="app-icon"
                    :title="item.name"
                    alt=""
                    @error="onIconError(item)"
                  />
                  <div v-else class="app-icon fallback-icon" :title="item.name">
                    <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                      <path fill="currentColor" d="M511.6 76.3C264.3 76.2 64 276.4 64 523.5 64 718.9 189.3 885 363.8 946c23.5 5.9 19.9-10.8 19.9-22.2v-77.5c-135.7 15.9-141.2-73.9-150.8-88.9C215 726 171.5 718 184.5 703c30.9-15.9 62.4 4 98.9 57.9 26.4 39.1 77.9 32.5 104 26 5.7-23.5 17.9-44.5 34.7-60.8-140.6-25.2-199.2-111-199.2-213 0-49.5 16.3-95 48.3-131.7-20.4-60.5 1.9-112.3 4.9-120 58.1-5.2 118.5 41.6 123.2 45.3 33-8.9 70.7-13.6 112.9-13.6 42.4 0 80.2 4.9 113.5 13.9 11.3-8.6 67.3-48.8 121.3-43.9 2.9 7.7 24.7 58.3 5.5 118 32.4 36.8 48.9 82.7 48.9 132.3 0 102.2-59 188.1-200 212.9a127.5 127.5 0 0 1 38.1 91v112.5c.8 9 0 17.9 15 17.9 177.1-59.7 304.6-227 304.6-424.1 0-247.2-200.4-447.3-447.5-447.3z"></path>
                    </svg>
                  </div>
                </template>
              </div>
              <div v-else class="empty-text">暂无应用</div>
            </template>

            <template v-else>
              <el-empty description="暂不支持的卡片" />
            </template>
          </el-card>
        </el-col>
      </el-row>

      <template v-if="homeTab === 'home'">
        <SystemStatusCard />
        <OverviewCard />
        
        <RankOverview />

        <el-row :gutter="20" class="mt-4">
          <el-col :span="8" :xs="24">
            <RatingPieChart />
          </el-col>
          <el-col :span="8" :xs="24">
            <TargetSdkPieChart />
          </el-col>
          <el-col :span="8" :xs="24">
            <MinSdkPieChart />
          </el-col>
        </el-row>

        <div class="mt-4">
          <AppListCard />
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, onActivated, onDeactivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useLayoutStore } from '../stores/layout';

defineOptions({
  name: 'HomeView'
});

import ActiveIncidents from '../components/ActiveIncidents.vue';
import SystemStatusCard from '../components/SystemStatusCard.vue';
import OverviewCard from '../components/OverviewCard.vue';
import RankOverview from '../components/RankOverview.vue';
import RatingPieChart from '../components/RatingPieChart.vue';
import TargetSdkPieChart from '../components/TargetSdkPieChart.vue';
import MinSdkPieChart from '../components/MinSdkPieChart.vue';
import AppListCard from '../components/AppListCard.vue';
import {
  getPublicAnnouncements,
  getPublicApps,
  getPublicFriendLinks,
  getPublicGroupChats,
  getPublicSiteCards,
  type Announcement,
  type AppItem,
  type FriendLink,
  type GroupChat,
  type SiteCard,
} from '../services/admin';
import { getAppIconUrl } from '../utils/app-info';

const router = useRouter();
const layoutStore = useLayoutStore();
const toolbarRef = ref<HTMLElement | null>(null);

const greeting = ref('');

const updateGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) {
    greeting.value = '尊敬的用户早上好~';
  } else if (hour >= 12 && hour < 14) {
    greeting.value = '尊敬的用户中午好~';
  } else if (hour >= 14 && hour < 18) {
    greeting.value = '尊敬的用户下午好~';
  } else {
    greeting.value = '尊敬的用户晚上好~';
  }
};

const siteCards = ref<SiteCard[]>([]);
const friendLinks = ref<FriendLink[]>([]);
const groupChats = ref<GroupChat[]>([]);
const announcements = ref<Announcement[]>([]);
const publicApps = ref<AppItem[]>([]);
const homeTab = ref<'home' | 'system'>('home');
const isActiveHome = ref(true);

const failedIcons = ref(new Set<number | string>());

const onIconError = (item: AppItem) => {
  failedIcons.value.add(item.id);
};

const touchStartX = ref(0);
const touchStartY = ref(0);
const handleTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX;
  touchStartY.value = e.touches[0].clientY;
};
const handleTouchEnd = (e: TouchEvent) => {
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const diffX = touchEndX - touchStartX.value;
  const diffY = touchEndY - touchStartY.value;
  if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX < 0) {
      homeTab.value = 'system';
    } else {
      homeTab.value = 'home';
    }
  }
};

const getCardStyle = (card: SiteCard) => {
  let parsed: any = {};
  try {
    parsed = JSON.parse(card.style || '{}');
  } catch {
    parsed = {};
  }
  const span = parsed.span === 12 ? 12 : 24;
  const accent = typeof parsed.accent === 'string' && parsed.accent.trim() ? parsed.accent.trim() : 'bg-yellow';
  return { span, accent };
};

const faviconUrl = (rawUrl: string) => {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}/favicon.ico`;
  } catch {
    return '/favicon.svg';
  }
};

const friendLinkIcon = (item: FriendLink) => {
  const icon = typeof item.icon_url === 'string' ? item.icon_url.trim() : '';
  return icon || faviconUrl(item.url);
};

const goMusic = async () => {
  try {
    await router.push('/music');
  } catch {
    ElMessage.warning('跳转失败');
  }
};

const loadSiteCards = async () => {
  try {
    siteCards.value = await getPublicSiteCards();
  } catch {
    siteCards.value = [];
    return;
  }

  const enabledKeys = new Set(siteCards.value.map((c) => c.key));

  const tasks: Array<Promise<void>> = [];
  if (enabledKeys.has('friend_links')) {
    tasks.push(
      getPublicFriendLinks()
        .then((items) => {
          friendLinks.value = items;
        })
        .catch(() => {
          friendLinks.value = [];
        })
    );
  }
  if (enabledKeys.has('group_chats')) {
    tasks.push(
      getPublicGroupChats()
        .then((items) => {
          groupChats.value = items;
        })
        .catch(() => {
          groupChats.value = [];
        })
    );
  }
  if (enabledKeys.has('announcements')) {
    tasks.push(
      getPublicAnnouncements()
        .then((items) => {
          announcements.value = items;
        })
        .catch(() => {
          announcements.value = [];
        })
    );
  }
  if (enabledKeys.has('apps')) {
    tasks.push(
      getPublicApps()
        .then((items) => {
          publicApps.value = items;
        })
        .catch(() => {
          publicApps.value = [];
        })
    );
  }

  await Promise.all(tasks);
};

let observer: IntersectionObserver | null = null;

onMounted(() => {
  isActiveHome.value = true;
  loadSiteCards();
  updateGreeting();

  observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting && entry.boundingClientRect.top < 60) {
        layoutStore.setCustomTitleVisible(true);
      } else {
        layoutStore.setCustomTitleVisible(false);
      }
    },
    { threshold: 0, rootMargin: '-60px 0px 0px 0px' }
  );
  
  if (toolbarRef.value) {
    observer.observe(toolbarRef.value);
  }
});

onActivated(() => {
  // Ensure header toggle only appears when HomeView is active
  isActiveHome.value = true;
  if (!observer && toolbarRef.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && entry.boundingClientRect.top < 60) {
          layoutStore.setCustomTitleVisible(true);
        } else {
          layoutStore.setCustomTitleVisible(false);
        }
      },
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' }
    );
    observer.observe(toolbarRef.value);
  }
});

onDeactivated(() => {
  // Hide custom header when leaving HomeView
  isActiveHome.value = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  layoutStore.setCustomTitleVisible(false);
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
  layoutStore.setCustomTitleVisible(false);
});
</script>

<style scoped>
.home-view {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}
.home-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.greeting-text {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.device-tabs {
  position: relative;
  display: flex;
  gap: 0;
  background: var(--el-fill-color-light);
  border-radius: 9999px;
  padding: 6px;
}
.device-tab {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  border-radius: 9999px;
  user-select: none;
}
.device-tab.active {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.tab-glider {
  position: absolute;
  top: 6px;
  left: 6px;
  height: calc(100% - 12px);
  background: var(--el-bg-color);
  border-radius: 9999px;
  transition: transform 0.25s ease;
  box-shadow: 0 4px 10px rgba(0,0,0,0.06);
}

.header-device-tabs {
  padding: 3px;
  background: var(--el-fill-color); /* Slightly different bg for header contrast if needed */
  transform: scale(0.85); /* Make it slightly smaller in header */
  transform-origin: center;
}

.header-device-tabs .tab-glider {
  top: 3px;
  left: 3px;
  height: calc(100% - 6px);
}

.mt-4 {
  margin-top: 20px;
}

/* 统一探索页面所有卡片的圆角样式，与后台管理控制的 site-card 保持一致 (16px) */
.home-view :deep(.el-card),
.home-view :deep(.incident-card),
.home-view :deep(.chart-card) {
  border-radius: 16px !important;
  overflow: hidden;
  /* 调整阴影：垂直方向偏移，负扩散半径减少左右两侧阴影 */
  box-shadow: 0 8px 12px -4px rgba(0, 0, 0, 0.08) !important;
}

.site-cards-row {
  margin-bottom: 24px;
  align-items: stretch;
}

.site-card-col {
  margin-bottom: 16px;
  display: flex;
}

.site-card {
  border-radius: 16px;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.site-card :deep(.el-card__header) {
  padding: 14px 16px;
}

.site-card :deep(.el-card__body) {
  padding: 14px 16px;
  flex: 1;
}

.site-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.accent-bar {
  width: 4px;
  height: 16px;
  border-radius: 4px;
  flex: 0 0 auto;
}

.bg-yellow { background-color: #f59e0b; }
.bg-green { background-color: #10b981; }
.bg-blue { background-color: #3b82f6; }
.bg-red { background-color: #ef4444; }
.bg-purple { background-color: #7c3aed; }

.card-title {
  font-weight: 700;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card-desc {
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.friend-links-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
}

.friend-link-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  min-height: 44px;
  width: 220px;
  flex: 0 0 220px;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  text-decoration: none;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color);
  transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.friend-link-item:hover {
  border-color: var(--el-color-primary-light-5);
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.friend-link-icon {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  object-fit: contain;
}

.friend-link-name {
  font-size: 13px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.group-chats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.group-chat-item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  min-height: 44px;
  width: 220px;
  flex: 0 0 220px;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  text-decoration: none;
  color: var(--el-text-color-regular);
  transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.group-chat-item:hover {
  border-color: var(--el-color-primary-light-5);
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.group-chat-item.is-disabled {
  cursor: default;
  opacity: 0.7;
}

.group-chat-item.is-disabled:hover {
  border-color: var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
}

.group-chat-name {
  font-size: 13px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.announcements-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.announcement-item {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.announcement-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.announcement-content {
  line-height: 1.7;
  color: var(--el-text-color-regular);
  font-size: 13px;
  padding: 0 !important;
  background-color: transparent !important;
  border: none !important;
  border-radius: 0 !important;
}

.apps-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  cursor: pointer;
}

.app-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border-radius: 12px;
  border: none;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all 0.3s;
}

.app-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--el-color-primary-light-5);
}

.app-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
  transition: all 0.25s ease;
}

.app-icon:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.fallback-icon {
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color-light);
  padding: 6px;
  box-sizing: border-box;
}

.empty-text {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}

@media (max-width: 768px) {
  .home-view {
    padding: 14px;
  }

  .site-cards-row {
    margin-bottom: 18px;
  }

  .site-card-col {
    margin-bottom: 12px;
  }

  .site-card :deep(.el-card__header) {
    padding: 12px 14px;
  }

  .site-card :deep(.el-card__body) {
    padding: 12px 14px;
  }

  .friend-link-item {
    padding: 6px 10px;
    width: 100%;
    flex-basis: 100%;
  }

  .group-chat-item {
    width: 100%;
    flex-basis: 100%;
  }
}

.music-card-wrapper {
  cursor: pointer;
}

.music-card-wrapper :deep(.el-card__header) {
  border-bottom: none !important;
  padding-bottom: 0 !important;
}

.music-card-wrapper :deep(.card-title) {
  font-size: 18px;
}

.music-card-wrapper .hidden-btn {
  display: none;
}

.music-card-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  position: relative;
  min-height: 90px;
  z-index: 10;
  cursor: pointer;
}

.music-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  z-index: 2;
}

.music-action-btn {
  padding: 6px 16px;
  background: var(--el-fill-color);
  border-radius: 20px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  border: 1px solid var(--el-border-color-lighter);
}

.music-action-btn:hover {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

.music-card-img {
  height: 120px;
  width: auto;
  object-fit: contain;
  position: absolute;
  right: -10px;
  bottom: -10px;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 20;
  transform-origin: top center;
}

.music-card-img:hover {
  filter: drop-shadow(0 8px 16px rgba(0,0,0,0.2)) brightness(1.1);
  transform: scale(1.1);
}

/* Mobile adaptation for Music Card */
@media (max-width: 768px) {
  .music-card-wrapper .hidden-btn {
    display: inline-flex;
  }
  .music-card-content {
    min-height: 100px;
    padding-right: 88px;
  }
  .music-actions {
    flex-wrap: wrap;
    overflow-x: visible;
    gap: 8px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }
  .music-actions::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }
  .music-action-btn {
    flex: 0 0 auto;
    padding: 6px 12px;
    font-size: 12px;
    margin-bottom: 6px;
  }
  .music-card-img {
    height: 80px;
    right: 0;
    bottom: 0;
    opacity: 0.9;
    z-index: 0;
    pointer-events: none;
  }
}
</style>
