<template>
  <!-- 关于页「联系我们」卡片的内容：星标 / 仓库 / 作者是配置里的自动项 -->
  <div v-if="chips.length" class="social-links">
    <component
      :is="chip.url ? 'a' : 'span'"
      v-for="chip in chips"
      :key="chip.key"
      v-bind="chip.url ? { href: chip.url, target: '_blank', rel: 'noopener' } : {}"
      class="social-chip"
      :class="{ 'is-link': !!chip.url, 'is-icon-only': !chip.label }"
      :title="chip.label || chip.hint || ''"
      :aria-label="chip.label || chip.hint || ''"
    >
      <AboutSocialIcon :name="chip.icon" />
      <span v-if="chip.label" class="social-chip-label">{{ chip.label }}</span>
    </component>
  </div>
  <p v-else class="empty-tip">还没有配置联系我们</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AboutSocialIcon from './AboutSocialIcon.vue';
import { resolveSocialLinks, type SocialLinkItem } from '../utils/about';

const props = withDefaults(
  defineProps<{
    links?: SocialLinkItem[];
    authorName?: string;
    authorGithub?: string;
    /** 已经清洗成 owner/repo 的仓库路径 */
    repoName?: string;
    /** 没取到星标时传 null */
    repoStars?: number | null;
  }>(),
  { links: () => [], repoStars: null }
);

const chips = computed(() =>
  resolveSocialLinks(props.links, {
    authorName: props.authorName,
    authorGithub: props.authorGithub,
    repoName: props.repoName,
    repoStars: props.repoStars
  }).map((item, index) => ({ ...item, key: `${item.icon}-${index}` }))
);
</script>

<style scoped>
.social-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/*
  无边框淡底胶囊：只靠一层浅填充区分，不再描边，和技术栈标签观感一致。
  比原来高一点（34px），图标也跟着放大，更好认、更好点。
*/
.social-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  /* 去掉描边：留一条透明边框占位，悬停时换色不会让高度抖动 */
  border: 1px solid transparent;
  background-color: var(--el-fill-color-light);
  font-size: 13px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease,
    transform 0.2s ease;
}

/* 图标略大于文字，视觉上和文字基线对齐 */
.social-chip :deep(.el-icon),
.social-chip :deep(.about-social-svg) {
  font-size: 17px;
  flex: 0 0 auto;
}

/* 可点击的条目：主色文字 + 起点缀色，悬停时抬起并加一层柔和阴影 */
.social-chip.is-link {
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.social-chip.is-link:hover {
  background-color: var(--el-color-primary-light-8);
  box-shadow: 0 6px 16px -8px rgba(15, 23, 42, 0.5);
  transform: translateY(-2px);
}

/*
  名称留空：只留一个图标。
  做成等宽圆形，而不是靠 padding 撑出来 —— 否则不同宽度的图标会让
  一排胶囊宽度参差，看着不齐。
*/
.social-chip.is-icon-only {
  width: 34px;
  padding: 0;
  justify-content: center;
}

.empty-tip {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* 尊重系统的「减少动态效果」设置 */
@media (prefers-reduced-motion: reduce) {
  .social-chip {
    transition: none;
  }

  .social-chip.is-link:hover {
    transform: none;
  }
}

@media (max-width: 640px) {
  /* 窄屏只留图标，文字藏起来避免换行成一堆胶囊 */
  .social-chip-label {
    display: none;
  }

  /* 有名称的胶囊这时候也只剩图标，统一收成圆形，和「留空」的保持一致 */
  .social-chip {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
}
</style>
