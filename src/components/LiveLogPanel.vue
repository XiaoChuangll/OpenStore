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

      <div ref="toolbarRef" class="live-toolbar" :class="{ 'is-stacked': filtersStacked }">
        <div ref="levelFiltersRef" class="live-filters">
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

        <div ref="methodFiltersRef" class="live-filters">
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
                'is-clickable': !!line.preview,
                'is-split': wrappedKeys.has(`${line.t}-${index}`) && isRequestLike(line)
              }
            ]"
            :data-key="`${line.t}-${index}`"
            @click="togglePreview(line, index)"
          >
            <span class="live-time">{{ formatTime(line.t) }}</span>

            <!-- 一行放得下就用整段消息（和以前一样）；折行的行 .is-split 把方法挪到时间下面 -->
            <span class="live-message">{{ displayMessage(line) }}</span>
            <template v-if="isRequestLike(line)">
              <span class="live-method">{{ methodLabel(line) }}<span class="live-arrow">→</span></span>
              <span class="live-path">{{ pathLabel(line) }}</span>
              <span class="live-result">{{ resultLabel(line) }}</span>
            </template>

            <span v-if="hasTail(line)" class="live-tail">
              <span v-if="line.kind === 'replay'" class="live-flag is-replay">重放</span>
              <span v-if="line.kind === 'upstream'" class="live-flag is-upstream">上游</span>
              <span v-if="isSlow(line)" class="live-flag">慢</span>
              <button
                v-if="canReplay(line)"
                type="button"
                class="live-replay"
                :disabled="replayingKey === `${line.t}-${index}`"
                @click.stop="replay(line, index)"
              >
                {{ replayingKey === `${line.t}-${index}` ? '重放中' : '重放' }}
              </button>
            </span>
          </div>
          <pre v-if="expandedKey === `${line.t}-${index}` && line.preview" class="live-preview">{{ line.preview }}</pre>
        </template>
      </div>

      <button
        v-if="!stickToBottom"
        type="button"
        class="live-jump"
        title="回到最新"
        aria-label="回到最新"
        @click="jumpToLatest"
      >
        <el-icon><ArrowDown /></el-icon>
      </button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, onUpdated, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';
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
/** 一行放不下的日志（下面按 DOM 实测标记），换行时把请求方式挪到时间下面 */
const wrappedKeys = ref<Set<string>>(new Set());
/** 工具栏里方法过滤被挤到下一行时，分隔线由竖线换成横线 */
const filtersStacked = ref(false);
const toolbarRef = ref<HTMLElement | null>(null);
const levelFiltersRef = ref<HTMLElement | null>(null);
const methodFiltersRef = ref<HTMLElement | null>(null);

let streamAbort: AbortController | null = null;
let retryTimer: number | null = null;
let retryCount = 0;
let wrapTimer: number | null = null;
let sweepTimer: number | null = null;
let smoothTimer: number | null = null;
/** 平滑滚动期间忽略 scroll 事件，否则滚到一半会被判定成「用户翻上去了」 */
let smoothUntil = 0;

const isError = (entry: LiveLogEntry) =>
  entry.level === 'error' || (typeof entry.status === 'number' && entry.status >= 500);

const isSlow = (entry: LiveLogEntry) =>
  (entry.kind === 'request' || entry.kind === 'upstream') &&
  typeof entry.ms === 'number' &&
  entry.ms >= SLOW_MS;

/** 整行带底色标记的行：错误 / 慢 / 上游 / 重放 */
const isMarkedRow = (entry: LiveLogEntry) =>
  isError(entry) || isSlow(entry) || entry.kind === 'upstream' || entry.kind === 'replay';

/** 请求 / 上游 / 重放都带 method+status+ms，够拆成「方法 / 路径 / 状态」三段 */
const isRequestLike = (entry: LiveLogEntry) =>
  !!entry.method && typeof entry.status === 'number' && typeof entry.ms === 'number';

const methodLabel = (entry: LiveLogEntry) =>
  isRequestLike(entry) ? String(entry.method).toUpperCase() : '';

const pathLabel = (entry: LiveLogEntry) =>
  isRequestLike(entry) ? String(entry.path || '') : displayMessage(entry);

const resultLabel = (entry: LiveLogEntry) =>
  isRequestLike(entry) ? `${entry.status} · ${entry.ms}ms` : '';

const canReplay = (entry: LiveLogEntry) =>
  !!entry.path && (entry.kind === 'request' || entry.kind === 'upstream' || entry.kind === 'replay');

/** 行尾（标签 + 重放按钮）是否存在，避免空容器占位 */
const hasTail = (entry: LiveLogEntry) =>
  canReplay(entry) || entry.kind === 'replay' || entry.kind === 'upstream' || isSlow(entry);

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
  // 新行渲染完立刻量一次，别等下一次更新，否则新行会先以单行样式闪一下
  void nextTick().then(measureWrapped);
};

/** 等 DOM 更新完再滚动，否则永远差一帧（新内容会被挤到底部之外） */
const scrollToBottom = async (force = false, smooth = false) => {
  await nextTick();
  measureWrapped();
  const el = listRef.value;
  if (!el) return;
  if (!force && !stickToBottom.value) return;
  requestAnimationFrame(() => {
    // 点「回到最新」时滑过去，自动跟随新日志时直接贴底（不然会一直追着动画跑）
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
  });
};

const handleScroll = () => {
  const el = listRef.value;
  if (!el) return;
  if (Date.now() < smoothUntil) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
};

const jumpToLatest = () => {
  stickToBottom.value = true;
  void scrollToBottom(true, true);
  smoothUntil = Date.now() + 900;
  if (smoothTimer) window.clearTimeout(smoothTimer);
  smoothTimer = window.setTimeout(() => {
    smoothUntil = 0;
    stickToBottom.value = true;
  }, 900);
};

/**
 * 量一下哪些日志行真的折行了（消息高度超过一行），只量还没标记的行：
 * 已经标记的行换成两行网格布局、宽度和折行时不一样，重量会来回抖。
 */
const measureWrapped = () => {
  const el = listRef.value;
  if (!el) return;
  const current = wrappedKeys.value;
  let next: Set<string> | null = null;
  el.querySelectorAll<HTMLElement>('.live-line').forEach((row) => {
    const key = row.dataset.key;
    if (!key || current.has(key)) return;
    const message = row.querySelector<HTMLElement>('.live-message');
    if (!message) return;
    const lineHeight = parseFloat(window.getComputedStyle(message).lineHeight) || 21;
    if (message.getBoundingClientRect().height > lineHeight * 1.5) {
      next = next || new Set(current);
      next.add(key);
    }
  });
  if (next) wrappedKeys.value = next;
};

/** 宽度变了要按新宽度重新量：先清空标记（回到单行布局）再统一测 */
const remeasureWrapped = () => {
  if (wrapTimer) window.clearTimeout(wrapTimer);
  wrapTimer = window.setTimeout(async () => {
    wrapTimer = null;
    if (wrappedKeys.value.size) {
      wrappedKeys.value = new Set();
      await nextTick();
    }
    measureWrapped();
  }, 120);
};

/**
 * 方法过滤换行时，把它和级别过滤之间的竖线换成整行横线。
 * 按各段宽度算，而不是量实际位置：横线本身占满一行，量位置会自己把自己钉在换行状态上。
 */
const syncFiltersStacked = () => {
  const toolbar = toolbarRef.value;
  const level = levelFiltersRef.value;
  const method = methodFiltersRef.value;
  if (!toolbar || !level || !method) return;
  const rate = toolbar.querySelector<HTMLElement>('.live-rate');
  const gap = 10;
  const needed =
    level.offsetWidth + method.offsetWidth + (rate?.offsetWidth || 0) + 1 + gap * (rate ? 3 : 2);
  const next = needed > toolbar.clientWidth;
  if (next !== filtersStacked.value) filtersStacked.value = next;
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
  wrappedKeys.value = new Set();
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
  if (streamAbort) {
    streamAbort.abort();
    streamAbort = null;
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

/** 解析一个 SSE 帧（形如 "event: log\ndata: {...}"）并分发 */
const handleSseFrame = (frame: string) => {
  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  const raw = dataLines.join('\n');
  if (!raw) return;

  if (eventName === 'hello') {
    connected.value = true;
    failed.value = false;
    retryCount = 0;
    try {
      const payload = JSON.parse(raw);
      metrics.value = payload.metrics || null;
      logs.value = (payload.logs || []).slice(-MAX_LINES);
      void scrollToBottom(true);
    } catch {
      /* ignore */
    }
    return;
  }

  if (eventName === 'log') {
    try {
      appendLogs([JSON.parse(raw)]);
      // 暂停时仍然接收（不丢日志），只是不自动跟随
      if (!paused.value) void scrollToBottom();
    } catch {
      /* ignore */
    }
    return;
  }

  if (eventName === 'metrics') {
    try {
      metrics.value = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
};

/*
 * 这里用 fetch 而不是 EventSource：EventSource 不能自定义请求头，
 * 只能把 token 塞进 URL（会连同查询串一起写进 nginx 的 access_log）。
 * 改成带 Authorization 头手动读流、手动解析 SSE 帧，重连仍由 scheduleReconnect 负责。
 */
const connect = async () => {
  closeSource();
  const token = auth.token;
  if (!token) {
    failed.value = true;
    return;
  }

  const controller = new AbortController();
  streamAbort = controller;

  try {
    const response = await fetch('/api/admin/live', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

    connected.value = true;
    failed.value = false;
    retryCount = 0;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (frame.trim()) handleSseFrame(frame);
        sep = buffer.indexOf('\n\n');
      }
    }
    throw new Error('stream closed');
  } catch (e) {
    // 主动关闭（切走 / 卸载）不算异常，也不重连
    if (controller.signal.aborted) return;
    console.warn('[LiveLogPanel] 实时日志连接中断', e);
    connected.value = false;
    retryCount += 1;
    if (retryCount >= 5) failed.value = true;
    scheduleReconnect();
  } finally {
    if (streamAbort === controller) streamAbort = null;
  }
};

let resizeObserver: ResizeObserver | null = null;
let toolbarObserver: ResizeObserver | null = null;

const startSweep = () => {
  if (sweepTimer === null) sweepTimer = window.setInterval(measureWrapped, 1000);
};

const stopSweep = () => {
  if (sweepTimer !== null) {
    window.clearInterval(sweepTimer);
    sweepTimer = null;
  }
};

let mountedOnce = false;

onMounted(() => {
  connect();
  if (listRef.value) {
    resizeObserver = new ResizeObserver(remeasureWrapped);
    resizeObserver.observe(listRef.value);
  }
  if (toolbarRef.value) {
    toolbarObserver = new ResizeObserver(syncFiltersStacked);
    toolbarObserver.observe(toolbarRef.value);
  }
  syncFiltersStacked();
  startSweep();
  mountedOnce = true;
});

/*
 * 面板被 KeepAlive 挂起时断开 SSE、停掉兜底扫描，切回来再连：
 * 重连会带上后端缓冲的日志，等于「接着上次继续看」，不用重新请求历史接口。
 */
onActivated(() => {
  if (!mountedOnce) return;
  connect();
  startSweep();
  void nextTick().then(() => {
    remeasureWrapped();
    syncFiltersStacked();
  });
});

onDeactivated(() => {
  closeSource();
  stopSweep();
});

// 每次日志重渲染后补量一次：新来的行只有还没标记才会被测
onUpdated(() => {
  measureWrapped();
  syncFiltersStacked();
});

onBeforeUnmount(() => {
  closeSource();
  stopSweep();
  resizeObserver?.disconnect();
  toolbarObserver?.disconnect();
  if (wrapTimer) window.clearTimeout(wrapTimer);
  if (smoothTimer) window.clearTimeout(smoothTimer);
});
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

/* 方法过滤被挤到下一行时，竖线没意义了，改成占满整行的横线 */
.live-toolbar.is-stacked .live-filter-divider {
  flex: 1 1 100%;
  width: auto;
  height: 1px;
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
  /* 长路径折不开时也不让它把面板撑出横向滚动条 */
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 4px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12.5px;
  line-height: 1.7;
}

.live-jump {
  position: absolute;
  right: 6px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color-overlay);
  color: var(--el-color-primary);
  font-size: 15px;
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
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 10px;
  /* flex/grid 子项默认可被内容顶开，这里压回容器宽度内 */
  min-width: 0;
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--el-text-color-regular);
}

.live-method,
.live-path,
.live-result {
  flex: 0 0 auto;
  min-width: 0;
  margin-left: 5px;
}

/* 路径 / 状态这类 token 里可能有很长的连续串（接口名、ID），给它们断行点 */
.live-path,
.live-result,
.live-message {
  overflow-wrap: anywhere;
}

/* 折行后箭头跟着请求方式走（GET →），不再留在路径尾巴上 */
.live-arrow {
  margin-left: 5px;
  color: var(--el-text-color-placeholder);
}

/* 没折行时上面三段是隐藏的，只有 .is-split（真的折行了）才由 CSS 两行排布接管 */
.live-line:not(.is-split) .live-method,
.live-line:not(.is-split) .live-path,
.live-line:not(.is-split) .live-result {
  display: none;
}

/* 行尾标签 + 重放按钮：不折行时直接参与行内排列（按钮靠右） */
.live-tail {
  display: contents;
}

/* 折行的日志：时间在第 1 行，请求方式落到时间下面；状态 · 耗时落到路径下面 */
.live-line.is-split {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  row-gap: 0;
  column-gap: 8px;
}

.live-line.is-split .live-message {
  display: none;
}

.live-line.is-split .live-time {
  grid-area: 1 / 1;
}

.live-line.is-split .live-method {
  grid-area: 2 / 1;
  margin-left: 0;
}

.live-line.is-split .live-path {
  /* 路径占满时间右边整宽（含行尾标签那一列），免得长路径被挤成两行 */
  grid-area: 1 / 2 / 2 / -1;
  margin-left: 0;
}

.live-line.is-split .live-result {
  grid-area: 2 / 2;
  margin-left: 0;
}

.live-line.is-split .live-tail {
  grid-area: 2 / 3;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}

.live-line.is-split .live-replay {
  margin-left: 0;
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
  min-width: 0;
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

.live-line.is-warn .live-message,
.live-line.is-warn .live-result {
  color: var(--el-color-warning);
}

.live-line.is-error .live-message,
.live-line.is-error .live-result {
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
