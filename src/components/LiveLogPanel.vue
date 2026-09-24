<template>
  <el-card class="live-panel" shadow="hover">
    <template #header>
      <div class="live-header">
        <div class="live-title">
          <span class="live-dot" :class="statusClass"></span>
          <span class="live-name">后端实时</span>
          <span class="live-status">{{ statusText }}</span>
          <button
            v-if="errorCount"
            type="button"
            class="live-error-badge"
            title="只看错误"
            @click="setLevel('error')"
          >
            {{ errorCount }} 错误
          </button>
        </div>

        <div class="live-actions">
          <span class="live-metric" v-if="metrics">
            运行 {{ formatUptime(metrics.uptime) }} · 内存 {{ formatBytes(metrics.rss) }} ·
            Node {{ metrics.node }}<template v-if="metrics.clients"> · 在线 {{ metrics.clients }}</template>
          </span>
          <el-button link size="small" @click="togglePause">{{ paused ? '继续' : '暂停' }}</el-button>
          <el-button link size="small" @click="clearLogs">清空</el-button>
        </div>
      </div>

      <div class="live-toolbar">
        <div class="live-filters">
          <button
            v-for="option in filterOptions"
            :key="option.key"
            type="button"
            class="live-filter"
            :class="{ 'is-active': levelFilter === option.key }"
            @click="setLevel(option.key)"
          >
            {{ option.label }}
            <span v-if="option.key === 'error' && errorCount" class="live-filter-count">
              {{ errorCount }}
            </span>
          </button>
        </div>

        <!-- 请求方法过滤：和上面的级别过滤是两个维度，可叠加 -->
        <span class="live-filter-divider" aria-hidden="true"></span>

        <div class="live-filters">
          <button
            v-for="option in methodOptions"
            :key="option.key"
            type="button"
            class="live-filter live-filter--method"
            :class="[`is-${option.key.toLowerCase()}`, { 'is-active': methodFilter === option.key }]"
            :title="methodFilter === option.key ? `取消只看 ${option.label}` : `只看 ${option.label} 请求`"
            @click="toggleMethod(option.key)"
          >
            {{ option.label }}
          </button>
        </div>

        <span v-if="rate.count" class="live-rate">
          近 1 分钟 {{ rate.count }} 请求 · 平均 {{ rate.avg }}ms
        </span>
      </div>
    </template>

    <div class="live-body-wrap">
      <div ref="listRef" class="live-body" @scroll="handleScroll">
        <p v-if="visibleLogs.length === 0" class="live-empty">
          {{ logs.length === 0 ? '等待后端事件…（请求、缓存构建、上游异常都会显示在这里）' : `没有匹配的日志（缓冲共 ${logs.length} 条）` }}
        </p>
        <template v-for="(line, index) in visibleLogs" :key="`${line.t}-${index}`">
          <div
            class="live-line"
            :class="[
              `is-${line.level}`,
              {
                'is-row-marked': isMarkedRow(line),
                'is-error-row': isError(line),
                'is-slow-row': isSlow(line),
                'is-upstream-row': line.kind === 'upstream',
                'is-replay-row': line.kind === 'replay',
                'is-clickable': !!line.preview
              }
            ]"
            @click="togglePreview(line, index)"
          >
            <span class="live-time">{{ formatTime(line.t) }}</span>
            <span class="live-message">{{ displayMessage(line) }}</span>
            <span v-if="line.kind === 'replay'" class="live-flag is-replay">重放</span>
            <span v-if="line.kind === 'upstream'" class="live-flag is-upstream">上游</span>
            <span v-if="isSlow(line)" class="live-flag">慢</span>
            <button
              v-if="line.path && (line.kind === 'request' || line.kind === 'upstream' || line.kind === 'replay')"
              type="button"
              class="live-replay"
              :disabled="replayingKey === `${line.t}-${index}`"
              @click.stop="replay(line, index)"
            >
              {{ replayingKey === `${line.t}-${index}` ? '重放中' : '重放' }}
            </button>
          </div>
          <pre v-if="expandedKey === `${line.t}-${index}` && line.preview" class="live-preview">{{ line.preview }}</pre>
        </template>
      </div>

      <button v-if="!stickToBottom" type="button" class="live-jump" @click="jumpToLatest">
        回到最新 ↓
      </button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { replayRequest } from '../services/admin';

interface LiveLogEntry {
  t: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  kind?: 'request' | 'cache' | 'upstream' | 'system' | 'replay';
  method?: string;
  path?: string;
  status?: number;
  ms?: number;
  preview?: string;
}

interface LiveMetrics {
  uptime: number;
  rss: number;
  node: string;
  clients: number;
  time: number;
}

type LevelFilter = 'all' | 'warn' | 'error' | 'slow';
type MethodFilter = '' | 'GET' | 'POST' | 'PUT' | 'DELETE';

const MAX_LINES = 200;
const SLOW_MS = 500;

const filterOptions: Array<{ key: LevelFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'warn', label: '警告' },
  { key: 'error', label: '错误' },
  { key: 'slow', label: '慢请求' }
];

/** 请求方式按钮：再点一次取消，回到全部方法 */
const methodOptions: Array<{ key: MethodFilter; label: string }> = [
  { key: 'GET', label: 'GET' },
  { key: 'POST', label: 'POST' },
  { key: 'PUT', label: 'PUT' },
  { key: 'DELETE', label: 'DELETE' }
];

const auth = useAuthStore();
const logs = ref<LiveLogEntry[]>([]);
const metrics = ref<LiveMetrics | null>(null);
const connected = ref(false);
const failed = ref(false);
const paused = ref(false);
const levelFilter = ref<LevelFilter>('all');
const methodFilter = ref<MethodFilter>('');
const listRef = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
const replayingKey = ref('');
const expandedKey = ref('');

let source: EventSource | null = null;
let retryTimer: number | null = null;
let retryCount = 0;

const isError = (entry: LiveLogEntry) =>
  entry.level === 'error' || (typeof entry.status === 'number' && entry.status >= 500);

const isSlow = (entry: LiveLogEntry) =>
  (entry.kind === 'request' || entry.kind === 'upstream') &&
  typeof entry.ms === 'number' &&
  entry.ms >= SLOW_MS;

/** 整行带底色标记的行：错误 / 慢 / 上游 / 重放 */
const isMarkedRow = (entry: LiveLogEntry) =>
  isError(entry) || isSlow(entry) || entry.kind === 'upstream' || entry.kind === 'replay';

/** 上游 / 重放以前把「↑ 上游」「↻ 重放」写进了文本里；现在改成小标签，这里兼容缓冲里的旧格式 */
const displayMessage = (entry: LiveLogEntry) => {
  const message = String(entry.message || '');
  if (entry.kind === 'upstream') return message.replace(/^↑\s*上游\s*/, '');
  if (entry.kind === 'replay') return message.replace(/^↻\s*重放\s*/, '');
  return message;
};

const visibleLogs = computed(() => {
  return logs.value.filter((entry) => {
    if (levelFilter.value === 'error' && !isError(entry)) return false;
    if (levelFilter.value === 'warn' && !(entry.level === 'warn' || isError(entry))) return false;
    if (levelFilter.value === 'slow' && !isSlow(entry)) return false;
    if (methodFilter.value && String(entry.method || '').toUpperCase() !== methodFilter.value) return false;
    return true;
  });
});

const errorCount = computed(() => logs.value.filter(isError).length);

/** 近 1 分钟的请求数与平均耗时（随新日志刷新） */
const rate = computed(() => {
  const since = Date.now() - 60000;
  const requests = logs.value.filter(
    (entry) => entry.kind === 'request' && entry.t >= since && typeof entry.ms === 'number'
  );
  if (requests.length === 0) return { count: 0, avg: 0 };
  return {
    count: requests.length,
    avg: Math.round(requests.reduce((sum, entry) => sum + (entry.ms || 0), 0) / requests.length)
  };
});

const statusText = computed(() => {
  if (connected.value) return paused.value ? '已暂停' : '已连接';
  if (failed.value) return '连接失败';
  return '连接中…';
});

const statusClass = computed(() => {
  if (connected.value) return paused.value ? 'is-paused' : 'is-online';
  return failed.value ? 'is-offline' : 'is-connecting';
});

const setLevel = (level: LevelFilter) => {
  levelFilter.value = level;
};

const toggleMethod = (method: MethodFilter) => {
  methodFilter.value = methodFilter.value === method ? '' : method;
};

const appendLogs = (entries: LiveLogEntry[]) => {
  if (!entries?.length) return;
  logs.value = [...logs.value, ...entries].slice(-MAX_LINES);
};

/** 等 DOM 更新完再滚动，否则永远差一帧（新内容会被挤到底部之外） */
const scrollToBottom = async (force = false) => {
  await nextTick();
  const el = listRef.value;
  if (!el) return;
  if (!force && !stickToBottom.value) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
};

const handleScroll = () => {
  const el = listRef.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
};

const jumpToLatest = () => {
  stickToBottom.value = true;
  void scrollToBottom(true);
};

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天${h}小时`;
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分`;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '-';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
};

const clearLogs = () => {
  logs.value = [];
  stickToBottom.value = true;
};

const togglePause = () => {
  paused.value = !paused.value;
  if (!paused.value) jumpToLatest();
};

const togglePreview = (line: LiveLogEntry, index: number) => {
  if (!line.preview) return;
  const key = `${line.t}-${index}`;
  expandedKey.value = expandedKey.value === key ? '' : key;
};

/** 重放一条请求：写操作需要二次确认，避免误触发副作用 */
const replay = async (line: LiveLogEntry, index: number) => {
  if (!line.path) return;
  const key = `${line.t}-${index}`;
  const method = (line.method || 'GET').toUpperCase();

  if (method === 'POST') {
    try {
      await ElMessageBox.confirm(
        `重放会真实执行一次 ${method} ${line.path}，可能产生副作用（写入/删除数据），确定继续？`,
        '确认重放写请求',
        { type: 'warning', confirmButtonText: '确认重放', cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
  }

  replayingKey.value = key;
  try {
    // 成功时不再本地追加日志：后端会通过 SSE 推一条 kind=replay 的记录（带响应预览），
    // 本地再追加就会和它重复成两条
    await replayRequest({ method, path: line.path, confirm: method === 'POST' });
  } catch (error: any) {
    const detail = error?.response?.data?.error || error?.message || '重放失败';
    ElMessage.error(detail);
  } finally {
    replayingKey.value = '';
  }
};

const closeSource = () => {
  if (source) {
    source.close();
    source = null;
  }
  if (retryTimer) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
};

const scheduleReconnect = () => {
  if (retryTimer) return;
  const delay = Math.min(3000 * (retryCount + 1), 15000);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
};

const connect = () => {
  closeSource();
  const token = auth.token;
  if (!token) {
    failed.value = true;
    return;
  }

  source = new EventSource(`/api/admin/live?token=${encodeURIComponent(token)}`);

  source.addEventListener('hello', (event) => {
    connected.value = true;
    failed.value = false;
    retryCount = 0;
    try {
      const payload = JSON.parse((event as MessageEvent).data);
      metrics.value = payload.metrics || null;
      logs.value = (payload.logs || []).slice(-MAX_LINES);
      void scrollToBottom(true);
    } catch {
      /* ignore */
    }
  });

  source.addEventListener('log', (event) => {
    try {
      appendLogs([JSON.parse((event as MessageEvent).data)]);
      // 暂停时仍然接收（不丢日志），只是不自动跟随
      if (!paused.value) void scrollToBottom();
    } catch {
      /* ignore */
    }
  });

  source.addEventListener('metrics', (event) => {
    try {
      metrics.value = JSON.parse((event as MessageEvent).data);
    } catch {
      /* ignore */
    }
  });

  source.onerror = () => {
    connected.value = false;
    if (source) {
      source.close();
      source = null;
    }
    retryCount += 1;
    if (retryCount >= 5) failed.value = true;
    scheduleReconnect();
  };
};

onMounted(connect);
onBeforeUnmount(closeSource);
</script>

<style scoped>
.live-panel {
  margin-top: 20px;
}

.live-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-weight: 600;
}

.live-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
  background-color: var(--el-text-color-placeholder);
}

.live-dot.is-online {
  background-color: var(--el-color-success);
  box-shadow: 0 0 0 3px var(--el-color-success-light-9);
}

.live-dot.is-paused {
  background-color: var(--el-color-warning);
  box-shadow: 0 0 0 3px var(--el-color-warning-light-9);
}

.live-dot.is-offline {
  background-color: var(--el-color-danger);
  box-shadow: 0 0 0 3px var(--el-color-danger-light-9);
}

.live-name {
  font-size: 15px;
}

.live-status {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.live-error-badge {
  padding: 1px 8px;
  border: none;
  border-radius: 999px;
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.live-error-badge:hover {
  background-color: var(--el-color-danger-light-8);
}

.live-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 400;
}

.live-metric {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.live-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-weight: 400;
}

.live-filters {
  display: flex;
  align-items: center;
  gap: 6px;
}

.live-filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.live-filter:hover {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.live-filter.is-active {
  border-color: var(--el-color-primary-light-7);
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

/* 方法过滤：与级别过滤中间用一条细线隔开 */
.live-filter-divider {
  width: 1px;
  height: 14px;
  background-color: var(--el-border-color-light);
}

.live-filter--method {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11.5px;
  letter-spacing: 0.3px;
}

.live-filter--method.is-get.is-active {
  border-color: var(--el-color-primary-light-7);
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.live-filter--method.is-post.is-active {
  border-color: var(--el-color-warning-light-7);
  background-color: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.live-filter--method.is-put.is-active {
  border-color: var(--el-color-success-light-7);
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.live-filter--method.is-delete.is-active {
  border-color: var(--el-color-danger-light-7);
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.live-filter-count {
  padding: 0 5px;
  border-radius: 999px;
  background-color: var(--el-color-danger);
  color: #fff;
  font-size: 11px;
  line-height: 15px;
}

.live-rate {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.live-body-wrap {
  position: relative;
}

.live-body {
  max-height: 260px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12.5px;
  line-height: 1.7;
}

.live-jump {
  position: absolute;
  right: 4px;
  bottom: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color-overlay);
  color: var(--el-color-primary);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  box-shadow: var(--el-box-shadow-light);
  transition: all 0.16s ease;
}

.live-jump:hover {
  border-color: var(--el-color-primary-light-5);
}

.live-empty {
  margin: 8px 0;
  color: var(--el-text-color-placeholder);
  font-size: 12.5px;
}

.live-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--el-text-color-regular);
}

.live-line.is-clickable {
  cursor: pointer;
}

/* 重放按钮：默认低调，hover 该行时才明显 */
.live-replay {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  background-color: transparent;
  color: var(--el-text-color-placeholder);
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.16s ease;
}

.live-line:hover .live-replay {
  opacity: 1;
}

.live-replay:hover:not(:disabled) {
  border-color: var(--el-color-primary-light-7);
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.live-replay:disabled {
  opacity: 1;
  color: var(--el-text-color-disabled);
}

.live-preview {
  margin: 2px 0 8px 60px;
  padding: 8px 10px;
  max-height: 180px;
  overflow: auto;
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 带底色标记的行（错误 / 上游 / 重放 / 慢）：整行上色，避免混在日志里被忽略。
   后面的规则优先级更高：错误最重，慢请求压过「上游 / 重放」 */
.live-line.is-error-row {
  background-color: var(--el-color-danger-light-9);
}

.live-line.is-upstream-row {
  background-color: var(--el-color-primary-light-9);
}

.live-line.is-replay-row {
  background-color: var(--el-color-success-light-9);
}

.live-line.is-slow-row {
  background-color: var(--el-color-warning-light-9);
}

/* 相邻两条带底色的行之间留 3px 缝，不然会连成一整块 */
.live-line.is-row-marked + .live-line.is-row-marked {
  margin-top: 3px;
}

.live-time {
  flex: 0 0 auto;
  color: var(--el-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

.live-message {
  min-width: 0;
  word-break: break-word;
}

.live-flag {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: 4px;
  background-color: var(--el-color-warning-light-8);
  color: var(--el-color-warning);
  font-size: 11px;
}

/* 上游调用：和「慢」同一个样式，只是换成主色 */
.live-flag.is-upstream {
  background-color: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}

/* 重放：同一套标签样式，换成绿色 */
.live-flag.is-replay {
  background-color: var(--el-color-success-light-8);
  color: var(--el-color-success);
}

.live-line.is-warn .live-message {
  color: var(--el-color-warning);
}

.live-line.is-error .live-message {
  color: var(--el-color-danger);
}

@media (max-width: 768px) {
  .live-metric,
  .live-rate {
    display: none;
  }

  .live-body {
    max-height: 220px;
    font-size: 12px;
  }
}
</style>
