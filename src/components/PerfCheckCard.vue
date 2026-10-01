<template>
  <el-card class="perf-card" shadow="hover">
    <template #header>
      <div class="perf-header">
        <span class="perf-name">接口性能检测</span>
        <el-button
          size="small"
          type="primary"
          :icon="Odometer"
          :loading="running"
          @click="runCheck"
        >
          {{ report ? '重新检测' : '开始检测' }}
        </el-button>
      </div>
    </template>

    <div v-if="running" class="perf-running">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>正在逐个检测服务端接口…（顺序执行，避免并发排队影响耗时统计）</span>
    </div>

    <p v-else-if="!report" class="perf-empty">
      把服务端全部 GET 接口跑一遍，出性能报告 · 还没有检测记录，点右上角「开始检测」跑一次
    </p>

    <template v-else>
      <div class="perf-toolbar">
        <el-radio-group v-model="filterMode" size="small">
          <el-radio-button value="all">全部 · {{ report.total }}</el-radio-button>
          <el-radio-button value="issue">慢 / 错 · {{ issueCount }}</el-radio-button>
        </el-radio-group>
        <span v-if="checkedAtText" class="perf-time">上次检测 {{ checkedAtText }}</span>
        <span class="perf-hint">按耗时从高到低排序；耗时包含本机 HTTP 往返</span>
      </div>

      <div class="perf-table-wrap">
        <table class="perf-table">
          <thead>
            <tr>
              <th class="col-path">接口</th>
              <th class="col-status">状态</th>
              <th class="col-ms">耗时</th>
              <th class="col-size">响应大小</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.path">
              <td class="col-path" :title="row.path">{{ row.path }}</td>
              <td class="col-status">
                <span :class="statusClass(row)">{{ statusText(row) }}</span>
              </td>
              <td class="col-ms" :class="msClass(row)">{{ row.skipped ? '—' : `${row.ms}ms` }}</td>
              <td class="col-size">{{ row.skipped ? '未检测' : formatBytes(row.bytes) }}</td>
            </tr>
            <tr v-if="!visibleRows.length">
              <td colspan="4" class="perf-empty-cell">没有慢接口或失败接口 🎉</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Odometer } from '@element-plus/icons-vue';
import { runPerfCheck, type PerfCheckReport, type PerfCheckResult } from '../services/admin';

const running = ref(false);
const report = ref<PerfCheckReport | null>(null);
const filterMode = ref<'all' | 'issue'>('all');

const checkedAtText = computed(() => {
  if (!report.value?.checkedAt) return '';
  return new Date(report.value.checkedAt).toLocaleTimeString('zh-CN', { hour12: false });
});

const isIssue = (row: PerfCheckResult) => row.skipped || (!row.ok && !row.needsParam) || row.ms >= 150;
const issueCount = computed(() => (report.value?.results || []).filter(isIssue).length);

const visibleRows = computed(() => {
  const rows = report.value?.results || [];
  return filterMode.value === 'issue' ? rows.filter(isIssue) : rows;
});

const runCheck = async () => {
  if (running.value) return;
  running.value = true;
  try {
    report.value = await runPerfCheck();
    filterMode.value = report.value.failed || report.value.slow ? 'issue' : 'all';
    ElMessage.success(`检测完成：${report.value.total} 个接口，平均 ${report.value.avgMs}ms`);
  } catch (error: any) {
    ElMessage.error(error?.message || '性能检测失败');
  } finally {
    running.value = false;
  }
};

const statusText = (row: PerfCheckResult) => {
  if (row.skipped) return '跳过';
  if (row.needsParam) return '需参数';
  if (!row.status) return '失败';
  return String(row.status);
};

const statusClass = (row: PerfCheckResult) => {
  if (row.skipped) return 'is-skipped';
  if (row.needsParam) return 'is-neutral';
  if (row.ok) return 'is-ok';
  return 'is-bad';
};

const msClass = (row: PerfCheckResult) => {
  if (row.skipped) return '';
  if (row.ms >= 500) return 'is-slow';
  if (row.ms >= 150) return 'is-mid';
  return '';
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
};
</script>

<style scoped>
.perf-card {
  margin-top: 20px;
}

.perf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.perf-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.perf-running {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.perf-empty {
  margin: 0;
  padding: 18px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.perf-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

/* 上次检测时间贴着这一行的右边，方法过滤按钮在左边 */
.perf-time {
  margin-left: auto;
  /* 宽度不够时整块挪到下一行，别把「上次检测 03:16:55」拆成两行 */
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.perf-hint {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.perf-table-wrap {
  max-height: 340px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.perf-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.perf-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px;
  text-align: left;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}

.perf-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  color: var(--el-text-color-regular);
  vertical-align: middle;
}

.perf-table tbody tr:hover td {
  background-color: var(--el-fill-color-lighter);
}

.col-path {
  max-width: 0;
  width: 55%;
  font-family: 'SFMono-Regular', Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-status { width: 12%; white-space: nowrap; }
.col-ms { width: 16%; white-space: nowrap; font-variant-numeric: tabular-nums; }
.col-size { width: 17%; white-space: nowrap; font-variant-numeric: tabular-nums; }

.col-ms.is-slow { color: var(--el-color-danger); font-weight: 600; }
.col-ms.is-mid { color: var(--el-color-warning); }

.is-ok { color: var(--el-color-success); }
.is-bad { color: var(--el-color-danger); }
.is-neutral { color: var(--el-text-color-secondary); }
.is-skipped { color: var(--el-text-color-secondary); }

.perf-empty-cell {
  text-align: center;
  padding: 20px 0;
  color: var(--el-text-color-secondary);
}
</style>
