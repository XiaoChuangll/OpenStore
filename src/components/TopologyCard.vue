<template>
  <el-card class="topology-card" shadow="hover" v-loading="loading">
    <template #header>
      <div class="topology-header">
        <div class="topology-title">
          <span>调用拓扑</span>
          <span class="topology-sub">近 {{ windowLabel }} · {{ totals.requests }} 次请求</span>
        </div>
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
      </div>
    </template>

    <div v-show="hasData" ref="chartRef" class="topology-chart"></div>
    <p v-if="!hasData" class="topology-empty">近 {{ windowLabel }}没有请求记录，等有流量后再看</p>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, nextTick, reactive } from 'vue';
import * as echarts from 'echarts';
import { getTopology, type TopologyData } from '../services/admin';

const REFRESH_MS = 15000;

const chartRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const data = ref<TopologyData | null>(null);
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
  const upstreamReserve = compact ? 26 : 200; // 右侧给「上游 API」标签留的宽度（原来 150 不够，长文案会被右边缘裁掉）
  const upstreamX = Math.round(W - upstreamReserve);
  const apiX = compact
    ? Math.round(W * 0.46)
    : Math.round(Math.max(frontendX + 150, Math.min(W * 0.44, upstreamX - 190)));

  const rowCount = apiNodes.length + (proxyNode ? 1 : 0);
  // 行距随高度自适应，整体垂直居中，行数多时不会超出画布
  const apiGap = Math.max(28, Math.min(compact ? 40 : 48, (H - 72) / Math.max(1, rowCount - 1)));
  const apiTop = Math.max(22, (H - (rowCount - 1) * apiGap) / 2);

  const titleFont = compact ? 10 : 11;
  const labelFont = compact ? 9 : 10;
  const labelDist = compact ? 5 : 7;
  const titleLineHeight = compact ? 12 : 14;
  const labelLineHeight = compact ? 11 : 13;

  const nodes: any[] = [
    {
      id: 'frontend',
      name: `前端\n${payload.totals.requests} 次`,
      x: frontendX,
      y: apiTop + ((rowCount - 1) * apiGap) / 2,
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

  const upstreamY = apiTop + ((rowCount - 1) * apiGap) / 2;
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
        if (!chartRef.value || !data.value) return;
        measure();
        chart?.resize();
        chart?.setOption(buildOption(data.value), true);
      }, 120);
    });
    resizeObserver.observe(chartRef.value);
  }
  chart.setOption(buildOption(data.value as TopologyData), true);
};

onMounted(() => {
  render();
  timer = window.setInterval(render, REFRESH_MS);
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<style scoped>
.topology-card {
  margin-top: 20px;
}

.topology-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.topology-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 15px;
}

.topology-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.topology-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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
}
</style>
