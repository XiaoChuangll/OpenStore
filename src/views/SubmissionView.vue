<template>
  <div class="submission-view">
    <el-card class="submission-card" :body-style="{ padding: '0px' }">
      <el-collapse v-model="activeNames">
        <el-collapse-item name="collection">
          <template #title>
            <div class="card-header">
              <h2>提交收录</h2>
            </div>
          </template>
      
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

          <el-form-item label="提取结果">
            <div v-if="appForm.app_id || appForm.pkg_name" class="extract-row">
              <div class="extract-left">
                <el-tag v-if="appForm.app_id" type="success" size="large">{{ appForm.app_id }}</el-tag>
                <el-tag v-if="appForm.pkg_name" type="success" size="large">{{ appForm.pkg_name }}</el-tag>
              </div>
              <el-tag :type="getStatusTagType(submittedAppInfo?.status || (parsing ? '解析中' : '待解析'))" size="large">
                {{ submittedAppInfo?.status || (parsing ? '解析中' : '待解析') }}
              </el-tag>
            </div>
            <el-tag v-else type="info" size="large">等待输入...</el-tag>
          </el-form-item>

          <!-- Result Table -->
          <div v-if="submittedAppInfo" class="result-section" v-loading="parsing">
            <el-table :data="[submittedAppInfo]" style="width: 100%" border>
              <el-table-column label="图标" width="80" align="center">
                <template #default="{ row }">
                  <el-image 
                    :src="row.icon_url || row.icon" 
                    style="width: 48px; height: 48px; border-radius: 8px"
                    fit="cover"
                  >
                    <template #error>
                      <el-icon><Picture /></el-icon>
                    </template>
                  </el-image>
                </template>
              </el-table-column>
              <el-table-column prop="pkg_name" label="包名" min-width="120" show-overflow-tooltip />
              <el-table-column prop="app_id" label="应用 ID" width="100" show-overflow-tooltip />
              <el-table-column prop="name" label="应用名称" min-width="120" show-overflow-tooltip />
              <el-table-column label="下载量" width="100">
                <template #default="{ row }">
                  {{ formatDownloads(row.download_count || row.downloads) }}
                </template>
              </el-table-column>
              <el-table-column label="大小" width="100">
                <template #default="{ row }">
                  {{ formatSize(row.size_bytes || row.size) }}
                </template>
              </el-table-column>
              <el-table-column label="列出时间" width="160">
                <template #default="{ row }">
                  {{ formatDate(row.listed_at || row.listed_time || row.release_date || row.release_time || row.create_time || row.created_at) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
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
            <div v-if="parsedSubstance" style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
              <div class="extract-row">
                <div class="extract-left">
                  <el-tag :type="parsedSubstance.substance_id ? 'success' : 'info'" size="large">
                    {{ parsedSubstance.substance_id || '—' }}
                  </el-tag>
                </div>
                <el-tag :type="getStatusTagType(parsedSubstance?.status || (topicParsing ? '解析中' : '待解析'))" size="large">
                  {{ parsedSubstance?.status || (topicParsing ? '解析中' : '待解析') }}
                </el-tag>
              </div>
              <div><span>标题：</span><span>{{ parsedSubstance.title || parsedSubstance.name || '—' }}</span></div>
              <div><span>副标题：</span><span>{{ parsedSubstance.subtitle || '—' }}</span></div>
              <div><span>专题：</span><span>{{ parsedSubstance.name || parsedSubstance.title || '—' }}</span></div>
              <div v-if="parsedSubstance.remark"><span>备注：</span><span>{{ parsedSubstance.remark }}</span></div>
              <div v-if="parsedSubstance.platform"><span>提交平台：</span><span>{{ parsedSubstance.platform }}</span></div>
              <div v-if="parsedSubstance.user"><span>提交用户：</span><span>{{ parsedSubstance.user }}</span></div>
            </div>
            <el-tag v-else type="info" size="large">等待输入...</el-tag>
          </el-form-item>

          <el-form-item label="相关应用" v-if="topicApps.length > 0">
            <div style="width: 100%;" v-loading="topicParsing">
              <el-table :data="topicApps" style="width: 100%" border>
                <el-table-column label="图标" width="80" align="center">
                  <template #default="{ row }">
                    <el-image 
                      :src="row.icon_url || row.icon" 
                      style="width: 48px; height: 48px; border-radius: 8px"
                      fit="cover"
                    >
                      <template #error>
                        <el-icon><Picture /></el-icon>
                      </template>
                    </el-image>
                  </template>
                </el-table-column>
                <el-table-column prop="pkg_name" label="包名" min-width="120" show-overflow-tooltip />
                <el-table-column prop="app_id" label="应用 ID" width="100" show-overflow-tooltip />
                <el-table-column prop="name" label="应用名称" min-width="120" show-overflow-tooltip />
                <el-table-column label="下载量" width="100">
                  <template #default="{ row }">
                    {{ formatDownloads(row.download_count || row.downloads) }}
                  </template>
                </el-table-column>
                <el-table-column label="大小" width="100">
                  <template #default="{ row }">
                    {{ formatSize(row.size_bytes || row.size) }}
                  </template>
                </el-table-column>
                <el-table-column label="列出时间" width="160">
                  <template #default="{ row }">
                    {{ formatDate(row.listed_at || row.listed_time || row.release_date || row.release_time || row.create_time || row.created_at) }}
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.status === '解析失败' ? 'danger' : row.status === '解析中' ? 'warning' : 'success'">
                      {{ row.status || '已解析' }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-form-item>
        </template>

          </el-form>
        </el-collapse-item>
      </el-collapse>
    </el-card>
    <el-card class="submission-card" :body-style="{ padding: '0px' }">
      <el-collapse v-model="activeNames">
        <el-collapse-item name="submission">
          <template #title>
            <div class="card-header">
              <h2>应用投稿</h2>
            </div>
          </template>
          <el-form :model="submitForm" label-position="top" v-if="submissionStep === 'edit'">
        <el-form-item label="投稿类型">
          <el-tag type="warning" size="large">侧载/测试类型</el-tag>
        </el-form-item>
        <el-form-item label="应用名称">
          <el-input v-model="submitForm.name" placeholder="请输入应用名称" clearable />
        </el-form-item>
        <el-form-item label="应用提供者">
          <el-input v-model="submitForm.provider" placeholder="请输入应用提供者" clearable />
        </el-form-item>
        <el-form-item label="背景URL">
          <el-input v-model="submitForm.bg_url" placeholder="请输入背景URL" clearable />
        </el-form-item>
        <el-form-item label="图标URL">
          <el-input v-model="submitForm.icon_url" placeholder="请输入图标URL" clearable />
        </el-form-item>
        <el-form-item label="下载链接">
          <el-input v-model="submitForm.download_url" placeholder="请输入下载链接" clearable />
        </el-form-item>
        <div class="submit-actions">
          <el-button type="primary" @click="saveForPreview">保存并预览</el-button>
          <span class="form-tip">每5分钟仅可提交一次</span>
        </div>
          </el-form>

          <div v-else class="preview-section">
            <el-alert
              title="请确认投稿信息"
              type="info"
              description="请仔细检查下方应用卡片预览效果，确认无误后点击提交。"
              show-icon
              :closable="false"
              style="margin-bottom: 20px;"
            />
            
            <div class="preview-card-wrapper">
               <AppDetailCard :item="previewData" :is-detail="true" />
            </div>

            <div class="submit-actions" style="margin-top: 24px; justify-content: center;">
              <el-button :icon="Back" @click="backToEdit">返回修改</el-button>
              <el-button type="primary" :loading="submitting" :icon="Check" @click="submitApp">确认提交</el-button>
            </div>
          </div>

        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { Link, Picture, Back, Check } from '@element-plus/icons-vue';
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
const activeNames = ref<string[]>([]);

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
  const res: any = await hmApi.get<any>('/apps/list/0', {
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
  align-items: center;
  gap: 20px;
  padding: 40px 20px;
}

.submission-card {
  width: 100%;
  max-width: 1000px;
  border-radius: 12px;
}

.card-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.extract-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.extract-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.submit-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

:deep(.el-collapse) {
  border-top: none;
  border-bottom: none;
}

:deep(.el-collapse-item__header) {
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

:deep(.el-collapse-item__content) {
  padding: 20px;
  padding-bottom: 20px;
}
</style>
