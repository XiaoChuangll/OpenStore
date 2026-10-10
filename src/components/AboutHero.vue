<template>
  <section class="about-hero" :style="gridVars">
    <!-- 背景纹理：GitHub 贡献图式的圆角格子，缓慢向左滚动 -->
    <div ref="gridRef" class="hero-grid" :class="{ 'is-text': useText }" aria-hidden="true">
      <div class="hero-grid-scroll">
        <svg
          class="hero-grid-accent"
          :viewBox="`0 0 ${totalCols} ${gridRows}`"
          preserveAspectRatio="none"
        >
          <!--
            底纹和绿格必须落在同一套坐标里。
            以前底纹是「CSS mask 平铺 public/hero-grid.svg」，绿格是「另一个 SVG 按 viewBox 拉伸」——
            两条路径各自做子像素取整，在 DPR 不是 1 的设备上格子原点会对不上，
            绿块就跑到格子外面去了。现在底纹改成同一个 SVG 里的 <pattern>，
            单位就是 viewBox 的格，和绿格共享同一个变换，任何设备都对得齐。
          -->
          <defs>
            <pattern id="hero-grid-cell" width="1" height="1" patternUnits="userSpaceOnUse">
              <rect
                class="hero-grid-base-cell"
                :x="GREEN_CELL_INSET"
                :y="GREEN_CELL_INSET"
                :width="GREEN_CELL_SIZE"
                :height="GREEN_CELL_SIZE"
                :rx="GREEN_CELL_RX"
              />
            </pattern>
          </defs>
          <rect
            class="hero-grid-base"
            x="0"
            y="0"
            :width="totalCols"
            :height="gridRows"
            fill="url(#hero-grid-cell)"
          />
          <g class="hero-grid-cells">
            <rect
              v-for="cell in greenCells"
              :key="cell.key"
              :x="cell.x + GREEN_CELL_INSET"
              :y="cell.y + GREEN_CELL_INSET"
              :width="GREEN_CELL_SIZE"
              :height="GREEN_CELL_SIZE"
              :rx="GREEN_CELL_RX"
              :fill-opacity="cell.opacity"
            />
          </g>
        </svg>
      </div>
    </div>

    <div class="hero-body">
      <!--
        产品 logo：直接用站点图标 public/favicon.svg（深色 tile + 网格 + 圆环 + 蓝线 + 站名）。
        它自带 8.3% 的透明留白（视口 240、底板 20→220），所以元素尺寸要按 240/200 放大，
        底板的实际视觉边长才等于 76px。
      -->
      <img src="/favicon.svg" alt="" class="hero-logo" />

      <div class="hero-main">
        <div class="hero-title-row">
          <h1 class="hero-title">{{ displayName }}</h1>
          <span v-if="displayVersion" class="hero-version">v{{ displayVersion }}</span>
        </div>
        <p v-if="tagline" class="hero-tagline">{{ tagline }}</p>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { GREEN_COLOR, GREEN_OPACITIES, GREEN_PERIOD_COLS, greenCellOpacity, textToCells } from '../utils/hero-grid';

const props = defineProps<{
    siteName?: string;
    tagline?: string;
    version?: string;
    /**
     * 背景绿格要拼的文字。留空 = 原来的随机贡献图。
     * 填了之后不再滚动（文字要停在原地），格子也会为它重新算尺寸。
     */
    gridText?: string | null;
  }>();

const displayName = computed(() => props.siteName?.trim() || 'OpenStore');

/*
 * 版本号来自更新日志接口，库里可能已经带着 v（如 v2.0.1），也可能只存 2.0.1。
 * 模板固定要加前缀，这里统一先剥掉再拼，避免出现 vv2.0.1。
 */
const displayVersion = computed(() => (props.version || '').trim().replace(/^v/i, ''));

/** 期望的格子步长（实际会按卡片尺寸微调，保证行列都是整数） */
const GRID_TARGET_CELL = 14;
/**
 * 拼文字时用更细的格子：字号是跟着卡片高度走的，格子越细 = 覆盖文字的格子越多、
 * 字形越准。14px 那种大格只有 10 行，字母会糊成方块。
 */
const GRID_TARGET_CELL_TEXT = 6;
/** 底纹向左滚动的速度（px/秒），实际时长按滚动一个周期的距离换算 */
const GRID_DRIFT_SPEED = 5;
/** 格子内部的留白与圆角（单位是「格」，和 about-nameplate.ts 的 2.5/14、9/14、2/14 对齐） */
const GREEN_CELL_INSET = 2.5 / 14;
const GREEN_CELL_SIZE = 9 / 14;
const GREEN_CELL_RX = 2 / 14;

const gridRef = ref<HTMLElement | null>(null);
const gridSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;

/** 后台配置的文字（留空 = 原来的随机格子） */
const gridText = computed(() => (props.gridText || '').trim());
const useText = computed(() => gridText.value.length > 0);

/*
 * 格子自适应卡片：按卡片尺寸取整数行列，格子尺寸 = 卡片尺寸 / 行列数，
 * 于是纹理总是整列整行铺满，不会在边缘切出半格。
 * 量的是纹理层自身（内边距盒），不是卡片外框 —— 用外框量会多算 1px 边框，
 * 最后一列/行被多切一点，上下（左右）缝隙就不一样宽了。
 */
const measureGrid = () => {
  const el = gridRef.value;
  if (!el) return;
  const { width, height } = el.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  if (width === gridSize.value.width && height === gridSize.value.height) return;
  gridSize.value = { width, height };
};

const targetCell = computed(() => (useText.value ? GRID_TARGET_CELL_TEXT : GRID_TARGET_CELL));
const gridCols = computed(() => Math.max(1, Math.round(gridSize.value.width / targetCell.value)));
const gridRows = computed(() => Math.max(1, Math.round(gridSize.value.height / targetCell.value)));
const cellW = computed(() => gridSize.value.width / gridCols.value);
const cellH = computed(() => gridSize.value.height / gridRows.value);

/*
 * 横向要多铺一份才够滚动：
 *   - 随机格子：多铺一个 128 列的周期（哈希本身按 128 列循环）；
 *   - 拼文字：把文字按「一屏宽」重复一份，滚动一屏后正好接上，同样无缝。
 */
const driftCols = computed(() => (useText.value ? gridCols.value : GREEN_PERIOD_COLS));
const totalCols = computed(() => gridCols.value + driftCols.value);

const gridVars = computed<Record<string, string>>(() => ({
  '--hero-grid-green': GREEN_COLOR,
  '--grid-cell-w': `${cellW.value}px`,
  '--grid-cell-h': `${cellH.value}px`,
  // 滚动一个周期的距离（随机 = 128 列；文字 = 一屏宽）
  '--grid-drift': `${cellW.value * driftCols.value}px`,
  // 按同一速度换算时长，卡片大小变化时观感一致
  '--grid-drift-duration': `${Math.max(1, Math.round((cellW.value * driftCols.value) / GRID_DRIFT_SPEED))}s`
}));

/*
 * 点亮格：
 *   - 配了文字 → 把文字栅格化成格子（不滚动，文字停在中间）；
 *   - 没配文字 → 按 (列, 行) 哈希生成的随机贡献图（要多出一个周期用于滚动）。
 * 坐标用「格」为单位（viewBox 也是格数），SVG 拉伸后正好落在底纹的格点上。
 */
const greenCells = computed<{ key: string; x: number; y: number; opacity: number }[]>(() => {
  const cells: { key: string; x: number; y: number; opacity: number }[] = [];
  if (!gridCols.value || !gridRows.value) return cells;

  if (useText.value) {
    /*
     * 文字统一用最亮那一档，读起来才清楚；再按一屏宽复制一份供无缝滚动。
     * 起步对齐到格子左边 —— 动画是往左滚的，这样每一份都是从「文字开头」
     * 从右边滚进来（居中起步的话，一开始看到的就是半截）。
     */
    const lit = textToCells(gridText.value, gridCols.value, gridRows.value, { align: 'left', sample: 8 });
    const brightest = GREEN_OPACITIES[GREEN_OPACITIES.length - 1];
    for (const offset of [0, gridCols.value]) {
      for (const { col, row } of lit) {
        cells.push({ key: `${offset}-${col}-${row}`, x: col + offset, y: row, opacity: brightest });
      }
    }
    return cells;
  }

  for (let row = 0; row < gridRows.value; row += 1) {
    for (let col = 0; col < totalCols.value; col += 1) {
      const opacity = greenCellOpacity(col, row);
      if (opacity > 0) cells.push({ key: `${col}-${row}`, x: col, y: row, opacity });
    }
  }
  return cells;
});

onMounted(() => {
  measureGrid();
  if (typeof ResizeObserver === 'undefined' || !gridRef.value) return;
  resizeObserver = new ResizeObserver(measureGrid);
  resizeObserver.observe(gridRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style scoped>
.about-hero {
  position: relative;
  overflow: hidden;
  /* 不描边：默认那圈浅色边在深色下会显得像一条"白边" */
  border: 1px solid transparent;
  border-radius: 18px;
  padding: 26px 24px 22px;
  /*
   * 右上角只有一层很淡的主色洗色，不加单独的光斑。
   * 椭圆半径按参考图量的：横向到卡片 35% 处基本消失，纵向到卡片底部仍保留约一半，
   * 这样上下不会出现"上面偏蓝、下面偏绿"的割裂感。
   */
  background:
    radial-gradient(65% 330% at 100% 0%, color-mix(in srgb, var(--el-color-primary) 8%, transparent) 0%, transparent 60%),
    linear-gradient(180deg, var(--el-bg-color-overlay) 0%, var(--el-fill-color-lighter) 100%);
  box-shadow: var(--el-box-shadow-lighter);
}

/*
 * 背景纹理：GitHub 贡献图那种圆角格子，只铺在卡片右半边，并向左渐隐。
 *
 * 为什么用 CSS mask 而不是直接铺图片：mask 只取 alpha，颜色来自 background-color，
 * 所以底纹能跟着主题走（亮色是深格子、深色自动变浅格子），不必做两套图。
 *
 * 每个伪元素挂两层 mask 取交集（mask-composite: intersect）：
 *   第一层是格子纹理，第二层是一道从左到右的渐变 —— 交集就把纹理裁进了右侧、
 *   并且自带淡出过渡，不会糊到左边的 logo 与文字上。
 * 不支持 mask-composite 的浏览器会退化成「两层相加」= 纹理铺满整张卡，
 * 也就是退回到加渐隐之前的样子，不会崩。
 */
.hero-grid {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  /* 渐隐位置：40% 之前完全没有，到 78% 才铺满 */
  --hero-grid-fade: linear-gradient(
    to right,
    transparent 0%,
    transparent 40%,
    #000 78%,
    #000 100%
  );
  /* 渐隐放在外层：滚动的是它里面的纹理，淡出位置固定不动 */
  -webkit-mask-image: var(--hero-grid-fade);
  mask-image: var(--hero-grid-fade);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

/*
 * 拼文字时渐隐要放松一些：
 * 文字是从最左边起步往左滚的，如果还按原来「左侧 40% 全透明」，
 * 一进页面看到的就是一张空卡片（文字正走在看不见的那一段）。
 * 这里只保留一点淡淡的压暗，让 logo/标题仍然清楚。
 */
.hero-grid.is-text {
  --hero-grid-fade: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.18) 0%,
    rgba(0, 0, 0, 0.6) 16%,
    #000 34%,
    #000 100%
  );
}

/* 滚动层：比容器多出一个周期，向左平移一个周期后无缝衔接 */
.hero-grid-scroll {
  position: absolute;
  inset: 0;
  /* 多出一个周期的宽度，滚动到尽头时右侧仍有内容 */
  right: calc(-1 * var(--grid-drift, 1022px));
  animation: hero-grid-drift var(--grid-drift-duration, 200s) linear infinite;
  will-change: transform;
}

/* 底纹 + 绿格都在这一个 SVG 里（见模板），共享同一套 viewBox 坐标 */
.hero-grid-accent {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* 均匀底纹：pattern 里的一格，颜色/透明度保持原来的观感 */
.hero-grid-base {
  opacity: 0.06;
}

.hero-grid-base-cell {
  fill: var(--el-text-color-primary);
}

/* 绿色贡献格：由 greenCells 按坐标哈希生成，深浅由每格 fill-opacity 决定 */
.hero-grid-cells {
  fill: var(--hero-grid-green, #39d353);
  opacity: 0.28;
}

/* 向左滚动一个周期（128 列），图案按周期重复，所以衔接处无缝 */
@keyframes hero-grid-drift {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(calc(-1 * var(--grid-drift, 1022px)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-grid-scroll {
    animation: none;
  }
}

.hero-body {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

/* 产品 logo：直接用 favicon.svg，尺寸按 240/200 放大以抵消自带的透明留白 */
.hero-logo {
  flex: 0 0 auto;
  width: 91px;
  height: 91px;
  /* 阴影走 drop-shadow 而不是 box-shadow：后者会按元素方框投影，
     把 SVG 那圈透明留白也投成一块方影 */
  filter: drop-shadow(0 1px 3px rgba(15, 23, 42, 0.18));
}

.hero-main {
  flex: 1 1 auto;
  min-width: 0;
}

.hero-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-title {
  margin: 0;
  font-size: 26px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--el-text-color-primary);
}

.hero-version {
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 40%, transparent);
  background-color: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.hero-tagline {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

@media (max-width: 640px) {
  .about-hero {
    padding: 20px 16px;
    border-radius: 14px;
  }

  .hero-body {
    align-items: flex-start;
    gap: 14px;
  }

  .hero-logo {
    width: 70px;
    height: 70px;
  }

  .hero-title {
    font-size: 21px;
  }

}
</style>
