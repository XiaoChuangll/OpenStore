<template>
  <div class="rank-overview">
    <el-tabs v-model="activeTab" class="rank-tabs" stretch>
      <el-tab-pane label="总下载榜" name="total" lazy>
         <TotalDownloadRank />
      </el-tab-pane>
      <el-tab-pane label="应用下载增长对比" name="growth" lazy>
         <GrowthChart />
      </el-tab-pane>
      <el-tab-pane label="鸿蒙应用下载量历史" name="history" lazy>
         <HistoryChart />
      </el-tab-pane>
      <el-tab-pane label="非华为应用下载榜" name="non-huawei" lazy>
         <NonHuaweiChart />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TotalDownloadRank from './TotalDownloadRank.vue';
import GrowthChart from './GrowthChart.vue';
import HistoryChart from './HistoryChart.vue';
import NonHuaweiChart from './NonHuaweiChart.vue';

const activeTab = ref('total');
</script>

<style scoped>
.rank-overview {
  margin-top: 20px;
}
:deep(.el-tabs__header) {
  margin-bottom: 20px;
}
:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
</style>
