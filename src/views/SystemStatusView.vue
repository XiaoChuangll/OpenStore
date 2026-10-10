<template>
  <div class="status-view">
    <!-- 总览：一眼看清整体可用性与关键指标 -->
    <section class="overview" :class="isSystemHealthy ? 'is-healthy' : 'is-degraded'">
      <div class="overview-head">
        <div class="overview-status">
          <span class="status-orb" :class="{ 'is-pulsing': isSystemHealthy }">
            <el-icon :size="22">
              <CircleCheckFilled v-if="isSystemHealthy" />
              <WarningFilled v-else />
            </el-icon>
          </span>
          <div class="overview-text">
            <h1 class="overview-title">
              {{ isSystemHealthy ? '全部服务运行正常' : '部分接口出现异常' }}
            </h1>
            <p class="overview-sub">
              服务 {{ onlineServices }} / {{ totalServices }} ·
              页面接口 {{ okPages }} / {{ totalPages }} ·
              每 {{ AUTO_INTERVAL }} 秒自动检测
            </p>
          </div>
        </div>

        <el-button
          class="overview-refresh"
          type="primary"
          :icon="Refresh"
          :loading="isCheckingAny"
          @click="runAllChecks"
        >
          全部检测
        </el-button>
      </div>

      <div class="overview-metrics">
        <div class="ov-metric">
          <span class="ov-label">在线服务</span>
          <span class="ov-value">
            <strong>{{ onlineServices }}</strong>
            <em>/ {{ totalServices }}</em>
          </span>
        </div>
        <div class="ov-metric">
          <span class="ov-label">页面接口正常</span>
          <span class="ov-value">
            <strong>{{ okPages }}</strong>
            <em>/ {{ totalPages }}</em>
          </span>
        </div>
        <div class="ov-metric">
          <span class="ov-label">平均响应</span>
          <span class="ov-value">
            <strong>{{ avgLatency ?? '--' }}</strong>
            <em>ms</em>
          </span>
        </div>
        <div class="ov-metric">
          <span class="ov-label">下次自动检测</span>
          <span class="ov-value">
            <strong>{{ secondsToNextCheck }}</strong>
            <em>s</em>
          </span>
        </div>
      </div>
    </section>

    <!-- 后端服务 -->
    <section class="service-grid">
      <article
        v-for="svc in services"
        :key="svc.key"
        class="service-card"
        :class="{ 'is-offline': !svc.online }"
      >
        <header class="service-head">
          <div class="service-identity">
            <span class="service-icon">
              <el-icon :size="20"><Connection /></el-icon>
            </span>
            <div class="service-names">
              <h2 class="service-name">{{ svc.name }}</h2>
              <code class="service-env">{{ svc.env }}</code>
            </div>
          </div>
          <span class="status-pill" :class="svc.online ? 'is-online' : 'is-offline'">
            <span class="pill-dot"></span>
            {{ svc.online ? '在线' : '离线' }}
          </span>
        </header>

        <div class="service-metrics">
          <div class="metric">
            <span class="metric-label">响应时间</span>
            <div class="metric-figure" :class="latencyTone(svc.latency, svc.online)">
              <span class="figure-num">{{ svc.latency ? svc.latency : '--' }}</span>
              <span class="figure-unit">ms</span>
              <span class="latency-tag">{{ latencyLabel(svc.latency, svc.online) }}</span>
            </div>
          </div>

          <div class="metric">
            <span class="metric-label">最后检测</span>
            <div class="metric-time">
              <span class="time-main">{{ svc.lastCheck ? svc.lastCheck.slice(11) : '--:--:--' }}</span>
              <span class="time-date">{{ svc.lastCheck ? svc.lastCheck.slice(0, 10) : '尚未检测' }}</span>
            </div>
          </div>
        </div>

        <footer class="service-foot">
          <span class="service-state" :class="latencyTone(svc.latency, svc.online)">
            <span class="state-dot"></span>
            {{ svc.statusText }}
          </span>
          <el-button :loading="svc.checking" @click="checkSingle(svc)">
            立即检测
          </el-button>
        </footer>
      </article>
    </section>

    <!-- 每个页面的关键接口 -->
    <section class="page-checks">
      <header class="section-head">
        <h2 class="section-title">页面接口检测</h2>
        <span class="section-count" :class="okPages === totalPages ? 'is-good' : 'is-bad'">
          {{ okPages }} / {{ totalPages }} 正常
        </span>
      </header>

      <ul class="page-list">
        <li
          v-for="page in pages"
          :key="page.key"
          class="page-row"
          :class="{ 'is-offline': !page.online }"
        >
          <span class="row-dot" :class="latencyTone(page.latency, page.online)"></span>

          <span class="page-label">
            <button class="page-name" type="button" @click="goPage(page.route)">
              {{ page.name }}
            </button>
            <code class="page-route">{{ page.route }}</code>
          </span>

          <span class="page-latency" :class="latencyTone(page.latency, page.online)">
            {{ page.latency ? page.latency + ' ms' : '--' }}
          </span>

          <span class="page-state" :title="page.statusText">{{ page.statusText }}</span>

          <el-button
            class="row-action"
            link
            :loading="page.checking"
            @click="checkSingle(page)"
          >
            检测
          </el-button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useActiveScope } from '../utils/page-active';
import {
  Connection,
  Refresh,
  CircleCheckFilled,
  WarningFilled,
} from '@element-plus/icons-vue';
import dayjs from 'dayjs';

const router = useRouter();

/** 自动检测间隔（秒） */
const AUTO_INTERVAL = 30;
const PROBE_TIMEOUT_MS = 10000;

interface Probe {
  key: string;
  name: string;
  /** 实际探测的接口路径（同源，走本站代理） */
  probePath: string;
  online: boolean;
  latency: number;
  lastCheck: string;
  statusText: string;
  checking: boolean;
}

interface ServiceProbe extends Probe {
  /** 对应的环境变量名，仅用于展示 */
  env: string;
}

interface PageProbe extends Probe {
  /** 页面路由，点击可跳过去排查 */
  route: string;
}

const createProbe = <T extends Probe>(probe: Omit<T, 'online' | 'latency' | 'lastCheck' | 'statusText' | 'checking'>): T =>
  ({
    ...probe,
    online: false,
    latency: 0,
    lastCheck: '',
    statusText: '等待检测...',
    checking: false,
  }) as T;

/*
 * 后端服务：探测真实的上游接口（/api/v0/* 会由本站代理转发到 VITE_API_TARGET）。
 * 之前用的是 /api/v0/charts/rating 这个本地桩，只要本站进程活着就一定「在线」，
 * 上游挂了也发现不了，所以换成真正会打到上游的 market_info。
 */
const services = ref<ServiceProbe[]>([
  createProbe<ServiceProbe>({
    key: 'api',
    name: 'API 服务',
    env: 'VITE_API_TARGET',
    probePath: '/api/v0/market_info',
  }),
]);

/*
 * 页面接口：每个页面挑一个「打不开时一定出问题」的接口。
 * 全部用无参数的 GET，且尽量带上 page_size / limit 把响应体压到最小，
 * 避免监控本身变成流量负担。
 */
const pages = ref<PageProbe[]>([
  createProbe<PageProbe>({
    key: 'home',
    name: '探索',
    route: '/',
    probePath: '/api/public/site-cards?page=home',
  }),
  createProbe<PageProbe>({
    key: 'apps',
    name: '应用',
    route: '/apps',
    probePath: '/api/public/apps/overview',
  }),
  createProbe<PageProbe>({
    key: 'topics',
    name: '专题',
    route: '/topics',
    probePath: '/api/v0/substance/list/1?page_size=1',
  }),
  createProbe<PageProbe>({
    key: 'updates',
    name: '更新',
    route: '/updates',
    probePath: '/api/v0/apps/list/1?page_size=1&detail=false',
  }),
  createProbe<PageProbe>({
    key: 'rank',
    name: '榜单',
    route: '/rank/total',
    probePath: '/api/v0/rankings/download_increase',
  }),
  createProbe<PageProbe>({
    key: 'articles',
    name: '文章',
    route: '/articles',
    probePath: '/api/public/blogs?limit=1',
  }),
  createProbe<PageProbe>({
    key: 'about',
    name: '关于',
    route: '/about',
    probePath: '/api/about',
  }),
]);

const allProbes = computed<Probe[]>(() => [...services.value, ...pages.value]);

const totalServices = computed(() => services.value.length);
const onlineServices = computed(() => services.value.filter((s) => s.online).length);
const totalPages = computed(() => pages.value.length);
const okPages = computed(() => pages.value.filter((p) => p.online).length);

const isSystemHealthy = computed(
  () => onlineServices.value === totalServices.value && okPages.value === totalPages.value
);
const isCheckingAny = computed(() => allProbes.value.some((p) => p.checking));

const avgLatency = computed(() => {
  const online = allProbes.value.filter((p) => p.online && p.latency > 0);
  if (!online.length) return null;
  return Math.round(online.reduce((sum, p) => sum + p.latency, 0) / online.length);
});

const secondsToNextCheck = ref(AUTO_INTERVAL);

/** 响应时间档位：探测的是真实上游，阈值给宽一些 */
const latencyTone = (latency: number, online = true) => {
  if (!latency || !online) return 'is-idle';
  if (latency < 400) return 'is-good';
  if (latency < 900) return 'is-warn';
  return 'is-bad';
};

const latencyLabel = (latency: number, online = true) => {
  if (!online) return '连接失败';
  if (!latency) return '等待检测';
  if (latency < 150) return '极速';
  if (latency < 400) return '良好';
  if (latency < 900) return '一般';
  return '偏慢';
};

const goPage = (route: string) => {
  router.push(route);
};

const checkProbe = async (probe: Probe) => {
  probe.checking = true;
  probe.statusText = '正在检测...';

  const startTime = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const response = await fetch(probe.probePath, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const duration = Math.round(performance.now() - startTime);

    if (response.ok) {
      probe.online = true;
      probe.latency = duration;
      probe.statusText = '连接正常';
    } else {
      // 非 2xx 也不一定代表服务挂了，只有 5xx 才判定为异常
      probe.online = response.status < 500;
      probe.statusText = `状态异常: ${response.status}`;
      probe.latency = probe.online ? duration : 0;
    }
  } catch (error) {
    probe.online = false;
    probe.latency = 0;
    probe.statusText = '连接失败: ' + (error instanceof Error ? error.message : '未知错误');
  } finally {
    probe.lastCheck = dayjs().format('YYYY-MM-DD HH:mm:ss');
    probe.checking = false;
  }
};

const resetCountdown = () => {
  secondsToNextCheck.value = AUTO_INTERVAL;
};

const runAllChecks = async () => {
  resetCountdown();
  await Promise.all(allProbes.value.map((probe) => checkProbe(probe)));
};

const checkSingle = async (probe: Probe) => {
  resetCountdown();
  await checkProbe(probe);
};
let autoCheckTimer: number | null = null;
let countdownTimer: number | null = null;

/**
 * 自动探测只在本页可见时跑：页面在 keep-alive 里不会卸载，
 * 不停的话切走后每 30 秒还会把探针打到上游。切走停、切回重启。
 */
const startAutoCheck = () => {
  // 切回来重新计时，免得显示一个在后台早就停走的倒计时
  resetCountdown();
  if (autoCheckTimer === null) {
    autoCheckTimer = window.setInterval(() => {
      void runAllChecks();
    }, AUTO_INTERVAL * 1000);
  }
  if (countdownTimer === null) {
    countdownTimer = window.setInterval(() => {
      if (secondsToNextCheck.value > 0) secondsToNextCheck.value -= 1;
    }, 1000);
  }
};

const stopAutoCheck = () => {
  if (autoCheckTimer !== null) {
    window.clearInterval(autoCheckTimer);
    autoCheckTimer = null;
  }
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
};

onMounted(() => {
  runAllChecks();
});

useActiveScope(startAutoCheck, stopAutoCheck);
</script>

<style scoped>
.status-view {
  max-width: 1080px;
  margin: 0 auto;
  padding: 8px 20px 24px;
  animation: fadeIn 0.4s ease-out;
}

/* ---------- 总览 ---------- */
.overview {
  --accent: var(--el-color-success);
  position: relative;
  padding: 20px 22px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  background-color: var(--el-bg-color);
  background-image: radial-gradient(
    130% 150% at 100% -30%,
    color-mix(in srgb, var(--el-color-primary) 10%, transparent),
    transparent 62%
  );
  box-shadow: var(--el-box-shadow-light);
  overflow: hidden;
}

.overview.is-degraded {
  --accent: var(--el-color-danger);
}

.overview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.overview-status {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.status-orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(
    140deg,
    color-mix(in srgb, var(--accent) 78%, #fff),
    var(--accent)
  );
  box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 32%, transparent);
}

.status-orb.is-pulsing::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  animation: orb-pulse 2.4s ease-out infinite;
}

@keyframes orb-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 42%, transparent);
  }
  70% {
    box-shadow: 0 0 0 14px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.overview-text {
  min-width: 0;
}

.overview-title {
  margin: 0;
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--el-text-color-primary);
}

.overview-sub {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.overview-refresh {
  flex-shrink: 0;
}

.overview-metrics {
  display: grid;
  /* 104px 起，320px 那种窄屏也能排成两列，不至于四个指标摞成一条 */
  grid-template-columns: repeat(auto-fit, minmax(min(104px, 100%), 1fr));
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--el-border-color-light);
}

.ov-metric {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ov-label {
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--el-text-color-secondary);
}

.ov-value {
  display: flex;
  align-items: baseline;
  gap: 3px;
  line-height: 1;
}

.ov-value strong {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.ov-value em {
  font-style: normal;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* ---------- 服务卡片 ---------- */
.service-grid {
  display: grid;
  /* 服务数量会变：1 个时整行铺满，多个时在够宽的情况下自动分列 */
  grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
  gap: 16px;
  margin-top: 16px;
}

.service-card {
  --accent: var(--el-color-success);
  display: flex;
  flex-direction: column;
  padding: 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background-color: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.service-card:hover {
  border-color: var(--el-border-color);
  box-shadow: var(--el-box-shadow);
}

.service-card.is-offline {
  --accent: var(--el-color-danger);
}

.service-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.service-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.service-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.service-names {
  min-width: 0;
}

.service-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.service-env {
  display: inline-block;
  margin-top: 3px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-light);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.status-pill.is-online {
  color: var(--el-color-success);
  background-color: color-mix(in srgb, var(--el-color-success) 12%, transparent);
}

.status-pill.is-offline {
  color: var(--el-color-danger);
  background-color: color-mix(in srgb, var(--el-color-danger) 12%, transparent);
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent);
}

.service-metrics {
  display: grid;
  /* 和总览、页面列表同一套写法：列数由可用宽度决定，不做「到某个断点才变」的硬切换 */
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: 12px;
  margin-top: 16px;
}

.metric {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-extra-light);
  border-radius: 12px;
  background-color: var(--el-fill-color-lighter);
}

.metric-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.metric-figure {
  display: flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1;
}

.figure-num {
  font-size: 24px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.figure-unit {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.latency-tag {
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  /* 颜色跟随 .metric-figure 上的档位色（currentColor），和数字保持同一色系 */
  background-color: color-mix(in srgb, currentColor 14%, transparent);
}

.metric-time {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-main {
  font-size: 20px;
  font-weight: 650;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.time-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.is-good {
  color: var(--el-color-success);
}

.is-warn {
  color: var(--el-color-warning);
}

.is-bad {
  color: var(--el-color-danger);
}

.is-idle {
  color: var(--el-text-color-secondary);
}

.service-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.service-state {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12.5px;
}

.state-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background-color: currentColor;
}

/* ---------- 页面接口 ---------- */
.page-checks {
  margin-top: 16px;
  padding: 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background-color: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background-color: color-mix(in srgb, currentColor 12%, transparent);
}

.page-list {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  /*
   * 行内是「页面名 → 耗时 → 状态 → 检测」的横向结构，
   * 单列铺满宽屏时中间会空出一大段，所以按可用宽度自动分列：
   * 窄屏一列，宽屏两到三列，每行宽度始终贴近内容宽度。
   */
  display: grid;
  /* 360px 是下面一行「圆点+页面名+耗时+状态+检测」排得下且不挤压的最小宽度 */
  grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
  gap: 8px;
}

.page-row {
  display: grid;
  /*
   * 各列都给定宽：每一行是独立的网格，用 max-content 的话「榜单 /rank/total」
   * 这类长内容会把列撑开，行与行之间的「检测」就错位，窄的时候还会顶出容器。
   */
  grid-template-columns: 8px 116px minmax(0, 1fr) 60px 76px 34px;
  grid-template-areas: 'dot label . latency state action';
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: var(--el-fill-color-lighter);
  transition: background-color 0.16s ease;
}

.page-row:hover {
  background-color: var(--el-fill-color-light);
}

.page-row.is-offline {
  background-color: color-mix(in srgb, var(--el-color-danger) 8%, transparent);
}

.row-dot {
  grid-area: dot;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
}

.page-label {
  grid-area: label;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.page-name {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.16s ease;
}

.page-name:hover {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.page-route {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--el-text-color-secondary);
  background-color: var(--el-bg-color);
}

.page-latency {
  grid-area: latency;
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.page-state {
  grid-area: state;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.row-action {
  grid-area: action;
  justify-self: end;
  padding: 0;
  height: auto;
  font-size: 12.5px;
  color: var(--el-color-primary);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 810px) {
  /* 窄屏：状态与耗时各占一行，避免被压成省略号 */
  .page-row {
    grid-template-columns: 8px minmax(0, 1fr) auto;
    grid-template-areas:
      'dot label action'
      'dot state latency';
    row-gap: 6px;
  }
}

@media (max-width: 640px) {
  .status-view {
    padding: 4px 12px 20px;
  }

  .overview {
    padding: 16px;
    border-radius: 14px;
  }

  .overview-title {
    font-size: 17px;
  }

  .status-orb {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }

  .overview-metrics {
    gap: 8px;
  }

  .ov-value strong {
    font-size: 19px;
  }

  .service-card,
  .page-checks {
    padding: 15px;
    border-radius: 14px;
  }
}

@media (max-width: 560px) {
  /* 两张卡片的操作按钮在这里一起变成整行，避免一张整行、一张还挂在右边 */
  .overview-head {
    align-items: stretch;
  }

  .overview-refresh {
    width: 100%;
  }

  .service-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .service-foot .el-button {
    width: 100%;
  }
}
</style>
