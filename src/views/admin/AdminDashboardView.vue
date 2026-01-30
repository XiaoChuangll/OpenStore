<template>
  <div class="admin-dashboard">
    <el-page-header ref="pageHeaderRef" class="mb-4" @back="goHome">
      <template #content>
        <span class="text-large font-600 mr-3"> 后台管理 </span>
      </template>
    </el-page-header>
    <el-tabs v-model="active" type="border-card">
      <el-tab-pane label="接口管理" name="music-apis">
        <MusicApisAdminView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="链接管理" name="links">
        <FriendLinksView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="群聊管理" name="groups">
        <GroupChatsView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="应用管理" name="apps">
        <AppsAdminView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="公告管理" name="announcements">
        <AnnouncementsView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="环境变量" name="env">
        <EnvManagerView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="故障维护" name="incidents">
        <IncidentsAdminView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="更新日志" name="changelogs">
        <ChangelogsAdminView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="首页配置" name="site-cards">
        <SiteCardsAdminView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="关于页面" name="about">
        <AboutManageView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="访客日志" name="visitors">
        <VisitorLogsView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="系统日志" name="logs">
        <SystemLogsView :embedded="true" />
      </el-tab-pane>
      <el-tab-pane label="用户反馈" name="feedbacks">
        <FeedbackAdminView :embedded="true" />
      </el-tab-pane>
    </el-tabs>
  </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue';
  import { useRouter } from 'vue-router';
  import { useLayoutStore } from '../../stores/layout';
  import FriendLinksView from './FriendLinksView.vue';
import MusicApisAdminView from './MusicApisAdminView.vue';
  import GroupChatsView from './GroupChatsView.vue';
  import AppsAdminView from './AppsAdminView.vue';
  import AnnouncementsView from './AnnouncementsView.vue';
  import EnvManagerView from './EnvManagerView.vue';
import VisitorLogsView from './VisitorLogsView.vue';
import SystemLogsView from './SystemLogsView.vue';
import IncidentsAdminView from './IncidentsAdminView.vue';
import ChangelogsAdminView from './ChangelogsAdminView.vue';
import SiteCardsAdminView from './SiteCardsAdminView.vue';
import AboutManageView from './AboutManageView.vue';
import FeedbackAdminView from './FeedbackAdminView.vue';

const active = ref<'links' | 'groups' | 'apps' | 'announcements' | 'env' | 'visitors' | 'logs' | 'changelogs' | 'site-cards' | 'about' | 'incidents' | 'music-apis' | 'feedbacks'>('music-apis');
const router = useRouter();
  const layoutStore = useLayoutStore();
  const pageHeaderRef = ref<HTMLElement | null>(null);
  const goHome = () => router.push('/');

  // Scroll Handler
  let ticking = false;
  
  const checkScrollPosition = () => {
    if (!pageHeaderRef.value) return;
    const el = (pageHeaderRef.value as any).$el || pageHeaderRef.value;
    if (!el || !el.getBoundingClientRect) return;
  
    const rect = el.getBoundingClientRect();
    layoutStore.setHeaderState(rect.bottom < 60);
  };
  
  const handleScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        checkScrollPosition();
        ticking = false;
      });
      ticking = true;
    }
  };
  
  onMounted(() => {
    window.addEventListener('scroll', handleScroll);
    layoutStore.setPageInfo('后台管理', true, goHome);
  });
  
  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll);
    layoutStore.reset();
  });
  </script>
  
  <style scoped>
  .mb-4 { margin-bottom: 20px; }
  .admin-dashboard { padding-bottom: 12px; }
  </style>
