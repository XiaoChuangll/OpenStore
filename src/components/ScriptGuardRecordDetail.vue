<template>
  <div class="record-detail">
    <div class="detail-grid">
      <div class="detail-item is-full">
        <span class="detail-label">User-Agent</span>
        <span class="detail-value is-mono">{{ record.ua || '(空)' }}</span>
      </div>

      <div class="detail-item is-full">
        <span class="detail-label">触发请求</span>
        <span class="detail-value is-mono">{{ record.path || '—' }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">来源 IP</span>
        <span class="detail-value is-mono">{{ record.ip || '—' }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">地区</span>
        <span class="detail-value">{{ record.location || '未知地区' }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">触发时间</span>
        <span class="detail-value">{{ formatTime(record.created_at) }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">封禁至</span>
        <span class="detail-value">
          {{ expiresText }}
          <span v-if="!active" class="detail-muted">（已过期）</span>
        </span>
      </div>

      <div class="detail-item">
        <span class="detail-label">违规次数</span>
        <span class="detail-value">第 {{ record.strikes }} 次（封禁时长按 4 倍递增）</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">本次封禁</span>
        <span class="detail-value">{{ humanMs(record.block_ms) }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">触发时已用</span>
        <span class="detail-value">{{ record.hits }} 次配额</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">记录 ID</span>
        <span class="detail-value">#{{ record.id }}</span>
      </div>
    </div>

    <div v-if="active" class="detail-actions">
      <el-button type="primary" size="small" plain @click.stop="emit('unblock', record.ip)">
        解除该 IP 的封禁
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 * 一条拦截记录的展开详情。
 * 表格的展开行和窄屏的卡片共用这一个组件，避免两处各写一遍字段。
 * 只负责展示，解封动作通过事件抛给父组件。
 */
import { computed } from 'vue';
import type { ScriptGuardBlockRecord } from '../services/admin';

const props = defineProps<{
  record: ScriptGuardBlockRecord;
  /** 该 IP 当前是否仍在封禁期内（父组件根据内存态判断） */
  active: boolean;
}>();

const emit = defineEmits(['unblock']);

/** 库里存的是 UTC，按和访客日志一致的口径转东八区 */
const formatTime = (val: string) => {
  const date = toDate(val);
  if (!date) return val || '';
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const toDate = (val: string) => {
  if (!val) return null;
  const date = new Date(val.endsWith('Z') ? val : val.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
};

/** 封禁到期时间 = 记录时间 + 封禁时长 */
const expiresText = computed(() => {
  const base = toDate(props.record.created_at);
  if (!base) return '—';
  const end = new Date(base.getTime() + (Number(props.record.block_ms) || 0));
  return end.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
});

const humanMs = (ms: number) => {
  const n = Number(ms) || 0;
  if (n >= 3600000) return `${Math.round(n / 3600000)} 小时`;
  if (n >= 60000) return `${Math.round(n / 60000)} 分钟`;
  return `${Math.max(1, Math.round(n / 1000))} 秒`;
};
</script>

<style scoped>
.record-detail {
  padding: 4px 8px 4px 4px;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px 20px;
}
.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.detail-item.is-full {
  grid-column: 1 / -1;
}
.detail-label {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.detail-value {
  font-size: 13px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
.detail-value.is-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.detail-muted {
  color: var(--el-text-color-placeholder);
}
.detail-actions {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
</style>
