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

export const getAnnouncements = async (
  params: { status?: string; search?: string; category_id?: number | null; page?: number; pageSize?: number } = {}
) => {
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

export interface BlogCategory { id: number; name: string; parent_id?: number | null; }
export interface BlogTag { id: number; name: string; color?: string | null; group_name?: string | null; usage_count?: number; }
export interface Blog {
  id: number;
  title: string;
  slug: string;
  content_html?: string | null;
  content_markdown?: string | null;
  summary?: string | null;
  cover_url?: string | null;
  cover_focus?: string | null;
  author_names?: string | null;
  status: 'draft' | 'published' | 'offline';
  category_id?: number | null;
  category_name?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  password?: string | null;
  /** 后台列表只返回这个标记，不再返回明文密码或哈希 */
  has_password?: number | boolean | null;
  allow_comments?: number | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  tag_ids?: string | number[] | null;
  tag_names?: string | null;
  tag_colors?: string | null;
  app_ids?: string | number[] | null;
}
export interface BlogVersion {
  id: number;
  blog_id: number;
  title?: string | null;
  content_html?: string | null;
  content_markdown?: string | null;
  summary?: string | null;
  cover_url?: string | null;
  author_names?: string | null;
  status?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  created_at?: string | null;
}

export const getBlogCategories = async () => {
  const { data } = await api.get('/blog-categories');
  return data.items as BlogCategory[];
};
export const createBlogCategory = async (payload: Partial<BlogCategory>) => {
  const { data } = await api.post('/blog-categories', payload);
  return data.id as number;
};
export const updateBlogCategory = async (id: number, payload: Partial<BlogCategory>) => {
  await api.put(`/blog-categories/${id}`, payload);
};
export const deleteBlogCategory = async (id: number) => {
  await api.delete(`/blog-categories/${id}`);
};

export const getBlogTags = async () => {
  const { data } = await api.get('/blog-tags');
  return data.items as BlogTag[];
};
export const createBlogTag = async (payload: Partial<BlogTag>) => {
  const { data } = await api.post('/blog-tags', payload);
  return data.id as number;
};
export const updateBlogTag = async (id: number, payload: Partial<BlogTag>) => {
  await api.put(`/blog-tags/${id}`, payload);
};
export const deleteBlogTag = async (id: number) => {
  await api.delete(`/blog-tags/${id}`);
};

export const getBlogs = async (
  params: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    category_id?: number;
    tag_id?: number;
  } = {}
) => {
  const { data } = await api.get('/blogs', { params });
  return data as { items: Blog[]; total: number; page: number; pageSize: number };
};
export const createBlog = async (payload: Partial<Blog> & { tag_ids?: number[]; app_ids?: number[] }) => {
  const { data } = await api.post('/blogs', payload);
  return data.id as number;
};
export const updateBlog = async (id: number, payload: Partial<Blog> & { tag_ids?: number[]; app_ids?: number[] }) => {
  await api.put(`/blogs/${id}`, payload);
};
export const deleteBlog = async (id: number) => {
  await api.delete(`/blogs/${id}`);
};
export const publishBlog = async (id: number) => {
  await api.post(`/blogs/${id}/publish`);
};
export const offlineBlog = async (id: number) => {
  await api.post(`/blogs/${id}/offline`);
};
export const getBlogVersions = async (id: number) => {
  const { data } = await api.get(`/blogs/${id}/versions`);
  return data.items as BlogVersion[];
};
export const createBlogVersion = async (id: number, payload: Partial<BlogVersion>) => {
  const { data } = await api.post(`/blogs/${id}/versions`, payload);
  return data.id as number;
};
export const restoreBlogVersion = async (id: number, versionId: number) => {
  await api.post(`/blogs/${id}/restore`, { version_id: versionId });
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
export const searchApps = async (params: { q?: string; ids?: number[]; limit?: number } = {}) => {
  const query: Record<string, any> = {};
  if (params.q) query.q = params.q;
  if (params.ids && params.ids.length) query.ids = params.ids.join(',');
  if (typeof params.limit !== 'undefined') query.limit = params.limit;
  const { data } = await api.get('/apps/search', { params: query });
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

export const getSystemLogs = async (
  page = 1,
  pageSize = 20,
  filters: { search?: string; action?: string; actor?: string } = {}
) => {
  const { data } = await api.get('/logs', { params: { page, pageSize, ...filters } });
  return data as {
    items: SystemLog[];
    total: number;
    page: number;
    pageSize: number;
    actions?: Array<{ action: string; count: number }>;
    actors?: Array<{ actor: string; count: number }>;
    today_count?: number;
  };
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
  /**
   * 访客请求带的原始 User-Agent 原文（device 是从它解析出来的展示名）。
   * 注意：服务端转发上游时不用它，上游看到的是统一的 UPSTREAM_USER_AGENT。
   * null / undefined = 这条记录是加字段之前的老数据，没有记录过；
   * 空串 = 记录过，但这次请求确实没带 User-Agent。
   */
  ua?: string | null;
  /** 1 = 这次请求经 /api/v0 转发到了上游（那一行的 UA 要显示上游 UA，不是访客的） */
  via_upstream?: number | null;
  /** 1 = 经已知前置反代（如 beta-next.icu）进来的访问 */
  via_proxy?: number | null;
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

export interface VisitorIpHistory {
  ip: string;
  total: number;
  path_kinds: number;
  device_kinds: number;
  first_seen: string;
  last_seen: string;
  location: string;
  /** 转发上游时用的 UA（用于展示 via_upstream 那几行） */
  upstream_ua?: string;
  visitors: Visitor[];
}

/** 某个 IP 的最近访问记录（访客日志点卡片 / 行时用） */
export const getVisitorIpHistory = async (ip: string, limit = 30) => {
  const { data } = await api.get('/visitors/ip-history', { params: { ip, limit } });
  return data as VisitorIpHistory;
};

export interface VisitorTrendOptions {
  /** day（默认）按天分桶，hour 按小时分桶 */
  granularity?: 'day' | 'hour';
  /** 小时粒度时的回看小时数，默认 24 */
  hours?: number;
  /** scope=today 表示只取当天（北京时间 0 点起） */
  scope?: 'today';
  /** 把窗口整体往回推 N 天（用于对比「上一个周期」） */
  offset?: number;
}

export const getVisitorTrend = async (days: number = 30, options: VisitorTrendOptions = {}) => {
  const { data } = await api.get('/visitors/trend', {
    params: {
      days,
      granularity: options.granularity,
      hours: options.hours,
      scope: options.scope,
      offset: options.offset
    }
  });
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

/* ------------------------------ 数据库管理 ------------------------------ */

export interface DatabaseTableInfo {
  name: string;
  rows: number;
  columns: number;
  indexes: number;
}

export interface DatabaseOverview {
  file: { path: string; sizeBytes: number; mtime: string | null; walBytes?: number; shmBytes?: number };
  sqlite: { version: string };
  pragmas: {
    pageSize: number;
    pageCount: number;
    freelistCount: number;
    journalMode: string;
    autoVacuum: number;
    encoding: string;
  };
  freeBytes: number;
  counts: { tables: number; indexes: number; views: number; triggers: number; totalRows: number };
  tables: DatabaseTableInfo[];
}

export const getDatabaseOverview = async () => {
  const { data } = await api.get('/database/overview');
  return data as DatabaseOverview;
};

export interface DatabaseTableData {
  table: string;
  page: number;
  pageSize: number;
  total: number;
  columns: Array<{ name: string; type: string; pk: boolean }>;
  rows: Array<Record<string, unknown>>;
}

export const getDatabaseTable = async (
  name: string,
  params: { page?: number; pageSize?: number; orderBy?: string; order?: 'asc' | 'desc'; q?: string } = {}
) => {
  const { data } = await api.get(`/database/tables/${encodeURIComponent(name)}`, { params });
  return data as DatabaseTableData;
};

export const runDatabaseMaintenance = async (action: string) => {
  const { data } = await api.post('/database/maintenance', { action });
  return data as { action: string; label: string; durationMs: number; rows: Array<Record<string, unknown>> };
};

export const runDatabaseQuery = async (sql: string) => {
  const { data } = await api.post('/database/query', { sql });
  return data as {
    durationMs: number;
    rowCount: number;
    truncated: boolean;
    columns: string[];
    rows: Array<Record<string, unknown>>;
  };
};

/** 下载数据库快照（后端用 VACUUM INTO 生成一致副本，含 WAL 里尚未合并的数据） */
export const downloadDatabaseBackup = async () => {
  const response = await api.get('/database/backup', { responseType: 'blob' });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `visitors-${stamp}.db`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
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
  page: string;
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

/** 拖拽排序：按传入的 id 顺序重写该页面的权重 */
export const reorderSiteCards = async (ids: number[]) => {
  const { data } = await api.put('/site-cards/order', { ids });
  return data.items as SiteCard[];
};

/** 把某个页面的卡片恢复成默认顺序 / 标题 / 显隐 / 样式 */
export const resetSiteCards = async (page: string) => {
  const { data } = await api.post('/site-cards/reset', { page });
  return data.items as SiteCard[];
};

export const getPublicSiteCards = async (page?: string) => {
  const { data } = await axios.get('/api/public/site-cards', { params: page ? { page } : undefined });
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

export interface Comment {
  id: number;
  blog_id: number;
  parent_id: number | null;
  nickname: string;
  email: string | null;
  website: string | null;
  content: string;
  status: 'pending' | 'approved' | 'spam' | 'trash';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  blog_title?: string;
}

export interface CommentQuery {
  status?: string;
  blog_id?: number;
}

export const getComments = async (page = 1, pageSize = 20, query: CommentQuery = {}) => {
  const params: Record<string, any> = { page, pageSize };
  if (query.status) params.status = query.status;
  if (query.blog_id) params.blog_id = query.blog_id;
  const { data } = await api.get('/comments', { params });
  return data as { items: Comment[]; total: number; page: number; pageSize: number };
};

export const updateComment = async (id: number, data: { status?: string; content?: string; nickname?: string; email?: string | null; website?: string }) => {
  await api.put(`/comments/${id}`, data);
};

export const deleteComment = async (id: number) => {
  const { data } = await api.delete(`/comments/${id}`);
  return data as { success: boolean; deleted: number };
};

export const deleteComments = async (ids: number[]) => {
  const { data } = await api.post('/comments/batch-delete', { ids });
  return data as { success: boolean; deleted: number };
};

export const updateCommentsStatus = async (ids: number[], status: string) => {
  const { data } = await api.post('/comments/batch-status', { ids, status });
  return data as { success: boolean; updated: number };
};

export const getCommentBlogs = async () => {
  const { data } = await api.get('/comments/blogs');
  return data.items as { id: number; title: string }[];
};

// System Settings
export const getSystemSettings = async () => {
  const { data } = await api.get('/settings');
  return data as Record<string, string>;
};

export const updateSystemSettings = async (settings: Record<string, string>) => {
  const { data } = await api.put('/settings', settings);
  return data as { updated: number };
};

export interface AdminOverviewStats {
  visitorCount: number;
  /** 独立 IP 数（和访客日志页同一份聚合结果） */
  uniqueIpCount: number;
  /** 覆盖地区数（同上） */
  locationKinds: number;
  appCount: number;
  feedbackCount: number;
  commentCount: number;
  articleCount: number;
  systemUptime: number;
  nodeVersion?: string;
}

export const getAdminOverviewStats = async () => {
  const { data } = await api.get('/overview');
  return data as AdminOverviewStats;
};

export interface FreshnessItem {
  key: string;
  label: string;
  ttl: number | null;
  last: string | null;
  ageSeconds: number | null;
  extra?: Record<string, number | null>;
}

/** 页面访问条目：哪个页面最近被访问、近 30 天访问了多少次 */
export interface PageVisitItem {
  key: string;
  path: string;
  label: string;
  visits: number;
  ageSeconds: number | null;
  last: string | null;
}

export const getDataFreshness = async () => {
  const { data } = await api.get('/freshness');
  return (data?.items || []) as FreshnessItem[];
};

export const getPageVisits = async () => {
  const { data } = await api.get('/freshness');
  return (data?.pages || []) as PageVisitItem[];
};

/** 一次请求同时拿到「数据表新鲜度」和「页面访问」两组数据 */
export const getFreshnessOverview = async () => {
  const { data } = await api.get('/freshness');
  return {
    items: (data?.items || []) as FreshnessItem[],
    pages: (data?.pages || []) as PageVisitItem[]
  };
};

export interface ReplayResult {
  success: boolean;
  status?: number;
  ms?: number;
  preview?: string;
  error?: string;
  needConfirm?: boolean;
}

export const replayRequest = async (payload: { method: string; path: string; confirm?: boolean }) => {
  const { data } = await api.post('/replay', payload);
  return data as ReplayResult;
};

export interface TopologyNode {
  id: string;
  name: string;
  count: number;
  avgMs: number;
  maxMs: number;
  errors: number;
  slow: number;
}

export interface TopologyData {
  windowSeconds: number;
  totals: {
    requests: number;
    errors: number;
    slow: number;
    cacheBuilds: number;
    upstreamErrors: number;
    upstreamRequests: number;
  };
  apiNodes: TopologyNode[];
  upstreamProxy: {
    count: number;
    avgMs: number;
    errors: number;
    slow: number;
    paths: Array<{ path: string; count: number; avgMs: number }>;
  } | null;
  upstream: { calls: number; avgMs: number; cacheBuilds: number; errors: number };
}

export const getTopology = async (windowSeconds = 300) => {
  const { data } = await api.get('/topology', { params: { window: windowSeconds } });
  return data as TopologyData;
};

// ---- 全接口性能检测 ----
export interface PerfCheckResult {
  path: string;
  status: number;
  ms: number;
  bytes: number;
  ok: boolean;
  /** 400 且提示缺参数：这类接口不开参数本来就没法访问，不算失败 */
  needsParam?: boolean;
  skipped?: boolean;
  error?: string;
}

export interface PerfCheckReport {
  total: number;
  failed: number;
  needsParams: number;
  slow: number;
  avgMs: number;
  maxMs: number;
  durationMs: number;
  checkedAt: string;
  results: PerfCheckResult[];
}

/** 把服务端全部 GET 接口顺序跑一遍，返回耗时报告（一次十几秒，给足超时） */
export const runPerfCheck = async () => {
  const { data } = await api.post('/perf-check', {}, { timeout: 90_000 });
  return data as PerfCheckReport;
};

export interface VisitorInsights {
  days: number;
  total: number;
  countries: Array<{ code: string; count: number }>;
  china: {
    provinces: Array<{ name: string; count: number }>;
    cities: Array<{ name: string; count: number }>;
    unlocated: number;
  };
  hourly: Array<{ hour: number; count: number }>;
  matrix: number[][];
}

export const getVisitorInsights = async (days = 180) => {
  const { data } = await api.get('/visitor-insights', { params: { days } });
  return data as VisitorInsights;
};

// 异常应用：屏蔽上游脏数据，首页/应用列表不再展示（搜索仍可搜到）
export interface BlockedApp {
  package: string;
  name?: string | null;
  icon_url?: string | null;
  note?: string | null;
  created_at?: string;
}

export const getBlockedApps = async () => {
  const { data } = await api.get('/blocked-apps');
  return (data.items || []) as BlockedApp[];
};

export const blockApp = async (payload: { package: string; name?: string; icon_url?: string; note?: string }) => {
  const { data } = await api.post('/blocked-apps', payload);
  return data as { success: boolean; package: string };
};

export const unblockApp = async (pkg: string) => {
  await api.delete(`/blocked-apps/${encodeURIComponent(pkg)}`);
};

/** 警告页预览：只取示例 HTML，不拦截、不消耗配额 */
export const getScriptGuardPreview = async () => {
  const { data } = await api.get('/script-guard/preview');
  return String(data?.html || '');
};

/** 警告页文案的自定义配置（存在 system_settings 里，保存后立刻生效，不用重启） */
export interface ScriptGuardPageConfig {
  badge: string;
  title: string;
  message: string;
  tips: string[];
  contactLabel: string;
  contactUrl: string;
  showDetails: boolean;
}

export const getScriptGuardPageConfig = async () => {
  const { data } = await api.get('/script-guard/page');
  return data as { config: ScriptGuardPageConfig; defaults: ScriptGuardPageConfig };
};

export const saveScriptGuardPageConfig = async (config: ScriptGuardPageConfig) => {
  const { data } = await api.put('/script-guard/page', config);
  return data.config as ScriptGuardPageConfig;
};

export const resetScriptGuardPageConfig = async () => {
  const { data } = await api.post('/script-guard/page/reset');
  return data.config as ScriptGuardPageConfig;
};

/** 一次拦截（封禁）记录 */
export interface ScriptGuardBlockRecord {
  id: number;
  ip: string;
  location: string;
  ua: string;
  path: string;
  hits: number;
  strikes: number;
  block_ms: number;
  created_at: string;
}

export interface ScriptGuardBlockList {
  items: ScriptGuardBlockRecord[];
  /** 当前仍在封禁期内的 IP（内存态，重启即清空） */
  active: Array<{ ip: string; ua: string; strikes: number; remainMs: number }>;
  stats: { scriptRequests: number; warned: number; blocked: number; strikes: number };
}

export const getScriptGuardBlocks = async (limit = 100) => {
  const { data } = await api.get('/script-guard/blocks', { params: { limit } });
  return data as ScriptGuardBlockList;
};

export const clearScriptGuardBlocks = async () => {
  await api.delete('/script-guard/blocks');
};

export const unblockScriptGuardIp = async (ip: string) => {
  const { data } = await api.post('/script-guard/unblock', { ip });
  return Boolean(data?.released);
};

export interface ScriptGuardTriggerResult {
  ip: string;
  status: number;
  strikes: number;
  blockMs: number;
  remainMs: number;
  /** 真正会发给这个 IP 的 429 页面 */
  html: string;
}

/** 一键触发真实拦截：对当前管理员 IP 真封一次，重复调用按 4 倍升级 */
export const triggerScriptGuardBlock = async (payload?: { ua?: string; path?: string }) => {
  const { data } = await api.post('/script-guard/trigger', payload || {});
  return data as ScriptGuardTriggerResult;
};

/** 硬封禁：不区分 UA，命中后该 IP 的一切请求都返回 429 */
export interface ScriptGuardHardBan {
  ip: string;
  reason: string;
  created_at: string;
  expires_at: string | null;
  permanent: boolean;
  remainMs: number;
  /** 封禁期间被挡下的请求数（内存计数，重启归零） */
  hits: number;
}

export const getScriptGuardBans = async () => {
  const { data } = await api.get('/script-guard/bans');
  return (data.items || []) as ScriptGuardHardBan[];
};

export const addScriptGuardBan = async (payload: { ip: string; reason?: string; durationMs?: number }) => {
  const { data } = await api.post('/script-guard/bans', payload);
  return (data.items || []) as ScriptGuardHardBan[];
};

export const removeScriptGuardBan = async (ip: string) => {
  const { data } = await api.post('/script-guard/bans/remove', { ip });
  return (data.items || []) as ScriptGuardHardBan[];
};
