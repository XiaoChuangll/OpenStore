<template>
  <el-table :data="visitors" style="width: 100%" stripe v-loading="loading">
    <el-table-column prop="timestamp" label="时间" width="200" :formatter="formatTime" />
    <el-table-column prop="ip" label="访客 IP" width="150" />
    <el-table-column prop="location" label="地区" width="150" />
    <el-table-column prop="path" label="访问路径" min-width="150" show-overflow-tooltip />
    <el-table-column prop="device" label="设备" show-overflow-tooltip />
  </el-table>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getVisitors, type Visitor } from '../services/api';

const visitors = ref<Visitor[]>([]);
const loading = ref(false);

const formatTime = (row: Visitor) => {
  try {
    const s = row.timestamp;
    const iso = s.includes('T') ? (s.endsWith('Z') ? s : s + 'Z') : s.replace(' ', 'T') + 'Z';
    const date = new Date(iso);
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch (e) {
    return row.timestamp;
  }
};

const fetchVisitors = async () => {
  loading.value = true;
  visitors.value = await getVisitors();
  loading.value = false;
};

onMounted(() => {
  fetchVisitors();
});
</script>

<style scoped>
.mt-4 {
  margin-top: 20px;
}
</style>
