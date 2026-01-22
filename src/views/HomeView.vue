<template>
  <main class="home-view">
    <section class="dashboard-container">
      <ActiveIncidents />
      <el-row v-if="siteCards.length > 0" :gutter="20" class="site-cards-row">
        <el-col
          v-for="card in siteCards"
          :key="card.id"
          :span="getCardStyle(card).span"
          :xs="24"
          class="site-card-col"
        >
          <el-card class="site-card" shadow="hover">
            <template #header>
              <div class="site-card-header">
                <div class="header-left">
                  <div class="accent-bar" :class="getCardStyle(card).accent"></div>
                  <span class="card-title">{{ card.title }}</span>
                </div>
                <el-button v-if="card.key === 'music'" type="primary" link @click="goMusic">打开</el-button>
              </div>
            </template>

            <template v-if="card.key === 'music'">
              <div class="card-desc">在线播放与歌单功能</div>
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
                <div 
                  v-for="item in publicApps" 
                  :key="item.id" 
                  class="app-item"
                  :title="item.name"
                >
                  <img v-if="item.icon_url" :src="item.icon_url" class="app-icon" alt="" />
                </div>
              </div>
              <div v-else class="empty-text">暂无应用</div>
            </template>

            <template v-else>
              <el-empty description="暂不支持的卡片" />
            </template>
          </el-card>
        </el-col>
      </el-row>

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
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
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

const router = useRouter();

const siteCards = ref<SiteCard[]>([]);
const friendLinks = ref<FriendLink[]>([]);
const groupChats = ref<GroupChat[]>([]);
const announcements = ref<Announcement[]>([]);
const publicApps = ref<AppItem[]>([]);

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

onMounted(() => {
  loadSiteCards();
});
</script>

<style scoped>
.home-view {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
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
</style>
