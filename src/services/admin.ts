import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const API_URL = '/api/admin';

const api = axios.create({ baseURL: API_URL });

const rawApi = axios.create({ baseURL: API_URL });

let refreshing: Promise<string | null> | null = null;

const refreshTokenIfNeeded = async (store: ReturnType<typeof useAuthStore>) => {
  const token = store.token;
  if (!token) return null;
  const expMs = store.tokenExpMs;
  if (!expMs || expMs - Date.now() > 5 * 60 * 1000) return token;

  if (!refreshing) {
    refreshing = rawApi
      .post(
        '/auth/refresh',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      .then((res) => {
        const nextToken = res?.data?.token;
        if (typeof nextToken === 'string' && nextToken.trim()) {
          store.setToken(nextToken);
          return nextToken;
        }
        store.logout();
        return null;
      })
      .catch(() => {
        store.logout();
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }

  return refreshing;
};

api.interceptors.request.use(async (config) => {
  const store = useAuthStore();
  await refreshTokenIfNeeded(store);
  if (store.token) {
    config.headers = config.headers || {};
    (config.headers as any)['Authorization'] = `Bearer ${store.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const store = useAuthStore();
      store.logout();
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      } else {
        window.location.reload();
      }
    }
    try {
      const status = (error as any)?.response?.status;
      const method = (error as any)?.config?.method?.toUpperCase();
      const baseURL = (error as any)?.config?.baseURL || '';
      const url = (error as any)?.config?.url || '';
      console.error(`[AxiosError] ${method || 'GET'} ${baseURL}${url} ${status || ''}`, (error as any)?.message || error);
    } catch {}
    return Promise.reject(error);
  }
);

import { type Incident } from './api';
export type { Incident };

// Incidents
export const getIncidents = async () => {
  const { data } = await api.get('/incidents');
  return data.items as Incident[];
};
export const createIncident = async (payload: Partial<Incident>) => {
  const { data } = await api.post('/incidents', payload);
  return data.id as number;
};
export const updateIncident = async (id: number, payload: Partial<Incident>) => {
  await api.put(`/incidents/${id}`, payload);
};
export const deleteIncident = async (id: number) => {
  await api.delete(`/incidents/${id}`);
};

// Friend Links
export interface FriendLink {
  id: number;
  name: string;
  url: string;
  icon_url?: string | null;
  weight: number;
  enabled: number;
}

export const getFriendLinks = async (page = 1, pageSize = 10) => {
  const { data } = await api.get('/friend-links', { params: { page, pageSize } });
  return data as { items: FriendLink[]; total: number; page: number; pageSize: number };
};
export const createFriendLink = async (payload: Partial<FriendLink>) => {
  const { data } = await api.post('/friend-links', payload);
  return data.id as number;
};
export const updateFriendLink = async (id: number, payload: Partial<FriendLink>) => {
  await api.put(`/friend-links/${id}`, payload);
};
export const deleteFriendLink = async (id: number) => {
  await api.delete(`/friend-links/${id}`);
};
export const batchFriendLinks = async (ids: number[], action: 'enable' | 'disable' | 'delete') => {
  const { data } = await api.post('/friend-links/batch', { ids, action });
  return data;
};

// Group Chats
export interface GroupChat {
  id: number;
  name: string;
  link?: string;
  avatar_url?: string;
  enabled: number;
}
export const getGroupChats = async () => {
  const { data } = await api.get('/group-chats');
  return data.items as GroupChat[];
};
export const createGroupChat = async (payload: Partial<GroupChat>) => {
  const { data } = await api.post('/group-chats', payload);
  return data.id as number;
};
export const updateGroupChat = async (id: number, payload: Partial<GroupChat>) => {
  await api.put(`/group-chats/${id}`, payload);
};
export const deleteGroupChat = async (id: number) => {
  await api.delete(`/group-chats/${id}`);
};
export const uploadFile = async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data as { url: string };
};

// Announcements
export interface AnnouncementCategory { id: number; name: string; parent_id?: number | null; }
export interface Announcement {
  id: number;
  title: string;
  content_html: string;
  content_markdown?: string | null;
  status: 'draft' | 'published' | 'offline';
  category_id?: number | null;
  scheduled_at?: string | null;
}
export const getAnnouncementCategories = async () => {
  const { data } = await api.get('/announcement-categories');
  return data.items as AnnouncementCategory[];
};
export const createAnnouncementCategory = async (payload: Partial<AnnouncementCategory>) => {
  const { data } = await api.post('/announcement-categories', payload);
  return data.id as number;
};
export const updateAnnouncementCategory = async (id: number, payload: Partial<AnnouncementCategory>) => {
  await api.put(`/announcement-categories/${id}`, payload);
};
export const deleteAnnouncementCategory = async (id: number) => {
  await api.delete(`/announcement-categories/${id}`);
};

export const getAnnouncements = async (params: { status?: string; page?: number; pageSize?: number } = {}) => {
  const { data } = await api.get('/announcements', { params });
  return data as { items: Announcement[]; total: number; page: number; pageSize: number };
};
export const createAnnouncement = async (payload: Partial<Announcement>) => {
  const { data } = await api.post('/announcements', payload);
  return data.id as number;
};
export const updateAnnouncement = async (id: number, payload: Partial<Announcement>) => {
  await api.put(`/announcements/${id}`, payload);
};
export const deleteAnnouncement = async (id: number) => {
  await api.delete(`/announcements/${id}`);
};
export const publishAnnouncement = async (id: number) => {
  await api.post(`/announcements/${id}/publish`);
};
export const offlineAnnouncement = async (id: number) => {
  await api.post(`/announcements/${id}/offline`);
};

// Apps
export interface AppItem {
  id: number;
  name: string;
  provider?: string | null;
  bg_url?: string | null;
  icon_url?: string | null;
  download_url?: string | null;
  enabled: number;
}
export const getApps = async () => {
  const { data } = await api.get('/apps');
  return data.items as AppItem[];
};
export const createApp = async (payload: Partial<AppItem>) => {
  const { data } = await api.post('/apps', payload);
  return data.id as number;
};
export const updateApp = async (id: number, payload: Partial<AppItem>) => {
  await api.put(`/apps/${id}`, payload);
};
export const deleteApp = async (id: number) => {
  await api.delete(`/apps/${id}`);
};

export interface AppSubmission {
  id: number;
  name: string;
  provider?: string | null;
  bg_url?: string | null;
  icon_url?: string | null;
  download_url?: string | null;
  type?: string | null;
  status?: string | null;
  user_id?: number | null;
  user_ip?: string | null;
  review_note?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  reviewer_id?: number | null;
}

export const getAppSubmissions = async (params: { status?: string } = {}) => {
  const { data } = await api.get('/submissions', { params });
  return data.items as AppSubmission[];
};

export const approveAppSubmission = async (id: number, note?: string) => {
  await api.post(`/submissions/${id}/approve`, note ? { note } : {});
};

export const rejectAppSubmission = async (id: number, note?: string) => {
  await api.post(`/submissions/${id}/reject`, note ? { note } : {});
};

export const updateAppSubmission = async (id: number, payload: Partial<AppSubmission>) => {
  await api.put(`/submissions/${id}`, payload);
};

// ENV management
export type EnvItem = { key: string; value: string; secure: boolean; updated_at: string | null };
export type EnvMap = Record<string, EnvItem[]>;

export const getEnvMap = async () => {
  const { data } = await api.get('/env');
  return data as EnvMap;
};
export const setEnv = async (payload: { key: string; value: string; category?: string; secure?: boolean }) => {
  await api.put('/env', payload);
};
export const getEnvHistory = async (key?: string) => {
  const { data } = await api.get('/env/history', { params: { key } });
  return data.items as Array<{ id: number; key: string; old_value_encrypted: string | null; new_value_encrypted: string; updated_at: string }>
};
export const rollbackEnvByHistoryId = async (id: number) => {
  await api.post('/env/rollback', { id });
};

// Public endpoints for homepage
export const getPublicFriendLinks = async () => {
  const { data } = await axios.get('/api/public/friend-links');
  return data.items as FriendLink[];
};
export const getPublicGroupChats = async () => {
  const { data } = await axios.get('/api/public/group-chats');
  return data.items as GroupChat[];
};
export const getPublicAnnouncements = async () => {
  const { data } = await axios.get('/api/public/announcements');
  return data.items as Announcement[];
};
export const getPublicApps = async () => {
  const { data } = await axios.get('/api/public/apps');
  return data.items as AppItem[];
};

// Auth
export const changeAdminPassword = async (payload: { old_password: string; new_password: string }) => {
  await api.post('/auth/change-password', payload);
};

export const loginAdmin = async (payload: { username: string; password: string }) => {
  const { data } = await rawApi.post('/auth/login', payload);
  return data as { token: string };
};

// System Logs
export interface SystemLog {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entity_id?: number | null;
  payload?: string | null;
  created_at: string;
}

export const getSystemLogs = async (page = 1, pageSize = 20) => {
  const { data } = await api.get('/logs', { params: { page, pageSize } });
  return data as { items: SystemLog[]; total: number; page: number; pageSize: number };
};

export const deleteSystemLogs = async (ids: number[], clearAll = false) => {
  await api.post('/logs/batch-delete', { ids, clearAll });
};

// Changelogs
import type { Changelog } from './api';
export const getChangelogs = async () => {
  const { data } = await api.get('/changelogs');
  return data.items as Changelog[];
};
export const createChangelog = async (payload: Partial<Changelog>) => {
  const { data } = await api.post('/changelogs', payload);
  return data.id as number;
};
export const updateChangelog = async (id: number, payload: Partial<Changelog>) => {
  await api.put(`/changelogs/${id}`, payload);
};
export const deleteChangelog = async (id: number) => {
  await api.delete(`/changelogs/${id}`);
};

export interface AboutPage {
  id: number;
  content_html?: string;
  content_markdown?: string;
  author_name?: string;
  author_avatar?: string;
  author_github?: string;
  github_repo?: string;
  version?: string;
}

export const getAboutPage = async () => {
  const { data } = await api.get('/about');
  return (data || {}) as AboutPage;
};

export const updateAboutPage = async (payload: Partial<AboutPage>) => {
  await api.put('/about', payload);
};

export interface Visitor {
  id: number;
  ip: string;
  location: string;
  device: string;
  path?: string;
  timestamp: string;
}

export interface VisitorStats {
  visitors: Visitor[];
  total: number;
  uniqueIp?: number;
  locationKinds?: number;
  deviceKinds?: number;
  locationStats?: Array<{ name: string; count: number }>;
  deviceStats?: Array<{ name: string; count: number }>;
}

export const getVisitorStats = async (page?: number, pageSize?: number, filters?: { location?: string; device?: string; path?: string }) => {
  const params: any = {};
  if (page) params.page = page;
  if (pageSize) params.pageSize = pageSize;
  if (filters?.location) params.location = filters.location;
  if (filters?.device) params.device = filters.device;
  if (filters?.path) params.path = filters.path;
  const { data } = await api.get('/visitors', { params });
  return data as VisitorStats;
};

export const batchDeleteVisitors = async (ids: number[]) => {
  await api.post('/visitors/batch-delete', { ids });
};

export const getVisitorTrend = async (days: number = 30) => {
  const { data } = await api.get('/visitors/trend', { params: { days } });
  return data as Array<{ date: string; count: number; unique_ip: number }>;
};

export const exportVisitors = async () => {
  const response = await api.get('/visitors/export', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `visitors-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export interface MusicApi {
  id: number;
  name: string;
  url: string;
  type: string;
  status: 'active' | 'error' | 'unknown';
  latency: number;
  enabled: number;
  created_at?: string;
  updated_at?: string;
}

export const getAdminMusicApis = async () => {
  const { data } = await api.get('/music/apis');
  return data.items as MusicApi[];
};

export const createMusicApi = async (payload: Partial<MusicApi>) => {
  const { data } = await api.post('/music/apis', payload);
  return data as { id: number };
};

export const updateMusicApi = async (id: number, payload: Partial<MusicApi>) => {
  await api.put(`/music/apis/${id}`, payload);
};

export const deleteMusicApi = async (id: number) => {
  await api.delete(`/music/apis/${id}`);
};

export const checkMusicApi = async (id?: number) => {
  const { data } = await api.post('/music/apis/check', { id });
  return data;
};

// Site Cards
export interface SiteCard {
  id: number;
  key: string;
  title: string;
  enabled: number;
  sort_order: number;
  style: string; // JSON string
  updated_at?: string;
}

export const getSiteCards = async () => {
  const { data } = await api.get('/site-cards');
  return data.items as SiteCard[];
};

export const updateSiteCard = async (id: number, payload: Partial<SiteCard>) => {
  await api.put(`/site-cards/${id}`, payload);
};

export const getPublicSiteCards = async () => {
  const { data } = await axios.get('/api/public/site-cards');
  return data.items as SiteCard[];
};

export interface Feedback {
  id: number;
  type: string;
  title: string;
  description: string;
  device_type?: string | null;
  os?: string | null;
  browser?: string | null;
  network?: string | null;
  page_url?: string | null;
  user_role?: string | null;
  email?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  hash?: string | null;
  status?: string | null;
  created_at: string;
}

export const getFeedbacks = async (page = 1, pageSize = 20) => {
  const { data } = await api.get('/feedbacks', { params: { page, pageSize } });
  return data as { items: Feedback[]; total: number; page: number; pageSize: number };
};

export const deleteFeedbacks = async (ids: number[]) => {
  const { data } = await api.post('/feedbacks/batch-delete', { ids });
  return data as { deleted: number };
};

export const updateFeedback = async (id: number, data: { status?: 'pending' | 'accepted' | 'rejected' | 'completed'; title?: string; description?: string }) => {
  await api.put(`/feedbacks/${id}`, data);
};
