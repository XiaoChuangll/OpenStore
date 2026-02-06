import { createRouter, createWebHistory } from 'vue-router';
const HomeView = () => import('../views/HomeView.vue');
const MusicView = () => import('../views/MusicView.vue');
const LoginView = () => import('../views/LoginView.vue');
const NotFoundView = () => import('../views/NotFoundView.vue');
const TotalRankView = () => import('../views/TotalRankView.vue');
const GrowthRankView = () => import('../views/GrowthRankView.vue');
const HistoryRankView = () => import('../views/HistoryRankView.vue');
const NonHuaweiRankView = () => import('../views/NonHuaweiRankView.vue');
const AppDashboardView = () => import('../views/AppDashboardView.vue');
const NextAppDetailView = () => import('../views/NextAppDetailView.vue');
const AppCardView = () => import('../views/AppCardView.vue');
const AppsView = () => import('../views/AppsView.vue');
const UpdatesView = () => import('../views/UpdatesView.vue');
const UpdatesAppDetailView = () => import('../views/UpdatesAppDetailView.vue');
const TopicView = () => import('../views/TopicView.vue');
const AdminDashboardView = () => import('../views/admin/AdminDashboardView.vue');
const SubmissionView = () => import('../views/SubmissionView.vue');
const AboutView = () => import('../views/AboutView.vue');
import { useAuthStore } from '../stores/auth';
import { trackVisit } from '../services/api';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: '探索', description: '发现最新、最热门的移动应用，探索OpenStore的精彩世界。' }
    },
    {
      path: '/music',
      name: 'music',
      component: MusicView,
      meta: { title: '音乐', description: '畅听海量音乐，发现你的专属歌单。' }
    },
    {
      path: '/apps',
      name: 'apps',
      component: AppsView,
      meta: { title: '应用', description: '浏览OpenStore所有应用，查找你需要的工具和游戏。' }
    },
    {
      path: '/apps/:id',
      name: 'next-app-detail',
      component: NextAppDetailView,
      meta: { title: '应用详情', description: '查看应用详细信息、评分、评论和更新历史。' }
    },
    {
      path: '/app/:id',
      name: 'app-card-detail',
      component: AppCardView,
      meta: { title: '应用详情', description: '应用卡片详情页面' }
    },
    {
      path: '/app-cards',
      name: 'app-cards',
      component: AppCardView,
      meta: { title: '应用列表', description: '应用卡片列表' }
    },
    {
      path: '/updates',
      name: 'updates',
      component: UpdatesView,
      meta: { title: '今日上新', description: '获取最新应用更新和新上架应用信息。' }
    },
    {
      path: '/updates/app/:id',
      name: 'updates-app-detail',
      component: UpdatesAppDetailView,
      meta: { title: '应用更新详情', description: '查看特定应用的详细更新日志和版本信息。' }
    },
    {
      path: '/topics',
      name: 'topics',
      component: TopicView,
      meta: { title: '专题', description: '探索精彩专题，发现更多优质应用。' }
    },
    {
      path: '/topics/:id',
      name: 'topic-detail',
      component: () => import('../views/TopicDetailView.vue'),
      meta: { title: '专题详情', description: '查看专题详细信息。' }
    },
    {
      path: '/dashboard',
      name: 'app-dashboard',
      component: AppDashboardView,
      meta: { title: '应用详情', description: '管理和查看你的应用数据仪表盘。' }
    },
    {
      path: '/rank/total',
      name: 'total-rank',
      component: TotalRankView,
      meta: { title: '总榜', description: '查看OpenStore应用总榜，了解最受欢迎的应用。' }
    },
    {
      path: '/rank/growth',
      name: 'growth-rank',
      component: GrowthRankView,
      meta: { title: '飙升榜', description: '查看OpenStore应用飙升榜，发现潜力应用。' }
    },
    {
      path: '/system-status',
      name: 'system-status',
      component: () => import('../views/SystemStatusView.vue'),
      meta: { title: '系统状态', description: '监控系统核心服务与接口状态。' }
    },
    {
      path: '/rank/history',
      name: 'history-rank',
      component: HistoryRankView,
      meta: { title: '历史榜', description: '回顾应用历史排名，分析长期表现。' }
    },
    {
      path: '/rank/non-huawei',
      name: 'non-huawei-rank',
      component: NonHuaweiRankView,
      meta: { title: '非华为榜', description: '探索非华为设备上的热门应用。' }
    },
    {
      path: '/submit',
      name: 'submission',
      component: SubmissionView,
      meta: { title: '投稿', description: '提交鸿蒙应用或专题到OpenStore。' }
    },
    {
      path: '/about',
      name: 'about',
      component: AboutView,
      meta: { title: '关于', description: '了解OpenStore的开发背景、技术栈和团队信息。' }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { title: '登录', description: '登录OpenStore账户，享受更多个性化服务。' }
    },
    {
      path: '/admin',
      redirect: '/admin/dashboard',
    },
    {
      path: '/admin/login',
      name: 'admin-login',
      component: LoginView,
      meta: { title: '管理员登录', description: 'OpenStore管理员登录页面。' }
    },
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: AdminDashboardView,
      meta: { title: '后台管理', requiresAuth: true, description: 'OpenStore后台管理系统，管理应用、用户和系统设置。' }
    },
    {
      path: '/admin/feedbacks',
      name: 'admin-feedbacks',
      component: () => import('../views/admin/FeedbackAdminView.vue'),
      meta: { title: '用户反馈', requiresAuth: true, description: '查看用户反馈' }
    },
    {
      path: '/admin/settings',
      name: 'admin-settings',
      component: () => import('../views/admin/SystemSettingsView.vue'),
      meta: { title: '系统设置', requiresAuth: true, description: '管理系统设置与主题' }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: { title: '404', description: '页面未找到。' }
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

router.beforeEach((to) => {
  const store = useAuthStore();
  if (to.meta && (to.meta as any).requiresAuth && !store.isLoggedIn()) {
    if (to.path.startsWith('/admin')) {
      return { name: 'admin-login', query: { redirect: to.fullPath } };
    }
    return { name: 'login' };
  }
});

router.afterEach((to) => {
  // Update document title
  const defaultTitle = 'OpenStore - 发现更多精彩应用'; // 默认标题
  const pageTitle = (to.query.title as string) || (to.meta.title as string);
  document.title = pageTitle ? `${pageTitle} - OpenStore` : defaultTitle;

  // Update meta description
  const defaultDescription = 'OpenStore 是一个发现和管理移动应用的平台，提供丰富的应用信息、排行榜和更新动态。'; // 默认描述
  const description = (to.meta.description as string) || defaultDescription;
  
  const updateMeta = (name: string, content: string, property = false) => {
    const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      if (property) el.setAttribute('property', name);
      else el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  updateMeta('description', description);
  
  // Update Open Graph and Twitter tags
  const fullTitle = pageTitle ? `${pageTitle} - OpenStore` : defaultTitle;
  updateMeta('og:title', fullTitle, true);
  updateMeta('og:description', description, true);
  updateMeta('og:url', window.location.href, true);
  updateMeta('twitter:title', fullTitle);
  updateMeta('twitter:description', description);

  // Ensure image tags exist (they point to root /og-image.png which is fine for most)
  // But we can force them to be absolute if we have location.origin
  const origin = window.location.origin;
  const imageUrl = `${origin}/og-image.png`;
  updateMeta('og:image', imageUrl, true);
  updateMeta('twitter:image', imageUrl);
  
  // Track visitor (exclude admin paths)
  if (!to.path.startsWith('/admin')) {
    trackVisit(to.fullPath);
  }
});

export default router;
