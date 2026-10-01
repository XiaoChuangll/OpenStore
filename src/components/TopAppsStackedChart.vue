<template>
  <el-card class="chart-card stacked-rank-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <!-- 标题可点：和下面那张经典图表卡一样，点了进对应榜单页 -->
          <span
            class="title"
            :class="{ 'title-link': route.path !== rankPath }"
            @click="goToRank"
          >
            {{ title }}
          </span>
        </div>
        <div class="controls">
          <el-select v-model="topN" size="small" :style="{ width: selectWidthOf(TOP_N_LABELS) }" @change="load">
            <el-option label="Top 6" :value="6" />
            <el-option label="Top 8" :value="8" />
            <el-option label="Top 10" :value="10" />
          </el-select>
          <el-select v-model="days" size="small" :style="{ width: selectWidthOf(DAY_LABELS) }" @change="load">
            <el-option label="14 天" :value="14" />
            <el-option label="30 天" :value="30" />
            <el-option label="60 天" :value="60" />
          </el-select>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="stacked-body">
      <div ref="chartRef" class="stacked-chart"></div>

      <!-- 名次清单默认折叠：卡片主体留给图，需要明细再展开（展开/收起带高度补间） -->
      <button
        v-if="rows.length"
        ref="listToggleRef"
        type="button"
        class="rank-toggle"
        :aria-expanded="listOpen"
        @click="toggleList"
      >
        <el-icon class="rank-toggle-caret">
          <ArrowDown v-if="listOpen" />
          <ArrowRight v-else />
        </el-icon>
        <span>名次清单</span>
        <span class="rank-toggle-count">{{ rows.length }} 条</span>
        <span class="rank-toggle-hint">{{ listOpen ? '收起' : '展开' }}</span>
      </button>

      <!--
        只有清单本身进"裁剪容器"（高度补间靠它）。
        上面的按钮刻意留在外面：放在容器里的话，补间期间它会被一起裁掉，
        它的位置会先跳到终点、再被滚动补偿追回来 —— 就是"展开不跟随、折叠顿一下"的成因。
      -->
      <div ref="listWrapRef">
        <ol v-if="rows.length" v-show="listOpen" class="rank-list">
        <li v-for="(row, index) in rows" :key="row.pkg" class="rank-row" @click="goToApp(row)">
          <span class="rank-no">{{ String(index + 1).padStart(2, '0') }}</span>
          <!-- 前面这枚小图标：加载不出来时退回同色色块，颜色仍和图表一一对应 -->
          <el-image :src="row.icon" class="rank-icon-sm" fit="cover">
            <template #error>
              <span class="rank-icon-sm-fallback" :style="{ backgroundColor: row.color }"></span>
            </template>
          </el-image>
          <span class="rank-name" :title="row.developer ? `${row.name} · ${row.developer}` : row.name">
            {{ row.name }}
          </span>
          <span class="rank-total">{{ formatCompact(row.total) }}</span>
            <span class="rank-change" :class="row.change >= 0 ? 'is-up' : 'is-down'">
              {{ row.change >= 0 ? '↑' : '↓' }}{{ Math.abs(row.change).toFixed(1) }}%
            </span>
          </li>
        </ol>
      </div>
      <!-- 注意这里是独立条件，不能跟着上面的 v-if 走：清单折叠时 rows 仍然有值，
           用 v-else-if 会在收起状态下误显示"暂无历史数据" -->
      <el-empty v-if="!loading && !rows.length" description="暂无历史数据" :image-size="70" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 榜单的「堆叠用量图」：取下载量最高的几个应用，按天算下载增量，
 * 一条一个颜色堆起来看谁在涨；下面配一份带名次 / 总量 / 变化率的清单。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { animateHeightChange } from '../utils/collapse-animate';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { hmApi } from '../services/hm-api';
import { selectWidthOf } from '../utils/select-width';

/** 下拉框宽度按「最长的那条选项」算 */
const TOP_N_LABELS = ['Top 6', 'Top 8', 'Top 10'];
const DAY_LABELS = ['14 天', '30 天', '60 天'];

const router = useRouter();
const route = useRoute();
const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
/** 上一次渲染时的容器尺寸：尺寸没变就不重复 resize */
let lastChartW = 0;
let lastChartH = 0;

/*
 * 同一套组件给四个榜单页签复用：
 * - title：卡片标题（各页签写自己的说法）
 * - rankBy=growth：清单按涨幅从高到低排（“增长对比”页签）
 * - excludeHuawei：候选人里先剔掉华为系应用（“非华为应用下载榜”页签）
 * - mode：increment=每天新增下载（总榜 / 增长对比 / 非华为）
 *         cumulative=累计下载量（“下载量历史”页签，看长期走势）
 */
const props = withDefaults(
  defineProps<{
    title?: string;
    rankBy?: 'total' | 'growth';
    excludeHuawei?: boolean;
    mode?: 'increment' | 'cumulative';
    /** 默认看多少天（累计口径默认给 60 天，走势才看得出来） */
    defaultDays?: number;
  }>(),
  {
    title: '热门应用用量',
    rankBy: 'total',
    excludeHuawei: false,
    mode: 'increment',
    defaultDays: 30
  }
);

const loading = ref(false);
const topN = ref(8);
const days = ref(props.defaultDays);

interface RankRow {
  appId: string;
  pkg: string;
  name: string;
  developer: string;
  icon: string;
  total: number;
  change: number;
  color: string;
  values: number[];
}

const rows = ref<RankRow[]>([]);
/** 名次清单默认收起：先看图，需要看明细再展开 */
const listOpen = ref(false);
/** 清单容器：折叠时给它做高度补间 */
const listWrapRef = ref<HTMLElement | null>(null);
/** 折叠按钮：动画期间用它当"视角锚点" */
const listToggleRef = ref<HTMLElement | null>(null);
const toggleList = () => {
  void animateHeightChange(
    listWrapRef.value,
    () => {
      listOpen.value = !listOpen.value;
    },
    listToggleRef.value
  );
};
const dates = ref<string[]>([]);

/** 参考色板：每个应用一条，够区分又不刺眼 */
const PALETTE = [
  '#5B8FF9', '#61DDAA', '#F6BD16', '#7262FD', '#78D3F8',
  '#9661BC', '#F6903D', '#008685', '#F08BB4', '#6DC8EC'
];

const toDateKey = (value: unknown) => {
  if (!value) return '';
  const raw = String(value);
  // 上游给的是 2026-09-26T13:31:36.444068+08:00 这种，直接取日期部分最稳
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matched) return `${matched[1]}-${matched[2]}-${matched[3]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const recentDates = (count: number) => {
  const list: string[] = [];
  const base = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const pad = (n: number) => String(n).padStart(2, '0');
    list.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return list;
};

const formatCompact = (value: number) => {
  const n = Number(value) || 0;
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString();
};

const normalizeList = (response: any) => {
  const payload = response?.data ?? response;
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return list.map((item: any) => item?.info || item);
};

/** 华为系应用：包名带 huawei、或开发者写的是华为 */
const isHuaweiApp = (app: any) => {
  const pkg = String(app?.pkg_name || '');
  const dev = String(app?.developer_name || app?.supplier || '');
  return /huawei/i.test(pkg) || /华为/.test(dev);
};

/** 一个应用的历史 → 每天最后一次快照，再换算成「当天新增下载」 */
const buildDailyIncrements = (raw: any, window: string[]) => {
  const payload = raw?.data ?? raw;
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const byDay = new Map<string, number>();
  list.forEach((item: any) => {
    const key = toDateKey(item?.created_at ?? item?.timestamp ?? item?.time);
    const count = Number(item?.download_count ?? item?.downloads);
    if (!key || !Number.isFinite(count)) return;
    const prev = byDay.get(key);
    // 同一天多条：保留最新的（接口是倒序，第一条就是当天最新，取较大值更稳）
    byDay.set(key, prev === undefined ? count : Math.max(prev, count));
  });

  const sorted = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const incrementByDay = new Map<string, number>();
  for (let i = 1; i < sorted.length; i += 1) {
    const [day, count] = sorted[i];
    const diff = count - sorted[i - 1][1];
    if (diff > 0) incrementByDay.set(day, diff);
  }
  return window.map((day) => incrementByDay.get(day) || 0);
};

/**
 * 累计模式：取每天最后一次快照的累计下载量，中间没有采集到的日子用上一个值顺延，
 * 这样每一列都是「到那天为止的累计」，能看出长期走势。
 */
const buildDailyCumulative = (raw: any, window: string[]) => {
  const payload = raw?.data ?? raw;
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const byDay = new Map<string, number>();
  list.forEach((item: any) => {
    const key = toDateKey(item?.created_at ?? item?.timestamp ?? item?.time);
    const count = Number(item?.download_count ?? item?.downloads);
    if (!key || !Number.isFinite(count)) return;
    const prev = byDay.get(key);
    byDay.set(key, prev === undefined ? count : Math.max(prev, count));
  });

  const sorted = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let cursor = 0;
  let current = 0;
  return window.map((day) => {
    while (cursor < sorted.length && sorted[cursor][0] <= day) {
      current = sorted[cursor][1];
      cursor += 1;
    }
    return current;
  });
};

/** 后半段增量 vs 前半段增量，用来给清单里的涨跌幅 */
const changeOfPeriod = (values: number[]) => {
  if (values.length < 4) return 0;
  const half = Math.floor(values.length / 2);
  const sum = (arr: number[]) => arr.reduce((acc, n) => acc + n, 0);
  const older = sum(values.slice(0, half));
  const recent = sum(values.slice(half));
  if (older <= 0) return recent > 0 ? 100 : 0;
  return ((recent - older) / older) * 100;
};

/** 累计模式下的涨跌：窗口最后一天 vs 第一天 */
const changeOfCumulative = (values: number[]) => {
  const first = values.find((v) => v > 0) || 0;
  const last = values[values.length - 1] || 0;
  if (first <= 0) return last > 0 ? 100 : 0;
  return ((last - first) / first) * 100;
};

const renderChart = () => {
  const el = chartRef.value;
  // 容器还没布局好（隐藏的页签里 clientWidth/Height 是 0）就先不画，
  // 等 ResizeObserver 拿到真实尺寸再补画，避免画成一小团
  if (!el || !el.clientWidth || !el.clientHeight) return;
  if (!chart) chart = echarts.init(el);

  /*
   * 某一天一条数据都没有时（上游那天没采集），画一根虚线空柱当骨架，
   * 这样整排柱子不会出现一个突兀的空缺（参考页就是这么处理的）。
   */
  const dayTotals = dates.value.map((_, index) =>
    rows.value.reduce((sum, row) => sum + (row.values[index] || 0), 0)
  );
  const maxStack = Math.max(1, ...dayTotals);
  const skeletonData = dayTotals.map((total) => (total > 0 ? null : maxStack));

  chart.setOption(
    {
      // 图里不放图例：下面的清单就是图例（每行带同色小方块），整块看起来是一件东西
      grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        textStyle: { fontSize: 12 },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
          const day = list[0]?.axisValue ?? '';
          const body = list
            .filter((p: any) => Number(p.value) > 0)
            .sort((a: any, b: any) => Number(b.value) - Number(a.value))
            .map((p: any) => `${p.marker}${p.seriesName}：${formatCompact(Number(p.value))}`)
            .join('<br/>');
          return `<strong>${day}</strong><br/>${body || '无新增'}`;
        }
      },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: dates.value,
        axisTick: { show: false },
        axisLabel: {
          fontSize: 10,
          color: '#94a3b8',
          formatter: (value: string) => value.slice(5).replace('-', '/')
        }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { opacity: 0.15 } },
        axisLabel: { fontSize: 10, color: '#94a3b8', formatter: (v: number) => formatCompact(v) }
      },
      series: [
        ...rows.value.map((row) => ({
          name: row.name,
          type: 'bar',
          stack: 'download',
          barMaxWidth: 26,
          itemStyle: { color: row.color },
          emphasis: { focus: 'series' },
          data: row.values
        })),
        {
          name: '暂无数据',
          type: 'bar',
          // 和堆叠柱同一列：负间距把它压到堆叠柱上
          barGap: '-100%',
          barMaxWidth: 26,
          silent: true,
          z: 3,
          tooltip: { show: false },
          itemStyle: {
            color: 'transparent',
            borderColor: 'rgba(148, 163, 184, 0.55)',
            borderWidth: 1,
            borderType: 'dashed'
          },
          data: skeletonData
        }
      ]
    },
    true
  );
  lastChartW = el.clientWidth;
  lastChartH = el.clientHeight;
};

const load = async () => {
  loading.value = true;
  try {
    const window = recentDates(days.value);
    const listResponse = await hmApi.get<any>('/apps/list/1', {
      // 多取两条：列表里偶尔有缺 pkg_name 的脏数据，裁掉后仍要凑够 topN
      // 非华为榜要先剔掉华为系应用，所以候选人取多得多
      page_size: props.excludeHuawei ? 60 : topN.value + 4,
      sort: 'download_count',
      desc: true,
      // 这里确实要用到总量 / 开发者 / 图标，所以取详细字段
      detail: true
    });
    let apps = normalizeList(listResponse).filter((app: any) => app?.pkg_name);
    if (props.excludeHuawei) apps = apps.filter((app: any) => !isHuaweiApp(app));
    apps = apps.slice(0, topN.value);

    const metricsResponses = await Promise.all(
      apps.map((app: any) =>
        hmApi.get<any>(`/apps/metrics/${encodeURIComponent(app.pkg_name)}`).catch(() => null)
      )
    );

    dates.value = window;
    rows.value = apps.map((app: any, index: number) => {
      const values =
        props.mode === 'cumulative'
          ? buildDailyCumulative(metricsResponses[index], window)
          : buildDailyIncrements(metricsResponses[index], window);
      return {
        appId: app.app_id || app.id || '',
        pkg: app.pkg_name,
        name: app.name || app.pkg_name,
        developer: app.developer_name || app.supplier || '',
        icon: app.icon_url || app.icon || '',
        total: Number(app.download_count) || 0,
        change: props.mode === 'cumulative' ? changeOfCumulative(values) : changeOfPeriod(values),
        color: PALETTE[index % PALETTE.length],
        values
      };
    });
    // 「增长对比」页签：清单按涨幅排，谁涨得快谁在前面
    if (props.rankBy === 'growth') {
      rows.value = [...rows.value].sort((a, b) => b.change - a.change);
    }
    renderChart();
  } catch (error) {
    console.error('Failed to build stacked rank chart:', error);
    rows.value = [];
    dates.value = [];
    renderChart();
  } finally {
    loading.value = false;
  }
};

const goToApp = (row: RankRow) => {
  // 详情页路由吃的是 app_id（C 开头那个），不是包名
  const target = row.appId || row.pkg;
  if (!target) return;
  router.push({ path: `/apps/${encodeURIComponent(target)}`, query: { title: row.name } });
};

/** 这张卡对应哪个榜单页：按 mode / rankBy / excludeHuawei 推出来 */
const rankPath = computed(() => {
  if (props.mode === 'cumulative') return '/rank/history';
  if (props.excludeHuawei) return '/rank/non-huawei';
  if (props.rankBy === 'growth') return '/rank/growth';
  return '/rank/total';
});

const goToRank = () => {
  if (route.path !== rankPath.value) router.push(rankPath.value);
};

const handleResize = () => {
  const el = chartRef.value;
  if (!el || !el.clientWidth || !el.clientHeight) return;
  // 之前在隐藏容器里没画成的，这时补一次完整渲染
  if (!chart) {
    renderChart();
    return;
  }
  if (el.clientWidth === lastChartW && el.clientHeight === lastChartH) return;
  lastChartW = el.clientWidth;
  lastChartH = el.clientHeight;
  chart.resize();
};

let chartObserver: ResizeObserver | null = null;

onMounted(() => {
  load();
  window.addEventListener('resize', handleResize);
  // 首页「榜单排行」是懒加载的页签：组件可能在容器还没拿到宽度时挂载，
  // 靠这个观察器在尺寸就绪后补画 / 重排
  if (typeof ResizeObserver !== 'undefined' && chartRef.value) {
    chartObserver = new ResizeObserver(() => handleResize());
    chartObserver.observe(chartRef.value);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  chartObserver?.disconnect();
  chartObserver = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
/* 卡片头：标题在左、两个下拉在右，同一行 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 标题可点：平时正常颜色，悬停变主题色 */
.title-link {
  cursor: pointer;
  transition: color 0.2s ease;
}

.title-link:hover {
  color: var(--el-color-primary);
}

.stacked-body {
  display: flex;
  flex-direction: column;
  /*
   * 不用 gap：折叠时下面那个列表容器是空的，但作为 flex 子元素仍会占一份 gap，
   * 结果开关底下凭空多出 14px、看着贴在横线上。改成给图表加下边距，
   * 间距该有的一样有，空容器不再凭空占位。
   */
  gap: 0;
}

.stacked-chart {
  width: 100%;
  height: 280px;
  margin-bottom: 14px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/*
  名次清单：参考开源数据页的写法 ——
  宽屏排成多列（每列都是 名次 + 色块 + 名称 + 总量 + 涨跌 的单行），窄屏自动落回单列。
*/
.rank-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  column-gap: 28px;
  margin: 0;
  padding: 0;
  list-style: none;
  /* 不画分隔线：图 + 清单是一整块 */
}

/* 名次清单的折叠开关：一条轻量的整行按钮，不抢图的注意力 */
.stacked-rank-card :deep(.el-card__body) {
  /*
   * 开关是这张卡的"页脚"：卡片自身不要再留底部内边距。
   * 否则横线下面会有三十来 px 空白，文字看着就贴在横线上、而不是"下方这块区域"的中间。
   */
  padding-bottom: 0;
}

.rank-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  /* 上下各留一点呼吸感（对称，保持居中） */
  padding: 9px 2px;
  border: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 12px;
  /* 行高按字体算：默认的 normal 会让文字比图标低 2px，看着就是"不居中" */
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
}

.rank-toggle > span {
  line-height: 1;
}

.rank-toggle:hover {
  color: var(--el-color-primary);
}

.rank-toggle-caret {
  font-size: 12px;
}

.rank-toggle-count {
  color: var(--el-text-color-placeholder);
}

.rank-toggle-hint {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}

.rank-row {
  display: grid;
  grid-template-columns: 26px 16px minmax(0, 1fr) auto 54px;
  align-items: center;
  gap: 8px;
  padding: 9px 2px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.rank-row:hover {
  background: var(--el-fill-color-light);
}

.rank-no {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}

/* 名次后面这枚小图标：占位和原来的色块差不多，加载失败时退回同色块 */
.rank-icon-sm {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--el-fill-color-light);
}

.rank-icon-sm-fallback {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
}

.rank-name {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-total {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-regular);
}

.rank-change {
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.rank-change.is-up {
  color: var(--el-color-success);
}

.rank-change.is-down {
  color: var(--el-color-danger);
}

@media (max-width: 768px) {
  .stacked-chart {
    height: 220px;
  }

  .rank-row {
    grid-template-columns: 22px 16px minmax(0, 1fr) auto 50px;
    gap: 8px;
    padding: 8px 2px;
  }
}
</style>
