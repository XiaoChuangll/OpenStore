<template>
  <!--
    通用「横向排名条」列表：给几张榜单卡当图表的替代视图用。
    一行一个条目：排名 · 图标 · 名称 · 条形 · 数值 · 另一个指标（小字）。
    窄屏自动折成两行，不依赖旋转标签或缩放条。
  -->
  <div v-loading="loading" class="rank-bar-list">
    <ol class="rb-list">
      <li
        v-for="(row, index) in sortedRows"
        :key="row.key"
        class="rb-row"
        :class="{ 'no-index': !showIndex }"
        @click="emit('select', row)"
      >
        <span v-if="showIndex" class="rb-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <!-- 分类榜这类没有图片的榜单直接给图标组件（和 /apps 分类页同一套图标） -->
        <el-icon v-if="row.iconComponent" class="rb-icon rb-icon-glyph">
          <component :is="row.iconComponent" />
        </el-icon>
        <img
          v-else-if="row.icon"
          class="rb-icon"
          :src="row.icon"
          alt=""
          loading="lazy"
          @error="(e: any) => { e.target.style.visibility = 'hidden'; }"
        />
        <span v-else class="rb-icon is-empty"></span>

        <span class="rb-name" :title="row.name">{{ row.name }}</span>

        <span class="rb-bar">
          <i :class="`is-${tone}`" :style="{ width: barWidthOf(row.value) }"></i>
        </span>

        <span class="rb-value">{{ formatCount(row.value) }}</span>
        <span v-if="row.sub" class="rb-sub">{{ row.sub }}</span>
      </li>
    </ol>
    <p v-if="!loading && !sortedRows.length" class="rb-empty">暂无数据</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface RankBarRow {
  key: string | number;
  name: string;
  icon?: string;
  /** 图标组件：优先于 icon（icon 是图片 URL，这个是组件，用于分类这种没有图标的条目） */
  iconComponent?: any;
  value: number;
  /** 右侧小字：通常是"另一个指标"，比如总量模式下显示 +增量 */
  sub?: string;
  app_id?: string;
  pkg_name?: string;
}

const props = withDefaults(
  defineProps<{
    rows: RankBarRow[];
    /** 条形配色：总量=primary、增量=success、其它指标可传 warning/danger */
    tone?: 'primary' | 'success' | 'warning' | 'danger';
    loading?: boolean;
    /** desc=按数值排名（榜单）；none=保持传入顺序（时间序列） */
    sort?: 'desc' | 'none';
    /** 是否显示左侧序号；时间序列用日期当标题时就不需要序号 */
    showIndex?: boolean;
  }>(),
  { tone: 'primary', loading: false, sort: 'desc', showIndex: true }
);

const emit = defineEmits<{ (e: 'select', row: RankBarRow): void }>();

const sortedRows = computed(() =>
  props.sort === 'none' ? props.rows : [...props.rows].sort((a, b) => b.value - a.value)
);

/*
 * 条形按「本榜最大值 → 100%、最小值 → 12%」映射。
 * 榜单数据往往很平（比如下载量前 30 名彼此差不到 6%），从 0 起算会画出
 * 一堆一样长的条；这里只表达名次间的相对差距，真实数值就印在条形右边。
 */
const barWidthOf = (value: number) => {
  const values = sortedRows.value.map((row) => Number(row.value) || 0);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  if (!Number.isFinite(max) || max <= min) return '100%';
  const ratio = ((Number(value) || 0) - min) / (max - min);
  return `${Math.round(12 + ratio * 88)}%`;
};

/** 下载量按 万 / 亿 折算，读起来比 84709000 直观 */
const formatCount = (value: number) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
};
</script>

<style scoped>
.rank-bar-list {
  min-height: 120px;
}

.rb-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rb-row {
  display: grid;
  align-items: center;
  /*
   * 序号 | 图标 | 名称 | 条形 | 主数值 | 小字
   *
   * 每行是各自独立的 grid，所以最后两列不能给 auto —— 那样列宽按本行的文字算，
   * 行与行之间数值、小字就对不齐（数值长短不一，条形末端也会参差不齐）。
   * 固定住这两列，所有行才共用同一套竖向基准线。
   */
  grid-template-columns: 26px 22px minmax(84px, 1fr) minmax(60px, 1.2fr) 84px 140px;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

/* 不显示序号时，那一列必须一起去掉，否则整行会往前错位一格（名称被挤进 22px 的图标列） */
.rb-row.no-index {
  grid-template-columns: 22px minmax(84px, 1fr) minmax(60px, 1.2fr) 84px 140px;
}

.rb-row:hover {
  background-color: var(--el-fill-color-light);
}

.rb-index {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}

.rb-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: cover;
  background-color: var(--el-fill-color);
}

.rb-icon.is-empty {
  display: inline-block;
}

/* 图标组件版：没有图片，用分类图标 + 一层淡底，和分类页的图标观感一致 */
.rb-icon-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--el-color-primary);
}

.rb-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.rb-bar {
  display: block;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--el-fill-color);
}

.rb-bar > i {
  display: block;
  height: 100%;
  border-radius: 4px;
  transition: width 0.35s ease;
}

.rb-bar > i.is-primary {
  background: linear-gradient(90deg, var(--el-color-primary-light-5), var(--el-color-primary));
}

.rb-bar > i.is-success {
  background: linear-gradient(90deg, var(--el-color-success-light-5), var(--el-color-success));
}

.rb-bar > i.is-warning {
  background: linear-gradient(90deg, var(--el-color-warning-light-5), var(--el-color-warning));
}

.rb-bar > i.is-danger {
  background: linear-gradient(90deg, var(--el-color-danger-light-5), var(--el-color-danger));
}

.rb-value {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.rb-sub {
  min-width: 62px;
  text-align: right;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.rb-empty {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

/* 窄屏折两行：第一行 序号+图标+名称+数值，第二行 条形（跨整行）+ 小字 */
@media (max-width: 768px) {
  .rb-row {
    /* 最后一列同样固定宽度，不然窄屏下每行的数值 / 小字也对不齐 */
    grid-template-columns: 24px 20px minmax(0, 1fr) 132px;
    grid-template-areas:
      'idx icon name value'
      '.   .    bar  sub';
    row-gap: 5px;
    column-gap: 8px;
    padding: 8px 6px;
  }

  .rb-row.no-index {
    grid-template-columns: 20px minmax(0, 1fr) 132px;
    grid-template-areas:
      'icon name value'
      '.    bar  sub';
  }

  .rb-index { grid-area: idx; }
  .rb-icon { grid-area: icon; width: 20px; height: 20px; }
  .rb-name { grid-area: name; }
  .rb-bar { grid-area: bar; }
  .rb-value { grid-area: value; }
  .rb-sub { grid-area: sub; min-width: 0; }
}
</style>
