<template>
  <div class="comment-card">
    <div class="comment-main">
      <div class="avatar-col">
        <div class="avatar">
          {{ comment.nickname.charAt(0).toUpperCase() }}
        </div>
      </div>
      <div class="content-col">
        <div class="comment-meta">
          <div class="meta-left">
            <span class="nickname">{{ comment.nickname }}</span>
            <el-tag v-if="comment.status === 'pending'" size="small" type="warning" effect="plain" round class="status-tag">审核中</el-tag>
            <span class="time-text">{{ formatDate(comment.created_at) }}</span>
          </div>
          <div class="meta-right">
            <span class="ip-text" v-if="comment.ip_address">{{ comment.ip_address }}</span>
          </div>
        </div>
        
        <div class="comment-body markdown-body" v-html="renderMarkdown(comment.content)"></div>
        
        <div class="comment-actions">
          <el-button link type="info" size="small" @click="$emit('reply', comment)" class="reply-btn">
            <el-icon class="mr-1"><ChatDotRound /></el-icon> 回复
          </el-button>
        </div>
      </div>
    </div>

    <!-- Recursive Children -->
    <div v-if="comment.children && comment.children.length > 0" class="replies-container">
      <CommentItem 
        v-for="child in comment.children" 
        :key="child.id" 
        :comment="child" 
        @reply="$emit('reply', $event)" 
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChatDotRound } from '@element-plus/icons-vue';
import MarkdownIt from 'markdown-it';
import 'github-markdown-css/github-markdown-light.css';

// Interface matching the one in CommentSection (should ideally be shared)
interface Comment {
  id: number;
  parent_id: number | null;
  nickname: string;
  content: string;
  created_at: string;
  status: string;
  ip_address?: string;
  children?: Comment[];
}

defineProps<{
  comment: Comment;
}>();

defineEmits<{
  (e: 'reply', comment: Comment): void
}>();

// Markdown setup
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

const renderMarkdown = (text: string) => {
  return md.render(text);
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  let targetDate = date;
  if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
     targetDate = new Date(dateStr + 'Z');
  }

  const now = new Date();
  const diff = now.getTime() - targetDate.getTime();
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
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
</script>

<script lang="ts">
// Necessary for recursive component to refer to itself
export default {
  name: 'CommentItem'
}
</script>

<style scoped>
.comment-card {
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.comment-card:last-child {
  border-bottom: none;
}

.comment-main {
  display: flex;
  gap: 16px;
}

.avatar-col {
  flex-shrink: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--el-color-primary-light-3), var(--el-color-primary));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 18px;
  box-shadow: 0 2px 6px rgba(var(--el-color-primary-rgb), 0.2);
}

.content-col {
  flex: 1;
  min-width: 0;
}

.comment-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.meta-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.nickname {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 15px;
}

.time-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.status-tag {
  height: 20px;
  padding: 0 6px;
}

.meta-right {
  display: flex;
  align-items: center;
}

.ip-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.comment-body {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 8px;
}

.comment-actions {
  display: flex;
  gap: 16px;
}

.reply-btn {
  padding: 0;
  height: auto;
  font-size: 13px;
}

.replies-container {
  margin-top: 12px;
  margin-left: 20px; /* Indentation */
  padding-left: 16px;
  border-left: 2px solid var(--el-border-color-lighter);
}

/* Adjust nested comments styles */
.replies-container .comment-card {
  padding: 12px 0;
}

.replies-container .avatar {
  width: 32px;
  height: 32px;
  font-size: 14px;
}

/* Markdown Styles Override if needed */
.markdown-body {
  background-color: transparent !important;
  font-family: inherit !important;
}

.markdown-body p {
  margin-bottom: 0.5em !important;
}
.markdown-body p:last-child {
  margin-bottom: 0 !important;
}
</style>