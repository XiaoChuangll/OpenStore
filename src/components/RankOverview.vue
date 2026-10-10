<template>
  <div class="rank-overview">
    <el-tabs v-model="activeTab" class="rank-tabs" stretch>
      <el-tab-pane :label="labels.total" name="total" lazy>
        <div class="pane-stack" :class="{ 'classic-first': classicFirst }">
          <TopAppsStackedChart v-if="showStacked" class="rank-block-stacked" />
          <TotalDownloadRank v-if="showClassic" class="rank-block-classic" />
        </div>
      </el-tab-pane>
      <el-tab-pane :label="labels.growth" name="growth" lazy>
        <div class="pane-stack" :class="{ 'classic-first': classicFirst }">
          <TopAppsStackedChart v-if="showStacked" class="rank-block-stacked" title="增长最快的应用" rank-by="growth" />
          <GrowthChart v-if="showClassic" class="rank-block-classic" />
        </div>
      </el-tab-pane>
      <el-tab-pane :label="labels.history" name="history" lazy>
        <div class="pane-stack" :class="{ 'classic-first': classicFirst }">
          <TopAppsStackedChart v-if="showStacked" class="rank-block-stacked" title="热门应用累计下载量" mode="cumulative" :default-days="60" />
          <HistoryChart v-if="showClassic" class="rank-block-classic" />
        </div>
      </el-tab-pane>
      <el-tab-pane :label="labels.nonHuawei" name="non-huawei" lazy>
        <div class="pane-stack" :class="{ 'classic-first': classicFirst }">
          <!-- 分类两张卡共用：堆叠用量图跟着榜单卡的分类筛选走 -->
          <TopAppsStackedChart v-if="showStacked" class="rank-block-stacked" title="非华为应用用量" exclude-huawei :category="nonHuaweiCategory" />
          <NonHuaweiChart v-if="showClassic" v-model:category="nonHuaweiCategory" class="rank-block-classic" />
        </div>
      </el-tab-pane>
      <el-tab-pane :label="labels.category" name="category" lazy>
        <div class="pane-stack">
          <CategoryGrowthRank class="rank-block-stacked" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TotalDownloadRank from './TotalDownloadRank.vue';
import GrowthChart from './GrowthChart.vue';
import HistoryChart from './HistoryChart.vue';
import NonHuaweiChart from './NonHuaweiChart.vue';
import TopAppsStackedChart from './TopAppsStackedChart.vue';
import CategoryGrowthRank from './CategoryGrowthRank.vue';

/*
 * 后台「首页配置 → 榜单排行」可以选前台展示哪种卡片：
 * classic=经典图表（原有那几张） / stacked=堆叠用量图 / both=两个都显示。
 */
const props = withDefaults(
  defineProps<{
    rankVariant?: 'classic' | 'stacked' | 'both';
    /** 两个都显示时谁在上面（默认堆叠用量图在上） */
    rankOrder?: 'stacked' | 'classic';
  }>(),
  {
    rankVariant: 'classic',
    rankOrder: 'stacked'
  }
);

const activeTab = ref('total');
/** 非华为榜的分类筛选：堆叠用量图 + 榜单卡共用 */
const nonHuaweiCategory = ref('');
const showStacked = computed(() => props.rankVariant !== 'classic');
const showClassic = computed(() => props.rankVariant !== 'stacked');
/** 只有「两个都显示」时顺序才有意义 */
const classicFirst = computed(() => props.rankVariant === 'both' && props.rankOrder === 'classic');

/*
 * 页签名称固定用榜单的正式名字，和榜单页顶部的名字一致。
 * （以前会跟着后台「首页配置 → 榜单排行」选的卡片样式在两组叫法之间切 ——
 *   同一个页签两套名字，用户看着容易以为是两个榜单，现在统一成一套。）
 */
const labels = {
  total: '总榜',
  growth: '飙升榜',
  history: '下载量',
  nonHuawei: '第三方应用榜',
  category: '分类榜'
};
</script>

<style scoped>
.rank-overview {
  margin-top: 20px;
}

/*
 * 两张卡片的上下顺序：用 flex order 控制，模板顺序不动。
 * 默认「堆叠用量图在上」，后台选「经典图表在上」时整体换过来。
 */
.pane-stack {
  display: flex;
  flex-direction: column;
}

.rank-block-stacked { order: 1; }
.rank-block-classic { order: 2; }
.pane-stack.classic-first .rank-block-stacked { order: 2; }
.pane-stack.classic-first .rank-block-classic { order: 1; }

/*
 * 两张卡片之间靠各自 20px 的 margin-bottom 撑开，所以「视觉上排最后的那张」要去掉外边距。
 * 不能按 DOM 的 :last-child 判断 —— 这里用 flex order 换过位置，
 * DOM 里永远是 [堆叠, 经典]，视觉顺序得看 .classic-first。
 * （之前就是这里判断错了，导致两张卡直接贴在一起。）
 */
.pane-stack:not(.classic-first) .rank-block-classic:not(:only-child),
.pane-stack.classic-first .rank-block-stacked:not(:only-child) {
  margin-bottom: 0;
}

/* 两张卡片同时显示时保持和其它板块一致的 20px 间距 */
.rank-overview :deep(.chart-card) {
  margin-bottom: 20px;
}

/* 注意：不要再按 :last-child 去清外边距 —— 视觉顺序是 flex order 决定的，
   真正的"最后一张"由下面 .pane-stack 那两条规则处理。 */

:deep(.el-tabs__header) {
  margin-bottom: 20px;
}
:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
</style>
