<template>
  <div class="submission-view">
    <header class="page-hero">
      <h1 class="page-hero-title">投稿</h1>
      <p class="page-hero-desc">提交应用收录，或投稿你的侧载应用</p>
    </header>

    <section class="panel">
      <div
        class="panel-head is-clickable"
        role="button"
        tabindex="0"
        :aria-expanded="openPanels.collection"
        @click="togglePanel('collection')"
        @keydown.enter.prevent="togglePanel('collection')"
        @keydown.space.prevent="togglePanel('collection')"
      >
        <span class="panel-index">1</span>
        <div class="panel-text">
          <h2 class="panel-title">提交收录</h2>
        </div>
        <el-icon class="panel-caret" :class="{ 'is-open': openPanels.collection }"><ArrowDown /></el-icon>
      </div>

      <el-collapse-transition>
        <div v-show="openPanels.collection" class="panel-body">
        <el-form :model="form" label-position="top">
        <el-form-item label="提交类型">
          <el-radio-group v-model="form.type">
            <el-radio-button label="app">应用</el-radio-button>
            <el-radio-button label="substance">专题</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <!-- App Submission Form -->
        <template v-if="form.type === 'app'">
          <el-form-item label="应用详情页链接">
            <el-input 
              v-model="appForm.link" 
              placeholder="请输入应用详情页链接/包名/应用ID"
              clearable
              spellcheck="false"
              @input="handleLinkInput"
            >
              <template #prefix>
                <el-icon><Link /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="解析结果">
            <div v-if="appForm.app_id || appForm.pkg_name" class="parse-result" v-loading="parsing">
              <!-- 还没解析出应用信息时，只显示识别到的标识 -->
              <div v-if="!submittedAppInfo" class="parse-status">
                <div class="parse-tags">
                  <el-tag v-if="appForm.app_id" type="success" size="small" effect="plain">{{ appForm.app_id }}</el-tag>
                  <el-tag v-if="appForm.pkg_name" type="success" size="small" effect="plain">{{ appForm.pkg_name }}</el-tag>
                </div>
                <el-tag :type="getStatusTagType(parsing ? '解析中' : '待解析')" size="small">
                  {{ parsing ? '解析中' : '待解析' }}
                </el-tag>
              </div>

              <!-- 命中应用：图标 + 名称 + 状态一行，下面是指标区 -->
              <div v-if="submittedAppInfo" class="app-result">
                <!-- 保留图标骨架方块；加载失败时不显示小图标，只留空底 -->
                <el-image
                  :src="submittedAppInfo.icon_url || submittedAppInfo.icon"
                  class="app-result-icon"
                  fit="cover"
                >
                  <!-- 失败时只留空底，不放任何图标/文字 -->
                  <template #error><span /></template>
                </el-image>
                <div class="app-result-main">
                  <div class="app-result-head">
                    <h3 class="app-result-name">{{ submittedAppInfo.name || submittedAppInfo.pkg_name || '—' }}</h3>
                    <el-tag :type="getStatusTagType(submittedAppInfo.status || '已解析')" size="small" effect="plain">
                      {{ submittedAppInfo.status || '已解析' }}
                    </el-tag>
                  </div>
                  <p class="app-result-sub">
                    <span class="app-result-pkg">{{ submittedAppInfo.pkg_name || '—' }}</span>
                    <span
                      v-if="submittedAppInfo.app_id && submittedAppInfo.app_id !== submittedAppInfo.pkg_name"
                      class="app-result-id"
                    >
                      ID {{ submittedAppInfo.app_id }}
                    </span>
                  </p>
                </div>
              </div>

              <div v-if="submittedAppInfo" class="app-result-stats">
                <span>
                  <em>下载量</em>
                  <b>{{ formatDownloads(submittedAppInfo.download_count || submittedAppInfo.downloads) }}</b>
                </span>
                <span>
                  <em>大小</em>
                  <b>{{ formatSize(submittedAppInfo.size_bytes || submittedAppInfo.size) }}</b>
                </span>
                <span>
                  <em>上架时间</em>
                  <b>{{ formatDate(submittedAppInfo.listed_at || submittedAppInfo.listed_time || submittedAppInfo.release_date || submittedAppInfo.release_time || submittedAppInfo.create_time || submittedAppInfo.created_at) }}</b>
                </span>
              </div>
            </div>
            <div v-else class="parse-empty">
              <el-icon><Link /></el-icon>
              <span>粘贴链接或包名后会自动解析，结果显示在这里</span>
            </div>
          </el-form-item>
        </template>

        <!-- Substance Submission Form -->
        <template v-else>
          <el-form-item label="专题链接或ID">
            <el-input 
              v-model="form.input" 
              placeholder="请输入华为应用市场专题链接或专题ID"
              clearable
              spellcheck="false"
              @input="handleSubstanceInput"
            >
              <template #prefix>
                <el-icon><Link /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="解析结果">
            <div v-if="parsedSubstance" class="parse-result">
              <div class="parse-status">
                <div class="parse-tags">
                  <el-tag :type="parsedSubstance.substance_id ? 'success' : 'info'" size="small">
                    {{ parsedSubstance.substance_id || '—' }}
                  </el-tag>
                </div>
                <el-tag :type="getStatusTagType(parsedSubstance?.status || (topicParsing ? '解析中' : '待解析'))" size="small">
                  {{ parsedSubstance?.status || (topicParsing ? '解析中' : '待解析') }}
                </el-tag>
              </div>

              <dl class="topic-meta">
                <div class="topic-meta-row">
                  <dt>标题</dt>
                  <dd>{{ parsedSubstance.title || parsedSubstance.name || '—' }}</dd>
                </div>
                <div class="topic-meta-row">
                  <dt>副标题</dt>
                  <dd>{{ parsedSubstance.subtitle || '—' }}</dd>
                </div>
                <div class="topic-meta-row">
                  <dt>专题</dt>
                  <dd>{{ parsedSubstance.name || parsedSubstance.title || '—' }}</dd>
                </div>
                <div v-if="parsedSubstance.remark" class="topic-meta-row">
                  <dt>备注</dt>
                  <dd>{{ parsedSubstance.remark }}</dd>
                </div>
                <div v-if="parsedSubstance.platform" class="topic-meta-row">
                  <dt>提交平台</dt>
                  <dd>{{ parsedSubstance.platform }}</dd>
                </div>
                <div v-if="parsedSubstance.user" class="topic-meta-row">
                  <dt>提交用户</dt>
                  <dd>{{ parsedSubstance.user }}</dd>
                </div>
              </dl>
            </div>
            <div v-else class="parse-empty">
              <el-icon><Link /></el-icon>
              <span>粘贴专题链接或 ID 后会自动解析</span>
            </div>
          </el-form-item>

          <el-form-item label="相关应用" v-if="topicApps.length > 0">
            <div class="topic-apps" v-loading="topicParsing">
              <div v-for="row in topicApps" :key="row.pkg_name || row.app_id" class="topic-app-row">
                <el-image
                  :src="row.icon_url || row.icon"
                  class="topic-app-icon"
                  fit="cover"
                >
                  <template #error><span /></template>
                </el-image>
                <div class="topic-app-main">
                  <span class="topic-app-name">{{ row.name || row.pkg_name || '—' }}</span>
                  <span class="topic-app-pkg">{{ row.pkg_name || row.app_id || '—' }}</span>
                </div>
                <span class="topic-app-count">{{ formatDownloads(row.download_count || row.downloads) }} 次下载</span>
                <el-tag
                  size="small"
                  :type="row.status === '解析失败' ? 'danger' : row.status === '解析中' ? 'warning' : 'success'"
                >
                  {{ row.status || '已解析' }}
                </el-tag>
              </div>
            </div>
          </el-form-item>
        </template>

        </el-form>
        </div>
      </el-collapse-transition>
    </section>

    <section class="panel">
      <div
        class="panel-head is-clickable"
        role="button"
        tabindex="0"
        :aria-expanded="openPanels.submission"
        @click="togglePanel('submission')"
        @keydown.enter.prevent="togglePanel('submission')"
        @keydown.space.prevent="togglePanel('submission')"
      >
        <span class="panel-index">2</span>
        <div class="panel-text">
          <h2 class="panel-title">应用投稿</h2>
        </div>
        <el-icon class="panel-caret" :class="{ 'is-open': openPanels.submission }"><ArrowDown /></el-icon>
      </div>

      <el-collapse-transition>
        <div v-show="openPanels.submission" class="panel-body">
        <el-form
          :model="submitForm"
          label-position="top"
          v-if="submissionStep === 'edit'"
          class="submit-form"
        >
        <el-form-item label="投稿类型">
          <el-tag type="warning" size="small">侧载 / 测试类型</el-tag>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="应用名称">
            <el-input v-model="submitForm.name" placeholder="请输入应用名称" clearable />
          </el-form-item>
          <el-form-item label="应用提供者">
            <el-input v-model="submitForm.provider" placeholder="请输入应用提供者" clearable />
          </el-form-item>
          <el-form-item label="图标 URL">
            <el-input v-model="submitForm.icon_url" placeholder="请输入图标 URL" clearable />
          </el-form-item>
          <el-form-item label="背景 URL">
            <el-input v-model="submitForm.bg_url" placeholder="请输入背景 URL" clearable />
          </el-form-item>
          <el-form-item label="下载链接" class="form-grid-full">
            <el-input v-model="submitForm.download_url" placeholder="请输入下载链接" clearable />
          </el-form-item>
        </div>
        <div class="submit-actions">
          <el-button type="primary" :icon="Check" @click="saveForPreview">保存并预览</el-button>
        </div>
        </el-form>

        <div v-else class="preview-section">
          <el-alert
            title="请确认投稿信息"
            type="info"
            description="仔细检查下方应用卡片预览效果，确认无误后点击提交。"
            show-icon
            :closable="false"
            class="preview-alert"
          />

          <div class="preview-card-wrapper">
            <AppDetailCard :item="previewData" :is-detail="true" />
          </div>

          <div class="submit-actions is-center">
            <el-button :icon="Back" @click="backToEdit">返回修改</el-button>
            <el-button type="primary" :loading="submitting" :icon="Check" @click="submitApp">确认提交</el-button>
          </div>
        </div>
        </div>
      </el-collapse-transition>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { Link, Back, Check, ArrowDown } from '@element-plus/icons-vue';
import { hmApi } from '../services/hm-api';
import { getTopicDetail, submitAppSubmission } from '../services/api';
import AppDetailCard from '../components/AppDetailCard.vue';

type SubmittedAppInfo = {
  icon_url?: string;
  icon?: string;
  pkg_name?: string;
  app_id?: string;
  name?: string;
  download_count?: number | string;
  downloads?: number | string;
  size_bytes?: number | string;
  size?: number | string;
  listed_at?: number | string;
  listed_time?: number | string;
  release_date?: number | string;
  release_time?: number | string;
  create_time?: number | string;
  created_at?: number | string;
  status?: string;
};

const parsing = ref(false);
const topicParsing = ref(false);

// 两个面板可展开/折叠，提交收录默认展开
const openPanels = reactive({ collection: true, submission: false });
const togglePanel = (key: 'collection' | 'submission') => {
  openPanels[key] = !openPanels[key];
};

const form = reactive({
  type: 'app',
  input: '' // For substance
});

const appForm = reactive({
  link: '',
  pkg_name: '',
  app_id: ''
});

const submittedAppInfo = ref<SubmittedAppInfo | null>(null);
const parsedSubstance = ref<any | null>(null);
const topicApps = ref<SubmittedAppInfo[]>([]);
const submitting = ref(false);
const submissionStep = ref<'edit' | 'preview'>('edit');
const previewData = ref<any>(null);

let debounceTimer: number | undefined;
let requestSeq = 0;
let lastFetchKey = '';
let substanceDebounceTimer: number | undefined;
let substanceRequestSeq = 0;
let lastSubstanceKey = '';

const submitForm = reactive({
  name: '',
  provider: '',
  bg_url: '',
  icon_url: '',
  download_url: ''
});

const getStatusTagType = (raw: any) => {
  const s = String(raw || '').trim();
  if (s === '解析失败') return 'danger';
  if (s === '解析中' || s === '提交中') return 'warning';
  if (s === '未找到') return 'info';
  if (s === '已解析' || s === '已存在') return 'success';
  if (!s || s === '待解析') return 'info';
  return 'success';
};

const formatDownloads = (raw: any) => {
  const n = Number(typeof raw === 'string' ? raw.replace(/[^\d.]/g, '') : raw);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString();
};

const formatSize = (raw: any) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (n >= gb) return `${(n / gb).toFixed(2)} GB`;
  if (n >= mb) return `${(n / mb).toFixed(2)} MB`;
  if (n >= kb) return `${(n / kb).toFixed(2)} KB`;
  return `${n} B`;
};

const formatDate = (raw: any) => {
  if (raw === null || raw === undefined || raw === '') return '—';
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN') : '—';
};

const getMetricTimeMs = (m: any) => {
  const raw = m?.created_at || m?.update_time || m?.last_update || 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const pickLatestMetric = (list: any[]) => {
  if (!Array.isArray(list) || list.length === 0) return null;
  let best = list[0];
  let bestMs = getMetricTimeMs(best);
  for (let i = 1; i < list.length; i++) {
    const cur = list[i];
    const curMs = getMetricTimeMs(cur);
    if (curMs > bestMs) {
      best = cur;
      bestMs = curMs;
    }
  }
  return best || null;
};

const tryParseUrl = (raw: string) => {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s);
    } catch {
      return null;
    }
  }
  if (/^appgallery\.huawei\.com/i.test(s)) {
    try {
      return new URL(`https://${s}`);
    } catch {
      return null;
    }
  }
  return null;
};

const parseAppInput = (raw: string) => {
  const input = raw.trim();
  let pkg_name = '';
  let app_id = '';

  const url = tryParseUrl(input);
  if (url) {
    const idParam = (url.searchParams.get('id') || '').trim();
    if (/^C\d+$/i.test(idParam)) app_id = idParam.toUpperCase();
    if (idParam && idParam.includes('.')) pkg_name = idParam;

    const cId = url.pathname.match(/(C\d+)/i)?.[1] || url.href.match(/(C\d+)/i)?.[1] || '';
    if (cId) app_id = cId.toUpperCase();
  } else {
    if (/^C\d+$/i.test(input)) app_id = input.toUpperCase();
    if (!app_id && input.includes('.') && !/\s/.test(input)) pkg_name = input;
  }

  return { pkg_name, app_id };
};

const fetchByPkgName = async (pkgName: string) => {
  const res: any = await hmApi.get<any>('/apps/list/1', {
    search_key: 'pkg_name',
    search_value: pkgName,
    search_exact: true,
    page_size: 1
  });
  const data = res?.data || res;
  const item = data?.data?.[0] || data?.apps?.[0] || null;
  return item?.info || item || null;
};

const fetchByAppId = async (appId: string) => {
  const res: any = await hmApi.get<any>(`apps/app_id/${encodeURIComponent(appId)}`);
  const data = res?.data || res;
  const info = data?.info || data?.full_info || data || {};
  const ratingRaw = data?.rating || info?.rating || {};
  return { ...info, rating: ratingRaw };
};

const fetchMetrics = async (pkgName: string) => {
  const mRes: any = await hmApi.get<any>(`apps/metrics/${encodeURIComponent(pkgName)}`);
  const mData = mRes?.data || mRes;
  if (Array.isArray(mData)) return mData;
  if (Array.isArray(mData?.data)) return mData.data;
  if (Array.isArray(mData?.data?.data)) return mData.data.data;
  if (Array.isArray(mData?.items)) return mData.items;
  return [];
};

const parseSubstanceId = (raw: string) => {
  const input = raw.trim();
  if (!input) return '';

  const url = tryParseUrl(input);
  if (url) {
    const id = (url.searchParams.get('id') || '').trim();
    return id || '';
  }

  if (/^[\w-]{4,}$/i.test(input)) return input;
  return '';
};

const parseSubstanceComment = (raw: any) => {
  if (raw === null || raw === undefined) return { remark: '', platform: '', user: '' };

  const normalizeObject = (obj: any) => {
    const platform = String(obj?.platform || '').trim();
    const user = String(obj?.user || '').trim();
    const remark =
      String(obj?.remark ?? obj?.note ?? obj?.message ?? obj?.text ?? obj?.comment ?? '').trim() ||
      '';
    return { remark, platform, user };
  };

  if (typeof raw === 'object') {
    return normalizeObject(raw);
  }

  const text = String(raw).trim();
  if (!text) return { remark: '', platform: '', user: '' };

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed) {
        const info = normalizeObject(parsed);
        if (!info.remark) info.remark = text;
        return info;
      }
    } catch {
      // ignore
    }
  }

  return { remark: text, platform: '', user: '' };
};

const normalizeSubmitPayload = () => ({
  name: String(submitForm.name || '').trim(),
  provider: String(submitForm.provider || '').trim(),
  bg_url: String(submitForm.bg_url || '').trim(),
  icon_url: String(submitForm.icon_url || '').trim(),
  download_url: String(submitForm.download_url || '').trim()
});

const validateSubmitPayload = (payload: ReturnType<typeof normalizeSubmitPayload>) => {
  if (!payload.name) return '请输入应用名称';
  if (!payload.provider) return '请输入应用提供者';
  if (!payload.bg_url) return '请输入背景URL';
  if (!payload.icon_url) return '请输入图标URL';
  if (!payload.download_url) return '请输入下载链接';
  return '';
};

const saveForPreview = () => {
  const payload = normalizeSubmitPayload();
  const error = validateSubmitPayload(payload);
  if (error) {
    ElMessage.error(error);
    return;
  }
  previewData.value = payload;
  submissionStep.value = 'preview';
};

const backToEdit = () => {
  submissionStep.value = 'edit';
};

const submitApp = async () => {
  if (submitting.value) return;
  const payload = previewData.value || normalizeSubmitPayload(); // Use preview data if available
  const error = validateSubmitPayload(payload);
  if (error) {
    ElMessage.error(error);
    return;
  }
  submitting.value = true;
  try {
    await submitAppSubmission(payload);
    ElMessage.success('提交成功，等待审核');
    submitForm.name = '';
    submitForm.provider = '';
    submitForm.bg_url = '';
    submitForm.icon_url = '';
    submitForm.download_url = '';
    submissionStep.value = 'edit';
    previewData.value = null;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '提交失败');
  } finally {
    submitting.value = false;
  }
};

const runPool = async <T>(items: T[], limit: number, worker: (item: T) => Promise<void>) => {
  const safeLimit = Math.max(1, Math.min(limit, items.length));
  let idx = 0;
  const runners = Array.from({ length: safeLimit }, async () => {
    while (true) {
      const current = idx++;
      if (current >= items.length) return;
      await worker(items[current]);
    }
  });
  await Promise.all(runners);
};

const hydrateTopicAppsMetrics = async (seq: number, apps: SubmittedAppInfo[], existedStatus: string) => {
  await runPool(apps, 4, async (row) => {
    if (seq !== substanceRequestSeq) return;
    let pkg = String(row.pkg_name || '').trim();
    const appId = String(row.app_id || '').trim();
    const isMissingNumber = (v: any) => {
      const n = Number(typeof v === 'string' ? v.replace(/[^\d.]/g, '') : v);
      return !Number.isFinite(n) || n <= 0;
    };

    let detail: any = null;
    const needsDetail =
      (!!appId && (!pkg || isMissingNumber(row.download_count ?? row.downloads) || isMissingNumber(row.size_bytes ?? row.size) || !row.listed_at)) ||
      false;

    if (needsDetail) {
      try {
        detail = await fetchByAppId(appId);
        if (seq !== substanceRequestSeq) return;
        row.icon_url = row.icon_url ?? detail?.icon_url;
        row.icon = row.icon ?? detail?.icon;
        row.name = row.name ?? detail?.name;
        row.pkg_name = row.pkg_name ?? detail?.pkg_name;
        pkg = String(row.pkg_name || '').trim();
        if (isMissingNumber(row.download_count ?? row.downloads)) {
          row.download_count = detail?.download_count ?? detail?.downloads ?? row.download_count;
        }
        if (isMissingNumber(row.size_bytes ?? row.size)) {
          row.size_bytes = detail?.size_bytes ?? detail?.size ?? row.size_bytes;
        }
        row.listed_at =
          row.listed_at ??
          detail?.listed_at ??
          detail?.listed_time ??
          detail?.release_date ??
          detail?.release_time ??
          detail?.create_time ??
          detail?.created_at;
      } catch {
        detail = null;
      }
    }

    if (!pkg) {
      row.status = existedStatus;
      return;
    }
    try {
      const metrics = await fetchMetrics(pkg);
      if (seq !== substanceRequestSeq) return;
      const latestMetric = pickLatestMetric(metrics);
      if (latestMetric) {
        row.download_count = latestMetric?.download_count ?? latestMetric?.downloads ?? row.download_count;
        row.size_bytes = latestMetric?.size_bytes ?? latestMetric?.file_size ?? latestMetric?.size ?? row.size_bytes;
        row.listed_at = row.listed_at ?? latestMetric?.created_at ?? latestMetric?.update_time ?? latestMetric?.last_update;
      } else if (detail) {
        if (isMissingNumber(row.download_count ?? row.downloads)) {
          row.download_count = detail?.download_count ?? detail?.downloads ?? row.download_count;
        }
        if (isMissingNumber(row.size_bytes ?? row.size)) {
          row.size_bytes = detail?.size_bytes ?? detail?.size ?? row.size_bytes;
        }
        row.listed_at =
          row.listed_at ??
          detail?.listed_at ??
          detail?.listed_time ??
          detail?.release_date ??
          detail?.release_time ??
          detail?.create_time ??
          detail?.created_at;
      }
      row.status = existedStatus;
    } catch {
      if (seq !== substanceRequestSeq) return;
      if (detail) {
        if (isMissingNumber(row.download_count ?? row.downloads)) {
          row.download_count = detail?.download_count ?? detail?.downloads ?? row.download_count;
        }
        if (isMissingNumber(row.size_bytes ?? row.size)) {
          row.size_bytes = detail?.size_bytes ?? detail?.size ?? row.size_bytes;
        }
        row.listed_at =
          row.listed_at ??
          detail?.listed_at ??
          detail?.listed_time ??
          detail?.release_date ??
          detail?.release_time ??
          detail?.create_time ??
          detail?.created_at;
      }
      row.status = existedStatus;
    }
  });
};

// Auto-fill logic for App Link
const handleLinkInput = (value: string) => {
  appForm.link = value;

  if (!value.trim()) {
    appForm.pkg_name = '';
    appForm.app_id = '';
    submittedAppInfo.value = null;
    parsing.value = false;
    lastFetchKey = '';
    return;
  }

  const ids = parseAppInput(value);
  appForm.pkg_name = ids.pkg_name;
  appForm.app_id = ids.app_id;

  const key = ids.app_id ? `app_id:${ids.app_id}` : ids.pkg_name ? `pkg_name:${ids.pkg_name}` : '';
  if (!key || key === lastFetchKey) return;

  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    void (async () => {
      if (key === lastFetchKey) return;
      lastFetchKey = key;

      const seq = ++requestSeq;
      parsing.value = true;
      submittedAppInfo.value = {
        pkg_name: ids.pkg_name || undefined,
        app_id: ids.app_id || undefined,
        status: '提交中'
      };

      try {
        // Auto submit first
        try {
          await hmApi.post('/submit', {
            link: value,
            comment: { platform: 'BetaHub', user: 'ChuEngll' }
          });
          ElMessage.success('提交成功');
        } catch (e: any) {
          // If it fails, it might be because it already exists or network error, but we continue to query
          console.warn('Auto submit failed:', e);
        }
        
        if (seq !== requestSeq) return;
        submittedAppInfo.value.status = '解析中';

        let appId = ids.app_id;
        let pkgName = ids.pkg_name;

        const hasAnyAppInfo = (obj: any) => {
          if (!obj) return false;
          const id = String(obj?.app_id || obj?.id || '').trim();
          const pkg = String(obj?.pkg_name || '').trim();
          const name = String(obj?.name || '').trim();
          return !!(id || pkg || name);
        };

        let byPkg: any = null;
        if (!appId && pkgName) {
          byPkg = await fetchByPkgName(pkgName);
          if (seq !== requestSeq) return;
          const foundId = String(byPkg?.app_id || '').trim();
          if (foundId) appId = foundId;
        }

        let detail: any = null;
        if (appId) {
          detail = await fetchByAppId(appId);
          if (seq !== requestSeq) return;
        } else if (byPkg) {
          detail = byPkg;
        }

        const finalPkg = String(pkgName || detail?.pkg_name || byPkg?.pkg_name || '').trim();
        const finalAppId = String(appId || detail?.app_id || byPkg?.app_id || '').trim();

        let latestMetric: any = null;
        let metrics: any[] = [];
        if (finalPkg) {
          metrics = await fetchMetrics(finalPkg);
          if (seq !== requestSeq) return;
          latestMetric = pickLatestMetric(metrics);
        }

        const found = !!latestMetric || hasAnyAppInfo(detail) || hasAnyAppInfo(byPkg);
        if (!found) {
          submittedAppInfo.value = {
            pkg_name: ids.pkg_name || undefined,
            app_id: ids.app_id || undefined,
            status: '未找到'
          };
          return;
        }

        submittedAppInfo.value = {
          icon_url: detail?.icon_url || byPkg?.icon_url,
          icon: detail?.icon || byPkg?.icon,
          pkg_name: finalPkg || undefined,
          app_id: finalAppId || undefined,
          name: detail?.name || byPkg?.name,
          download_count: latestMetric?.download_count ?? latestMetric?.downloads ?? detail?.download_count ?? byPkg?.download_count,
          size_bytes: latestMetric?.size_bytes ?? latestMetric?.file_size ?? latestMetric?.size ?? detail?.size_bytes ?? byPkg?.size_bytes ?? byPkg?.size,
          listed_at: detail?.listed_at ?? detail?.listed_time ?? detail?.release_date ?? detail?.created_at ?? latestMetric?.created_at ?? latestMetric?.update_time ?? latestMetric?.last_update,
          status: '已解析'
        };
      } catch (error: any) {
        if (seq !== requestSeq) return;
        const statusCode = Number(error?.response?.status || 0);
        const msg = String(error?.response?.data?.message || error?.message || '');
        const isNotFound = statusCode === 404 || /not\s*found|未找到|不存在/i.test(msg);
        submittedAppInfo.value = {
          pkg_name: ids.pkg_name || undefined,
          app_id: ids.app_id || undefined,
          status: isNotFound ? '未找到' : '解析失败'
        };
        ElMessage.error(msg || '解析失败，请稍后重试');
      } finally {
        if (seq !== requestSeq) return;
        parsing.value = false;
      }
    })();
  }, 400);
};

const handleSubstanceInput = (value: string) => {
  form.input = value;

  const id = parseSubstanceId(value);
  const key = id ? `substance:${id}` : '';

  if (!key) {
    parsedSubstance.value = null;
    topicApps.value = [];
    topicParsing.value = false;
    lastSubstanceKey = '';
    return;
  }

  if (key === lastSubstanceKey) return;
  if (substanceDebounceTimer) window.clearTimeout(substanceDebounceTimer);

  substanceDebounceTimer = window.setTimeout(() => {
    void (async () => {
      if (key === lastSubstanceKey) return;
      lastSubstanceKey = key;

      const seq = ++substanceRequestSeq;
      topicParsing.value = true;
      parsedSubstance.value = {
        substance_id: id,
        status: '提交中'
      };
      topicApps.value = [];

      try {
        // Auto submit first
        try {
          await hmApi.post(`/submit_substance/${id}`, {
            comment: { platform: 'BetaHub', user: 'ChuEngll' }
          });
          ElMessage.success('提交成功');
        } catch (e: any) {
          console.warn('Auto submit substance failed:', e);
        }

        if (seq !== substanceRequestSeq) return;
        parsedSubstance.value.status = '解析中';

        const data: any = await getTopicDetail(id);
        if (seq !== substanceRequestSeq) return;

        const commentInfo = parseSubstanceComment(data?.comment);
        parsedSubstance.value = {
          substance_id: data?.substance_id || id,
          title: data?.title ?? '',
          name: data?.name ?? '',
          subtitle: data?.subtitle || '',
          remark: commentInfo.remark,
          platform: commentInfo.platform,
          user: commentInfo.user,
          status: '已解析'
        };

        const appsRaw = Array.isArray(data?.apps) ? data.apps : [];
        const rows = appsRaw.map((a: any) => {
          const app = a?.info || a || {};
          return {
            icon_url: app?.icon_url,
            icon: app?.icon,
            pkg_name: app?.pkg_name,
            app_id: app?.app_id || app?.id,
            name: app?.name,
            download_count: app?.download_count,
            size_bytes: app?.size_bytes ?? app?.size,
            listed_at: app?.listed_at ?? app?.listed_time ?? app?.release_date ?? app?.created_at,
            status: '已存在'
          } as SubmittedAppInfo;
        });

        topicApps.value = rows;
        await hydrateTopicAppsMetrics(seq, topicApps.value, '已存在');
      } catch (error: any) {
        if (seq !== substanceRequestSeq) return;
        parsedSubstance.value = {
          substance_id: id,
          status: '解析失败'
        };
        topicApps.value = [];
        ElMessage.error(error?.response?.data?.message || '解析失败，请稍后重试');
      } finally {
        if (seq !== substanceRequestSeq) return;
        topicParsing.value = false;
      }
    })();
  }, 400);
};
</script>

<style scoped>
.submission-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  padding: 32px 20px 40px;
  /* width:100% + 左右内边距必须算进宽度里，否则会溢出父容器导致页面能左右滑 */
  box-sizing: border-box;
  overflow-x: hidden;
}

.page-hero {
  margin-bottom: 2px;
}

.page-hero-title {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--el-text-color-primary);
}

.page-hero-desc {
  margin: 0;
  font-size: 13.5px;
  color: var(--el-text-color-secondary);
}

/* ---------- 分区面板 ---------- */
.panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background-color: var(--el-bg-color);
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-fill-color-light);
  transition: background-color 0.2s;
}

.panel-head.is-clickable {
  cursor: pointer;
}

.panel-head.is-clickable:hover {
  background-color: var(--el-fill-color);
}

.panel-head:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: -2px;
}

.panel-caret {
  flex: 0 0 auto;
  margin-left: auto;
  margin-top: 4px;
  font-size: 16px;
  color: var(--el-text-color-secondary);
  transition: transform 0.25s ease;
}

.panel-caret.is-open {
  transform: rotate(180deg);
}

.panel-index {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 700;
}

.panel-text {
  min-width: 0;
  flex: 1;
}

.panel-title {
  margin: 0 0 3px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-body {
  padding: 20px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

/* ---------- 解析结果 ---------- */
.parse-result {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background-color: var(--el-fill-color-blank);
}

.parse-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  flex-wrap: wrap;
}

.parse-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.parse-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 18px 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

/* 命中应用：卡片式，窄屏也不会像表格那样横向挤 */
.app-result {
  display: flex;
  align-items: center;
  gap: 14px;
}

.app-result-icon {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  border-radius: 12px;
  background-color: var(--el-fill-color-light);
}

.app-result-main {
  flex: 1;
  min-width: 0;
}

.app-result-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-result-name {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-result-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.app-result-pkg {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}

.app-result-id {
  padding-left: 10px;
  border-left: 1px solid var(--el-border-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* 指标区：标签在上、数值在下，窄屏自动换行 */
.app-result-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px 16px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.app-result-stats > span {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.app-result-stats em {
  font-style: normal;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.app-result-stats b {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

/* ---------- 专题元信息 ---------- */
.topic-meta {
  margin: 14px 0 0;
}

.topic-meta-row {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
}

.topic-meta-row + .topic-meta-row {
  border-top: 1px dashed var(--el-border-color-lighter);
}

.topic-meta-row dt {
  flex: 0 0 68px;
  margin: 0;
  color: var(--el-text-color-secondary);
}

.topic-meta-row dd {
  margin: 0;
  min-width: 0;
  word-break: break-all;
}

/* ---------- 专题相关应用 ---------- */
.topic-apps {
  width: 100%;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
}

.topic-app-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.topic-app-row + .topic-app-row {
  border-top: 1px solid var(--el-border-color-lighter);
}

.topic-app-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 10px;
  background-color: var(--el-fill-color-light);
}

.topic-app-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.topic-app-name {
  font-size: 13.5px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-app-pkg {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-app-count {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ---------- 投稿表单 ---------- */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.form-grid-full {
  grid-column: 1 / -1;
}

.submit-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.submit-actions.is-center {
  justify-content: center;
  margin-top: 24px;
}

.preview-alert {
  margin-bottom: 20px;
}

.preview-card-wrapper {
  display: flex;
  justify-content: center;
}

:deep(.el-input__wrapper),
:deep(.el-input) {
  max-width: 100%;
}

@media (max-width: 768px) {
  .submission-view {
    padding: 18px 14px 28px;
    gap: 14px;
  }

  .page-hero-title {
    font-size: 22px;
  }

  .panel-head {
    padding: 14px;
  }

  .panel-body {
    padding: 14px;
  }

  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 窄屏省掉下载量，避免行内太挤 */
  .topic-app-count {
    display: none;
  }

  .app-result {
    align-items: flex-start;
  }

  .topic-meta-row dt {
    flex-basis: 56px;
  }
}
</style>
