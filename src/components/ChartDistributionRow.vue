<template>
  <el-row :gutter="20" class="mt-4 charts-row">
    <el-col :span="8" :xs="24">
      <RatingPieChart />
    </el-col>
    <el-col :span="8" :xs="24">
      <TargetSdkPieChart />
    </el-col>
    <el-col :span="8" :xs="24">
      <MinSdkPieChart />
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
// 首页「评分与 SDK 分布」板块：三张环形图并排，抽成组件才能被卡片顺序配置整体调换位置
import RatingPieChart from './RatingPieChart.vue';
import TargetSdkPieChart from './TargetSdkPieChart.vue';
import MinSdkPieChart from './MinSdkPieChart.vue';
</script>

<style scoped>
.mt-4 {
  margin-top: 20px;
}
</style>
