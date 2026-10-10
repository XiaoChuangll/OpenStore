<template>
  <el-card class="chart-card" :class="{ 'is-list-view': viewMode === 'list' }" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span class="card-title" :class="{ 'title-link': route.path !== '/rank/non-huawei' }" @click="goToRank">非华为应用下载榜</span>
          <!-- 两个筛选框单独成组：窄屏时整组占到第二行，不会被挤变形 -->
          <div class="header-filters">
            <!-- 分类筛选：按榜单口径（分类别名组）筛出该分类下的应用。
                 不加 filterable：这是选项不多的分类下拉，能键入反而像是在搜索框里打字 -->
            <el-select
              v-if="categoryOptions.length"
              v-model="category"
              size="small"
              clearable
              placeholder="全部分类"
              class="category-select"
              :style="{ width: categorySelectWidth }"
              @change="fetchData"
            >
              <el-option label="全部分类" value="" />
              <el-option v-for="opt in categoryOptions" :key="opt.name" :label="opt.name" :value="opt.name" />
            </el-select>
            <el-select v-model="pageSize" size="small" :style="{ width: selectWidthOf(PAGE_SIZE_LABELS) }" @change="fetchData">
              <el-option label="10条" :value="10" />
              <el-option label="20条" :value="20" />
              <el-option label="30条" :value="30" />
              <el-option label="50条" :value="50" />
            </el-select>
          </div>
        </div>
        <div class="controls">
          <el-tag 
            :effect="showTotal ? 'dark' : 'plain'" 
            @click="toggleTotal" 
            class="cursor-pointer"
            round
            size="small"
            type="danger" 
          >总量</el-tag>
          <el-tag 
            :effect="showIncrement ? 'dark' : 'plain'" 
            @click="toggleIncrement" 
            class="cursor-pointer"
            round
            type="success"
            size="small"
          >增量</el-tag>
          <!-- 图表 / 排名条 切换，选择记在本地，默认图表 -->
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
    <template v-else>
      <div ref="listWrapRef">
        <RankBarList
          :rows="visibleRows"
          :tone="primaryMetric === 'total' ? 'danger' : 'success'"
          @select="openApp"
        />
      </div>
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
import { getCategoryGrowthRanking, mergeCategoryGrowth, getAppsByCategory } from '../services/next-api';
import { selectWidthOf } from '../utils/select-width';

/** 下拉框宽度按「最长的那条选项」算 */
const PAGE_SIZE_LABELS = ['10条', '20条', '30条', '50条'];

const router = useRouter();
const route = useRoute();
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
const showTotal = ref(true);
const showIncrement = ref(true);
const pageSize = ref(30);
const chartData = ref<any[]>([]);

/*
 * 分类筛选：选项取上游「大分类下载量增速排行」的 kind_name。
 * 比起走 apps/overview（面板要跑 26 个分类 + 5 个设备的计数查询），这个接口
 * 上游自带 TTL 缓存、一次拿全，轻得多；筛选也直接用原始 kind_name 精确匹配，
 * 下拉里的数量和筛出来的结果能对上。
 *
 * 代价：这是上游的原始分类（93 条，含繁体/外语/重名的脏条目），不像 /apps
 * 分类页那套把「休闲益智 = 休闲 + 益智解谜」合并成一组 —— 因此下拉里会看到
 * 更细的拆分。下面的筛选会把脏条目滤掉、重名的合并掉。
 *
 * 判空用 category 本身 —— 清空/选「全部分类」时都当作不限分类。
 */
interface CategoryOption {
  name: string;
  /** 该分类下的应用数（重名条目已合并） */
  count?: number;
  /** 窗口期内的下载增量，用来排序 */
  increase?: number;
}
const categoryOptions = ref<CategoryOption[]>([]);

/*
 * 分类要暴露给父组件（同页堆叠图跟着筛），但取数用本地值：
 * @change 触发时父组件状态还没回流，直接读 props 会拿到旧分类。
 */
const props = withDefaults(defineProps<{ category?: string }>(), { category: '' });
const emit = defineEmits<{ 'update:category': [string] }>();
const category = ref(props.category);
const categorySelectWidth = computed(() =>
  selectWidthOf(['全部分类', ...categoryOptions.value.map((item) => item.name)])
);
const activeCategory = computed(
  () => categoryOptions.value.find((item) => item.name === category.value) || null
);

/** 分类筛选的选项来源：上游大分类增速榜 */
const CATEGORY_MIN_APPS = 50;
const loadCategories = async () => {
  try {
    const res: any = await getCategoryGrowthRanking({
      days: 7,
      limit: 300,
      // 上游原始分类里有一堆只有一两个应用的脏条目（繁体、外语、错拆），
      // 让服务端先按应用数滤一遍，93 条能降到 40 条左右
      minApps: CATEGORY_MIN_APPS
    });
    // 同名不同 kind_id 的合并成一条，数字相加，和按 kind_name 精确查的结果一致
    categoryOptions.value = mergeCategoryGrowth(res?.data || []).map((item) => ({
      name: item.kind_name,
      count: Number(item.app_count) || 0,
      increase: Number(item.downloads_increase) || 0
    }));
  } catch (error) {
    // 拿不到分类就退化成「只有全部分类」，不影响榜单本身
    console.warn('Failed to load categories for rank filter:', error);
    categoryOptions.value = [];
  }
};

/* 展示方式：chart（每次进页面都从图表开始）/ list（横向排名条） */
const viewMode = ref<'list' | 'chart'>('chart');
const toggleView = () => {
  viewMode.value = viewMode.value === 'list' ? 'chart' : 'list';
  if (viewMode.value === 'list') { showTotal.value = true; showIncrement.value = false; }
  else { showTotal.value = true; showIncrement.value = true; }
};

/** 排名条模式下由哪个指标排序/画条 */
const primaryMetric = computed<'total' | 'increment'>(() =>
  showIncrement.value && !showTotal.value ? 'increment' : 'total'
);
const primaryValueOf = (item: any) =>
  primaryMetric.value === 'total'
    ? item.current_download_count || item.download_count || 0
    : item.download_increment || 0;

const formatCount = (value: number) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
};

const listRows = computed(() =>
  chartData.value
    .map((item: any) => ({
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
    .sort((a, b) => b.value - a.value)
);

/*
 * 折叠：默认只铺前 10 条，底部留一个「展开全部 N 条」，与总下载榜一致 ——
 * 名单长了在手机上要滑两屏多，看完想回到上面的图表得滑很久。
 */
const COLLAPSED_ROWS = 10;
const COLLAPSE_OVER = 12;
const expanded = ref(false);
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


const openApp = (row: { app_id?: string }) => {
  if (row?.app_id) router.push({ name: 'app-dashboard', query: { app_id: row.app_id } });
};

const goToRank = () => {
  if (route.path !== '/rank/non-huawei') {
    router.push('/rank/non-huawei');
  }
};

const toggleTotal = () => {
  if (viewMode.value === 'chart') {
    showTotal.value = !showTotal.value;
    updateVisibility();
  } else {
    selectMetric('total');
  }
};

const toggleIncrement = () => {
  if (viewMode.value === 'chart') {
    showIncrement.value = !showIncrement.value;
    updateVisibility();
  } else {
    selectMetric('increment');
  }
};

/** 排名条模式下两个标签是单选（条形画哪个指标），图表模式下仍是各自开关 */
const selectMetric = (metric: 'total' | 'increment') => {
  const next = primaryMetric.value === metric ? (metric === 'total' ? 'increment' : 'total') : metric;
  showTotal.value = next === 'total';
  showIncrement.value = next === 'increment';
};

const updateVisibility = () => {
  if (!chartInstance || !chartData.value.length) return;
  
  const data = chartData.value;
  const downloads = data.map(item => item.current_download_count || item.download_count);
  const increments = data.map(item => item.download_increment || 0);

  // Determine icon data source
  // If Total is shown, icons follow Total (yAxis 0)
  // If Total is hidden but Increment is shown, icons follow Increment (yAxis 1)
  const useTotalForIcons = showTotal.value;
  const iconData = useTotalForIcons 
    ? data.map((item, index) => ({
        value: downloads[index],
        symbol: 'image://' + (item.icon_url || '')
      }))
    : data.map((item, index) => ({
        value: increments[index],
        symbol: 'image://' + (item.icon_url || '')
      }));
  
  const iconYAxisIndex = useTotalForIcons ? 0 : 1;
  const showIcons = showTotal.value || showIncrement.value;

  chartInstance.setOption({
    legend: {
      selected: {
        '总下载量': showTotal.value,
        '图标': showIcons,
        '新增下载': showIncrement.value
      }
    },
    yAxis: [
      { show: showTotal.value },
      { show: showIncrement.value }
    ],
    series: [
      {
        // Total bar
      },
      {
        name: '图标',
        yAxisIndex: iconYAxisIndex,
        data: iconData
      },
      {
        // Increment line
      }
    ]
  });
};

const initChart = () => {
  // 切到排名条时图表容器被销毁，再切回来要重新建实例
  if (viewMode.value !== 'chart' || !chartRef.value) return;
  // 先把尺寸观察挂上：容器真拿到宽度后要靠它补一次（下面可能直接 return）
  ensureResizeObserver();
  /*
   * 容器还没量出尺寸就先别建实例。
   * 面板是懒加载的，挂载那一瞬间容器宽度可能还是 0；echarts.init 在 0 尺寸容器上
   * 会退化成 100×100，之后只要没有 resize 触发（手机上没人会去拉窗口），
   * 图表就一直是"缩在卡片左边一小条"的样子 —— 移动端就是这么中招的。
   */
  if (!chartRef.value.clientWidth || !chartRef.value.clientHeight) return;
  if (!chartInstance) chartInstance = echarts.init(chartRef.value);
  if (!chartData.value.length) {
    chartInstance.clear();
    return;
  }
  const data = chartData.value;
  
  const names = data.map(item => item.name);
  const downloads = data.map(item => item.current_download_count || item.download_count);
  const increments = data.map(item => item.download_increment || 0);
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      show: false,
      selected: {
        '总下载量': showTotal.value,
        '图标': true,
        '新增下载': showIncrement.value
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '15%',
      containLabel: true
    },
    dataZoom: [
      {
        type: 'slider',
        show: true,
        xAxisIndex: [0],
        startValue: 0,
        endValue: 9,
        bottom: '2%'
      },
      {
        type: 'inside',
        xAxisIndex: [0],
        startValue: 0,
        endValue: 9
      }
    ],
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: {
        interval: 0,
        rotate: 45
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '总下载量',
        position: 'left',
        alignTicks: true,
        axisLine: {
          show: true,
          lineStyle: {
            color: '#EE6666'
          }
        },
        axisLabel: {
          formatter: function (value: number) {
             if (value > 100000000) return (value / 100000000).toFixed(0) + '亿';
             if (value > 10000) return (value / 10000).toFixed(0) + 'w';
             return value;
          }
        }
      },
      {
        type: 'value',
        name: '新增下载',
        position: 'right',
        alignTicks: true,
        axisLine: {
          show: true,
          lineStyle: {
            color: '#91CC75'
          }
        },
        axisLabel: {
          formatter: function (value: number) {
             if (value > 100000000) return (value / 100000000).toFixed(0) + '亿';
             if (value > 10000) return (value / 10000).toFixed(0) + 'w';
             return value;
          }
        }
      }
    ],
    series: [
      {
        name: '总下载量',
        type: 'bar',
        data: downloads,
        itemStyle: {
          color: '#EE6666'
        },
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
        label: {
          show: false
        }
      },
      {
        name: '新增下载',
        type: 'line',
        yAxisIndex: 1,
        data: increments,
        itemStyle: {
          color: '#91CC75'
        }
      }
    ]
  };
  
  chartInstance.setOption(option);

  chartInstance.on('click', (params) => {
    const item = chartData.value[params.dataIndex];
    if (item && item.app_id) {
      router.push({ name: 'app-dashboard', query: { app_id: item.app_id } });
    }
  });
};

const fetchData = async () => {
  try {
    // 多要几条再裁：服务端会从结果里删掉被屏蔽的异常应用（上游 total 不变），
    // 正好要 30 条时会少一两个。详见 TotalDownloadRank 里的同一处注释。
    const FETCH_EXTRA = 6;
    const fetchSize = pageSize.value + FETCH_EXTRA;
    let apps: any[] = [];

    if (activeCategory.value) {
      /*
       * 选了分类：按上游原始 kind_name 精确查（下拉就是按这个口径来的，
       * 所以选项里的数量和筛出来的条数一致）。
       * 同时带上非华为条件，候选池才是「该分类下的非华为应用」。
       */
      const categoryRes: any = await getAppsByCategory(
        activeCategory.value.name,
        1,
        fetchSize,
        undefined,
        undefined,
        { sort: 'download_count', desc: true, excludeHuawei: true }
      );
      apps = (categoryRes?.data || []).slice(0, pageSize.value);
    } else {
      const listResponse = await hmApi.get<any>('/apps/list/1', {
        page_size: fetchSize,
        sort: 'download_count',
        desc: true,
        exclude_huawei: true,
        // 榜单要显示下载量，必须完整信息
        detail: true
      });
      apps = (listResponse.data?.data || []).slice(0, pageSize.value);
    }

    // 2. Fetch Growth data to map increments
    let growthMap = new Map<string, number>();
    try {
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
      current_download_count: item.download_count,
      download_increment: growthMap.get(item.pkg_name) || 0
    }));

    // 4. Fallback for 0 increment
    const appsToFetch = apps.filter((item: any) => item.download_increment === 0 && item.pkg_name);
    
    if (appsToFetch.length > 0) {
      await Promise.all(appsToFetch.map(async (item: any) => {
          try {
              const res = await hmApi.get<any>(`/apps/metrics/${item.pkg_name}`);
              let metrics = Array.isArray(res) ? res : (res.data || []);
              
              if (Array.isArray(metrics) && metrics.length >= 2) {
                   metrics.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                   const latest = metrics[0];
                   const prev = metrics[1];
                   const inc = Math.max(0, latest.download_count - prev.download_count);
                   item.download_increment = inc;
              }
          } catch (e) {
              // ignore
          }
      }));
    }
    
    // 5. Fetch details for icons (if missing)
    const appsWithIcons = await Promise.all(apps.map(async (item: any) => {
      if (!item.icon_url && item.pkg_name) {
         try {
           const detailRes = await hmApi.get<any>('/apps/list/1', {
             search_key: 'pkg_name',
             search_value: item.pkg_name,
             search_exact: true,
             page_size: 1,
             // 只补一个图标，取简略信息即可
             detail: false
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

    chartData.value = appsWithIcons;
    initChart();
  } catch (error) {
    console.error('Failed to fetch non-huawei download rank:', error);
  }
};

/* 分类双向同步：本卡改动通知父组件，父组件改了本卡也跟着换 */
watch(category, (value) => {
  if (value !== props.category) emit('update:category', value);
});
watch(
  () => props.category,
  (value) => {
    if (value === category.value) return;
    category.value = value;
    void fetchData();
  }
);

const handleResize = () => {
  if (viewMode.value !== 'chart' || !chartRef.value) return;
  const el = chartRef.value;
  if (!el.clientWidth || !el.clientHeight) return;
  // 之前容器还没尺寸、没能建实例的，这里补建
  if (!chartInstance) {
    initChart();
    return;
  }
  chartInstance.resize();
};

let resizeObserver: ResizeObserver | null = null;
/** 观察器当前盯着的元素，换了容器（切回图表模式）要重新挂 */
let observedEl: HTMLElement | null = null;

const ensureResizeObserver = () => {
  const el = chartRef.value;
  if (!el || el === observedEl) return;
  resizeObserver?.disconnect();
  if (!resizeObserver) resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(el);
  observedEl = el;
};

/**
 * 图表容器是 v-if 控制的：切到排名条时容器被销毁（实例必须跟着 dispose，
 * 否则 echarts 会抱着一块已经不存在的 canvas），切回来再重建。
 */
watch(viewMode, async (mode) => {
  if (mode === 'chart') {
    await nextTick();
    initChart();
  } else {
    chartInstance?.dispose();
    chartInstance = null;
  }
});

onMounted(() => {
  fetchData();
  // 分类选项单独加载（与图表数据分开请求，失败只退化成「全部分类」）
  loadCategories();
  window.addEventListener('resize', handleResize);
  ensureResizeObserver();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  observedEl = null;
  chartInstance?.dispose();
});
</script>

<style scoped>
.chart-card {
  margin-bottom: 20px;
}

/*
 * 列表模式时底部那颗「展开全部 / 收起」就是这张卡的页脚：
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
/* 两个筛选框成组，桌面端排布和以前完全一致 */
.header-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.card-title {
  white-space: nowrap;
}
@media (max-width: 768px) {
  /*
    标题和条数下拉必须待在同一行（原来用 display:contents 拆开，
    下拉会被单独挤到第二行 —— 就是"筛选框被换行了"）。
  */
  .card-header {
    height: auto;
    row-gap: 8px;
  }

  /*
   * 窄屏排成两行：
   *   第 1 行：标题（左） + 总量/增量/切换（右）
   *   第 2 行：两个筛选框整行
   * 挤在一行的话两个下拉会被 flex 压窄，「全部分类」「30条」都会被截断。
   * 用 grid 摆放，所以这里让 .header-left 不再参与布局（display: contents），
   * 标题 / 筛选组 / 切换按钮直接按网格定位。
   */
  .card-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 8px;
    row-gap: 6px;
  }
  .header-left {
    display: contents;
  }
  .card-title {
    grid-area: 1 / 1 / 2 / 2;
    min-width: 0;
    /* 极窄屏（≲330）时标题让位给右侧按钮，省略号收尾而不是压到按钮上 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    grid-area: 1 / 2 / 2 / 3;
    justify-self: end;
    margin-left: 0;
  }
  .header-filters {
    grid-area: 2 / 1 / 3 / 3;
    min-width: 0;
  }
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.view-toggle {
  width: 24px;
  height: 24px;
  padding: 0;
}
.rank-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 6px;
  padding: 10px 2px;
  border: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 12px;
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
.cursor-pointer {
  cursor: pointer;
}

.title-link {
  cursor: pointer;
  transition: color 0.3s;
}

.title-link:hover {
  color: var(--el-color-primary);
}
</style>
