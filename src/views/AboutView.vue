<template>
  <div class="about-view">
    <el-card class="about-card mb-4" v-if="showContent">
      <div 
        class="about-content" 
        :class="{ 'ql-editor': !aboutData.content_markdown, 'markdown-body': !!aboutData.content_markdown }"
        v-html="aboutData.content_html"
      ></div>
    </el-card>

    <el-card class="about-card mb-4">
      <template #header>
        <div class="card-header">
          <span>关于作者</span>
        </div>
      </template>
      <div class="about-content">
        <div class="info-row">
          <span class="label">开发者</span>
          <div class="developer-info">
            <span class="value">{{ aboutData.author_name || 'ChuEng' }}</span>
            <div class="author-info" v-if="aboutData.author_avatar">
              <el-image 
                :src="aboutData.author_avatar" 
                fit="cover" 
                class="author-avatar"
                :preview-src-list="[aboutData.author_avatar]"
              />
            </div>
          </div>
        </div>
        <div class="info-row">
          <div class="flex items-center">
            <span class="label mr-2">Github</span>
            <a v-if="repoStars !== null" :href="`https://github.com/${getRepoName(aboutData.github_repo)}/stargazers`" target="_blank" class="value link star-link">
              <el-icon class="mr-1 text-yellow-500"><StarFilled /></el-icon> {{ repoStars }}
            </a>
          </div>
          <div class="flex items-center">
            <a :href="aboutData.author_github || 'https://github.com/XiaoChuangll'" target="_blank" class="value link">
              {{ getGithubUsername(aboutData.author_github) || 'XiaoChuangll' }} <el-icon><Link /></el-icon>
            </a>
          </div>
        </div>
      </div>
    </el-card>

    <el-card class="about-card mb-4">
      <template #header>
        <div class="card-header">
          <span>技术栈</span>
        </div>
      </template>
      <div class="tech-stack">
        <el-tag 
          v-for="tech in techStack" 
          :key="tech.name"
          :type="tech.type"
          effect="light"
          class="tech-tag"
          size="large"
        >
          {{ tech.name }}
        </el-tag>
      </div>
    </el-card>

    <el-card class="about-card mb-4">
      <template #header>
        <div class="card-header cursor-pointer select-none flex items-center justify-between" @click="toggleChangelogs">
          <div class="flex items-center">
            <span class="mr-2">更新日志</span>
            <el-tag size="small" effect="light" type="primary" round>{{ latestChangelogVersion }}</el-tag>
          </div>
          <el-icon :class="{ 'rotate-90': changelogsExpanded }"><ArrowRight /></el-icon>
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
            <div v-if="changelogsFetched && changelogs.length === 0 && !changelogsLoading" class="text-center text-gray-400 py-4">
              暂无更新日志
            </div>
          </div>
        </div>
      </el-collapse-transition>
    </el-card>

    <el-card class="about-card mb-4" v-if="aboutData.github_repo">
      <template #header>
        <div class="card-header cursor-pointer select-none flex items-center justify-between" @click="toggleCommits">
          <div class="flex items-center">
            <span class="mr-2">最近提交 ({{ getRepoName(aboutData.github_repo) }})</span>
          </div>
          <el-icon :class="{ 'rotate-90': commitsExpanded }"><ArrowRight /></el-icon>
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
              <a :href="commit.html_url" target="_blank" class="commit-link">
                <el-icon><Link /></el-icon>
              </a>
            </div>
            <div v-if="commits.length === 0 && !commitsLoading" class="text-center text-gray-400 py-4">
              暂无提交记录或无法获取
            </div>
          </div>
        </div>
      </el-collapse-transition>
    </el-card>

    <el-card class="about-card mb-4">
      <template #header>
        <div class="card-header cursor-pointer select-none flex items-center justify-between" @click="toggleFeedback">
          <div class="flex items-center">
            <span class="mr-2">意见反馈</span>
          </div>
          <el-icon :class="{ 'rotate-90': feedbackExpanded }"><ArrowRight /></el-icon>
        </div>
      </template>
      <el-collapse-transition>
        <div v-show="feedbackExpanded" class="feedback-form">
          <el-tabs v-model="feedbackTab" class="feedback-tabs" :stretch="true">
            <el-tab-pane label="提交反馈" name="submit">
              <el-form :model="feedbackForm" label-width="120px">
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
              <div class="privacy-tip"></div>
            </el-tab-pane>
            <el-tab-pane label="查询进度" name="query">
              <div class="hash-query">
                <el-form :model="queryForm" label-width="120px">
                  <el-form-item label="反馈编号">
                    <el-input
                      v-model="hashQueryInput"
                      placeholder="输入编号查询进度"
                      style="width: 100%;"
                      clearable
                      @clear="onQueryClear"
                    />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" :loading="queryLoading" @click="queryFeedbackProgress">查询</el-button>
                  </el-form-item>
                </el-form>
                <el-alert
                  v-if="queryResult"
                  type="info"
                  :closable="false"
                  title="查询结果"
                  class="mt-2"
                />
                <el-descriptions
                  v-if="queryResult"
                  border
                  :column="2"
                  size="small"
                  class="query-result-desc"
                >
                  <el-descriptions-item label="进度">{{ statusLabel(queryResult.status) }}</el-descriptions-item>
                  <el-descriptions-item label="提交时间">{{ formatTime(queryResult.created_at) }}</el-descriptions-item>
                  <el-descriptions-item label="类型">{{ typeLabel(queryResult.type) }}</el-descriptions-item>
                  <el-descriptions-item label="标题">{{ queryResult.title }}</el-descriptions-item>
                </el-descriptions>
                <div v-if="completedList.length > 0" class="success-list success-list-completed">
                  <div class="success-list-header flex items-center">
                    <el-icon class="mr-1"><CircleCheckFilled /></el-icon> 已完成
                  </div>
                  <div class="success-item" v-for="item in completedList" :key="item.id">
                    <span class="title">{{ item.title }}</span>
                    <span class="meta">{{ typeLabel(item.type) }} · {{ statusLabel(item.status) }} · {{ formatTime(item.created_at) }}</span>
                  </div>
                </div>
                <div v-if="acceptedList.length > 0" class="success-list success-list-accepted">
                  <div class="success-list-header flex items-center">
                    <el-icon class="mr-1"><CircleCheck /></el-icon> 已接纳
                  </div>
                  <div class="success-item" v-for="item in acceptedList" :key="item.id">
                    <span class="title">{{ item.title }}</span>
                    <span class="meta">{{ typeLabel(item.type) }} · {{ statusLabel(item.status) }} · {{ formatTime(item.created_at) }}</span>
                  </div>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-collapse-transition>
    </el-card>

    <div class="footer-info">
      <p>Version {{ aboutData.version || '1.0.0' }}</p>
      <p>&copy; {{ new Date().getFullYear() }} BetaHub Tech. All rights reserved.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useLayoutStore } from '../stores/layout';
import { Link, ArrowRight, StarFilled, CircleCheck, CircleCheckFilled } from '@element-plus/icons-vue';
import { getAboutPage, getPublicChangelogs, submitFeedback, getFeedbackProgressByHash, getFeedbackSuccessList, type AboutPage, type Changelog, type FeedbackSummary } from '../services/api';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import '@vueup/vue-quill/dist/vue-quill.snow.css'; // Import Quill styles for content rendering
import 'github-markdown-css/github-markdown.css';
import { useAuthStore } from '../stores/auth';

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
const submittedId = ref<number | null>(null);
const submittedHash = ref<string | null>(null);
const copyTipVisible = ref(false);
const repoStars = ref<number | null>(null);
const changelogs = ref<Changelog[]>([]);
const changelogsLoading = ref(false);
const changelogsExpanded = ref(false);
const changelogsFetched = ref(false);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});

const techStack = [
  { name: 'Vue 3', type: 'success' },
  { name: 'TypeScript', type: 'primary' },
  { name: 'Vite', type: 'warning' },
  { name: 'Element Plus', type: 'primary' },
  { name: 'Pinia', type: 'warning' },
  { name: 'Apache ECharts', type: 'danger' },
  { name: 'Node.js', type: 'success' },
  { name: 'Express', type: 'info' },
  { name: 'SQLite', type: 'info' },
  { name: 'Font Awesome', type: 'primary' }
] as const;

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
    submittedId.value = Number(data.id);
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
  try {
    const data = await getFeedbackProgressByHash(h);
    queryResult.value = data;
  } catch (e: any) {
    queryResult.value = null;
    feedbackErrorTitle.value = '查询失败';
    feedbackErrorMessage.value = e?.response?.data?.error || '无法查询反馈，请检查哈希是否正确';
    feedbackErrorVisible.value = true;
    feedbackSuccessVisible.value = false;
  } finally {
    queryLoading.value = false;
  }
};
const onQueryClear = () => {
  hashQueryInput.value = '';
  queryResult.value = null;
  feedbackErrorVisible.value = false;
  feedbackSuccessVisible.value = false;
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

const latestChangelogVersion = computed(() => {
  return latestChangelog.value?.version || aboutData.value.version || '1.0.0';
});

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
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  layoutStore.setHeaderState(false);
});
</script>

<style scoped>
.about-view {
  max-width: 800px;
  margin: 0 auto;
}
.mb-4 {
  margin-bottom: 20px;
}
.about-card {
  border-radius: 12px;
}
.about-content {
  line-height: 1.6;
}
.about-content.ql-editor,
.about-content.markdown-body {
  padding: 0;
  overflow-y: visible;
  height: auto;
}
.card-header {
}
.feedback-tabs {
  margin-top: 8px;
}
.success-alert :deep(.el-alert__content) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.query-result-desc {
  margin-top: 8px;
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
  padding-left: 8px;
  border-left: 4px solid var(--el-color-success);
  line-height: 1.2;
}
.success-list-completed .success-list-header {
  border-left-color: var(--el-color-success);
  color: var(--el-color-success-dark-2);
}
.success-list-accepted .success-list-header {
  border-left-color: var(--el-color-primary);
  color: var(--el-color-primary-dark-2);
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
.developer-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.author-info {
  display: flex;
  justify-content: center;
  margin: 0;
}
.author-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--el-border-color);
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 12px;
}
.info-row:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.info-row .label {
  color: var(--el-text-color-secondary);
}
.commits-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.changelogs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.commit-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.changelog-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.commit-item:last-child {
  border-bottom: none;
}
.changelog-item:last-child {
  border-bottom: none;
}
.commit-info {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}
.changelog-info {
  flex: 1;
  min-width: 0;
}
.commit-msg {
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.changelog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
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
.commit-meta {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  gap: 12px;
}
.commit-user {
  display: flex;
  align-items: center;
  gap: 8px;
}
.commit-link {
  color: var(--el-color-primary);
  font-size: 18px;
  display: flex;
  align-items: center;
}
.commit-link:hover {
  color: var(--el-color-primary-light-3);
}
.info-row .value {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.info-row .link {
  color: var(--el-color-primary);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.info-row .link:hover {
  text-decoration: underline;
}
.tech-stack {
  padding: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.tech-tag {
  flex-grow: 1;
  justify-content: center;
  transition: all 0.3s ease;
  cursor: default;
  border: none;
  font-weight: 500;
}
.tech-tag:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.mr-2 { margin-right: 12px; }
.mb-2 { margin-bottom: 12px; }

.feedback-form :deep(.el-checkbox__label) {
  white-space: normal;
  word-break: break-word;
  line-height: 1.6;
}
@media (max-width: 480px) {
  .feedback-form :deep(.el-checkbox__label) {
    display: block;
  }
}

h2 {
  margin-bottom: 20px;
  color: var(--el-text-color-primary);
}
p, ul {
  color: var(--el-text-color-regular);
  margin-bottom: 16px;
}
ul {
  padding-left: 20px;
}
li {
  margin-bottom: 8px;
}
.footer-info {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-light);
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}
.rotate-90 {
  transform: rotate(90deg);
  transition: transform 0.3s;
}
.el-icon {
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
.justify-between {
  justify-content: space-between;
}
.star-link {
  display: flex;
  align-items: center;
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
</style>
