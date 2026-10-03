<template>
  <!--
    OpenStore 角标（顶部导航 / 后台品牌位 / 登录页品牌位共用）。
      · 造型取自 /favicon.svg 的 tile 内容：圆环 + 一条短横线，去掉底板/网格/辉光/文字。
      · 之所以内联成组件而不是继续用 CSS mask：mask 只取 alpha 通道、整块被 background-color
        染成同一个颜色，没法让「圆环跟主题走、横线固定鸿蒙蓝」。内联后圆环用 currentColor
        继承外层文字色，横线写死品牌蓝，两个诉求同时成立。
      · 尺寸交给 size 属性，颜色交给外层 CSS 的 color，组件本身不预设配色。
  -->
  <svg
    class="brand-mark-svg"
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
    role="img"
    aria-label="OpenStore"
    focusable="false"
  >
    <circle cx="50" cy="41" r="29" fill="none" stroke="currentColor" stroke-width="11" />
    <path d="M26 89H74" fill="none" stroke="#0A59F7" stroke-width="9" stroke-linecap="round" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<style scoped>
.brand-mark-svg {
  display: block;
  flex: 0 0 auto;
}
</style>
