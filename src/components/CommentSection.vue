<template>
  <div class="comment-section">
    <!-- Comment Form -->
    <div class="comment-form-card">
      <div class="form-header">
        <h3 class="form-title">发表评论</h3>
      </div>
      <div class="form-body">
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="4"
          placeholder="分享你的想法..."
          resize="none"
          class="comment-textarea"
          show-word-limit
          maxlength="1000"
        />
        <div class="form-footer">
          <el-input 
            v-model="form.email" 
            placeholder="邮箱 (选填, 用于接收回复)" 
            :prefix-icon="Message" 
            class="email-input" 
          />
          <div class="form-actions">
            <span class="tip-text">支持 Markdown</span>
            <el-button type="primary" :loading="submitting" @click="submitComment" :disabled="!isValid" round>
              发布
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Comment List -->
    <div class="comment-list-container" v-loading="loading">
      <div class="list-header" v-if="comments.length > 0">
        <span class="comment-count">{{ total }} 条评论</span>
      </div>
      
      <el-empty v-if="!loading && comments.length === 0" description="暂无评论，快来抢沙发吧~" />
      
      <div class="comment-list">
        <div v-for="item in comments" :key="item.id" class="comment-card">
          <div class="comment-main">
            <div class="avatar-col">
              <div class="avatar">
                {{ item.nickname.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div class="content-col">
              <div class="comment-meta">
                <div class="meta-left">
                  <span class="nickname">{{ item.nickname }}</span>
                  <el-tag v-if="item.status === 'pending'" size="small" type="warning" effect="plain" round class="status-tag">审核中</el-tag>
                  <span class="time-text">{{ formatDate(item.created_at) }}</span>
                </div>
                <div class="meta-right">
                  <span class="ip-text" v-if="item.ip_address">{{ item.ip_address }}</span>
                </div>
              </div>
              
              <div class="comment-body markdown-body" v-html="renderMarkdown(item.content)"></div>
              
              <div class="comment-actions">
                <el-button link type="info" size="small" @click="replyTo(item)" class="reply-btn">
                  <el-icon class="mr-1"><ChatDotRound /></el-icon> 回复
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="pagination-wrapper" v-if="total > pageSize">
        <el-pagination
          background
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="handlePageChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { Message, ChatDotRound } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import 'github-markdown-css/github-markdown-light.css';

const props = defineProps<{
  blogId: number;
}>();

interface Comment {
  id: number;
  parent_id: number | null;
  nickname: string;
  content: string;
  created_at: string;
  status: string;
  ip_address?: string;
}

const loading = ref(false);
const submitting = ref(false);
const comments = ref<Comment[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const generateNickname = () => {
  const adjectives = ['热情', '勇敢', '智慧', '快乐', '温柔', '真诚', '开朗', '沉稳', '活泼', '恬静'];
  const nouns = ['访客', '朋友', '旅者', '漫步者', '探索者', '梦想家', '思考者', '旅行者', '观察者', '创作者'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
};

const form = reactive({
  nickname: generateNickname(),
  email: '',
  content: '',
  parent_id: null as number | null
});

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

const isValid = computed(() => {
  return form.nickname.trim() && form.content.trim();
});

const fetchComments = async () => {
  if (!props.blogId) return;
  loading.value = true;
  try {
    const res = await axios.get('/api/public/comments', {
      params: {
        blog_id: props.blogId,
        page: page.value,
        pageSize: pageSize.value
      }
    });
    comments.value = res.data.items;
    total.value = res.data.total;
  } catch (e) {
    console.error('Failed to fetch comments', e);
  } finally {
    loading.value = false;
  }
};

const submitComment = async () => {
  if (!isValid.value) return;
  submitting.value = true;
  try {
    await axios.post('/api/public/comments', {
      blog_id: props.blogId,
      ...form
    });
    ElMessage.success('评论已提交，等待审核');
    form.content = '';
    // Optionally clear other fields or keep nickname/email for convenience
    // Refresh list
    page.value = 1;
    await fetchComments();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '发布失败');
  } finally {
    submitting.value = false;
  }
};

const replyTo = (comment: Comment) => {
  form.content = `@${comment.nickname} `;
  form.parent_id = comment.id;
  // Scroll to form
  document.querySelector('.comment-form-card')?.scrollIntoView({ behavior: 'smooth' });
};

const renderMarkdown = (text: string) => {
  return md.render(text);
};

const formatDate = (dateStr: string) => {
  // Convert UTC date string to local Date object
  // Assuming dateStr is in UTC format like 'YYYY-MM-DD HH:mm:ss' or ISO string
  const date = new Date(dateStr);
  
  // Adjust for timezone offset if the server returns UTC time without 'Z'
  // If the server returns 'YYYY-MM-DD HH:mm:ss' which is UTC, we need to treat it as UTC
  let targetDate = date;
  if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
     targetDate = new Date(dateStr + 'Z');
  }

  const now = new Date();
  const diff = now.getTime() - targetDate.getTime();
  
  // Less than 1 minute
  if (diff < 60000) return '刚刚';
  // Less than 1 hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  // Less than 24 hours
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  // Less than 7 days
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  
  return targetDate.toLocaleString('zh-CN', {
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai'
  });
};

const handlePageChange = (p: number) => {
  page.value = p;
  fetchComments();
};

watch(() => props.blogId, fetchComments, { immediate: true });
</script>

<style scoped>
.comment-section {
  display: flex;
  flex-direction: column;
  gap: 40px;
  /* max-width: 800px; */
  width: 100%;
  margin: 0 auto;
}

/* Comment Form Card */
.comment-form-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.3s ease;
}

.comment-form-card:focus-within {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(var(--el-color-primary-rgb), 0.08);
}

.form-header {
  margin-bottom: 16px;
}

.form-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-primary);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-textarea :deep(.el-textarea__inner) {
  border-radius: 12px;
  min-height: 120px !important;
  padding: 16px;
  font-size: 15px;
  line-height: 1.6;
  background-color: var(--el-fill-color-blank);
  transition: background-color 0.2s;
}

.comment-textarea :deep(.el-textarea__inner):focus {
  background-color: var(--el-bg-color);
}

.comment-textarea :deep(.el-input__count) {
  background: transparent;
  bottom: 8px;
  right: 12px;
}

.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.email-input {
  width: 240px;
}

.email-input :deep(.el-input__wrapper) {
  border-radius: 20px;
  background-color: var(--el-fill-color-lighter);
  box-shadow: none;
}

.email-input :deep(.el-input__wrapper):hover,
.email-input :deep(.el-input__wrapper.is-focus) {
  background-color: var(--el-bg-color);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.tip-text {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

/* Comment List */
.comment-list-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.list-header {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.comment-count {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-card {
  /* No background/border for clean look, just padding */
  padding: 0;
  transition: transform 0.2s ease;
}

.comment-main {
  display: flex;
  gap: 16px;
}

.avatar-col {
  flex-shrink: 0;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px; /* Soft square */
  background: linear-gradient(135deg, var(--el-color-primary-light-8), var(--el-color-primary-light-5));
  color: var(--el-color-primary-dark-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.content-col {
  flex: 1;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 0 16px 16px 16px; /* Chat bubble style */
  padding: 20px;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

/* Little triangle for chat bubble effect */
.content-col::before {
  content: '';
  position: absolute;
  top: 16px;
  left: -6px;
  width: 12px;
  height: 12px;
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
  transform: rotate(45deg);
}

.comment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.meta-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.nickname {
  font-weight: 700;
  font-size: 16px;
  color: var(--el-text-color-primary);
}

.status-tag {
  font-weight: normal;
}

.time-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.meta-right {
  display: flex;
  align-items: center;
}

.ip-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-lighter);
  padding: 2px 6px;
  border-radius: 4px;
}

.comment-body {
  font-size: 15px;
  line-height: 1.75;
  color: var(--el-text-color-regular);
  word-break: break-word;
}

.comment-body :deep(p) {
  margin-bottom: 0.8em;
}

.comment-body :deep(p:last-child) {
  margin-bottom: 0;
}

/* Custom link color in comments */
.comment-body :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.comment-body :deep(a:hover) {
  border-bottom-color: var(--el-color-primary);
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.reply-btn {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.reply-btn:hover {
  color: var(--el-color-primary);
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

/* Dark mode adjustments */
html.dark .comment-form-card {
  background: #1c2128;
  border-color: #30363d;
}

html.dark .content-col {
  background: #1c2128;
  border-color: #30363d;
}

html.dark .content-col::before {
  background: #1c2128;
  border-color: #30363d;
}

html.dark .avatar {
  background: linear-gradient(135deg, #238636, #1f6feb);
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

html.dark .email-input :deep(.el-input__wrapper) {
  background-color: #0d1117;
}

html.dark .comment-textarea :deep(.el-textarea__inner) {
  background-color: #0d1117;
  border-color: #30363d;
}

html.dark .comment-textarea :deep(.el-textarea__inner):focus {
  background-color: #161b22;
  border-color: #1f6feb;
}

html.dark .ip-text {
  background: #21262d;
}
</style>