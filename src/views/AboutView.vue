<template>
  <div class="about-view">
    <!-- 页面头部：站点身份 + 作者，始终做成第一屏的主视觉 -->
    <AboutHero
      class="about-hero-item"
      :style="cardStyle('hero')"
      :site-name="aboutData.site_name"
      :tagline="aboutData.tagline"
      :version="siteVersion"
      :author-name="aboutData.author_name"
      :author-github="aboutData.author_github"
      :repo-name="repoName"
      :repo-stars="repoStars"
      :social-links="socialLinks"
    />

    <el-card
      v-if="showContent"
      class="about-card is-full content-card"
      :style="cardStyle('content')"
    >
      <div
        class="about-content"
        :class="{ 'ql-editor': !aboutData.content_markdown, 'markdown-body': !!aboutData.content_markdown }"
        v-html="aboutData.content_html"
      ></div>
    </el-card>

    <el-card class="about-card is-half" :style="cardStyle('author')">
      <template #header>
        <div class="card-header">
          <span class="card-title"><el-icon><User /></el-icon>关于作者</span>
        </div>
      </template>
      <div class="info-list">
        <div class="info-row">
          <span class="label">开发者</span>
          <span class="value">{{ aboutData.author_name || 'ChuEng' }}</span>
        </div>
        <div class="info-row">
          <span class="label">GitHub</span>
          <a
            :href="aboutData.author_github || 'https://github.com/XiaoChuangll'"
            target="_blank"
            rel="noopener"
            class="value link"
          >
            {{ getGithubUsername(aboutData.author_github) || 'XiaoChuangll' }}
            <el-icon><Link /></el-icon>
          </a>
        </div>
        <div class="info-row">
          <span class="label">仓库</span>
          <a v-if="repoName" :href="`https://github.com/${repoName}`" target="_blank" rel="noopener" class="value link">
            {{ repoName }}
            <el-icon><Link /></el-icon>
          </a>
          <span v-else class="value is-muted">未配置</span>
        </div>
        <div class="info-row">
          <span class="label">星标</span>
          <a
            v-if="repoStars !== null && repoName"
            :href="`https://github.com/${repoName}/stargazers`"
            target="_blank"
            rel="noopener"
            class="value link star-link"
          >
            <el-icon class="text-yellow-500"><StarFilled /></el-icon> {{ repoStars }}
          </a>
          <span v-else class="value is-muted">—</span>
        </div>
      </div>
    </el-card>

    <el-card class="about-card is-half" :style="cardStyle('tech-stack')">
      <template #header>
        <div class="card-header">
          <span class="card-title"><el-icon><Cpu /></el-icon>技术栈</span>
        </div>
      </template>
      <div v-if="techStack.length" class="tech-stack">
        <el-tag
          v-for="tech in techStack"
          :key="tech.name"
          :type="tech.color"
          effect="light"
          size="large"
          class="tech-tag"
        >
          {{ tech.name }}
        </el-tag>
      </div>
      <p v-else class="empty-tip">暂未配置技术栈</p>
    </el-card>

    <el-card v-if="contributors.length" class="about-card is-full" :style="cardStyle('contributors')">
      <template #header>
        <div class="card-header">
          <span class="card-title"><el-icon><Medal /></el-icon>鸣谢</span>
        </div>
      </template>
      <p class="contributors-intro">感谢以下贡献者对 OpenStore 的支持：</p>
      <div class="contributors">
        <a
          v-for="person in contributors"
          :key="person.github"
          :href="githubProfileUrl(person.github)"
          target="_blank"
          rel="noopener"
          class="contributor"
          :title="`@${person.github}`"
        >
          <el-image
            :src="githubAvatarUrl(person.github, 160)"
            fit="cover"
            class="contributor-avatar"
            loading="lazy"
          >
            <!-- 头像取不到时退回首字母，别留一个破图 -->
            <template #error>
              <span class="contributor-fallback">{{ (person.name || person.github).slice(0, 1).toUpperCase() }}</span>
            </template>
          </el-image>
          <span class="contributor-name">{{ person.name || person.github }}</span>
        </a>
      </div>
    </el-card>

    <el-card class="about-card is-full" :style="cardStyle('changelogs')">
      <template #header>
        <div class="card-header is-toggle" @click="toggleChangelogs">
          <span class="card-title">
            <el-icon><Histogram /></el-icon>
            更新日志
            <el-tag size="small" effect="light" type="primary" round>{{ latestChangelogVersion }}</el-tag>
          </span>
          <el-icon class="toggle-icon" :class="{ 'rotate-90': changelogsExpanded }"><ArrowRight /></el-icon>
        </div>
      </template>
      <el-collapse-transition>
        <div v-show="changelogsExpanded">
          <div v-loading="changelogsLoading" class="changelogs-list">
            <div v-for="item in changelogs" :key="item.id" class="changelog-item">
              <div class="changelog-info">
                <div class="changelog-title">
                  <el-tag size="small" effect="light" type="primary">{{ item.version }}</el-tag>
                  <span class="changelog-date">{{ formatTime(item.release_date) }}</span>
                </div>
                <div class="changelog-content markdown-body" v-html="getChangelogHtml(item)"></div>
              </div>
            </div>
            <p v-if="changelogsFetched && changelogs.length === 0 && !changelogsLoading" class="empty-tip">
              暂无更新日志
            </p>
          </div>
        </div>
      </el-collapse-transition>
    </el-card>

    <el-card v-if="aboutData.github_repo" class="about-card is-full" :style="cardStyle('commits')">
      <template #header>
        <div class="card-header is-toggle" @click="toggleCommits">
          <span class="card-title">
            <el-icon><Connection /></el-icon>
            最近提交
            <span class="card-count">{{ repoName }}</span>
          </span>
          <el-icon class="toggle-icon" :class="{ 'rotate-90': commitsExpanded }"><ArrowRight /></el-icon>
        </div>
      </template>
      <el-collapse-transition>
        <div v-show="commitsExpanded">
          <div v-loading="commitsLoading" class="commits-list">
            <div v-for="commit in commits" :key="commit.sha" class="commit-item">
              <div class="commit-info">
                <div class="commit-msg" :title="commit.commit.message">{{ commit.commit.message }}</div>
                <div class="commit-meta">
                  <div class="commit-user">
                    <el-avatar :size="16" :src="commit.author?.avatar_url" v-if="commit.author?.avatar_url" />
                    <span>{{ commit.commit.author.name }}</span>
                  </div>
                  <span class="commit-time">{{ new Date(commit.commit.author.date).toLocaleString() }}</span>
                </div>
              </div>
              <a :href="commit.html_url" target="_blank" rel="noopener" class="commit-link">
                <el-icon><Link /></el-icon>
              </a>
            </div>
            <p v-if="commits.length === 0 && !commitsLoading" class="empty-tip">暂无提交记录或无法获取</p>
          </div>
        </div>
      </el-collapse-transition>
    </el-card>

    <el-card class="about-card is-full" :style="cardStyle('feedback')">
      <template #header>
        <div class="card-header is-toggle" @click="toggleFeedback">
          <span class="card-title"><el-icon><ChatDotRound /></el-icon>意见反馈</span>
          <el-icon class="toggle-icon" :class="{ 'rotate-90': feedbackExpanded }"><ArrowRight /></el-icon>
        </div>
      </template>
      <el-collapse-transition>
        <div v-show="feedbackExpanded" class="feedback-form">
          <el-tabs v-model="feedbackTab" class="feedback-tabs" :stretch="true">
            <el-tab-pane label="提交反馈" name="submit">
              <el-form label-position="top" :model="feedbackForm">
                <el-form-item label="反馈类型">
                  <el-select v-model="feedbackForm.type" placeholder="请选择">
                    <el-option v-for="opt in feedbackTypes" :key="opt.value" :label="opt.label" :value="opt.value" />
                  </el-select>
                </el-form-item>
                <el-form-item label="标题/概要">
                  <el-input v-model="feedbackForm.title" placeholder="用一句话简述问题" />
                </el-form-item>
                <el-form-item label="详细描述">
                  <el-input v-model="feedbackForm.description" type="textarea" :rows="6" placeholder="请描述问题场景、期望结果等" />
                </el-form-item>
                <el-form-item label="联系方式">
                  <el-autocomplete
                    v-model="feedbackForm.email"
                    placeholder="邮箱（可选）"
                    value-key="value"
                    :fetch-suggestions="getEmailSuggestions"
                    @select="onEmailSelect"
                    style="width: 100%;"
                  />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="submitting" @click="submitFeedbackForm">提交反馈</el-button>
                </el-form-item>
              </el-form>
              <el-alert
                v-show="feedbackErrorVisible"
                type="error"
                :closable="true"
                :title="feedbackErrorTitle"
                :description="feedbackErrorMessage"
                @close="feedbackErrorVisible = false"
                class="mb-2"
              />
              <el-alert
                v-show="feedbackSuccessVisible"
                type="success"
                :closable="true"
                @close="feedbackSuccessVisible = false"
                class="mb-2 success-alert"
              >
                <div class="alert-header">
                  <span>反馈已提交</span>
                </div>
                <div class="alert-desc">
                  反馈编号：
                  <span class="hash" @click="copySubmittedHash">{{ submittedHash || '—' }}</span>
                  <span v-if="copyTipVisible" class="copy-tip">已复制</span>
                </div>
              </el-alert>
            </el-tab-pane>
            <el-tab-pane label="查询进度" name="query">
              <div class="hash-query">
                <el-form label-position="top" :model="queryForm">
                  <el-form-item label="反馈编号">
                    <!-- 输入框 + 查询按钮同一行：按钮贴着输入框右侧 -->
                    <div class="hash-query-row">
                      <el-input
                        v-model="hashQueryInput"
                        placeholder="输入编号查询进度"
                        clearable
                        @clear="onQueryClear"
                        @keyup.enter="queryFeedbackProgress"
                      />
                      <el-button type="primary" :loading="queryLoading" @click="queryFeedbackProgress">查询</el-button>
                    </div>
                  </el-form-item>
                </el-form>
                <el-alert
                  v-if="queryErrorVisible"
                  type="error"
                  :closable="true"
                  title="查询失败"
                  :description="queryErrorMessage"
                  @close="queryErrorVisible = false"
                  class="mt-2"
                />
                <el-alert
                  v-if="queryResult || queryNotFound"
                  :type="queryNotFound ? 'warning' : 'info'"
                  :closable="false"
                  :title="queryNotFound ? '未找到反馈' : '查询结果'"
                  class="mt-2"
                />
                <div
                  v-if="queryResult"
                  class="query-result"
                  :class="`is-${(queryResult.status || 'pending').trim()}`"
                >
                  <div class="query-result-head">
                    <el-tag
                      :type="statusTagType(queryResult.status)"
                      effect="light"
                      round
                      size="small"
                      class="qr-status"
                    >
                      {{ statusLabel(queryResult.status) }}
                    </el-tag>
                    <el-tag type="info" effect="plain" round size="small" class="qr-type">
                      {{ typeLabel(queryResult.type) }}
                    </el-tag>
                    <span class="qr-time">
                      <el-icon><Clock /></el-icon>
                      {{ formatTime(queryResult.created_at) }}
                    </span>
                  </div>
                  <div class="query-result-title">{{ queryResult.title }}</div>
                </div>
                <div v-if="completedList.length > 0" class="success-list success-list-completed">
                  <div class="success-list-header flex items-center">
                    <el-icon><CircleCheckFilled /></el-icon> 已完成
                  </div>
                  <div class="success-item" v-for="item in completedList" :key="item.id">
                    <span class="title">{{ item.title }}</span>
                    <span class="meta">{{ typeLabel(item.type) }}</span>
                  </div>
                </div>
                <div v-if="acceptedList.length > 0" class="success-list success-list-accepted">
                  <div class="success-list-header flex items-center">
                    <el-icon><CircleCheck /></el-icon> 已接纳
                  </div>
                  <div class="success-item" v-for="item in acceptedList" :key="item.id">
                    <span class="title">{{ item.title }}</span>
                    <span class="meta">{{ typeLabel(item.type) }}</span>
                  </div>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-collapse-transition>
    </el-card>

    <div class="footer-info">
      <p>Version {{ siteVersion }}</p>
      <p>&copy; {{ new Date().getFullYear() }} BetaHub Tech. All rights reserved.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useLayoutStore } from '../stores/layout';
import {
  Link,
  ArrowRight,
  StarFilled,
  CircleCheck,
  CircleCheckFilled,
  Clock,
  User,
  Cpu,
  ChatDotRound,
  Histogram,
  Medal,
  Connection,
} from '@element-plus/icons-vue';
import { getAboutPage, getPublicChangelogs, submitFeedback, getFeedbackProgressByHash, getFeedbackSuccessList, type AboutPage, type Changelog, type FeedbackSummary } from '../services/api';
import axios from 'axios';
import { createMarkdownRenderer } from '../utils/markdown';
import '@vueup/vue-quill/dist/vue-quill.snow.css'; // Import Quill styles for content rendering
import 'github-markdown-css/github-markdown.css';
import { useAuthStore } from '../stores/auth';
import { getPublicSiteCards } from '../services/admin';
import { contentVersion } from '../services/content-refresh';
import AboutHero from '../components/AboutHero.vue';
import { DEFAULT_TECH_STACK, githubAvatarUrl, githubProfileUrl, normalizeContributors, normalizeSocialLinks, normalizeTechStack, type Contributor, type SocialLinkItem, type TechStackItem } from '../utils/about';

/*
 * 关于页面的卡片顺序 / 显隐由后台「首页配置 → 关于」决定：
 * 卡片都留在模板原位，用 grid order + display 调整，避免大改结构。
 * hero 是后加的卡片，老库启动时会被种子数据补上，没补上时按模板顺序落在最前面。
 */
const aboutCards = ref<Record<string, { enabled: boolean; order: number }>>({});
const ABOUT_CARD_FALLBACK = ['hero', 'content', 'author', 'tech-stack', 'contributors', 'changelogs', 'commits', 'feedback'];

const loadAboutCards = async () => {
  let keys = ABOUT_CARD_FALLBACK;
  try {
    const cards = await getPublicSiteCards('about');
    keys = cards.map((card) => card.key);
  } catch {
    keys = ABOUT_CARD_FALLBACK;
  }

  const next: Record<string, { enabled: boolean; order: number }> = {};
  keys.forEach((key, index) => {
    if (!ABOUT_CARD_FALLBACK.includes(key)) return;
    next[key] = { enabled: true, order: index + 1 };
  });
  aboutCards.value = next;
};

const cardStyle = (key: string) => {
  const config = aboutCards.value[key];
  if (!config) return {};
  // order 负责排序，display 负责显隐（未配置的卡片保持模板原顺序）
  return config.enabled
    ? { order: config.order }
    : { order: config.order, display: 'none' };
};

const layoutStore = useLayoutStore();
const aboutData = ref<AboutPage>({ id: 0, version: '', author_name: '', author_avatar: '', author_github: '', github_repo: '', content_html: '', content_markdown: '' });
const commits = ref<any[]>([]);
const commitsLoading = ref(false);
const commitsExpanded = ref(false);
const feedbackExpanded = ref(true);
const feedbackTab = ref('submit');
const queryForm = ref({ hash: '' });
const feedbackSuccessVisible = ref(false);
const feedbackErrorVisible = ref(false);
const feedbackErrorTitle = ref('提交失败');
const feedbackErrorMessage = ref('');
const queryErrorVisible = ref(false);
const queryErrorMessage = ref('');
const queryNotFound = ref(false);
const submittedHash = ref<string | null>(null);
const copyTipVisible = ref(false);
const repoStars = ref<number | null>(null);
const changelogs = ref<Changelog[]>([]);
const changelogsLoading = ref(false);
const changelogsExpanded = ref(false);
const changelogsFetched = ref(false);

const md = createMarkdownRenderer({ allowHtml: false, katex: false, highlight: false });

/** 技术栈：后台没配置过就用默认值，保证首屏不空 */
const techStack = computed<TechStackItem[]>(() => {
  const list = normalizeTechStack(aboutData.value.tech_stack);
  return list.length ? list : DEFAULT_TECH_STACK;
});

/** 社交入口：后台清了就退回作者的 GitHub / 仓库地址，避免 Hero 底部整块消失 */
/** 后台配置了什么就显示什么（自动项由 AboutHero 按当前配置解析） */
const socialLinks = computed<SocialLinkItem[]>(() => normalizeSocialLinks(aboutData.value.social_links));

const repoName = computed(() => (aboutData.value.github_repo ? getRepoName(aboutData.value.github_repo) : ''));

/** 鸣谢名单：头像按 GitHub 用户名现拼地址，后台改了名字/顺序立刻反映到前台 */
const contributors = computed<Contributor[]>(() => normalizeContributors(aboutData.value.contributors));

const showContent = computed(() => {
  const html = aboutData.value.content_html;
  if (!html) return false;
  // Check for common empty states
  if (html === '<p><br></p>') return false;
  // Check if it contains only whitespace tags
  const text = html.replace(/<[^>]*>/g, '').trim();
  // If text is empty, check for images or iframes
  if (!text && !html.includes('<img') && !html.includes('<iframe') && !html.includes('<video')) {
    return false;
  }
  return true;
});

const feedbackTypes = [
  { label: 'Bug / 错误报告', value: 'bug' },
  { label: '功能建议', value: 'feature' },
  { label: '体验问题', value: 'ux' },
  { label: '内容反馈', value: 'content' },
  { label: '其他', value: 'other' },
] as const;
const typeLabel = (v?: string) => {
  const opt = feedbackTypes.find(o => o.value === (v || '').trim());
  return opt ? opt.label : (v || '');
};
const statusOptions = [
  { value: 'pending', label: '待优化' },
  { value: 'accepted', label: '已接纳' },
  { value: 'rejected', label: '不接纳' },
  { value: 'completed', label: '已完成' },
] as const;
const statusLabel = (s?: string) => {
  const opt = statusOptions.find(o => o.value === (s || '').trim());
  return opt ? opt.label : '待优化';
};
/** 状态标签配色：待优化=警告、已接纳=主题、已完成=成功、不接纳=中性 */
const statusTagType = (s?: string) => {
  switch ((s || '').trim()) {
    case 'completed':
      return 'success';
    case 'accepted':
      return 'primary';
    case 'rejected':
      return 'info';
    case 'pending':
    default:
      return 'warning';
  }
};

const getUserRole = () => {
  const store = useAuthStore();
  if (!store.token) return 'guest';
  try {
    const parts = store.token.split('.');
    if (parts.length < 2) return 'user';
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payloadBase64.length % 4 ? '='.repeat(4 - (payloadBase64.length % 4)) : '';
    const json = atob(payloadBase64 + pad);
    const obj = JSON.parse(json) as any;
    return String(obj?.role || 'user');
  } catch {
    return 'user';
  }
};

const detectEnv = () => {
  const ua = navigator.userAgent || '';
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|HarmonyOS/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);
  const device_type = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');

  let os = 'unknown';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/HarmonyOS/i.test(ua)) os = 'HarmonyOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'unknown';
  const m =
    ua.match(/Edg\/([\d.]+)/) ||
    ua.match(/Chrome\/([\d.]+)/) ||
    ua.match(/Firefox\/([\d.]+)/) ||
    ua.match(/Version\/([\d.]+).*Safari/) ||
    ua.match(/OPR\/([\d.]+)/);
  if (m) {
    if (/Edg\//.test(ua)) browser = `Edge ${m[1]}`;
    else if (/Chrome\//.test(ua)) browser = `Chrome ${m[1]}`;
    else if (/Firefox\//.test(ua)) browser = `Firefox ${m[1]}`;
    else if (/Safari/.test(ua)) browser = `Safari ${m[1]}`;
    else if (/OPR\//.test(ua)) browser = `Opera ${m[1]}`;
  }

  let network = 'unknown';
  const anyNav: any = navigator;
  const conn = anyNav.connection || anyNav.mozConnection || anyNav.webkitConnection;
  if (conn) {
    const et = conn.effectiveType || '';
    const dl = conn.downlink ? `${conn.downlink}Mbps` : '';
    network = [et, dl].filter(Boolean).join(' ') || 'unknown';
  }

  return { device_type, os, browser, network };
};

const submitting = ref(false);
const feedbackForm = ref({
  type: '',
  title: '',
  description: '',
  device_type: '',
  os: '',
  browser: '',
  network: '',
  email: '',
});

const submitFeedbackForm = async () => {
  if (!feedbackForm.value.type) { 
    feedbackErrorTitle.value = '提交失败';
    feedbackErrorMessage.value = '请选择反馈类型';
    feedbackErrorVisible.value = true;
    feedbackSuccessVisible.value = false;
    return; 
  }
  if (!feedbackForm.value.title.trim()) { 
    feedbackErrorTitle.value = '提交失败';
    feedbackErrorMessage.value = '请填写标题/概要';
    feedbackErrorVisible.value = true;
    feedbackSuccessVisible.value = false;
    return; 
  }
  if (!feedbackForm.value.description.trim()) { 
    feedbackErrorTitle.value = '提交失败';
    feedbackErrorMessage.value = '请填写详细描述';
    feedbackErrorVisible.value = true;
    feedbackSuccessVisible.value = false;
    return; 
  }
  const email = (feedbackForm.value.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { 
    feedbackErrorTitle.value = '提交失败';
    feedbackErrorMessage.value = '邮箱格式不正确';
    feedbackErrorVisible.value = true;
    feedbackSuccessVisible.value = false;
    return; 
  }
  submitting.value = true;
  try {
    const env = detectEnv();
    const pageUrl = window.location.href;
    const role = getUserRole();
    const payload = {
      ...feedbackForm.value,
      device_type: feedbackForm.value.device_type || env.device_type,
      os: feedbackForm.value.os || env.os,
      browser: feedbackForm.value.browser || env.browser,
      network: feedbackForm.value.network || env.network,
      page_url: pageUrl,
      user_role: role,
    };
    const data = await submitFeedback(payload);
    submittedHash.value = String(data.hash || '');
    feedbackSuccessVisible.value = true;
    feedbackErrorVisible.value = false;
    feedbackForm.value.title = '';
    feedbackForm.value.description = '';
  } catch (e: any) {
    const msg = e?.response?.data?.error || '提交失败，请稍后重试';
    feedbackErrorTitle.value = '提交失败';
    feedbackErrorMessage.value = msg;
    feedbackErrorVisible.value = true;
    feedbackSuccessVisible.value = false;
  } finally {
    submitting.value = false;
  }
};

const copySubmittedHash = async () => {
  const h = submittedHash.value || '';
  if (!h) return;
  try {
    await navigator.clipboard.writeText(h);
    copyTipVisible.value = true;
    setTimeout(() => { copyTipVisible.value = false; }, 1500);
  } catch {}
};

const hashQueryInput = ref('');
const queryLoading = ref(false);
const queryResult = ref<null | { id: number; type: string; title: string; status: string; created_at: string }>(null);
const acceptedList = ref<FeedbackSummary[]>([]);
const completedList = ref<FeedbackSummary[]>([]);
const queryFeedbackProgress = async () => {
  const h = (hashQueryInput.value || queryForm.value.hash || '').trim();
  if (!h) { queryResult.value = null; return; }
  queryLoading.value = true;
  queryErrorVisible.value = false;
  queryNotFound.value = false;
  try {
    const data = await getFeedbackProgressByHash(h);
    queryResult.value = data;
  } catch (e: any) {
    queryResult.value = null;
    if (e?.response?.status === 404) {
      queryNotFound.value = true;
    } else {
      queryErrorMessage.value = e?.response?.data?.error || '无法查询反馈，请检查哈希是否正确';
      queryErrorVisible.value = true;
    }
  } finally {
    queryLoading.value = false;
  }
};
const onQueryClear = () => {
  hashQueryInput.value = '';
  queryResult.value = null;
  queryErrorVisible.value = false;
  queryNotFound.value = false;
};
const fetchSuccessList = async () => {
  try {
    const [accepted, completed] = await Promise.all([
      getFeedbackSuccessList(5, 'accepted'),
      getFeedbackSuccessList(5, 'completed')
    ]);
    acceptedList.value = accepted;
    completedList.value = completed;
  } catch {}
};

const commonEmailDomains = [
  'qq.com',
  '163.com',
  '126.com',
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'sina.com',
  'sohu.com',
  'foxmail.com',
  'yeah.net',
  'aliyun.com'
];

const getEmailSuggestions = (queryString: string, cb: (arg: Array<{ value: string }>) => void) => {
  const q = (queryString || '').trim();
  if (!q) { cb([]); return; }
  const hasAt = q.includes('@');
  const [local, partialDomain] = q.split('@');
  const baseLocal = local || '';
  let domains = commonEmailDomains;
  if (hasAt) {
    const part = (partialDomain || '').toLowerCase();
    domains = commonEmailDomains.filter(d => d.toLowerCase().includes(part));
  }
  const suggestions = domains.slice(0, 8).map(d => ({ value: `${baseLocal}@${d}` }));
  cb(suggestions);
};

const onEmailSelect = (item: any) => {
  const v = typeof item === 'string' ? item : item?.value;
  if (v) feedbackForm.value.email = String(v);
};

const formatTime = (time?: string) => {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

const getChangelogHtml = (item: Changelog) => {
  if (item.content_html) return item.content_html;
  if (item.content_markdown) return md.render(item.content_markdown);
  return '';
};

const getChangelogTimeMs = (item: Changelog) => {
  const raw = item?.release_date || item?.created_at || 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const latestChangelog = computed(() => {
  const list = Array.isArray(changelogs.value) ? changelogs.value.slice() : [];
  list.sort((a, b) => getChangelogTimeMs(b) - getChangelogTimeMs(a));
  return list[0] || null;
});

/*
 * 首屏版本徽标和页脚共用同一个来源：优先「关于」里配置的版本，
 * 没配置才退回最新一条更新日志（更新日志每条有自己的 vX.Y.Z，不是站点版本）。
 */
const siteVersion = computed(() => {
  return aboutData.value.version || latestChangelog.value?.version || '1.0.0';
});

/** 更新日志卡片标题上的标签：用日志自己的版本号，没配才退回站点版本 */
const latestChangelogVersion = computed(() => latestChangelog.value?.version || siteVersion.value);

const fetchChangelogs = async () => {
  changelogsLoading.value = true;
  try {
    changelogs.value = await getPublicChangelogs();
  } catch (error) {
    console.error('Failed to fetch changelogs', error);
  } finally {
    changelogsFetched.value = true;
    changelogsLoading.value = false;
  }
};

const toggleChangelogs = () => {
  changelogsExpanded.value = !changelogsExpanded.value;
  if (changelogsExpanded.value && !changelogsFetched.value) {
    fetchChangelogs();
  }
};

const toggleCommits = () => {
  commitsExpanded.value = !commitsExpanded.value;
  if (commitsExpanded.value && commits.value.length === 0) {
    if (aboutData.value.github_repo) {
      fetchCommits(aboutData.value.github_repo);
    }
  }
};

const toggleFeedback = () => {
  feedbackExpanded.value = !feedbackExpanded.value;
};

const fetchCommits = async (repoInput: string) => {
  if (!repoInput) return;
  
  // Clean up repo string if it's a full URL
  let repo = repoInput;
  try {
    const urlObj = new URL(repoInput);
    if (urlObj.hostname === 'github.com') {
      repo = urlObj.pathname.substring(1); // Remove leading slash
    }
  } catch (e) {
    // Not a URL, assume it's already owner/repo format
    repo = repoInput;
  }
  
  // Remove .git suffix if present
  repo = repo.replace(/\.git$/, '');

  commitsLoading.value = true;
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}/commits?per_page=5`);
    commits.value = response.data;
  } catch (error) {
    console.error('Failed to fetch commits', error);
  } finally {
    commitsLoading.value = false;
  }
};

const getGithubUsername = (url?: string) => {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1] || 'GitHub';
};

const getRepoName = (repoInput?: string) => {
  if (!repoInput) return '';
  let repo = repoInput;
  try {
    const urlObj = new URL(repoInput);
    if (urlObj.hostname === 'github.com') {
      repo = urlObj.pathname.substring(1);
    }
  } catch (e) {
    // Not a URL
  }
  return repo.replace(/\.git$/, '');
};

// Scroll Handler
let ticking = false;

const checkScrollPosition = () => {
  // Use window.scrollY directly for more robust detection
  // When scrolled down more than 60px (header height), switch to sticky header
  layoutStore.setHeaderState(window.scrollY > 60);
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

const fetchRepoStars = async (repoInput: string) => {
  if (!repoInput) return;
  const repo = getRepoName(repoInput);
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}`);
    repoStars.value = response.data.stargazers_count;
  } catch (error) {
    console.error('Failed to fetch repo stars', error);
  }
};

const fetchData = async () => {
  const data = await getAboutPage();
  if (data && Object.keys(data).length > 0) {
    aboutData.value = data;
    if (data.github_repo) {
      fetchRepoStars(data.github_repo);
    }
    // Don't auto fetch commits, wait for expand
  } else {
    // Default fallback if no data in DB yet
    aboutData.value = {
      id: 0,
      content_html: `
        <h2>OpenStore - 鸿蒙应用数据面板</h2>
        <p>这是一个基于现代 Web 技术栈构建的鸿蒙应用数据探索与分析平台。</p>
        <p><strong>技术栈：</strong></p>
        <ul>
          <li><strong>前端框架：</strong>Vue 3 (Composition API)</li>
          <li><strong>开发语言：</strong>TypeScript</li>
          <li><strong>构建工具：</strong>Vite</li>
          <li><strong>UI 组件库：</strong>Element Plus</li>
          <li><strong>状态管理：</strong>Pinia</li>
          <li><strong>数据可视化：</strong>Apache ECharts</li>
          <li><strong>图标系统：</strong>Font Awesome & Element Plus Icons</li>
        </ul>
        <p><strong>核心功能：</strong></p>
        <ul>
          <li><strong>应用看板：</strong>实时监控鸿蒙应用下载量与增长趋势</li>
          <li><strong>排行榜单：</strong>多维度应用下载榜单、增长对比榜</li>
          <li><strong>数据分析：</strong>应用详情深度解析与历史数据回溯</li>
          <li><strong>探索发现：</strong>发现最新上架与热门更新的鸿蒙应用</li>
          <li><strong>投稿中心：</strong>支持用户自主提交优质应用与专题内容</li>
        </ul>
      `,
      author_name: 'ChuEng',
      author_github: 'https://github.com/XiaoChuangll',
      site_name: 'OpenStore',
      tagline: '鸿蒙应用数据探索与分析平台',
      version: '1.0.0'
    };
  }
};

onMounted(async () => {
  window.scrollTo(0, 0);
  window.addEventListener('scroll', handleScroll);
  layoutStore.setPageInfo('关于', false);
  // Initial check
  checkScrollPosition();
  await fetchData();
  fetchChangelogs();
  fetchSuccessList();
  loadAboutCards();
});

// 后台保存「关于」内容 / 卡片配置后（WS → contentVersion +1）重新取数
watch(contentVersion, () => {
  fetchData();
  loadAboutCards();
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  layoutStore.setHeaderState(false);
});
</script>

<style scoped>
.about-view {
  max-width: 960px;
  margin: 0 auto;
  /*
   * 两列网格：hero / 内容 / 更新日志 / 提交 / 反馈整宽，作者与技术栈并排。
   * 卡片顺序仍然由后台配置的 order 决定，dense 让半宽卡片自动补上空位。
   */
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  grid-auto-flow: dense;
}

.about-view > .is-full,
.about-view > .about-hero-item {
  grid-column: 1 / -1;
}

.about-hero-item {
  margin: 0;
}

.about-card {
  border-radius: 14px;
  margin: 0;
}

.about-card :deep(.el-card__header) {
  padding: 14px 18px;
}

.about-card :deep(.el-card__body) {
  padding: 18px;
}

.content-card :deep(.el-card__body) {
  padding: 22px 24px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-header.is-toggle {
  cursor: pointer;
  user-select: none;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card-title .el-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}

.card-count {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.toggle-icon {
  color: var(--el-text-color-secondary);
}

.about-content {
  line-height: 1.7;
}

.about-content.ql-editor,
.about-content.markdown-body {
  padding: 0;
  overflow-y: visible;
  height: auto;
}

.empty-tip {
  margin: 0;
  padding: 16px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 作者信息 */
.info-list {
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.info-row:first-child {
  padding-top: 0;
}

.info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.info-row .label {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.info-row .value {
  min-width: 0;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-row .value.is-muted {
  font-weight: 400;
  color: var(--el-text-color-placeholder);
}

.info-row .link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-primary);
  text-decoration: none;
}

.info-row .link:hover {
  text-decoration: underline;
}

/* 技术栈 */
.tech-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tech-tag {
  border: none;
  font-weight: 500;
  /* 撑满整行：标签按内容比例分摊剩余宽度，右端不会留下参差空白 */
  flex-grow: 1;
  justify-content: center;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  cursor: default;
}

.tech-tag:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px -8px rgba(15, 23, 42, 0.5);
}

/* 更新日志 / 提交 */
.changelogs-list,
.commits-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.changelog-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.changelog-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.changelog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.changelog-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.changelog-content {
  margin-top: 8px;
  padding: 0;
}

.commit-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.commit-item:last-child {
  border-bottom: none;
}

.commit-info {
  flex: 1;
  min-width: 0;
}

.commit-msg {
  margin-bottom: 4px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.commit-user {
  display: flex;
  align-items: center;
  gap: 8px;
}

.commit-link {
  display: flex;
  align-items: center;
  font-size: 18px;
  color: var(--el-color-primary);
}

.commit-link:hover {
  color: var(--el-color-primary-light-3);
}

/* 鸣谢 */
.contributors-intro {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.contributors {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.contributor {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 6px 14px 6px 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background-color: var(--el-fill-color-lighter);
  text-decoration: none;
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.contributor:hover {
  border-color: color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  background-color: var(--el-color-primary-light-9);
  transform: translateY(-1px);
}

.contributor-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex: 0 0 auto;
  border: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-bg-color);
}

/* 头像挂了也要占住同样的位置，否则整行会抖 */
.contributor-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-size: 14px;
  font-weight: 600;
}

.contributor-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 反馈 */
.feedback-tabs {
  margin-top: 4px;
}

.success-alert :deep(.el-alert__content) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hash-query-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.hash-query-row .el-input {
  flex: 1 1 auto;
  min-width: 0;
}

.hash-query-row .el-button {
  flex: 0 0 auto;
}

.query-result {
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  /*
   * 底色保持中性：状态色只由上面的标签承担，
   * 否则标签会和整块底色撞成一个颜色、反而看不清。
   */
  background-color: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.query-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  line-height: 1;
}

.query-result .qr-time {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.query-result .qr-time .el-icon {
  font-size: 13px;
}

.query-result-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

@media (max-width: 480px) {
  .query-result .qr-time {
    /* 窄屏让时间换行到下一行，别把两个标签挤变形 */
    margin-left: 0;
    width: 100%;
  }
}

.success-list {
  margin-top: 20px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 16px;
}

.success-list-completed {
  background-color: var(--el-color-success-light-9);
}

.success-list-accepted {
  background-color: var(--el-color-primary-light-9);
}

.success-list-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
  padding-left: 12px;
  position: relative;
  line-height: 1.2;
  /* 图标与标题之间留出间距：flex 会吃掉模板里那个空格，不显式给 gap 就会贴在一起 */
  gap: 6px;
}

.success-list-header::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 4px;
  background-color: var(--el-color-success);
}

.success-list-completed .success-list-header {
  color: var(--el-color-success-dark-2);
}

.success-list-completed .success-list-header::before {
  background-color: var(--el-color-success);
}

.success-list-accepted .success-list-header {
  color: var(--el-color-primary-dark-2);
}

.success-list-accepted .success-list-header::before {
  background-color: var(--el-color-primary);
}

.success-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  transition: background-color 0.2s;
  border-radius: 4px;
}

.success-item:hover {
  background-color: var(--el-fill-color-light);
}

.success-item:last-child {
  border-bottom: none;
}

.success-item .title {
  font-size: 14px;
  color: var(--el-text-color-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 16px;
  font-weight: 500;
}

.success-item .meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.success-alert .alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.success-alert .alert-desc {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
}

.success-alert .alert-desc .hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--el-color-primary);
  word-break: break-all;
  font-weight: 600;
  font-size: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.copy-tip {
  color: var(--el-color-success);
  margin-left: 8px;
  font-size: 13px;
}

.footer-info {
  /* 页脚永远排在所有卡片之后 */
  order: 1000;
  grid-column: 1 / -1;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-light);
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.footer-info p {
  margin: 4px 0;
}

.rotate-90 {
  transform: rotate(90deg);
}

.toggle-icon {
  transition: transform 0.3s;
}

.text-yellow-500 {
  color: #e6a23c;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.mb-2 {
  margin-bottom: 12px;
}

.mt-2 {
  margin-top: 12px;
}

.star-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  font-weight: 500;
  color: var(--el-text-color-primary);
  transition: opacity 0.2s;
}

.star-link:hover {
  opacity: 0.8;
  text-decoration: none;
}

/* Dark Mode & Theme Adaptation */
.about-content {
  color: var(--el-text-color-primary);
}

/* Markdown Adaptation */
.markdown-body {
  background-color: transparent !important;
  color: var(--el-text-color-primary) !important;
}

:deep(.markdown-body) {
  /* Variable mapping for github-markdown-css */
  --color-canvas-default: transparent;
  --color-fg-default: var(--el-text-color-primary);
  --color-fg-muted: var(--el-text-color-secondary);
  --color-accent-fg: var(--el-color-primary);
  --color-canvas-subtle: var(--el-fill-color-light);
  --color-border-default: var(--el-border-color);
  --color-border-muted: var(--el-border-color-lighter);
  --color-neutral-muted: var(--el-fill-color-lighter);
}

:deep(.markdown-body a) {
  color: var(--el-color-primary) !important;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  color: var(--el-text-color-primary) !important;
  border-bottom-color: var(--el-border-color-lighter) !important;
}

:deep(.markdown-body blockquote) {
  color: var(--el-text-color-secondary) !important;
  border-left-color: var(--el-border-color) !important;
}

:deep(.markdown-body table tr) {
  background-color: transparent !important;
  border-top-color: var(--el-border-color-lighter) !important;
}

:deep(.markdown-body table tr:nth-child(2n)) {
  background-color: var(--el-fill-color-lighter) !important;
}

:deep(.markdown-body code),
:deep(.markdown-body tt) {
  background-color: var(--el-fill-color-light) !important;
  border-radius: 4px;
}

:deep(.markdown-body pre) {
  background-color: var(--el-fill-color-light) !important;
}

/* Quill Editor Adaptation */
.ql-editor {
  color: var(--el-text-color-primary) !important;
  background-color: transparent;
}

:deep(.ql-editor p),
:deep(.ql-editor ol),
:deep(.ql-editor ul),
:deep(.ql-editor pre),
:deep(.ql-editor blockquote),
:deep(.ql-editor h1),
:deep(.ql-editor h2),
:deep(.ql-editor h3),
:deep(.ql-editor h4),
:deep(.ql-editor h5),
:deep(.ql-editor h6) {
  color: var(--el-text-color-primary) !important;
}

:deep(.ql-editor a) {
  color: var(--el-color-primary) !important;
}

:deep(.ql-editor blockquote) {
  border-left-color: var(--el-border-color) !important;
  color: var(--el-text-color-secondary) !important;
}

:deep(.ql-editor code),
:deep(.ql-editor pre) {
  background-color: var(--el-fill-color-light) !important;
  color: var(--el-text-color-primary) !important;
}

/* 窄屏：改单列，半宽卡片自然铺满 */
@media (max-width: 720px) {
  .about-view {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .content-card :deep(.el-card__body) {
    padding: 18px 16px;
  }
}
</style>
