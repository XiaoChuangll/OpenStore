<template>
  <div
    class="section-card"
    :class="[variant === 'plain' ? 'is-plain' : 'is-divided', { 'is-head-wrap': headWrap }]"
  >
    <div class="section-head">
      <div class="section-left">
        <span class="section-title">{{ title }}</span>
        <slot name="meta" />
      </div>
      <slot name="actions" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/*
 * 后台「分区卡片」：标题行 + 右侧操作 + 内容区，各管理页面共用。
 *
 *   <AdminSection title="操作日志">
 *     <template #meta><span class="meta-chip">共 10 条</span></template>
 *     <template #actions><div class="head-right">…按钮…</div></template>
 *     …内容…
 *   </AdminSection>
 *
 * variant="plain" 不带分隔线（并排小卡片）；head-wrap 允许标题行换行。
 * #meta / #actions 的内容由调用方渲染，其 scoped 样式照常生效。
 */
withDefaults(
  defineProps<{ title: string; variant?: 'divided' | 'plain'; headWrap?: boolean }>(),
  { variant: 'divided', headWrap: false }
);
</script>

<style scoped>
.section-card {
  padding: 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background-color: var(--el-bg-color-overlay);
}

/* plain 变体：并排的小卡片需要自己撑开上下间距 */
.section-card.is-plain {
  margin-bottom: 20px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

/* divided 变体（默认）：标题行加一条分隔线，下面才是内容 */
.section-card.is-divided .section-head {
  /* 标题与右侧按钮保持同一行，空间不够时压缩左侧信息 */
  flex-wrap: nowrap;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.section-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.section-card.is-divided:not(.is-head-wrap) .section-left {
  overflow: hidden;
}

.section-card.is-head-wrap .section-head {
  flex-wrap: wrap;
}

.section-card.is-head-wrap .section-left {
  flex-wrap: wrap;
}

.section-card.is-plain .section-left {
  align-items: baseline;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-card.is-divided .section-title {
  white-space: nowrap;
}
</style>
