<template>
  <!--
    关于页面的简化预览：复用前台的 AboutHero，下面按同样的视觉顺序铺内容与技术栈。
    只做展示，不接任何交互（更新日志 / 提交 / 反馈这些依赖接口的区块不在这里渲染）。
  -->
  <div class="about-preview">
    <AboutHero
      :site-name="siteName"
      :tagline="tagline"
      :version="version"
      :author-name="authorName"
      :repo-name="repoName"
      :repo-stars="null"
      :social-links="socialLinks"
    />

    <div v-if="contentHtml" class="preview-card">
      <div class="preview-content markdown-body" v-html="contentHtml"></div>
    </div>

    <div v-if="authorName || authorGithub || repoName" class="preview-card">
      <div class="preview-card-title">关于作者</div>
      <div class="preview-info">
        <div class="preview-info-row">
          <span class="preview-info-label">开发者</span>
          <span class="preview-info-value">{{ authorName || '—' }}</span>
        </div>
        <div class="preview-info-row">
          <span class="preview-info-label">GitHub</span>
          <span class="preview-info-value is-link">{{ githubLoginFrom(authorGithub || '') || '—' }}</span>
        </div>
        <div class="preview-info-row">
          <span class="preview-info-label">仓库</span>
          <span class="preview-info-value is-link">{{ repoName || '未配置' }}</span>
        </div>
        <div class="preview-info-row">
          <span class="preview-info-label">星标</span>
          <span class="preview-info-value">—</span>
        </div>
      </div>
    </div>

    <div v-if="techStack.length" class="preview-card">
      <div class="preview-card-title">技术栈</div>
      <div class="preview-tech">
        <el-tag v-for="tech in techStack" :key="tech.name" :type="tech.color" effect="light" class="preview-tag">
          {{ tech.name }}
        </el-tag>
      </div>
    </div>

    <div v-if="contributors.length" class="preview-card">
      <div class="preview-card-title">鸣谢</div>
      <div class="preview-contributors">
        <span v-for="person in contributors" :key="person.github" class="preview-contributor">
          <el-image :src="githubAvatarUrl(person.github, 96)" fit="cover" class="preview-contributor-avatar">
            <template #error>
              <span class="preview-contributor-fallback">{{ (person.name || person.github).slice(0, 1).toUpperCase() }}</span>
            </template>
          </el-image>
          <span class="preview-contributor-name">{{ person.name || person.github }}</span>
        </span>
      </div>
    </div>

    <p v-if="!contentHtml && !techStack.length && !contributors.length" class="preview-empty">
      填写左侧表单后，这里会同步显示页面效果
    </p>
  </div>
</template>

<script setup lang="ts">
import AboutHero from './AboutHero.vue';
import { githubAvatarUrl, githubLoginFrom, type Contributor, type SocialLinkItem, type TechStackItem } from '../utils/about';

withDefaults(
  defineProps<{
    siteName?: string;
    tagline?: string;
    version?: string;
    authorName?: string;
    authorGithub?: string;
    repoName?: string;
    socialLinks?: SocialLinkItem[];
    techStack?: TechStackItem[];
    contributors?: Contributor[];
    contentHtml?: string;
  }>(),
  { socialLinks: () => [], techStack: () => [], contributors: () => [] }
);
</script>

<style scoped>
.about-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-radius: 14px;
  background-color: var(--el-bg-color-page);
  overflow: hidden;
}

.preview-card {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background-color: var(--el-bg-color-overlay);
}

.preview-card-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.preview-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}

/* 预览整体比正式页面小一号，避免在窄预览栏里显得拥挤 */
.preview-content :deep(h1) { font-size: 22px; }
.preview-content :deep(h2) { font-size: 18px; }
.preview-content :deep(h3) { font-size: 16px; }
.preview-content :deep(p) { margin: 0 0 10px; }
.preview-content :deep(ul),
.preview-content :deep(ol) { padding-left: 20px; margin: 0 0 10px; }
.preview-content :deep(img) { max-width: 100%; height: auto; border-radius: 8px; }
.preview-content :deep(a) { color: var(--el-color-primary); }

/* 关于作者：和前台一样的「标签 - 值」两列 */
.preview-info {
  display: flex;
  flex-direction: column;
}

.preview-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.preview-info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.preview-info-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex: 0 0 auto;
}

.preview-info-value {
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-info-value.is-link {
  color: var(--el-color-primary);
}

.preview-tech {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-tag {
  border: none;
  font-weight: 500;
}

.preview-contributors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-contributor {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px 4px 4px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background-color: var(--el-fill-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.preview-contributor-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.preview-contributor-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background-color: var(--el-fill-color);
  font-size: 12px;
  font-weight: 600;
}

.preview-contributor-name {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

:deep(.markdown-body) {
  background-color: transparent !important;
  --color-canvas-default: transparent;
  --color-fg-default: var(--el-text-color-primary);
  --color-fg-muted: var(--el-text-color-secondary);
  --color-accent-fg: var(--el-color-primary);
  --color-border-default: var(--el-border-color);
  --color-border-muted: var(--el-border-color-lighter);
}
</style>
