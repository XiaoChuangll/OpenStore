<template>
  <el-card class="chart-card" :class="{ 'is-list-view': viewMode === 'list' }" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span class="card-title" :class="{ 'title-link': route.path !== '/rank/total' }" @click="goToRank">总下载榜</span>
          <el-select v-model="pageSize" size="small" :style="{ width: selectWidthOf(PAGE_SIZE_LABELS) }" @change="fetchData">
            <el-option label="10条" :value="10" />
            <el-option label="20条" :value="20" />
            <el-option label="30条" :value="30" />
            <el-option label="50条" :value="50" />
          </el-select>
        </div>
        <div class="controls">
          <el-tag 
            :effect="showTotal ? 'dark' : 'plain'" 
            @click="toggleTotal" 
            class="cursor-pointer"
            round
            size="small"
          >总量</el-tag>
          <el-tag 
            :effect="showIncrement ? 'dark' : 'plain'" 
            @click="toggleIncrement" 
            class="cursor-pointer"
            round
            type="success"
            size="small"
          >增量</el-tag>
          <!-- 图表 / 排名条 两种展示方式互相切换，选择记在本地，下次打开还是上次那个 -->
          <el-tooltip :content="viewMode === 'list' ? '切换为图表' : '切换为排名条'" placement="top">
            <el-button
              size="small"
              class="view-toggle"
              :icon="viewMode === 'list' ? TrendCharts : List"
              @click="toggleView"
            />
          </el-tooltip>
        </div>
      </div>
    </template>
    <div v-if="viewMode === 'chart'" ref="chartRef" class="chart-box"></div>
    <!--
      改用横向排名条（原来是「竖柱 + 折线 + 悬浮图标 + 缩放条」的堆叠图）：
      手机上一列 30 根柱子要旋转标签、图例压在柱子上、还要拖缩放条，基本没法看。
      横向条一行一个应用：条形表示当前指标，右侧是数值，另一个指标用小字跟着，
      窄屏自动折成两行，任何宽度都能读。
    -->
    <template v-else>
      <!--
        只有列表进"裁剪容器"（高度补间靠它）；底部的开关按钮留在外面 ——
        放在容器里的话补间期间会被一起裁掉，按钮位置会先跳到终点再被滚动补偿追回来，
        表现就是"展开不跟随、折叠顿一下"。
      -->
      <div ref="listWrapRef">
        <RankBarList
          :rows="visibleRows"
          :loading="loading"
          :tone="primaryMetric === 'total' ? 'primary' : 'success'"
          @select="openApp"
        />
      </div>
      <!-- 榜单太长（30 条在手机要滑两屏），底部给一个折叠开关：
           收起来只剩前 10 条，想看全再展开（带高度补间 + 视角跟随） -->
      <button
        v-if="collapsible"
        ref="moreButtonRef"
        type="button"
        class="rank-more"
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        <span>{{ expanded ? '收起' : `展开全部 ${listRows.length} 条` }}</span>
        <svg viewBox="0 0 1024 1024" width="12" height="12" aria-hidden="true">
          <path v-if="expanded" fill="currentColor" d="M512 320 192 640h640z" />
          <path v-else fill="currentColor" d="M512 704 192 384h640z" />
        </svg>
      </button>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import * as echarts from 'echarts';
import { TrendCharts, List } from '@element-plus/icons-vue';
import RankBarList from './RankBarList.vue';
import { animateHeightChange } from '../utils/collapse-animate';
import { hmApi } from '../services/hm-api';
import { selectWidthOf } from '../utils/select-width';

/** 下拉框宽度按「最长的那条选项」算 */
const PAGE_SIZE_LABELS = ['10条', '20条', '30条', '50条'];

const router = useRouter();
const route = useRoute();
// 注意别叫 apps：fetchData 里有个同名的局部数组（let apps = ...），会把这个 ref 遮住
const appRows = ref<any[]>([]);
const loading = ref(true);
const showTotal = ref(true);
const showIncrement = ref(false);
const pageSize = ref(30);

/*
 * 两种展示方式：
 *   chart —— 原来的「竖柱 + 折线 + 悬浮图标 + 缩放条」图表
 *   list  —— 横向排名条（手机上好读）
 * 右上角按钮切换。四个榜单页都以图表为准：回到页面 / 刷新都从图表开始，
 * 所以不把选择写进 localStorage（免得上次切到列表，下次进来还以为"默认不是图表"）。
 */
const viewMode = ref<'list' | 'chart'>('chart');
const toggleView = () => {
  viewMode.value = viewMode.value === 'list' ? 'chart' : 'list';
  if (viewMode.value === 'list') showIncrement.value = false, showTotal.value = true;
};

const goToRank = () => {
  if (route.path !== '/rank/total') {
    router.push('/rank/total');
  }
};

/*
 * 两个标签现在当「看哪个指标」用：条形永远画当前选中的那个，另一个作为小字跟着。
 * 这样既不用双 Y 轴，也不会出现"两个都关掉"的空卡片；再点一次当前标签就切到另一个。
 */
const primaryMetric = computed<'total' | 'increment'>(() =>
  showIncrement.value && !showTotal.value ? 'increment' : 'total'
);
const selectMetric = (metric: 'total' | 'increment') => {
  const next = primaryMetric.value === metric ? (metric === 'total' ? 'increment' : 'total') : metric;
  showTotal.value = next === 'total';
  showIncrement.value = next === 'increment';
};
/*
 * 两个标签在两种视图下语义不同（故意的）：
 *   排名条：单选，决定"条形画哪个指标"，另一个作为小字。
 *   图表：沿用原来的开关语义，柱（总量）和线（增量）各自显示/隐藏，可以同时开。
 */
const toggleTotal = () => {
  if (viewMode.value === 'chart') {
    showTotal.value = !showTotal.value;
    updateChartVisibility();
  } else {
    selectMetric('total');
  }
};
const toggleIncrement = () => {
  if (viewMode.value === 'chart') {
    showIncrement.value = !showIncrement.value;
    updateChartVisibility();
  } else {
    selectMetric('increment');
  }
};

const primaryValueOf = (item: any) =>
  primaryMetric.value === 'total'
    ? item.current_download_count || item.download_count || 0
    : item.download_increment || 0;

const rankedApps = computed(() =>
  [...appRows.value].sort((a, b) => primaryValueOf(b) - primaryValueOf(a))
);

/** 交给公共排名条组件渲染：value = 当前指标，sub = 另一个指标 */
const listRows = computed(() =>
  rankedApps.value.map((item: any) => ({
    key: item.pkg_name || item.name,
    name: item.name,
    icon: item.icon_url,
    value: primaryValueOf(item) as number,
    sub:
      primaryMetric.value === 'total'
        ? `+${formatCount(item.download_increment || 0)}`
        : `共 ${formatCount(item.current_download_count || item.download_count || 0)}`,
    app_id: item.app_id
  }))
);

/*
 * 折叠：榜单默认只铺前 10 条，底部留一个「展开全部 N 条」。
 * 30 条在手机上要滑两屏多，用户看完想回到上面的图表得滑很久。
 */
const COLLAPSED_ROWS = 10;
const COLLAPSE_OVER = 12; // 超过这个条数才值得折叠
const expanded = ref(false);
/** 折叠容器：切换展开/收起时给它做高度补间 */
const listWrapRef = ref<HTMLElement | null>(null);
/** 展开按钮：动画期间当"视角锚点"，收起后不会让人跳到别的版块 */
const moreButtonRef = ref<HTMLElement | null>(null);
const collapsible = computed(() => listRows.value.length > COLLAPSE_OVER);
const visibleRows = computed(() =>
  collapsible.value && !expanded.value ? listRows.value.slice(0, COLLAPSED_ROWS) : listRows.value
);
const toggleExpanded = () => {
  void animateHeightChange(
    listWrapRef.value,
    () => {
      expanded.value = !expanded.value;
    },
    moreButtonRef.value
  );
};

/** 下载量按 万 / 亿 折算，读起来比 84709000 直观 */
const formatCount = (value: number) => {
  const n = Number(value) || 0;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
};

const openApp = (item: any) => {
  if (item?.app_id) {
    router.push({ name: 'app-dashboard', query: { app_id: item.app_id } });
  }
};

/* ---------------------------- 图表视图（旧样式） ---------------------------- */

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const compactCount = (value: number) => {
  if (value > 100000000) return (value / 100000000).toFixed(0) + '亿';
  if (value > 10000) return (value / 10000).toFixed(0) + 'w';
  return value;
};

const buildChartOption = (data: any[]) => {
  const names = data.map((item) => item.name);
  const downloads = data.map((item) => item.current_download_count || item.download_count);
  const increments = data.map((item) => item.download_increment || 0);

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      show: false,
      selected: { 总下载量: showTotal.value, 图标: showTotal.value || showIncrement.value, 新增下载: showIncrement.value }
    },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [
      { type: 'slider', show: true, xAxisIndex: [0], startValue: 0, endValue: 9, bottom: '2%' },
      { type: 'inside', xAxisIndex: [0], startValue: 0, endValue: 9 }
    ],
    xAxis: { type: 'category', data: names, axisLabel: { interval: 0, rotate: 45 } },
    yAxis: [
      {
        type: 'value',
        name: '总下载量',
        position: 'left',
        alignTicks: true,
        axisLine: { show: true, lineStyle: { color: '#5470C6' } },
        axisLabel: { formatter: compactCount }
      },
      {
        type: 'value',
        name: '新增下载',
        position: 'right',
        alignTicks: true,
        axisLine: { show: true, lineStyle: { color: '#91CC75' } },
        axisLabel: { formatter: compactCount }
      }
    ],
    series: [
      {
        name: '总下载量',
        type: 'bar',
        data: downloads,
        itemStyle: { color: '#5470C6' },
        barWidth: '40%'
      },
      {
        name: '图标',
        type: 'pictorialBar',
        symbolPosition: 'end',
        symbolSize: [30, 30],
        symbolOffset: [0, -20],
        z: 10,
        tooltip: { show: false },
        yAxisIndex: 0,
        data: data.map((item, index) => ({
          value: downloads[index],
          symbol: 'image://' + (item.icon_url || '')
        })),
        label: { show: false }
      },
      {
        name: '新增下载',
        type: 'line',
        yAxisIndex: 1,
        data: increments,
        itemStyle: { color: '#91CC75' }
      }
    ]
  };
};

const renderChart = () => {
  if (!chartRef.value) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
    chartInstance.on('click', (params) => {
      const item = appRows.value[params.dataIndex];
      if (item?.app_id) router.push({ name: 'app-dashboard', query: { app_id: item.app_id } });
    });
  }
  chartInstance.setOption(buildChartOption(appRows.value), true);
  chartInstance.resize();
};

/** 图表里切换「总量 / 增量」：沿用图例开关，不重画整张图 */
const updateChartVisibility = () => {
  if (!chartInstance) return;
  chartInstance.setOption({
    legend: {
      selected: {
        总下载量: showTotal.value,
        图标: showTotal.value || showIncrement.value,
        新增下载: showIncrement.value
      }
    },
    yAxis: [{ show: showTotal.value }, { show: showIncrement.value }]
  });
};

const disposeChart = () => {
  chartInstance?.dispose();
  chartInstance = null;
};

const handleResize = () => {
  if (viewMode.value === 'chart') chartInstance?.resize();
};

// 切到图表：等 DOM 出现再画；切回排名条：把实例释放掉，别留着占内存
watch(viewMode, async (mode) => {
  if (mode === 'chart') {
    await nextTick();
    renderChart();
  } else {
    disposeChart();
  }
});

// 数据回来时如果正在看图表，补一次渲染
watch(appRows, () => {
  if (viewMode.value === 'chart') renderChart();
});

const fetchData = async () => {
  try {
    /*
     * 多要几条再裁：服务端的「屏蔽异常应用」是直接从 /apps/query 的结果里删掉那几条的
     * （上游 total 不变），所以正好要 30 条时会只到手 29 条 —— 榜单一列就少一个。
     * 这里按 pageSize + 余量请求，裁到 pageSize 即可。
     */
    const FETCH_EXTRA = 6;
    let apps = [];
    const listResponse = await hmApi.get<any>('/apps/list/1', {
      page_size: pageSize.value + FETCH_EXTRA,
      sort: 'download_count',
      desc: true
    });
    apps = (listResponse.data?.data || []).slice(0, pageSize.value);

    // 2. Fetch Growth data to map increments
    let growthMap = new Map<string, number>();
    try {
      // Fetch a larger batch of growth data to increase hit rate
      const growthResponse = await hmApi.get<any>('/rankings/download_increase', {
        limit: 100, 
        days: 1
      });
      const growthList = growthResponse.data || [];
      growthList.forEach((item: any) => {
        if (item.pkg_name) {
          growthMap.set(item.pkg_name, item.download_increment || 0);
        }
      });
    } catch (e) {
      console.warn('Failed to fetch increment data');
    }

    // 3. Merge data
    apps = apps.map((item: any) => ({
      ...item,
      // Use existing download_count from list
      current_download_count: item.download_count,
      // Map increment if available, else 0
      download_increment: growthMap.get(item.pkg_name) || 0
    }));

    // 4. For apps with 0 increment, try to fetch metrics individually to calculate increment
    const appsToFetch = apps.filter((item: any) => item.download_increment === 0 && item.pkg_name);
    
    if (appsToFetch.length > 0) {
      await Promise.all(appsToFetch.map(async (item: any) => {
          try {
              const res = await hmApi.get<any>(`/apps/metrics/${item.pkg_name}`);
              // API might return array or { data: [...] }
              let metrics = Array.isArray(res) ? res : (res.data || []);
              
              if (Array.isArray(metrics) && metrics.length >= 2) {
                   // Sort by created_at desc to ensure latest is first
                   metrics.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                   const latest = metrics[0];
                   const prev = metrics[1];
                   // Calculate increment
                   const inc = Math.max(0, latest.download_count - prev.download_count);
                   item.download_increment = inc;
              }
          } catch (e) {
              // console.warn(`Failed to fetch metrics for ${item.name}`);
          }
      }));
    }
    
    // 5. Fetch details for icons (Optimize: Only fetch if icon_url is missing or invalid)
    const appsWithIcons = await Promise.all(apps.map(async (item: any) => {
      if (!item.icon_url && item.pkg_name) {
         try {
           const detailRes = await hmApi.get<any>('/apps/list/1', {
             search_key: 'pkg_name',
             search_value: item.pkg_name,
             search_exact: true,
             page_size: 1
           });
           const detail = detailRes.data?.data?.[0];
           if (detail && detail.icon_url) {
             return { ...item, icon_url: detail.icon_url };
           }
         } catch (e) {
           // ignore
         }
      }
      return item;
    }));

    appRows.value = appsWithIcons;
  } catch (error) {
    console.error('Failed to fetch download rank:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchData();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  disposeChart();
});
</script>

<style scoped>
.chart-card {
  margin-bottom: 20px;
}

/*
 * 列表模式时，底部那颗「展开全部 / 收起」就是这张卡的页脚：
 * 卡片自身不留底部内边距，否则横线下面会空出一大块，文字看着贴在横线上。
 * （图表模式不动 —— 那里的 300px 图表需要这层内边距。）
 */
.chart-card.is-list-view :deep(.el-card__body) {
  padding-bottom: 0;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  height: 32px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.card-title {
  white-space: nowrap;
}

.title-link {
  cursor: pointer;
  transition: color 0.3s;
}

.title-link:hover {
  color: var(--el-color-primary);
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle {
  /* 图标按钮给个固定方形，免得和标签挤在一起时被压扁 */
  width: 24px;
  height: 24px;
  padding: 0;
}

/* 底部的「展开全部 / 收起」：整行按钮压一条上边框，和堆叠图那张卡的入口样式一致 */
.rank-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 6px;
  /* 上下要对称：之前写的 8px/2px 会把文字压到中线下面去 */
  padding: 10px 2px;
  border: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 12px;
  /* 同「名次清单」：行高按字体算，文字才和图标在同一中线上 */
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
}

.rank-more > span {
  line-height: 1;
}

.rank-more:hover {
  color: var(--el-color-primary);
}

.chart-box {
  width: 100%;
  height: 300px;
}

@media (max-width: 768px) {
  /*
    标题和条数下拉必须在同一行（以前用 display:contents 拆开，
    下拉会被单独挤到第二行，看起来就是"筛选框被换行了"）。
    放不下时整组换行，而不是把下拉和图标题拆散。
  */
  .card-header {
    height: auto;
    row-gap: 8px;
  }

  .header-left {
    gap: 8px;
  }

  .controls {
    margin-left: auto;
  }
}
.cursor-pointer {
  cursor: pointer;
}
</style>
