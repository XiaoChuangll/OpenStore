<template>
  <span class="animated-number" :class="{ 'is-bumping': bumping }">{{ Math.round(display).toLocaleString() }}</span>
</template>

<script setup lang="ts">
/*
 * 数字滚动：值变化时从旧值补间到新值，并轻微放大一下，
 * 用来表现「数据在实时跳动」。纯展示组件，不改变任何业务数据。
 */
import { onUnmounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ value?: number; duration?: number }>(), {
  value: 0,
  duration: 480
});

const display = ref(props.value || 0);
const bumping = ref(false);

let rafId: number | null = null;
let bumpTimer: number | null = null;

const stopRaf = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

const animate = (from: number, to: number) => {
  stopRaf();
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / props.duration);
    // easeOutCubic：先快后慢，读起来更像计数器在追数字
    const eased = 1 - Math.pow(1 - progress, 3);
    display.value = from + (to - from) * eased;
    if (progress < 1) rafId = requestAnimationFrame(step);
    else {
      display.value = to;
      rafId = null;
    }
  };
  rafId = requestAnimationFrame(step);
};

watch(
  () => props.value,
  (next, prev) => {
    const target = Number(next) || 0;
    const from = Number(prev) || 0;
    if (target === from) return;

    animate(display.value, target);

    // 放大一下再回位，避免数字悄悄变了看不出来
    bumping.value = false;
    if (bumpTimer !== null) window.clearTimeout(bumpTimer);
    requestAnimationFrame(() => {
      bumping.value = true;
      bumpTimer = window.setTimeout(() => {
        bumping.value = false;
        bumpTimer = null;
      }, 520);
    });
  },
  { immediate: true }
);

onUnmounted(() => {
  stopRaf();
  if (bumpTimer !== null) window.clearTimeout(bumpTimer);
});
</script>

<style scoped>
.animated-number {
  display: inline-block;
  font-variant-numeric: tabular-nums;
  transform-origin: left center;
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.24s ease;
}

.animated-number.is-bumping {
  transform: scale(1.06);
}
</style>
