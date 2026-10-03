<template>
  <div class="about-manage-view">
    <AdminPageHeader :embedded="embedded" title="关于页面管理" />

    <!-- 操作条：保存状态 + 预览 / 保存。嵌进后台时固定在这块面板顶部 -->
    <div class="manage-toolbar">
      <div class="toolbar-left">
        <el-tag :type="dirty ? 'warning' : 'success'" effect="light" round size="small">
          {{ dirty ? '有未保存的修改' : '已保存' }}
        </el-tag>
        <span v-if="lastSavedAt" class="toolbar-meta">上次保存 {{ lastSavedAt }}</span>
        <span class="toolbar-tip">Ctrl / ⌘ + S 保存</span>
      </div>
      <div class="toolbar-right">
        <el-button size="small" :icon="Refresh" :loading="loading" @click="reload">重新加载</el-button>
        <el-button size="small" :icon="View" @click="previewDrawer = true">预览</el-button>
        <el-button type="primary" size="small" :icon="Check" :loading="saving" :disabled="!dirty" @click="save">
          保存更改
        </el-button>
      </div>
    </div>

    <div class="manage-layout">
      <div class="manage-main">
        <!-- 分区说明：下面每块对应关于页面上的一张卡片 -->
        <div class="card-map-note">
          <el-icon><InfoFilled /></el-icon>
          <span>下面的分区与「关于」页面上的卡片一一对应，改完点右上角「保存更改」。</span>
          <el-button link type="primary" size="small" @click="openPane('site-cards')">调整卡片顺序 / 显隐</el-button>
        </div>

        <!-- 页面头部（前台首屏卡片） -->
        <AdminSection title="页面头部" head-wrap>
          <template #meta>
            <span class="meta-chip">对应前台首屏卡片</span>
          </template>

          <el-form label-position="top" :model="form">
            <el-row :gutter="20">
              <el-col :md="12" :xs="24">
                <el-form-item label="站点名称">
                  <el-input v-model="form.site_name" placeholder="显示在页面头部的大标题" maxlength="40" show-word-limit />
                </el-form-item>
              </el-col>
              <el-col :md="12" :xs="24">
                <el-form-item label="版本号">
                  <el-input v-model="form.version" placeholder="e.g. 1.0.0" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="一句话简介">
              <el-input v-model="form.tagline" placeholder="页面头部标题下面的一句话" maxlength="80" show-word-limit />
            </el-form-item>
          </el-form>

          <p class="section-tip">卡片底部的星标 / 仓库 / 作者取自下方「关于作者」，社交入口在本分区底部维护。</p>

          <!-- 社交入口：渲染在页面头部卡片底部的胶囊 -->
          <div class="sub-block">
            <div class="sub-head">
              <div class="sub-left">
                <span class="sub-title">社交入口</span>
                <span class="meta-chip">{{ socialLinkItems.length }} 个</span>
              </div>
              <div class="head-right">
                <el-button size="small" :icon="MagicStick" @click="restoreSocialLinks">恢复默认</el-button>
                <el-button size="small" type="primary" plain :icon="Plus" @click="addSocialLink">添加</el-button>
              </div>
            </div>

            <div v-if="socialLinkItems.length" class="item-list">
              <div v-for="(item, index) in socialLinkItems" :key="index" class="item-row is-social">
                <el-input v-model="item.label" placeholder="名称" class="item-label" />
                <el-input v-model="item.url" placeholder="https://..." class="item-grow" />
                <el-select v-model="item.icon" class="item-icon">
                  <el-option v-for="opt in SOCIAL_ICON_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value">
                    <span class="icon-option">
                      <AboutSocialIcon :name="opt.value" />
                      {{ opt.label }}
                    </span>
                  </el-option>
                </el-select>
                <div class="item-actions">
                  <el-button :icon="ArrowUp" text size="small" :disabled="index === 0" @click="moveSocialLink(index, -1)" />
                  <el-button
                    :icon="ArrowDown"
                    text
                    size="small"
                    :disabled="index === socialLinkItems.length - 1"
                    @click="moveSocialLink(index, 1)"
                  />
                  <el-button :icon="Delete" text type="danger" size="small" @click="socialLinkItems.splice(index, 1)" />
                </div>
              </div>
            </div>
            <p v-else class="empty-tip">还没有社交入口，点「添加」或「恢复默认」开始。</p>
          </div>
        </AdminSection>

        <!-- 页面内容 -->
        <AdminSection title="页面内容" head-wrap>
          <template #meta>
            <span class="meta-chip">对应前台「页面内容」卡片</span>
            <span class="meta-chip">富文本 / Markdown 二选一</span>
          </template>
          <template #actions>
            <el-radio-group v-model="markdownMode" size="small" @change="handleModeChange">
              <el-radio-button :value="false">富文本</el-radio-button>
              <el-radio-button :value="true">Markdown</el-radio-button>
            </el-radio-group>
          </template>

          <div v-if="!markdownMode" class="editor-container">
            <div class="quill-wrapper">
              <QuillEditor
                v-model:content="form.content_html"
                contentType="html"
                theme="snow"
                class="quill-editor"
                :options="quillOptions"
              />
            </div>
          </div>

          <div v-else class="editor-container">
            <el-row :gutter="16" class="markdown-row">
              <el-col :xs="24" :md="12" class="markdown-col">
                <div class="markdown-pane">
                  <div class="sub-label">编辑区域</div>
                  <el-input
                    v-model="contentMarkdown"
                    type="textarea"
                    class="markdown-editor"
                    placeholder="在此编写 Markdown 内容"
                    :autosize="{ minRows: 18 }"
                    resize="none"
                  />
                </div>
              </el-col>
              <el-col :xs="24" :md="12" class="markdown-col">
                <div class="markdown-pane">
                  <div class="sub-label">渲染预览</div>
                  <div class="md-preview markdown-body" v-html="renderedMarkdown" />
                </div>
              </el-col>
            </el-row>
          </div>
        </AdminSection>

        <!-- 关于作者 -->
        <AdminSection title="关于作者" head-wrap>
          <template #meta>
            <span class="meta-chip">对应前台「关于作者」卡片</span>
          </template>

          <el-form label-position="top" :model="form">
            <el-row :gutter="20">
              <el-col :md="12" :xs="24">
                <el-form-item label="作者名称">
                  <el-input v-model="form.author_name" placeholder="Author Name" />
                </el-form-item>
              </el-col>
              <el-col :md="12" :xs="24">
                <el-form-item label="GitHub 主页">
                  <el-input v-model="form.author_github" placeholder="https://github.com/..." />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :md="12" :xs="24">
                <el-form-item label="仓库路径">
                  <el-input v-model="form.github_repo" placeholder="owner/repo（也接受完整 GitHub 链接）" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <p class="section-tip">「星标」数量按仓库地址自动从 GitHub 获取，无需手动填写。</p>
        </AdminSection>

        <!-- 技术栈 -->
        <AdminSection title="技术栈" head-wrap>
          <template #meta>
            <span class="meta-chip">对应前台「技术栈」卡片</span>
            <span class="meta-chip">{{ techStackItems.length }} 个标签</span>
          </template>
          <template #actions>
            <div class="head-right">
              <el-button size="small" :icon="MagicStick" @click="restoreTechStack">恢复默认</el-button>
              <el-button size="small" type="primary" plain :icon="Plus" @click="addTechStack">添加</el-button>
            </div>
          </template>

          <div v-if="techStackItems.length" class="item-list">
            <div v-for="(item, index) in techStackItems" :key="index" class="item-row">
              <el-input v-model="item.name" placeholder="技术名称" class="item-grow" />
              <el-select v-model="item.color" class="item-color">
                <el-option v-for="opt in TECH_COLOR_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
              <el-tag :type="item.color" effect="light" class="item-preview">{{ item.name || '预览' }}</el-tag>
              <div class="item-actions">
                <el-button :icon="ArrowUp" text size="small" :disabled="index === 0" @click="moveTechStack(index, -1)" />
                <el-button
                  :icon="ArrowDown"
                  text
                  size="small"
                  :disabled="index === techStackItems.length - 1"
                  @click="moveTechStack(index, 1)"
                />
                <el-button :icon="Delete" text type="danger" size="small" @click="techStackItems.splice(index, 1)" />
              </div>
            </div>
          </div>
          <p v-else class="empty-tip">还没有技术栈标签，点「添加」或「恢复默认」开始。</p>
        </AdminSection>

        <!-- 鸣谢 -->
        <AdminSection title="鸣谢" head-wrap>
          <template #meta>
            <span class="meta-chip">对应前台「鸣谢」卡片</span>
            <span class="meta-chip">{{ contributorItems.length }} 位</span>
          </template>
          <template #actions>
            <div class="head-right">
              <el-button size="small" type="primary" plain :icon="Plus" @click="addContributor">添加</el-button>
            </div>
          </template>

          <div v-if="contributorItems.length" class="item-list">
            <div v-for="(item, index) in contributorItems" :key="index" class="item-row is-contributor">
              <!-- 头像跟着输入实时变，粘上主页地址就能看到是不是本人 -->
              <el-image :src="githubAvatarUrl(item.github)" fit="cover" class="contributor-preview">
                <template #error>
                  <span class="contributor-preview-fallback">{{ contributorInitial(item) }}</span>
                </template>
              </el-image>
              <el-input v-model="item.github" placeholder="GitHub 用户名或主页地址" class="item-grow" />
              <el-input v-model="item.name" placeholder="显示名（可留空）" class="item-name" />
              <div class="item-actions">
                <el-button :icon="ArrowUp" text size="small" :disabled="index === 0" @click="moveContributor(index, -1)" />
                <el-button
                  :icon="ArrowDown"
                  text
                  size="small"
                  :disabled="index === contributorItems.length - 1"
                  @click="moveContributor(index, 1)"
                />
                <el-button :icon="Delete" text type="danger" size="small" @click="contributorItems.splice(index, 1)" />
              </div>
            </div>
          </div>
          <p v-else class="empty-tip">
            还没有鸣谢对象。点「添加」并填入 GitHub 主页（如 https://github.com/XiaoChuangll）即可自动取到头像。
          </p>
        </AdminSection>

        <!-- 数据驱动的卡片：内容来自数据或接口，不在本页手工编辑 -->
        <AdminSection title="其他卡片" head-wrap>
          <template #meta>
            <span class="meta-chip">内容来自数据 / 接口，不在这里编辑</span>
          </template>

          <ul class="other-cards">
            <li class="other-card">
              <span class="oc-name">更新日志</span>
              <span class="oc-desc">内容取自「更新日志管理」里发布的记录</span>
              <el-button link type="primary" size="small" @click="openPane('changelogs')">去维护</el-button>
            </li>
            <li class="other-card">
              <span class="oc-name">最近提交</span>
              <span class="oc-desc">按「关于作者」里的仓库地址自动从 GitHub 拉取</span>
            </li>
            <li class="other-card">
              <span class="oc-name">意见反馈</span>
              <span class="oc-desc">由访客提交，处理记录在「用户反馈」</span>
              <el-button link type="primary" size="small" @click="openPane('feedbacks')">去查看</el-button>
            </li>
          </ul>
        </AdminSection>
      </div>

      <!-- 宽屏：右侧常驻预览 -->
      <aside class="preview-panel">
        <div class="preview-head">
          <span class="preview-title">实时预览</span>
          <span class="meta-chip">简化效果</span>
          <el-dropdown trigger="click" class="preview-export" @command="exportNameplate">
            <el-button size="small" :icon="Download" :loading="exporting">生成图片</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="light">浅色底</el-dropdown-item>
                <el-dropdown-item command="dark">深色底</el-dropdown-item>
                <el-dropdown-item divided command="sheet">浅色 + 深色（拼一张）</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="preview-frame">
          <AboutPreview v-bind="previewProps" />
        </div>
      </aside>
    </div>

    <!-- 窄屏：预览收进抽屉（自带「生成图片」，因为宽屏那处预览此时是隐藏的） -->
    <el-drawer v-model="previewDrawer" direction="btt" size="85%" class="about-preview-drawer">
      <template #header>
        <div class="preview-head">
          <span class="preview-title">实时预览</span>
          <el-dropdown trigger="click" class="preview-export" @command="exportNameplate">
            <el-button size="small" :icon="Download" :loading="exporting">生成图片</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="light">浅色底</el-dropdown-item>
                <el-dropdown-item command="dark">深色底</el-dropdown-item>
                <el-dropdown-item divided command="sheet">浅色 + 深色（拼一张）</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>
      <AboutPreview v-bind="previewProps" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue';
import AdminSection from '../../components/admin/AdminSection.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Delete,
  Download,
  InfoFilled,
  MagicStick,
  Plus,
  Refresh,
  View,
} from '@element-plus/icons-vue';
import { getAboutPage, updateAboutPage, type AboutPage } from '../../services/admin';
import type { SocialLinkItem, TechStackItem } from '../../utils/about';
import {
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_TECH_STACK,
  SOCIAL_ICON_OPTIONS,
  TECH_COLOR_OPTIONS,
  githubAvatarUrl,
  normalizeContributors,
  normalizeSocialLinks,
  normalizeTechStack,
  type Contributor,
} from '../../utils/about';
import AboutPreview from '../../components/AboutPreview.vue';
import AboutSocialIcon from '../../components/AboutSocialIcon.vue';
import {
  downloadCanvas,
  renderNameplate,
  renderNameplateSheet,
  type NameplateTheme,
} from '../../utils/about-nameplate';
import MarkdownIt from 'markdown-it';
import markdownItKatex from 'markdown-it-katex';
import hljs from 'highlight.js';
import 'github-markdown-css/github-markdown-light.css';
import 'highlight.js/styles/atom-one-light.css';
import 'katex/dist/katex.min.css';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

defineProps<{ embedded?: boolean }>();

const router = useRouter();

/** 切到「关于」相关的其他面板：卡片顺序在首页配置，日志 / 反馈有各自的管理页 */
const openPane = (pane: string) => {
  router.push({ path: '/admin/dashboard', query: { pane } });
};

const form = ref<AboutPage>({
  id: 1,
  version: '',
  author_name: '',
  author_github: '',
  github_repo: '',
  site_name: '',
  tagline: '',
  content_html: '',
  content_markdown: '',
});

const techStackItems = ref<TechStackItem[]>([]);
const socialLinkItems = ref<SocialLinkItem[]>([]);
const contributorItems = ref<Contributor[]>([]);

const loading = ref(false);
const saving = ref(false);
const markdownMode = ref(false);
const contentMarkdown = ref('');
const lastSavedAt = ref('');
/** 已保存内容的快照：和当前表单比对来决定「未保存」状态 */
const snapshot = ref('');
/*
 * 富文本编辑器在挂载时会把 HTML 过一遍 Quill，输出的是归一化后的结构（顺序、样式写法都会变）。
 * 这属于渲染副作用、不是用户改动，所以回填后先进入 hydration 状态：
 * 期间不上报「未保存」，等编辑器稳定下来再把归一化结果作为新基准。
 */
const hydrating = ref(false);
let hydrateTimer: number | null = null;
const previewDrawer = ref(false);
/** 名牌图片导出中 */
const exporting = ref(false);
/** 回填时正文是否非空：用来拦住「把已有正文存成空」的误操作 */
const loadedHadContent = ref(false);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (__) {}
    }
    return '';
  },
});
md.use(markdownItKatex);

const renderedMarkdown = computed(() => md.render(contentMarkdown.value || ''));

const quillOptions = {
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block'],
      [{ header: 1 }, { header: 2 }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ script: 'sub' }, { script: 'super' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ direction: 'rtl' }],
      [{ size: ['small', false, 'large', 'huge'] }],
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ color: [] }, { background: [] }],
      [{ font: [] }],
      [{ align: [] }],
      ['clean'],
      ['link', 'image', 'video'],
    ],
  },
  placeholder: '请输入页面内容...',
  theme: 'snow',
};

/** 把仓库地址统一成 owner/repo */
const cleanRepo = (input?: string) => {
  const raw = (input || '').trim();
  if (!raw) return '';
  let repo = raw;
  try {
    const urlObj = new URL(raw);
    if (urlObj.hostname === 'github.com') repo = urlObj.pathname.substring(1);
  } catch {
    // 不是 URL，按 owner/repo 处理
  }
  return repo.replace(/^\/+/, '').replace(/\.git$/, '');
};

/** 当前表单会提交的完整内容：脏检查、保存、预览都从这一份派生 */
const buildPayload = (): Partial<AboutPage> => ({
  site_name: (form.value.site_name || '').trim(),
  tagline: (form.value.tagline || '').trim(),
  version: (form.value.version || '').trim(),
  author_name: (form.value.author_name || '').trim(),
  author_github: (form.value.author_github || '').trim(),
  github_repo: cleanRepo(form.value.github_repo),
  tech_stack: normalizeTechStack(techStackItems.value),
  social_links: normalizeSocialLinks(socialLinkItems.value),
  contributors: normalizeContributors(contributorItems.value),
  content_html: markdownMode.value ? renderedMarkdown.value : form.value.content_html || '',
  content_markdown: markdownMode.value ? contentMarkdown.value : '',
});

const dirty = computed(() => !hydrating.value && JSON.stringify(buildPayload()) !== snapshot.value);

const previewProps = computed(() => {
  const payload = buildPayload();
  return {
    siteName: payload.site_name,
    tagline: payload.tagline,
    version: payload.version,
    authorName: payload.author_name,
    authorGithub: payload.author_github,
    repoName: payload.github_repo,
    socialLinks: payload.social_links || [],
    contributors: payload.contributors || [],
    techStack: payload.tech_stack || [],
    contentHtml: payload.content_html || '',
  };
});

const applyForm = (data: AboutPage) => {
  form.value = {
    ...form.value,
    ...data,
    content_html: data.content_html || '',
    content_markdown: data.content_markdown || '',
  };
  techStackItems.value = normalizeTechStack(data.tech_stack);
  socialLinkItems.value = normalizeSocialLinks(data.social_links);
  contributorItems.value = normalizeContributors(data.contributors);
  contentMarkdown.value = data.content_markdown || '';
  markdownMode.value = !!data.content_markdown;
  loadedHadContent.value = !!(data.content_html || data.content_markdown);
  snapshot.value = JSON.stringify(buildPayload());
  rebaselineLater();
};

/** 等富文本编辑器归一化完成，再把当前内容作为「已保存」基准 */
const rebaselineLater = () => {
  hydrating.value = true;
  if (hydrateTimer !== null) window.clearTimeout(hydrateTimer);
  nextTick(() => {
    hydrateTimer = window.setTimeout(() => {
      hydrating.value = false;
      hydrateTimer = null;
      snapshot.value = JSON.stringify(buildPayload());
    }, 400);
  });
};

const fetchData = async () => {
  loading.value = true;
  try {
    const data = await getAboutPage();
    if (data) {
      applyForm(data);
      lastSavedAt.value = data.updated_at ? new Date(data.updated_at).toLocaleString('zh-CN') : '';
    }
  } catch {
    ElMessage.error('获取数据失败');
  } finally {
    loading.value = false;
  }
};

/**
 * 生成「名牌」图片：把 Hero 卡片按当前表单内容画成 PNG 下载。
 * 走的是 utils/about-nameplate 里的 Canvas 手绘（没有引入截图库）。
 */
const exportNameplate = async (command: 'light' | 'dark' | 'sheet') => {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const data = {
      siteName: form.value.site_name,
      tagline: form.value.tagline,
      version: form.value.version,
      authorName: form.value.author_name,
      repoName: cleanRepo(form.value.github_repo),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    if (command === 'sheet') {
      downloadCanvas(await renderNameplateSheet(data), `openstore-nameplate-${stamp}.png`);
    } else {
      downloadCanvas(
        await renderNameplate(data, command as NameplateTheme),
        `openstore-nameplate-${command}-${stamp}.png`
      );
    }
    ElMessage.success('图片已生成');
  } catch {
    ElMessage.error('生成图片失败');
  } finally {
    exporting.value = false;
  }
};

const reload = async () => {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('重新加载会丢弃当前未保存的修改，确定继续？', '放弃修改', {
        confirmButtonText: '放弃并重新加载',
        cancelButtonText: '取消',
        type: 'warning',
      });
    } catch {
      return;
    }
  }
  await fetchData();
};

onMounted(fetchData);

/**
 * 两种编辑模式共用一个正文，切换时要保证「切过去不是空的」：
 *   切 Markdown：HTML 里没有对应的 Markdown 源码，只能粗降级成纯文本；
 *   切富文本：优先用 Markdown 的渲染结果填进去，避免编辑器挂载成空白、
 *             一保存就把整篇正文写没（这是最容易被误伤的一条路径）。
 */
const handleModeChange = (val: boolean) => {
  if (val) {
    if (form.value.content_html && !contentMarkdown.value) {
      contentMarkdown.value = form.value.content_html.replace(/<[^>]*>/g, '').trim();
    }
    return;
  }
  if (!form.value.content_html && contentMarkdown.value) {
    form.value.content_html = renderedMarkdown.value;
  }
};

const addTechStack = () => techStackItems.value.push({ name: '', color: 'primary' });
const restoreTechStack = () => {
  techStackItems.value = DEFAULT_TECH_STACK.map((item) => ({ ...item }));
};
const moveTechStack = (index: number, delta: number) => {
  const target = index + delta;
  if (target < 0 || target >= techStackItems.value.length) return;
  const [moved] = techStackItems.value.splice(index, 1);
  techStackItems.value.splice(target, 0, moved);
};

const addContributor = () => contributorItems.value.push({ github: '', name: '' });
const moveContributor = (index: number, delta: number) => {
  const target = index + delta;
  if (target < 0 || target >= contributorItems.value.length) return;
  const [moved] = contributorItems.value.splice(index, 1);
  contributorItems.value.splice(target, 0, moved);
};
/** 头像取不到时的兜底首字母 */
const contributorInitial = (item: Contributor) =>
  (item.name || item.github || '?').trim().slice(0, 1).toUpperCase();

const addSocialLink = () => socialLinkItems.value.push({ label: '', url: '', icon: 'link' });
const restoreSocialLinks = () => {
  socialLinkItems.value = DEFAULT_SOCIAL_LINKS.map((item) => ({ ...item }));
};
const moveSocialLink = (index: number, delta: number) => {
  const target = index + delta;
  if (target < 0 || target >= socialLinkItems.value.length) return;
  const [moved] = socialLinkItems.value.splice(index, 1);
  socialLinkItems.value.splice(target, 0, moved);
};

/** 保存前校验：空名称 / 非法链接直接拦住，避免"填了却没存上" */
const validate = () => {
  for (const item of techStackItems.value) {
    if (!item.name.trim()) return '技术栈里还有没填名称的标签';
  }
  for (const item of socialLinkItems.value) {
    const url = item.url.trim();
    if (!url) return '社交链接里还有没填地址的条目';
    if (!/^https?:\/\//i.test(url)) return `社交链接「${item.label || url}」需要以 http:// 或 https:// 开头`;
  }
  for (const item of contributorItems.value) {
    if (!normalizeContributors([item]).length) return '鸣谢名单里还有没填 GitHub 用户名的条目';
  }
  return '';
};

const save = async () => {
  if (!dirty.value || saving.value) return;
  const error = validate();
  if (error) {
    ElMessage.warning(error);
    return;
  }

  const payload = buildPayload();
  /*
   * 本来有正文、这次却要存成空：绝大多数情况是误操作
   * （编辑器没挂上 / 切模式时内容没带过来），先让用户确认一次。
   */
  if (loadedHadContent.value && !payload.content_html && !payload.content_markdown) {
    try {
      await ElMessageBox.confirm('这次保存会把页面正文清空，确定继续？', '正文将变为空', {
        confirmButtonText: '仍然清空',
        cancelButtonText: '取消',
        type: 'warning',
      });
    } catch {
      return;
    }
  }

  saving.value = true;
  try {
    const res = await updateAboutPage(payload);
    if (res.item) {
      applyForm(res.item);
    } else {
      snapshot.value = JSON.stringify(payload);
    }
    lastSavedAt.value = new Date().toLocaleString('zh-CN');
    ElMessage.success('保存成功');
  } catch {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
};

// Ctrl / ⌘ + S 保存，和常见的编辑器习惯保持一致
const onKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    save();
  }
};

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
};

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
  if (hydrateTimer !== null) window.clearTimeout(hydrateTimer);
});

// 离开后台（或切到别的路由）前拦一下未保存的修改
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('关于页面还有未保存的修改，确定离开吗？', '未保存的修改', {
      confirmButtonText: '放弃修改并离开',
      cancelButtonText: '留在本页',
      type: 'warning',
    });
    return true;
  } catch {
    return false;
  }
});
</script>

<style scoped>
.manage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background-color: var(--el-bg-color-overlay);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.toolbar-meta,
.toolbar-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.manage-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
  align-items: start;
}

.manage-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* 顶部说明：把后台分区和前台的卡片对上号 */
.card-map-note {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px dashed var(--el-border-color);
  border-radius: 12px;
  background-color: var(--el-fill-color-lighter);
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.card-map-note .el-icon {
  color: var(--el-color-primary);
  font-size: 15px;
}

.card-map-note .el-button {
  margin-left: auto;
}

.meta-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

/* 分区内的一句说明：提示字段之间的关联、或哪些值由接口自动带出 */
.section-tip {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/* 页面头部分区里嵌的「社交入口」子块 */
.sub-block {
  margin-top: 14px;
  padding: 14px 14px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-lighter);
}

.sub-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

/* 子块标题行（同 .section-left，作用域留在本组件内） */
.sub-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 数据驱动的卡片：一行一张，只做说明与跳转 */
.other-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.other-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-lighter);
  font-size: 13px;
}

.oc-name {
  flex: 0 0 auto;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.oc-desc {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--el-text-color-secondary);
}

.other-card .el-button {
  flex: 0 0 auto;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 鸣谢：头像预览 + 两个输入框 */
.item-row.is-contributor {
  align-items: center;
}

.contributor-preview {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-bg-color);
}

.contributor-preview-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-weight: 600;
}

.item-name {
  flex: 0 0 160px;
  width: 160px;
}

/* 列表型编辑器（技术栈 / 社交链接 / 鸣谢） */
.item-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-lighter);
}

.item-grow {
  flex: 1 1 auto;
  min-width: 0;
}

.item-label {
  flex: 0 0 130px;
  width: 130px;
}

.item-color {
  flex: 0 0 100px;
  width: 100px;
}

.item-icon {
  flex: 0 0 130px;
  width: 130px;
}

.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.item-preview {
  flex: 0 0 auto;
  border: none;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.empty-tip {
  margin: 0;
  padding: 16px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 内容编辑器 */
.editor-container {
  border-radius: 10px;
}

.quill-wrapper {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.quill-editor :deep(.ql-toolbar) {
  border: none;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  border-top-left-radius: 7px;
  border-top-right-radius: 7px;
}

.quill-editor :deep(.ql-container) {
  border: none;
  min-height: 380px;
  font-size: 14px;
  border-bottom-left-radius: 7px;
  border-bottom-right-radius: 7px;
}

.quill-editor :deep(.ql-editor) {
  min-height: 360px;
  padding: 16px;
}

.markdown-row {
  display: flex;
  flex-wrap: wrap;
}

.markdown-col {
  margin-bottom: 12px;
}

.markdown-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.sub-label {
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.markdown-editor :deep(.el-textarea__inner) {
  border: none;
  border-radius: 0;
  padding: 12px;
  min-height: 380px;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
}

.md-preview {
  flex: 1;
  min-height: 380px;
  padding: 12px !important;
  overflow: auto;
  font-size: 14px;
  background-color: transparent !important;
}

/* 右侧预览 */
.preview-panel {
  position: sticky;
  top: 76px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 「生成图片」推到最右，和标题分开 */
.preview-export {
  margin-left: auto;
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.preview-frame {
  max-height: calc(100vh - 160px);
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background-color: var(--el-bg-color-page);
}

/* 预览里的 Hero 会自己带圆角，包一层防止贴边 */
.preview-frame :deep(.about-preview) {
  background-color: transparent;
}

@media (max-width: 1100px) {
  .manage-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .preview-panel {
    display: none;
  }
}

@media (max-width: 640px) {
  .item-row {
    flex-wrap: wrap;
  }

  .item-label,
  .item-color,
  .item-icon,
  .item-name {
    flex: 1 1 45%;
    width: auto;
  }

  .item-preview {
    display: none;
  }

  .item-actions {
    margin-left: auto;
  }

}
</style>
