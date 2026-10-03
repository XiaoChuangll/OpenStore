<template>
  <section class="about-hero">
    <!-- 背景纹理：GitHub 贡献图式的圆角格子 -->
    <div class="hero-grid" aria-hidden="true"></div>
    <div class="hero-glow" aria-hidden="true"></div>

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

    <!--
      星标 / 仓库 / 作者 / 社交入口统一收在这条虚线下面。
      以前前三者是贴在标题底下的，和标题、简介挤在一屏里；挪下来之后「文字信息在上、
      链接与出处在下」层次更清楚，也不会把标题行撑宽。
    -->
    <div v-if="hasLinks" class="hero-links">
      <a
        v-if="showStars"
        :href="`${repoUrl}/stargazers`"
        target="_blank"
        rel="noopener"
        class="hero-chip is-link"
      >
        <el-icon><StarFilled /></el-icon>
        <span>{{ repoStars }}</span>
      </a>
      <a v-if="repoUrl" :href="repoUrl" target="_blank" rel="noopener" class="hero-chip is-link">
        <el-icon><Link /></el-icon>
        <span>{{ repoLabel }}</span>
      </a>
      <span v-if="authorName" class="hero-chip">
        <el-icon><User /></el-icon>
        <span>{{ authorName }}</span>
      </span>

      <a
        v-for="link in socialLinks"
        :key="link.url"
        :href="link.url"
        target="_blank"
        rel="noopener"
        class="hero-chip is-link hero-social-chip"
        :title="link.label"
      >
        <AboutSocialIcon :name="link.icon" />
        <span class="hero-social-label">{{ link.label }}</span>
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Link, StarFilled, User } from '@element-plus/icons-vue';
import AboutSocialIcon from './AboutSocialIcon.vue';
import type { SocialLinkItem } from '../utils/about';

const props = withDefaults(
  defineProps<{
    siteName?: string;
    tagline?: string;
    version?: string;
    authorName?: string;
    /** 已经清洗成 owner/repo 的仓库路径 */
    repoName?: string;
    /** 没取到星标时传 null，直接不显示这个 chip */
    repoStars?: number | null;
    socialLinks?: SocialLinkItem[];
  }>(),
  { repoStars: null, socialLinks: () => [] }
);

const displayName = computed(() => props.siteName?.trim() || 'OpenStore');

/*
 * 版本号来自更新日志接口，库里可能已经带着 v（如 v2.0.1），也可能只存 2.0.1。
 * 模板固定要加前缀，这里统一先剥掉再拼，避免出现 vv2.0.1。
 */
const displayVersion = computed(() => (props.version || '').trim().replace(/^v/i, ''));

const repoUrl = computed(() => {
  if (!props.repoName) return '';
  return `https://github.com/${props.repoName.replace(/^\/+/, '')}`;
});

/** 仓库 chip 上只显示 repo 名，owner 放到 title 里，窄屏更省地方 */
const repoLabel = computed(() => {
  const parts = (props.repoName || '').split('/');
  return parts[parts.length - 1] || props.repoName || '';
});

/** 星标要拿到数字、且得有仓库地址才能点进 stargazers */
const showStars = computed(() => props.repoStars !== null && !!repoUrl.value);

/*
 * 虚线下面那一行只要有任何一项就渲染。
 * 注意不能再用 socialLinks.length 当条件：社交入口为空时星标/仓库/作者仍然要显示，
 * 而那条虚线正是它们的分隔线，整行没了就会连分隔线一起消失。
 */
const hasLinks = computed(
  () =>
    showStars.value ||
    !!repoUrl.value ||
    !!(props.authorName || '').trim() ||
    props.socialLinks.length > 0
);</script>

<style scoped>
.about-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  padding: 26px 24px 22px;
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--el-color-primary) 14%, transparent) 0%, transparent 55%),
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
  pointer-events: none;
  /* 渐隐位置：40% 之前完全没有，到 78% 才铺满 */
  --hero-grid-fade: linear-gradient(
    to right,
    transparent 0%,
    transparent 40%,
    #000 78%,
    #000 100%
  );
}

.hero-grid::before,
.hero-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  -webkit-mask-repeat: repeat, no-repeat;
  mask-repeat: repeat, no-repeat;
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

/* 均匀底纹 */
.hero-grid::before {
  background-color: var(--el-text-color-primary);
  opacity: 0.06;
  -webkit-mask-image: url('/hero-grid.svg'), var(--hero-grid-fade);
  mask-image: url('/hero-grid.svg'), var(--hero-grid-fade);
  -webkit-mask-size: 14px 14px, auto;
  mask-size: 14px 14px, auto;
}

/* 绿色贡献格：SVG 里每格 fill-opacity 不同，经 mask 转成不同强度，形成浓淡分布 */
.hero-grid::after {
  background-color: #39d353;
  opacity: 0.28;
  -webkit-mask-image: url('/hero-grid-accent.svg'), var(--hero-grid-fade);
  mask-image: url('/hero-grid-accent.svg'), var(--hero-grid-fade);
  /* 尺寸与 SVG 一致；这个单元比卡片还宽（卡片 max-width 960），横向不会重复，
     否则同一簇绿点会在卡片上出现好几遍、一眼看出周期 */
  -webkit-mask-size: 1022px 420px, auto;
  mask-size: 1022px 420px, auto;
}

/* 装饰光斑：纯视觉，不参与布局也不吃指针事件 */
.hero-glow {
  position: absolute;
  top: -70px;
  right: -50px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--el-color-primary) 26%, transparent) 0%, transparent 70%);
  pointer-events: none;
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

/* 虚线下面那一整行：星标 / 仓库 / 作者 / 社交入口，统一样式的胶囊 */
.hero-links {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--el-border-color-light);
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-bg-color);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.18s ease, border-color 0.18s ease, background-color 0.18s ease,
    transform 0.18s ease;
}

.hero-chip.is-link {
  color: var(--el-color-primary);
  border-color: color-mix(in srgb, var(--el-color-primary) 22%, transparent);
}

.hero-chip.is-link:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  transform: translateY(-1px);
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

  /* 窄屏社交胶囊只留图标，文字藏起来避免换行成一堆胶囊 */
  .hero-social-label {
    display: none;
  }

  .hero-social-chip {
    padding: 0 10px;
  }
}
</style>
