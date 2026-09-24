<template>
  <span class="animated-number">{{ display }}</span>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

/**
 * 数字滚动：数值变化时从「当前显示值」平滑滚到新值；
 * epoch 变化时（例如点了「刷新状态」）从头 0 → 目标值重播一次，保证有可见的滚动效果。
 */
const props = withDefaults(
  defineProps<{
    value: number;
    duration?: number;
    epoch?: number;
    formatter?: (n: number) => string;
  }>(),
  { duration: 600, epoch: 0 }
);

const fmt = (n: number) => (props.formatter ? props.formatter(n) : Math.round(n).toLocaleString());

const display = ref('0');
let raf = 0;
let timer = 0;
let startTs = 0;
let fromVal = 0;
let toVal = 0;

const stop = () => {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
};

const run = (from: number, to: number, duration: number) => {
  stop();
  fromVal = from;
  toVal = to;
  startTs = 0;
  if (duration <= 0 || fromVal === toVal) {
    display.value = fmt(toVal);
    return;
  }
  const step = (ts: number) => {
    if (!startTs) startTs = ts;
    const p = Math.min(1, (ts - startTs) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    display.value = fmt(fromVal + (toVal - fromVal) * eased);
    if (p < 1) {
      raf = requestAnimationFrame(step);
    } else {
      display.value = fmt(toVal);
      raf = 0;
    }
  };
  raf = requestAnimationFrame(step);
  // 兜底：后台标签页 rAF 会被节流/暂停，超时后直接落到目标值
  timer = window.setTimeout(() => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    display.value = fmt(toVal);
    timer = 0;
  }, duration + 300);
};

/** 从当前显示的文本里反解出数字，作为下一次滚动的起点 */
const currentValue = () => {
  const n = Number(String(display.value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

onMounted(() => run(0, props.value || 0, props.duration * 1.4));

watch(
  () => props.value,
  (v) => run(currentValue(), v || 0, props.duration)
);

watch(
  () => props.epoch,
  () => run(0, props.value || 0, props.duration * 1.4)
);

onUnmounted(stop);
</script>

<style scoped>
.animated-number {
  font-variant-numeric: tabular-nums;
}
</style>
