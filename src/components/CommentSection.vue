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
        <CommentItem 
          v-for="item in commentTree" 
          :key="item.id" 
          :comment="item" 
          @reply="replyTo"
        />
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
import { Message } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import CommentItem from './CommentItem.vue';

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
  children?: Comment[];
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

const isValid = computed(() => {
  return form.nickname.trim() && form.content.trim();
});

const LOCAL_STORAGE_KEY = 'my_pending_comments';

const getPendingCommentIds = () => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as number[];
  } catch {
    return [];
  }
};

const savePendingCommentId = (id: number) => {
  const ids = getPendingCommentIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(ids));
  }
};

const commentTree = computed(() => {
  const map = new Map<number, Comment>();
  const roots: Comment[] = [];
  
  // Clone to avoid mutating original source
  const rawComments = comments.value.map(c => ({ ...c, children: [] as Comment[] }));

  // Map all comments
  rawComments.forEach(c => map.set(c.id, c));

  // Build tree
  rawComments.forEach(c => {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children!.push(c);
    } else {
      roots.push(c);
    }
  });

  return roots;
});

const fetchComments = async () => {
  if (!props.blogId) return;
  loading.value = true;
  try {
    const pendingIds = getPendingCommentIds();
    const res = await axios.get('/api/public/comments', {
      params: {
        blog_id: props.blogId,
        page: page.value,
        pageSize: pageSize.value,
        include_ids: pendingIds.length > 0 ? pendingIds.join(',') : undefined
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
    const res = await axios.post('/api/public/comments', {
      blog_id: props.blogId,
      ...form
    });
    
    if (res.data && res.data.id) {
      savePendingCommentId(res.data.id);
    }
    
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
  gap: 16px;
}

.email-input {
  width: 240px;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
}

.tip-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* Comment List */
.comment-list-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 200px;
}

.list-header {
  padding-bottom: 16px;
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
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

@media (max-width: 600px) {
  .form-footer {
    flex-direction: column;
    align-items: stretch;
  }
  
  .email-input {
    width: 100%;
  }
  
  .form-actions {
    margin-left: 0;
    justify-content: space-between;
  }
}
</style>