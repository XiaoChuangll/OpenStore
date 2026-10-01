import { createRouter, createWebHistory } from 'vue-router';
import { onlyTrackQueryChanged, setupScrollMemory } from '../utils/route-scroll';

const HomeView = () => import('../views/HomeView.vue');
const MusicView = () => import('../views/MusicView.vue');
const LoginView = () => import('../views/LoginView.vue');
const NotFoundView = () => import('../views/NotFoundView.vue');
const TotalRankView = () => import('../views/TotalRankView.vue');
const GrowthRankView = () => import('../views/GrowthRankView.vue');
const HistoryRankView = () => import('../views/HistoryRankView.vue');
const NonHuaweiRankView = () => import('../views/NonHuaweiRankView.vue');
const CategoryRankView = () => import('../views/CategoryRankView.vue');
const AppDashboardView = () => import('../views/AppDashboardView.vue');
const NextAppDetailView = () => import('../views/NextAppDetailView.vue');
const AppCardView = () => import('../views/AppCardView.vue');
const AppsView = () => import('../views/AppsView.vue');
const UpdatesView = () => import('../views/UpdatesView.vue');
const UpdatesAppDetailView = () => import('../views/UpdatesAppDetailView.vue');
const TopicView = () => import('../views/TopicView.vue');
const ArticlesView = () => import('../views/ArticlesView.vue');
const ArticleDetailView = () => import('../views/ArticleDetailView.vue');
const AdminDashboardView = () => import('../views/admin/AdminDashboardView.vue');
const SubmissionView = () => import('../views/SubmissionView.vue');
const AboutView = () => import('../views/AboutView.vue');
import { useAuthStore } from '../stores/auth';
import { trackVisit } from '../services/api';
import { applyPageMeta } from '../utils/page-share';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        title: '探索',
        // 分享卡片副标题（人话版）；SEO 用的关键词描述保留在 index.html 的 name="description" 里
        description: '发现最新、最热门的鸿蒙应用，探索 OpenStore 的精彩世界。'
      }
    },
    {
      path: '/music',
      name: 'music',
      component: MusicView,
      meta: { title: '音乐', description: '畅听海量音乐，发现你的专属歌单。' }
    },
    {
      path: '/player',
      name: 'player',
      component: () => import('../views/PlayerView.vue'),
      meta: { title: '正在播放', description: '查看当前播放的歌曲、进度与播放队列。' }
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
      meta: { title: '专题', description: '跟随专题逛鸿蒙生态，发现值得一试的应用。' }
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
      meta: { title: '下载量', description: '查看应用下载量的历史变化，分析长期趋势。' }
    },
    {
      path: '/rank/non-huawei',
      name: 'non-huawei-rank',
      component: NonHuaweiRankView,
      meta: { title: '第三方应用榜', description: '探索非华为设备上的热门应用。' }
    },
    {
      path: '/rank/category',
      name: 'category-rank',
      component: CategoryRankView,
      meta: { title: '分类榜', description: '按应用分类查看下载量增长，找出正在上涨的赛道。' }
    },
    {
      path: '/articles',
      name: 'articles',
      component: ArticlesView,
      meta: { title: '文章', description: '阅读OpenStore发布的最新文章与专题内容。' }
    },
    {
      path: '/articles/:slug',
      name: 'article-detail',
      component: ArticleDetailView,
      meta: { title: '文章详情', description: '查看文章详细内容。' }
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
      meta: { title: '主题设置', requiresAuth: true, description: '管理全站主题配色' }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: { title: '404', description: '页面未找到。' }
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    /*
     * 同一页面里只有曲目变了时不重置滚动位置：播放页和音乐页切歌都会把 ?track= 同步到地址栏，
     * 若是照常「回到顶部」，每点一次上一首 / 下一首，页面就被拽回顶上。
     * 其它导航（换页面、切换 view 等 query）维持原来的行为。
     * 返回 false 表示这次导航不要改动滚动位置。
     */
    if (to.path === from.path && onlyTrackQueryChanged(to.query, from.query)) {
      return false;
    }
    return { top: 0 };
  },
});

/*
 * 额外记一层"每个页面离开时滚到哪"，只有浏览器后退时恢复。
 * vue-router 自带的 savedPosition 实测经常取不到（从榜单页返回首页总是顶部），
 * 见 utils/route-scroll.ts 里的 setupScrollMemory。
 */
setupScrollMemory(router);

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
  /*
    标题 / 描述 / og / twitter 统一由 page-share 决定：
    栏目页（探索、应用、专题、榜单…）带网站 logo，信息页（应用、文章、专题详情）
    带自己的资源图片和文字。
  */
  applyPageMeta({
    path: to.path,
    fullPath: to.fullPath,
    query: to.query as Record<string, any>,
    meta: to.meta as Record<string, any>,
  });
  
  // Track visitor (exclude admin paths)
  if (!to.path.startsWith('/admin')) {
    trackVisit(to.fullPath);
  }
});

export default router;
