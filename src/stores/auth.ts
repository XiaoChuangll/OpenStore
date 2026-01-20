import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));

  const decodeJwtPayload = (t: string) => {
    try {
      const parts = t.split('.');
      if (parts.length < 2) return null;
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = payloadBase64.length % 4 ? '='.repeat(4 - (payloadBase64.length % 4)) : '';
      const json = atob(payloadBase64 + pad);
      return JSON.parse(json) as any;
    } catch {
      return null;
    }
  };

  const tokenPayload = computed(() => (token.value ? decodeJwtPayload(token.value) : null));
  const username = computed(() => String(tokenPayload.value?.username || '').trim());
  const tokenExpMs = computed(() => {
    const exp = tokenPayload.value?.exp;
    const ms = typeof exp === 'number' ? exp * 1000 : Number(exp) * 1000;
    return Number.isFinite(ms) ? ms : 0;
  });

  const isLoggedIn = () => {
    if (!token.value) return false;
    if (tokenExpMs.value && tokenExpMs.value <= Date.now()) {
      token.value = null;
      localStorage.removeItem('token');
      return false;
    }
    return true;
  };
  const setToken = (t: string) => { token.value = t; localStorage.setItem('token', t); };
  const logout = () => { token.value = null; localStorage.removeItem('token'); };
  return { token, username, tokenExpMs, isLoggedIn, setToken, logout };
});
