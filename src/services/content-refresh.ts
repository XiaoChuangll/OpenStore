import { ref } from 'vue';
import { onWS } from './ws';
import { hmApi } from './hm-api';

/*
 * 「保存即失效」：后台保存后服务端广播 `<x>:update`，这里监听并
 *   1) 清掉 hm-api 缓存（应用列表 / 榜单等上游数据）；
 *   2) 递增 contentVersion，页面 watch 它重新取数。
 * WS 需要登录态，匿名访客靠各自的 TTL 兜底。
 */
export const contentVersion = ref(0);

/** 会触发前台刷新的后台事件（日志类不在此列） */
const CONTENT_EVENTS = new Set([
  'site_cards:update',
  'about:update',
  'apps:update',
  'announcements:update',
  'links:update',
  'groups:update',
  'changelogs:update',
  'incidents:update',
  'submissions:update',
]);

let bound = false;

/** 注册一次即可（在 main.ts 里调用） */
export const initContentRefresh = () => {
  if (bound) return;
  bound = true;
  onWS((type: string) => {
    if (!CONTENT_EVENTS.has(type)) return;
    hmApi.clearCache();
    contentVersion.value += 1;
  });
};
