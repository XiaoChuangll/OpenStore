<template>
  <div class="login-view">
    <el-card class="login-card">
      <h2>管理员登录</h2>
      <el-form :model="form" label-width="100px" @submit.prevent>
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" /></el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="login">登录</el-button>
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" show-icon class="mt-2" />
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { loginAdmin } from '../services/admin';

const router = useRouter();
const route = useRoute();
const store = useAuthStore();
const form = ref({ username: '', password: '' });
const loading = ref(false);
const error = ref('');

const login = async () => {
  error.value = '';
  loading.value = true;
  try {
    const data = await loginAdmin(form.value);
    store.setToken(data.token);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect.trim() : '';
    if (redirect.startsWith('/admin')) {
      router.replace(redirect);
      return;
    }
    if (route.path.startsWith('/admin')) {
      router.replace('/admin/dashboard');
      return;
    }
    router.replace({ name: 'home' });
  } catch (e: any) {
    error.value = e?.response?.data?.error || '登录失败';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-view { display: flex; justify-content: center; margin-top: 80px; }
.login-card { width: 400px; }
.mt-2 { margin-top: 12px; }
</style>
