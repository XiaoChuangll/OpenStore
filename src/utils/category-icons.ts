/**
 * 分类名 → 图标。
 *
 * 「/apps 应用页」的分类卡片和「分类增长排行」共用这一份，
 * 同一个分类在两处必须长一样，别再各写一份。
 *
 * 键同时覆盖两类名字：
 * - 分类页的分组名（服务端 APP_CATEGORY_GROUPS 的 label，如「休闲益智」「体育竞速」）
 * - 上游的原始 kind_name（分类增长排行用的就是这套，如「休闲」「竞技」「射击」）
 */
import {
  Tools, MapLocation, Coffee, School, House, Suitcase, Lollipop, Wallet,
  Document, Camera, UserFilled, Basketball, MagicStick, ShoppingCart,
  DataAnalysis, Location, ChatDotRound, Van, FirstAidKit, Trophy, Ticket,
  Food, Timer, VideoPlay, Headset, Brush, Picture, Reading, VideoCamera, Service
} from '@element-plus/icons-vue';

export const CATEGORY_ICON_MAP: Record<string, any> = {
  '工具': Tools,
  '旅游': MapLocation,
  '休闲益智': Coffee,
  '教育': School,
  '生活服务': House,
  '商务': Suitcase,
  '儿童': Lollipop,
  '金融理财': Wallet,
  '新闻': Document,
  '拍摄美化': Camera,
  '角色扮演': UserFilled,
  '运动健康': Basketball,
  '动作射击': MagicStick,
  '购物': ShoppingCart,
  '经营策略': DataAnalysis,
  '出行导航': Location,
  '社交': ChatDotRound,
  '汽车': Van,
  '医疗': FirstAidKit,
  '体育竞速': Trophy,
  '棋牌桌游': Ticket,
  '资讯': Document,
  '美食': Food,
  '效率': Timer,
  '休闲娱乐': VideoPlay,
  '音乐': Headset,
  '艺术与设计': Brush,
  '主题': Picture,
  '阅读与工具书': Reading,
  '影视与直播': VideoCamera,
  '实用工具': Tools,
  '体育': Basketball,
  '房产与装修': House,
  '便捷生活': Service,
  '旅游住宿': MapLocation,
  '新闻阅读': Reading,
  '购物比价': ShoppingCart,
  '影音娛樂': VideoPlay,
  '社交通讯': ChatDotRound,
  // 上游原始分类（分类增长排行会出现），归到语义最近的那一类
  '射击': MagicStick,
  '动作': MagicStick,
  '休闲': Coffee,
  '益智解谜': Coffee,
  '策略': DataAnalysis,
  '经营建造': DataAnalysis,
  '模拟养成': DataAnalysis,
  '竞技': Trophy,
  '竞速': Trophy,
  '棋牌': Ticket,
  '卡牌': Ticket,
  '派对游戏': Lollipop
};
