<template>
  <el-card class="insights-card" shadow="hover" v-loading="loading">
    <template #header>
      <div class="insights-header">
        <div class="insights-title">
          <span>访客分布</span>
          <span class="insights-sub">近 {{ days }} 天 · {{ total.toLocaleString() }} 次访问</span>
        </div>
        <div class="insights-controls">
          <el-radio-group v-model="scope" size="small" @change="handleScopeChange">
            <el-radio-button label="world">世界</el-radio-button>
            <el-radio-button label="china">中国</el-radio-button>
          </el-radio-group>
          <span class="insights-hint">{{ mapReady ? '' : '地图数据不可用，已降级为排行视图' }}</span>
        </div>
      </div>
    </template>

    <div :class="['insights-body', { 'is-single': !mapReady }]">
      <div v-show="mapReady" ref="mapRef" class="insights-map"></div>

      <div class="insights-rank">
        <div class="rank-title">
          <template v-if="scope === 'world'">国家 / 地区 Top {{ rankItems.length }}</template>
          <template v-else>省份 Top {{ rankItems.length }}</template>
        </div>
        <div class="rank-list">
          <div v-for="item in rankItems" :key="item.key" class="rank-item">
            <span class="rank-name" :class="{ 'is-wide': scope === 'china' }">
              {{ item.label }}
            </span>
            <span class="rank-bar">
              <span class="rank-bar-fill" :style="{ width: barWidth(item.count) }"></span>
            </span>
            <span class="rank-count">{{ item.count.toLocaleString() }}</span>
          </div>
        </div>
        <p v-if="scope === 'china' && unlocatedCn" class="rank-note">
          另有 {{ unlocatedCn.toLocaleString() }} 次访问只能定位到国家、无法归属到省份
        </p>
      </div>
    </div>

    <div class="insights-heat">
      <div class="heat-title">访问时段热力图（北京时间，横轴 0–23 时，纵轴周日→周六）</div>
      <div ref="heatRef" class="heat-chart"></div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import * as echarts from 'echarts';
import { getVisitorInsights, type VisitorInsights } from '../services/admin';

/** ISO 代码 → echarts 世界地图里的国家名（未收录的国家仍会出现在右侧排行里） */
const COUNTRY_NAMES: Record<string, string> = {
  CN: 'China', HK: 'China', MO: 'China', TW: 'China',
  US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil', AR: 'Argentina', CL: 'Chile', CO: 'Colombia',
  JP: 'Japan', KR: 'Korea', SG: 'Singapore', MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', ID: 'Indonesia',
  PH: 'Philippines', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal',
  KH: 'Cambodia', MM: 'Myanmar', LA: 'Lao PDR', BN: 'Brunei', MN: 'Mongolia', KZ: 'Kazakhstan',
  RU: 'Russia', UA: 'Ukraine', BY: 'Belarus', PL: 'Poland', CZ: 'Czech Rep.', HU: 'Hungary', RO: 'Romania',
  DE: 'Germany', FR: 'France', NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria',
  IT: 'Italy', ES: 'Spain', PT: 'Portugal', GR: 'Greece', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', IE: 'Ireland', GB: 'United Kingdom', TR: 'Turkey', IL: 'Israel', SA: 'Saudi Arabia',
  AE: 'United Arab Emirates', EG: 'Egypt', ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya',
  AU: 'Australia', NZ: 'New Zealand', IR: 'Iran', IQ: 'Iraq'
};

const MAP_GEOJSON_URL = 'https://fastly.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json';
const CHINA_GEOJSON_URL = 'https://fastly.jsdelivr.net/npm/echarts@4.9.0/map/json/china.json';
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const mapRef = ref<HTMLElement | null>(null);
const heatRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const data = ref<VisitorInsights | null>(null);
const mapReady = ref(false);
const scope = ref<'world' | 'china'>('world');

let mapChart: echarts.ECharts | null = null;
let heatChart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const days = computed(() => data.value?.days || 180);
const total = computed(() => data.value?.total || 0);
const countries = computed(() => (data.value?.countries || []).slice(0, 12));
const provinces = computed(() => (data.value?.china?.provinces || []).slice(0, 12));
const unlocatedCn = computed(() => data.value?.china?.unlocated || 0);

const rankItems = computed(() =>
  scope.value === 'world'
    ? countries.value.map((item) => ({ key: item.code, label: item.code === 'UNKNOWN' ? '未知' : item.code, count: item.count }))
    : provinces.value.map((item) => ({ key: item.name, label: item.name, count: item.count }))
);
const maxRank = computed(() => Math.max(1, ...rankItems.value.map((c) => c.count), 1));

const barWidth = (count: number) => `${Math.max(3, Math.round((count / maxRank.value) * 100))}%`;

const fetchGeoJson = async (url: string) => {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

const registeredMaps = new Set<string>();
const ensureMap = async (name: 'world' | 'china') => {
  if (registeredMaps.has(name)) return true;
  const geoJson = await fetchGeoJson(name === 'world' ? MAP_GEOJSON_URL : CHINA_GEOJSON_URL);
  if (!geoJson) return false;
  echarts.registerMap(name, geoJson);
  registeredMaps.add(name);
  return true;
};

const renderMap = async () => {
  if (!mapRef.value || !data.value) return;

  const mapName = scope.value === 'world' ? 'world' : 'china';
  const ready = await ensureMap(mapName as 'world' | 'china');
  if (!ready) {
    mapReady.value = false;
    return;
  }

  const mapData = new Map<string, number>();
  if (scope.value === 'world') {
    data.value.countries.forEach((item) => {
      const name = COUNTRY_NAMES[item.code];
      if (!name) return;
      mapData.set(name, (mapData.get(name) || 0) + item.count);
    });
  } else {
    data.value.china.provinces.forEach((item) => mapData.set(item.name, item.count));
  }
  if (mapData.size === 0) {
    mapReady.value = false;
    return;
  }

  mapReady.value = true;
  await nextTick();
  if (!mapChart) mapChart = echarts.init(mapRef.value);

  mapChart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: (params: any) =>
        `${params.name}：${Number(params.value || 0).toLocaleString()} 次`
    },
    visualMap: {
      min: 0,
      max: Math.max(...mapData.values()),
      left: 8,
      bottom: 8,
      itemWidth: 10,
      itemHeight: 70,
      textStyle: { color: '#94a3b8', fontSize: 10 },
      inRange: { color: ['#1e293b', '#3b6ea5', '#4f86f7'] }
    },
    series: [
      {
        type: 'map',
        map: mapName,
        roam: false,
        zoom: scope.value === 'china' ? 1.15 : 1,
        itemStyle: { areaColor: '#1a1d23', borderColor: 'rgba(148,163,184,0.25)' },
        emphasis: { itemStyle: { areaColor: '#4f86f7' }, label: { show: false } },
        data: [...mapData.entries()].map(([name, value]) => ({ name, value }))
      }
    ]
  }, true);
};

const handleScopeChange = () => {
  void renderMap();
};

const renderHeat = async () => {
  if (!heatRef.value || !data.value) return;
  await nextTick();
  if (!heatChart) heatChart = echarts.init(heatRef.value);

  const heatData: Array<[number, number, number]> = [];
  data.value.matrix.forEach((row, weekday) => {
    row.forEach((count, hour) => heatData.push([hour, weekday, count]));
  });
  const max = Math.max(1, ...heatData.map((item) => item[2]));

  heatChart.setOption({
    tooltip: {
      position: 'top',
      formatter: (params: any) =>
        `${WEEKDAYS[params.value[1]]} ${String(params.value[0]).padStart(2, '0')}:00 — ${params.value[2].toLocaleString()} 次`
    },
    grid: { left: 46, right: 16, top: 12, bottom: 34 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => `${i}`),
      splitArea: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
      axisLabel: { fontSize: 10, color: '#94a3b8' }
    },
    yAxis: {
      type: 'category',
      data: WEEKDAYS,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
      axisLabel: { fontSize: 10, color: '#94a3b8' }
    },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 70,
      textStyle: { color: '#94a3b8', fontSize: 10 },
      inRange: { color: ['#1a1d23', '#2f4a70', '#4f86f7'] }
    },
    series: [
      {
        type: 'heatmap',
        data: heatData,
        itemStyle: { borderRadius: 3, borderColor: 'rgba(0,0,0,0.25)', borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: '#e2e8f0' } }
      }
    ]
  });
};

const render = async () => {
  loading.value = true;
  try {
    data.value = await getVisitorInsights(180);
  } catch {
    data.value = null;
  } finally {
    loading.value = false;
  }
  if (!data.value) return;

  await renderMap();
  await renderHeat();
};

onMounted(() => {
  render();
  const observe = () => {
    if (!mapRef.value && !heatRef.value) return;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      mapChart?.resize();
      heatChart?.resize();
    });
    if (mapRef.value) resizeObserver.observe(mapRef.value);
    if (heatRef.value) resizeObserver.observe(heatRef.value);
  };
  window.setTimeout(observe, 600);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  mapChart?.dispose();
  heatChart?.dispose();
});
</script>

<style scoped>
.insights-card {
  margin-top: 20px;
}

.insights-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.insights-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 15px;
}

.insights-sub,
.insights-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.insights-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.insights-body {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(240px, 1fr);
  gap: 20px;
  align-items: start;
}

.insights-body.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.insights-map {
  width: 100%;
  height: 340px;
}

.rank-title,
.heat-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.rank-name {
  /* 固定宽度：这样每一行的进度条起点、长度都完全对齐（原来还有一列宽度不定的 emoji 国旗） */
  width: 46px;
  flex: 0 0 auto;
  color: var(--el-text-color-regular);
}

.rank-name.is-wide {
  width: 74px;
}

.rank-note {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--el-text-color-placeholder);
}

.rank-bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background-color: var(--el-fill-color);
  overflow: hidden;
}

.rank-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3b6ea5, #4f86f7);
}

.rank-count {
  width: 56px;
  flex: 0 0 auto;
  text-align: right;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.insights-heat {
  margin-top: 18px;
}

.heat-chart {
  width: 100%;
  height: 260px;
}

@media (max-width: 768px) {
  .insights-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .insights-map {
    height: 240px;
  }

  .heat-chart {
    height: 220px;
  }
}
</style>
