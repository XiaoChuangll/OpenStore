<template>
  <el-card
    class="topology-card"
    :class="{ 'is-health-mode': healthMode === 'health' }"
    shadow="hover"
    v-loading="loading"
  >
    <template #header>
      <div class="topology-header">
        <div class="topology-title">
          <span>调用拓扑</span>
          <span class="topology-sub">近 {{ windowLabel }} · {{ totals.requests }} 次请求</span>
        </div>
        <!-- 卡片不够宽时，「接口健康 Top」收进标题栏按钮：点一下在内容区切换视图 -->
        <el-button class="health-trigger" size="small" :icon="healthMode === 'chart' ? DataLine : List" @click="toggleHealthView">
          {{ healthMode === 'chart' ? '接口健康' : '返回拓扑' }}
        </el-button>
      </div>
    </template>

    <div class="topology-body">
      <!-- 宽卡片：接口健康 Top 占内容区左侧一栏 -->
      <aside v-if="hasData" class="health-panel">
        <div class="health-head">
          <span>接口健康 Top {{ healthRows.length }}</span>
          <span class="health-hint">错误 / 慢请求 / 耗时</span>
        </div>
        <ul class="health-list">
          <li v-for="row in healthRows" :key="row.id" class="health-item">
            <i class="health-dot" :style="{ backgroundColor: row.color }"></i>
            <span class="health-path" :title="row.name">{{ row.shortPath }}</span>
            <span class="health-metrics">
              <span>{{ row.avgMs }}ms</span>
              <span v-if="row.slow" class="is-slow">{{ row.slow }} 慢</span>
              <span v-if="row.errors" class="is-error">{{ row.errors }} 错</span>
            </span>
          </li>
        </ul>
      </aside>

      <div class="topology-main">
        <!-- 图例：内容区顶部居中（宽卡片下居中于图表这一列） -->
        <div class="topology-legend">
          <span class="legend-item"><i class="legend-dot is-frontend"></i>前端</span>
          <span class="legend-item"><i class="legend-dot is-api"></i>后端接口</span>
          <span class="legend-item"><i class="legend-dot is-upstream"></i>上游</span>
          <span v-if="totals.errors" class="legend-item is-danger">
            <i class="legend-dot is-error"></i>{{ totals.errors }} 个 5xx
          </span>
          <span v-if="totals.slow" class="legend-item is-warning">
            <i class="legend-dot is-slow"></i>{{ totals.slow }} 个慢请求
          </span>
        </div>

        <div v-show="hasData" ref="chartRef" class="topology-chart"></div>

        <!-- 窄卡片下点按钮后，接口健康直接在内容区替换掉拓扑图 -->
        <div v-if="hasData" class="health-view">
          <div class="health-head">
            <span>接口健康 Top {{ healthRows.length }}</span>
            <span class="health-hint">错误 / 慢请求 / 耗时</span>
          </div>
          <ul class="health-list health-list--roomy">
            <li v-for="row in healthRows" :key="row.id" class="health-item">
              <i class="health-dot" :style="{ backgroundColor: row.color }"></i>
              <span class="health-path" :title="row.name">{{ row.name }}</span>
              <span class="health-metrics">
                <span>{{ row.count }} 次 · 均 {{ row.avgMs }}ms</span>
                <span v-if="row.slow" class="is-slow">{{ row.slow }} 慢</span>
                <span v-if="row.errors" class="is-error">{{ row.errors }} 错</span>
              </span>
            </li>
          </ul>
        </div>

        <p v-if="!hasData" class="topology-empty">近 {{ windowLabel }}没有请求记录，等有流量后再看</p>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, nextTick, reactive } from 'vue';
import * as echarts from 'echarts';
import { DataLine, List } from '@element-plus/icons-vue';
import { getTopology, type TopologyData } from '../services/admin';

const REFRESH_MS = 15000;

const chartRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const data = ref<TopologyData | null>(null);
// 窄卡片下的内容区视图：默认拓扑图，点标题栏按钮切成接口健康列表
const healthMode = ref<'chart' | 'health'>('chart');
const toggleHealthView = () => {
  healthMode.value = healthMode.value === 'chart' ? 'health' : 'chart';
};
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let timer: number | null = null;
let resizeTimer: number | null = null;

// 画布实际尺寸：布局坐标按它来算，窗口缩放时重新排布
const chartSize = reactive({ width: 0, height: 0 });

const totals = computed(
  () => data.value?.totals || { requests: 0, errors: 0, slow: 0, cacheBuilds: 0, upstreamErrors: 0 }
);
const hasData = computed(
  () => (data.value?.apiNodes?.length || 0) > 0 || (data.value?.upstreamProxy?.count || 0) > 0
);
const windowLabel = computed(() => {
  const seconds = data.value?.windowSeconds || 300;
  return seconds >= 60 ? `${Math.round(seconds / 60)} 分钟` : `${seconds} 秒`;
});

const nodeColor = (node: { errors: number; slow: number; avgMs: number }) => {
  if (node.errors > 0) return '#d9534f';
  if (node.slow > 0 || node.avgMs >= 300) return '#c88a2e';
  return '#4f86f7';
};

/*
 * 接口健康 Top：按「错误 → 慢请求 → 平均耗时」加权排序，取前 10。
 * 数据就是拓扑节点本身（同一份 /api/admin/topology 结果），不额外请求。
 */
const healthRows = computed(() => {
  const nodes = [...(data.value?.apiNodes || [])];
  return nodes
    .sort((a, b) => b.errors * 1000 + b.slow * 100 + b.avgMs - (a.errors * 1000 + a.slow * 100 + a.avgMs))
    .slice(0, 10)
    .map((node) => ({
      ...node,
      color: nodeColor(node),
      // 窄栏里去掉 /api/ 前缀更好读，完整路径放在 title 里
      shortPath: node.name.replace(/^\/api\//, '')
    }));
});

const buildOption = (payload: TopologyData): echarts.EChartsOption => {
  const apiNodes = payload.apiNodes;
  const proxyNode = payload.upstreamProxy;
  const total = Math.max(1, payload.totals.requests);

  // 坐标按容器实际尺寸算：窗口变窄时自动压缩横向间距、缩小字号、把上游标签挪到节点下方，
  // 避免「上游 API」节点和它的说明被画布右边缘截断（原来三列坐标是写死的 70 / 400 / 780）。
  const W = Math.max(320, Math.round(chartSize.width || 800));
  const H = Math.max(240, Math.round(chartSize.height || 380));
  const compact = W < 640;

  const frontendX = Math.max(30, Math.round(W * 0.05));
  // 「上游 API」也放左侧：和「前端」同列，标签朝右展开（右侧留出标签宽度即可）
  const upstreamX = frontendX;
  const apiX = compact
    ? Math.round(W * 0.46)
    : Math.round(Math.max(frontendX + 170, Math.min(W * 0.44, W - 260)));

  const rowCount = apiNodes.length + (proxyNode ? 1 : 0);
  // 行距随高度自适应，整体垂直居中，行数多时不会超出画布
  const apiGap = Math.max(28, Math.min(compact ? 40 : 48, (H - 72) / Math.max(1, rowCount - 1)));
  const apiTop = Math.max(22, (H - (rowCount - 1) * apiGap) / 2);

  const titleFont = compact ? 10 : 11;
  const labelFont = compact ? 9 : 10;
  const labelDist = compact ? 5 : 7;
  const titleLineHeight = compact ? 12 : 14;
  const labelLineHeight = compact ? 11 : 13;

  /*
   * 左侧两个球（前端 / 上游 API）的纵向位置：
   * 以接口列表的垂直中线为基准上下对称分布，整体不会被压到画布下半部分；
   * 再稍微上抬一点，避开顶部图例占用的空间。
   */
  const leftCenterY = apiTop + ((rowCount - 1) * apiGap) / 2;
  const leftSpread = Math.max(34, Math.round(((rowCount - 1) * apiGap) / 4));
  const leftLift = Math.round(apiGap * 0.2);
  const frontendY = leftCenterY - leftSpread - leftLift;

  const nodes: any[] = [
    {
      id: 'frontend',
      name: `前端\n${payload.totals.requests} 次`,
      x: frontendX,
      y: frontendY,
      symbolSize: 46,
      itemStyle: { color: '#64748b' },
      label: { show: true, position: 'bottom', distance: 8, color: '#e2e8f0', fontSize: titleFont, lineHeight: titleLineHeight }
    }
  ];
  const links: any[] = [];

  apiNodes.forEach((node, index) => {
    const y = apiTop + index * apiGap;
    const size = 14 + Math.min(20, (node.count / total) * 60);
    nodes.push({
      id: node.id,
      name: `${node.name}\n${node.count} 次 · 均 ${node.avgMs}ms`,
      x: apiX,
      y,
      symbolSize: size,
      itemStyle: { color: nodeColor(node) },
      label: { show: true, position: 'right', distance: labelDist, align: 'left', color: '#94a3b8', fontSize: labelFont, lineHeight: labelLineHeight }
    });
    links.push({
      source: 'frontend',
      target: node.id,
      value: node.count,
      lineStyle: { width: 1 + Math.min(4, node.count / 20), color: 'rgba(148,163,184,0.35)', curveness: 0.08 }
    });
  });

  // 上游代理请求单独成一个节点，保证它不会被 Top8 截断
  if (proxyNode) {
    const y = apiTop + apiNodes.length * apiGap;
    const nodeId = 'proxy:upstream';
    const proxyIdle = !proxyNode.count;
    nodes.push({
      id: nodeId,
      name: proxyIdle
        ? '上游接口 (v0)\n本时段无调用'
        : `上游接口 (v0)\n${proxyNode.count} 次 · 均 ${proxyNode.avgMs}ms`,
      x: apiX,
      y,
      symbolSize: 16 + Math.min(20, (proxyNode.count / total) * 60),
      itemStyle: { color: proxyNode.errors ? '#d9534f' : proxyNode.slow ? '#c88a2e' : '#4f86f7' },
      label: { show: true, position: 'right', distance: labelDist, align: 'left', color: '#94a3b8', fontSize: labelFont, lineHeight: labelLineHeight }
    });
    links.push({
      source: 'frontend',
      target: nodeId,
      value: proxyNode.count,
      lineStyle: {
        width: 1 + Math.min(4, proxyNode.count / 20),
        color: 'rgba(148,163,184,0.35)',
        curveness: 0.08
      }
    });
  }

  /*
   * 「上游 API」和「前端」放在同一列（左侧）：
   * 前端保持垂直居中（它要扇形连到所有接口），上游落在列表最底部——
   * 上游代理节点本来就在列表最后一行，两点之间只差一条水平线，不会横穿整个图。
   */
  const upstreamY = leftCenterY + leftSpread - leftLift;
  nodes.push({
    id: 'upstream',
    name: `上游 API\n${payload.upstream.calls ? `调用 ${payload.upstream.calls} 次 · 均 ${payload.upstream.avgMs}ms` : '近期无调用'}${payload.upstream.cacheBuilds ? ` · 建缓存 ${payload.upstream.cacheBuilds}` : ''}`,
    x: upstreamX,
    y: upstreamY,
    symbolSize: 40,
    itemStyle: { color: payload.upstream.errors ? '#d9534f' : '#94a3b8' },
    label: {
      show: true,
      position: compact ? 'bottom' : 'right',
      distance: compact ? 6 : 8,
      align: compact ? 'center' : 'left',
      color: '#e2e8f0',
      fontSize: titleFont,
      lineHeight: titleLineHeight
    }
  });

  // 上游代理节点 → 上游 API
  if (proxyNode) {
    const idle = !proxyNode.count;
    links.push({
      source: 'proxy:upstream',
      target: 'upstream',
      value: proxyNode.count,
      lineStyle: {
        // 本时段没有上游调用时用虚线，仍然把两个节点连起来，避免上游节点孤零零没有连线
        width: idle ? 1 : 1 + Math.min(3, proxyNode.count / 20),
        type: idle ? 'dashed' : 'solid',
        color: idle ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.3)',
        curveness: 0.08
      }
    });
  }

  return {
    tooltip: {
      formatter: (params: any) =>
        params.dataType === 'edge'
          ? `${params.data.value} 次`
          : String(params.data.name).replace('\n', ' · ')
    },
    series: [
      {
        type: 'graph',
        layout: 'none',
        roam: false,
        coordinateSystem: undefined,
        symbol: 'circle',
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 5,
        data: nodes,
        links,
        lineStyle: { opacity: 0.9 },
        emphasis: { focus: 'adjacency' }
      }
    ]
  };
};

/** 记录画布实际尺寸，坐标按它计算 */
const measure = () => {
  if (!chartRef.value) return;
  chartSize.width = chartRef.value.clientWidth;
  chartSize.height = chartRef.value.clientHeight;
};

const render = async () => {
  loading.value = true;
  try {
    data.value = await getTopology(900);
  } catch {
    data.value = null;
  } finally {
    loading.value = false;
  }

  if (!hasData.value) return;
  await nextTick();
  if (!chartRef.value) return;
  measure();
  if (!chart) {
    chart = echarts.init(chartRef.value);
    // 尺寸变化时先测量再重建：只 resize 不重排的话，写死的坐标还是会顶到画布外
    resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const el = chartRef.value;
        if (!el || !data.value) return;
        /*
         * 切到「接口健康」视图时图表是 display:none，宽高会变成 0：
         * 这时不能 resize（会被压成 100px 宽），切回来再按新尺寸重画。
         * 尺寸没真的变化也不重画，避免重新布局的动画看起来像「挤成一团又展开」。
         */
        const nextW = el.clientWidth;
        const nextH = el.clientHeight;
        if (nextW < 40 || nextH < 40) return;
        if (nextW === chartSize.width && nextH === chartSize.height) return;
        measure();
        chart?.resize();
        chart?.setOption(buildOption(data.value), true);
      }, 120);
    });
    resizeObserver.observe(chartRef.value);
  }
  chart.setOption(buildOption(data.value as TopologyData), true);
};

const startPolling = () => {
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(render, REFRESH_MS);
};

const stopPolling = () => {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
};

// 面板被 KeepAlive 挂起时停掉轮询，切回来再恢复（数据还是上次那份，不用重新请求）
let mountedOnce = false;

onMounted(() => {
  render();
  startPolling();
  mountedOnce = true;
});

onActivated(() => {
  if (mountedOnce) startPolling();
});

onDeactivated(stopPolling);

onBeforeUnmount(() => {
  stopPolling();
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<style scoped>
.topology-card {
  margin-top: 20px;
  /* 供下面的容器查询使用：按卡片实际宽度决定接口健康 Top 放内容区还是收进标题栏 */
  container-type: inline-size;
}

.topology-body {
  display: flex;
  align-items: stretch;
  gap: 16px;
}

/* 图表这一列：图例 + 拓扑图 / 接口健康列表 */
.topology-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 接口健康 Top：默认收进标题栏按钮，卡片够宽时才展开到内容区 */
.health-panel {
  display: none;
}

/* 窄卡片下由按钮切换出来的内容区视图，默认不显示 */
.health-view {
  display: none;
  width: 100%;
  /* 与拓扑图同高（图表 .topology-chart 固定 380px），切换时卡片尺寸不变 */
  height: 380px;
  overflow-y: auto;
}

.health-trigger {
  display: inline-flex;
  /* 窄卡片时按钮不换行也不被压扁，让标题那边的文字去让位 */
  flex: 0 0 auto;
  white-space: nowrap;
}

@container (min-width: 1000px) {
  .health-panel {
    display: flex;
    flex-direction: column;
    flex: 0 0 244px;
    /* 放在图表左侧 */
    padding-right: 16px;
    border-right: 1px solid var(--el-border-color-lighter);
  }

  .health-trigger {
    display: none;
  }
}

/* 窄卡片：按钮切换内容区，两种视图互斥 */
@container (max-width: 999px) {
  .topology-card.is-health-mode .topology-chart {
    display: none;
  }

  .topology-card.is-health-mode .health-view {
    display: flex;
    flex-direction: column;
  }
}

.health-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.health-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.health-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.health-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.health-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.health-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-regular);
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.health-metrics {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.health-metrics .is-slow { color: var(--el-color-warning); }
.health-metrics .is-error { color: var(--el-color-danger); }

.health-list--roomy { gap: 12px; }
.health-list--roomy .health-path { font-size: 13px; }

.topology-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 不换行：按钮固定尺寸，标题与副标题自己缩 */
  flex-wrap: nowrap;
}

.topology-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
}

.topology-title > span:first-child {
  flex: 0 0 auto;
  white-space: nowrap;
}

.topology-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.topology-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.legend-dot.is-frontend { background-color: #64748b; }
.legend-dot.is-api { background-color: #4f86f7; }
.legend-dot.is-upstream { background-color: #94a3b8; }
.legend-dot.is-error { background-color: #d9534f; }
.legend-dot.is-slow { background-color: #c88a2e; }

.legend-item.is-danger { color: var(--el-color-danger); }
.legend-item.is-warning { color: var(--el-color-warning); }

.topology-chart {
  width: 100%;
  height: 380px;
}

.topology-empty {
  margin: 12px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

@media (max-width: 768px) {
  .topology-chart {
    height: 320px;
  }

  /* 列表与图表同高，切换时卡片尺寸不变（含窄屏这一档） */
  .health-view {
    height: 320px;
  }
}
</style>
