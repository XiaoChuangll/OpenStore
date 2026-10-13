<template>
  <div class="admin-page seo-page">
    <AdminPageHeader :embedded="embedded" title="SEO 收录" />

    <!-- 概览数字：一眼看出「今天有多少要提、提了多少、额度还剩多少」 -->
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">待提交</span>
        <span class="stat-value">{{ stats.pending }}</span>
        <span class="stat-hint">近 48 小时有新访问、且近 4 天没成功提交过的 URL</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">今日已提交</span>
        <span class="stat-value">{{ stats.submittedToday }}</span>
        <span class="stat-hint">当日去重后的成功条数</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">队列总量</span>
        <span class="stat-value">{{ stats.totalQueued }}</span>
        <span class="stat-hint">累计攒下的前台路径（已按 URL 归一）</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">额度上限</span>
        <span class="stat-value">{{ config.dailyLimit }}</span>
        <span class="stat-hint">自己设的每日提交上限（必应官方上限 {{ BING_DAILY_MAX }}）</span>
      </div>
    </div>

    <AdminSection title="提交配置">
      <template #meta>
        <span class="meta-chip" :class="config.enabled ? 'is-on' : 'is-off'">
          {{ config.enabled ? '已启用' : '已停用' }}
        </span>
        <span v-if="runtime.running" class="meta-chip is-running">正在提交…</span>
      </template>
      <template #actions>
        <div class="head-right">
          <el-button size="small" :icon="Refresh" :loading="loadingStatus" @click="loadAll">刷新</el-button>
          <el-button size="small" type="primary" :icon="Check" :loading="saving" @click="saveConfig">保存配置</el-button>
        </div>
      </template>

      <el-form label-width="132px" class="config-form" @submit.prevent>
        <el-form-item label="启用收录提交">
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
          <span class="form-hint">关闭后访客路径仍会进队列，只是不再提交</span>
        </el-form-item>

        <el-form-item label="定时自动提交">
          <el-switch v-model="form.autoSubmit" :active-value="1" :inactive-value="0" />
          <span class="form-hint">
            每天 {{ submitHourText }}（北京时间）提交前 48 小时内访问过的 URL
            <template v-if="runtime.nextRunText">，{{ runtime.nextRunText }}</template>
            <template v-if="runtime.ranToday">（今天已跑过）</template>
          </span>
        </el-form-item>

        <el-form-item label="提交时刻">
          <el-input-number v-model="form.submitHour" :min="0" :max="23" size="small" />
          <span class="form-hint">点（北京时间 0~23）；默认 0 点，即 26 号 0 点提交 25 号那天的 URL</span>
        </el-form-item>

        <el-form-item label="站点 URL">
          <el-input v-model="form.siteUrl" size="small" placeholder="https://next.betahub.tech" />
          <span class="form-hint">必须和必应后台验证过的站点一致</span>
        </el-form-item>

        <el-divider content-position="left">必应 Webmaster API（主通道）</el-divider>

        <el-form-item label="启用">
          <el-switch v-model="form.bingEnabled" :active-value="1" :inactive-value="0" />
          <span class="form-hint">单请求最多 {{ BING_BATCH_MAX }} 条，日额度 {{ BING_DAILY_MAX }} 条</span>
        </el-form-item>

        <el-form-item label="API Key">
          <div class="key-row">
            <el-input
              v-model="bingKeyInput"
              size="small"
              type="password"
              show-password
              :placeholder="config.bingKeyConfigured ? `已配置（${config.bingKeyMasked}），留空表示不改` : '在必应后台 → 设置 → API 访问 里生成'"
            />
            <el-button v-if="config.bingKeyConfigured" size="small" :icon="Delete" @click="clearBingKey">清除</el-button>
          </div>
          <span class="form-hint">
            只写不读：服务端用 AES-256-GCM 加密存库，接口只返回尾 4 位。未配置时自动只走 IndexNow。
          </span>
        </el-form-item>

        <el-divider content-position="left">IndexNow（兜底通道）</el-divider>

        <el-form-item label="启用">
          <el-switch v-model="form.indexNowEnabled" :active-value="1" :inactive-value="0" />
          <span class="form-hint">无需后台操作，靠下面的 key 文件证明站点归属；单请求最多 {{ INDEXNOW_BATCH_MAX }} 条</span>
        </el-form-item>

        <el-form-item label="Key 文件地址">
          <div class="key-row">
            <el-input :model-value="config.indexNowKeyLocation" size="small" readonly />
            <el-button size="small" :icon="DocumentCopy" @click="copyText(config.indexNowKeyLocation)">复制</el-button>
            <el-button size="small" :icon="Refresh" @click="rotateIndexNowKey">换 key</el-button>
          </div>
          <span class="form-hint">
            当前 key：<code class="key-text">{{ config.indexNowKey }}</code>（这个文件由本站直接托管，换 key 后搜索引擎会重新抓取）
          </span>
        </el-form-item>

        <el-divider content-position="left">提交策略</el-divider>

        <el-form-item label="单批条数">
          <el-input-number v-model="form.batchSize" :min="1" :max="BING_BATCH_MAX" size="small" />
          <span class="form-hint">建议 100~200：一条请求出问题不会连累整批</span>
        </el-form-item>

        <el-form-item label="每日上限">
          <el-input-number v-model="form.dailyLimit" :min="1" :max="BING_DAILY_MAX" size="small" />
          <span class="form-hint">留点余量，别把必应额度撞满</span>
        </el-form-item>

        <el-form-item label="最少访问次数">
          <el-input-number v-model="form.minHits" :min="1" :max="100" size="small" />
          <span class="form-hint">过滤偶发误访问与扫描器路径；设为 1 表示今天被访问过就提交</span>
        </el-form-item>

        <el-form-item label="批间隔">
          <el-input-number v-model="form.requestDelayMs" :min="0" :max="10000" :step="200" size="small" />
          <span class="form-hint">毫秒；串行提交 + 间隔，避免触发限速</span>
        </el-form-item>
      </el-form>
    </AdminSection>

    <AdminSection title="手动提交">
      <template #meta>
        <span class="meta-chip">按当前配置立即跑一轮</span>
      </template>
      <template #actions>
        <div class="head-right">
          <el-input-number v-model="submitLimit" :min="1" :max="BING_DAILY_MAX" size="small" class="limit-input" />
          <el-button size="small" type="primary" :icon="Promotion" :loading="submitting" @click="submitNow">立即提交</el-button>
          <el-button size="small" :icon="Delete" @click="cleanupQueue">清理已提交队列</el-button>
        </div>
      </template>

      <div v-if="lastResult" class="result-box">
        <div class="result-line">
          <span class="result-tag" :class="lastResult.succeeded > 0 ? 'is-ok' : 'is-warn'">
            {{ lastResult.skipped ? '本轮跳过' : `成功 ${lastResult.succeeded} / 尝试 ${lastResult.attempted}` }}
          </span>
          <span v-if="lastResult.reason" class="result-reason">{{ lastResult.reason }}</span>
          <span v-if="lastResult.error" class="result-reason is-error">{{ lastResult.error }}</span>
        </div>
        <ul v-if="lastResult.channels?.length" class="result-channels">
          <li v-for="(item, index) in lastResult.channels" :key="index">
            <strong>{{ item.channel }}</strong> · {{ item.size }} 条 · {{ item.status }}
            <span v-if="item.httpStatus"> · HTTP {{ item.httpStatus }}</span>
            <span v-if="item.message"> · {{ item.message }}</span>
          </li>
        </ul>
      </div>
      <p v-else class="form-hint">
        提交只代表「必应已收到」，收录与否由必应自行决定，通常需要数小时到数天。
      </p>
    </AdminSection>

    <AdminSection title="待提交 URL">
      <template #meta>
        <span class="meta-chip">{{ pending.length }} 条</span>
      </template>
      <template #actions>
        <div class="head-right">
          <el-button size="small" :icon="Refresh" :loading="loadingPending" @click="loadPending">刷新</el-button>
        </div>
      </template>

      <el-table v-loading="loadingPending" :data="pending" size="small" max-height="360" empty-text="今天还没有待提交的新路径">
        <el-table-column type="index" label="#" width="56" />
        <el-table-column prop="url" label="归一化 URL" min-width="320" show-overflow-tooltip />
        <el-table-column prop="hits" label="访问次数" width="100" align="right" />
        <el-table-column label="原始路径" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="path-cell">{{ row.path }}</span>
          </template>
        </el-table-column>
      </el-table>
    </AdminSection>

    <AdminSection title="提交记录">
      <template #meta>
        <span class="meta-chip">共 {{ submissionTotal }} 条</span>
      </template>
      <template #actions>
        <div class="head-right">
          <el-select v-model="filters.status" size="small" clearable placeholder="全部状态" class="filter-select" @change="loadSubmissions(1)">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="跳过" value="skipped" />
          </el-select>
          <el-select v-model="filters.channel" size="small" clearable placeholder="全部通道" class="filter-select" @change="loadSubmissions(1)">
            <el-option label="必应 API" value="bing" />
            <el-option label="IndexNow" value="indexnow" />
          </el-select>
          <el-input
            v-model="filters.url"
            size="small"
            clearable
            placeholder="按 URL 搜索"
            class="filter-input"
            @keyup.enter="loadSubmissions(1)"
            @clear="loadSubmissions(1)"
          />
          <el-button size="small" :icon="Search" @click="loadSubmissions(1)">查询</el-button>
        </div>
      </template>

      <el-table v-loading="loadingSubmissions" :data="submissions" size="small" max-height="420" empty-text="还没有提交记录">
        <el-table-column prop="created_at" label="时间" width="160" />
        <el-table-column prop="url" label="URL" min-width="300" show-overflow-tooltip />
        <el-table-column label="通道" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.channel === 'bing' ? 'primary' : 'success'" effect="plain">
              {{ row.channel === 'bing' ? '必应' : row.channel === 'indexnow' ? 'IndexNow' : row.channel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="170">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTagType(row.status)" effect="light">{{ statusText(row.status) }}</el-tag>
            <span v-if="row.http_status" class="http-code">HTTP {{ row.http_status }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="200" show-overflow-tooltip />
      </el-table>

      <div class="pager-row">
        <el-pagination
          layout="prev, pager, next, total"
          :total="submissionTotal"
          :page-size="PAGE_SIZE"
          :current-page="filters.page"
          @current-change="loadSubmissions"
        />
      </div>
    </AdminSection>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Check, Refresh, Delete, Search, Promotion, DocumentCopy } from '@element-plus/icons-vue';
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue';
import AdminSection from '../../components/admin/AdminSection.vue';
import {
  getSeoStatus,
  getSeoPending,
  getSeoSubmissions,
  updateSeoConfig,
  regenerateIndexNowKey,
  runSeoSubmit,
  cleanupSeoQueue,
  type SeoConfig,
  type SeoStats,
  type SeoPendingItem,
  type SeoSubmission,
  type SeoBatchResult
} from '../../services/admin';

/*
 * embedded=true 时由后台外壳统一画标题行；单独访问路由时自己画。
 * 首页概览轮询 30 秒一次（要能看到「今日已提交」在跑），提交进行中时更密一些。
 */
defineProps<{ embedded?: boolean }>();

const BING_BATCH_MAX = 500;
const BING_DAILY_MAX = 10000;
const INDEXNOW_BATCH_MAX = 10000;
const PAGE_SIZE = 50;

const config = ref<SeoConfig>({
  enabled: 1,
  autoSubmit: 1,
  bingEnabled: 1,
  indexNowEnabled: 1,
  siteUrl: '',
  batchSize: 200,
  dailyLimit: 5000,
  submitHour: 0,
  minHits: 1,
  requestDelayMs: 1200,
  bingKeyMasked: '',
  bingKeyConfigured: false,
  indexNowKey: '',
  indexNowKeyLocation: ''
});
const stats = ref<SeoStats>({ pending: 0, totalQueued: 0, submittedToday: 0, failedToday: 0, successRecent: 0 });
const runtime = ref<{ running: boolean; lastRunDay: string | null; ranToday: boolean; nextRunText: string }>({
  running: false,
  lastRunDay: null,
  ranToday: false,
  nextRunText: ''
});

/** 表单是配置的本地副本：保存前的改动不会影响已生效的配置 */
const form = reactive({
  enabled: 1,
  autoSubmit: 1,
  bingEnabled: 1,
  indexNowEnabled: 1,
  siteUrl: '',
  batchSize: 200,
  dailyLimit: 5000,
  submitHour: 0,
  minHits: 1,
  requestDelayMs: 1200
});
/** 只写的 key 输入框：留空表示「不修改」，和「清除」是两种不同意图 */
const bingKeyInput = ref('');

const pending = ref<SeoPendingItem[]>([]);
const submissions = ref<SeoSubmission[]>([]);
const submissionTotal = ref(0);
const filters = reactive({ page: 1, status: '', channel: '', url: '' });
const submitLimit = ref<number | undefined>(undefined);
const lastResult = ref<SeoBatchResult | null>(null);

const loadingStatus = ref(false);
const loadingPending = ref(false);
const loadingSubmissions = ref(false);
const saving = ref(false);
const submitting = ref(false);

/** 提交时刻文案（HH:00）；字段未加载时回退 0 点 */
const submitHourText = computed(() => {
  const hour = Number(form.submitHour);
  return `${String(Number.isFinite(hour) ? hour : 0).padStart(2, '0')}:00`;
});

let pollTimer: number | null = null;

const applyConfig = (next: SeoConfig) => {
  config.value = next;
  form.enabled = next.enabled;
  form.autoSubmit = next.autoSubmit;
  form.bingEnabled = next.bingEnabled;
  form.indexNowEnabled = next.indexNowEnabled;
  form.siteUrl = next.siteUrl;
  form.batchSize = next.batchSize;
  form.dailyLimit = next.dailyLimit;
  form.submitHour = next.submitHour;
  form.minHits = next.minHits;
  form.requestDelayMs = next.requestDelayMs;
};

const loadStatus = async () => {
  loadingStatus.value = true;
  try {
    const data = await getSeoStatus();
    applyConfig(data.config);
    stats.value = data.stats;
    runtime.value = data.runtime;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '读取 SEO 状态失败');
  } finally {
    loadingStatus.value = false;
  }
};

const loadPending = async () => {
  loadingPending.value = true;
  try {
    const data = await getSeoPending(300);
    pending.value = data.items || [];
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '读取待提交列表失败');
  } finally {
    loadingPending.value = false;
  }
};

const loadSubmissions = async (page = 1) => {
  loadingSubmissions.value = true;
  filters.page = page;
  try {
    const data = await getSeoSubmissions({
      page,
      limit: PAGE_SIZE,
      status: filters.status || undefined,
      channel: filters.channel || undefined,
      url: filters.url || undefined
    });
    submissions.value = data.items || [];
    submissionTotal.value = data.total || 0;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '读取提交记录失败');
  } finally {
    loadingSubmissions.value = false;
  }
};

const loadAll = async () => {
  await Promise.all([loadStatus(), loadPending(), loadSubmissions(filters.page)]);
};

const saveConfig = async () => {
  if (!/^https?:\/\//i.test(form.siteUrl)) {
    ElMessage.warning('站点 URL 必须以 http:// 或 https:// 开头');
    return;
  }
  saving.value = true;
  try {
    const payload: Record<string, unknown> = { ...form };
    // 只有真的填了才提交 key：留空 = 不改，清除由「清除」按钮显式触发
    if (bingKeyInput.value.trim()) payload.bingApiKey = bingKeyInput.value.trim();

    const data = await updateSeoConfig(payload);
    applyConfig(data.config);
    bingKeyInput.value = '';
    ElMessage.success('配置已保存');
    await loadStatus();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
};

const clearBingKey = async () => {
  try {
    await ElMessageBox.confirm('清除后必应通道会停用，只能靠 IndexNow 提交。确定清除？', '清除 API Key', {
      type: 'warning'
    });
  } catch {
    return;
  }
  try {
    const data = await updateSeoConfig({ bingApiKey: '' });
    applyConfig(data.config);
    ElMessage.success('已清除必应 API Key');
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '清除失败');
  }
};

const rotateIndexNowKey = async () => {
  try {
    await ElMessageBox.confirm('换 key 后搜索引擎需要重新抓取 key 文件，期间提交可能返回 403。确定更换？', '更换 IndexNow Key', {
      type: 'warning'
    });
  } catch {
    return;
  }
  try {
    const data = await regenerateIndexNowKey();
    config.value = { ...config.value, indexNowKey: data.indexNowKey, indexNowKeyLocation: data.indexNowKeyLocation };
    ElMessage.success('已生成新的 IndexNow Key');
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '更换失败');
  }
};

const submitNow = async () => {
  submitting.value = true;
  try {
    lastResult.value = await runSeoSubmit(submitLimit.value || undefined);
    const result = lastResult.value;
    if (result.skipped) ElMessage.info(`本轮跳过：${result.reason || '无待提交内容'}`);
    else if (result.error) ElMessage.error(result.error);
    else if (result.failed > 0) ElMessage.warning(`提交完成：成功 ${result.succeeded}，失败 ${result.failed}`);
    else ElMessage.success(`提交完成：成功 ${result.succeeded} 条`);
    await Promise.all([loadStatus(), loadPending(), loadSubmissions(1)]);
  } catch (error: any) {
    if (error?.response?.status === 409) ElMessage.warning('已有一轮提交正在进行');
    else ElMessage.error(error?.response?.data?.error || '提交失败');
  } finally {
    submitting.value = false;
  }
};

const cleanupQueue = async () => {
  try {
    await ElMessageBox.confirm('清理掉队列里已经提交成功且不在保留期内的条目，不影响待提交的 URL。继续？', '清理队列', {
      type: 'warning'
    });
  } catch {
    return;
  }
  try {
    const { deleted } = await cleanupSeoQueue();
    ElMessage.success(`已清理 ${deleted} 条`);
    await Promise.all([loadStatus(), loadPending()]);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '清理失败');
  }
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择文本');
  }
};

const statusText = (status: string) => (status === 'success' ? '成功' : status === 'failed' ? '失败' : '跳过');
const statusTagType = (status: string) => (status === 'success' ? 'success' : status === 'failed' ? 'danger' : 'info');

onMounted(async () => {
  await loadAll();
  pollTimer = window.setInterval(() => {
    // 提交进行中时状态变化快，轮询照常；手动提交会自己刷新，避免打架
    if (!submitting.value) loadStatus();
  }, 30000);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = null;
});
</script>

<style scoped>
.seo-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 概览数字：窄屏两列，宽屏四列 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background-color: var(--el-bg-color-overlay);
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.stat-hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-placeholder);
}

.config-form {
  max-width: 760px;
}

/* 提示文字跟在控件后面，窄屏自动换行 */
.form-hint {
  margin-left: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.key-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.key-text {
  padding: 1px 6px;
  border-radius: 4px;
  background-color: var(--el-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  word-break: break-all;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-chip.is-on {
  color: var(--el-color-success);
}

.meta-chip.is-off {
  color: var(--el-text-color-secondary);
}

.meta-chip.is-running {
  color: var(--el-color-primary);
}

.limit-input {
  width: 130px;
}

.filter-select {
  width: 130px;
}

.filter-input {
  width: 200px;
}

.result-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-blank);
}

.result-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.result-tag {
  font-weight: 600;
}

.result-tag.is-ok {
  color: var(--el-color-success);
}

.result-tag.is-warn {
  color: var(--el-color-warning);
}

.result-reason {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.result-reason.is-error {
  color: var(--el-color-danger);
}

.result-channels {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}

.path-cell {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.http-code {
  margin-left: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.pager-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* 窄屏：控件占满整行，避免提示文字被挤成一列竖排 */
@media (max-width: 900px) {
  .config-form {
    max-width: 100%;
  }

  .config-form :deep(.el-form-item) {
    display: block;
  }

  .config-form :deep(.el-form-item__label) {
    width: auto !important;
    justify-content: flex-start;
  }

  .form-hint {
    display: block;
    margin: 4px 0 0;
  }

  .key-row,
  .head-right {
    flex-wrap: wrap;
  }

  .filter-select,
  .filter-input,
  .limit-input {
    width: 100%;
  }
}
</style>
