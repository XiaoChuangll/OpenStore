import type { EChartsOption } from 'echarts';
import type { TopologyData, TopologyNode } from '../services/admin';

/*
 * 调用拓扑的画布布局。
 *
 * 形状：左边缘一列两个大球（前端在上、上游 API 在下），接口小球在对侧（右侧、说明贴右边缘）。
 * 「前端 → 各接口 → 上游接口(v0) → 上游 API」的连线里，其余接口从左侧扇形展开。
 *
 * 电流只认「这段时间真的有请求」：live 传的是短窗口（十几秒）里各节点的请求数，
 * 大于 0 的链路才通电；长窗口的 count 只决定线的粗细和颜色，不再决定亮不亮。
 *
 * 坐标就是画布像素，靠两件事保证：
 *   1. graph 只用它自己的 view 坐标系（挂 cartesian2d 时节点会拿不到坐标、球整个消失），
 *      再用两个不可见锚点把数据范围钉成「0,0 → W,H」——view 是按数据范围自适应缩放的，
 *      范围等于画布时映射就是 1:1，而且横竖缩放比恒为 1（不会把圆球拉成椭圆）；
 *   2. 电流用一套铺满画布的隐藏直角坐标系，和上面是同一套像素。
 * 所以 W/H 必须是 ECharts 的真实画布尺寸（调用方传 chart.getWidth()/getHeight()）。
 */

/** 画布尺寸 */
export interface TopologySize {
  width: number;
  height: number;
}

/** 节点 id -> 短窗口内的请求数；没有就是不亮 */
export type TopologyLive = Record<string, number>;

/** 后台自己的接口：这些接口的调用方是「后台」球，不是前台页面 */
const isBackendPath = (path: string) => path.startsWith('/api/admin');

/*
 * 电流强度分 5 档，按「近窗口请求数」的绝对值分桶，而不是跟最忙的那条比：
 * 相对比例下最忙的链路抖一下就会连带改掉其它链路的档位，
 * 指纹跟着变 → 每轮都重画 → 光点被打回起点，看着一顿一顿的。
 */
const liveLevel = (count: number) => {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return 0;
  if (n >= 12) return 4;
  if (n >= 6) return 3;
  if (n >= 3) return 2;
  return 1;
};
const LIVE_LEVELS = 5;

/**
 * 电流视觉的指纹：哪些线亮 + 各自的强度档位。
 * 调用方拿它判断要不要 setOption —— 每轮都重画会让动画一顿一顿的。
 */
export const liveSignature = (live: TopologyLive): string =>
  Object.keys(live)
    .filter((id) => liveLevel(live[id]) > 0)
    .sort()
    .map((id) => `${id}:${liveLevel(live[id])}`)
    .join(',');

/** 只关心颜色和流量这几个字段，接口节点与上游代理都能传进来 */
type TrafficLike = Pick<TopologyNode, 'count' | 'avgMs' | 'errors' | 'slow'>;

/** 节点色：有错 > 慢 > 正常；电流沿用链路自己的颜色 */
export const nodeColor = (node: Pick<TopologyNode, 'errors' | 'slow' | 'avgMs'>) => {
  if (node.errors > 0) return '#d9534f';
  if (node.slow > 0 || node.avgMs >= 300) return '#c88a2e';
  return '#4f86f7';
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 电流：越忙跑得越快、光点越大，颜色跟链路状态一致（错误发红光） */
const signalEffect = (count: number, color: string) => {
  const ratio = liveLevel(count) / (LIVE_LEVELS - 1);
  return {
    period: Number((4.2 - 2.6 * ratio).toFixed(2)),
    symbol: 'circle',
    symbolSize: Number((3 + 3 * ratio).toFixed(1)),
    color
  };
};

export const buildTopologyOption = (
  payload: TopologyData,
  size: TopologySize,
  live: TopologyLive = {}
): EChartsOption => {
  const apiNodes = payload.apiNodes;
  const proxyNode = payload.upstreamProxy;
  const total = Math.max(1, payload.totals.requests);

  const W = Math.max(300, Math.round(size.width || 800));
  const H = Math.max(240, Math.round(size.height || 380));
  const compact = W < 640;

  const labelFont = compact ? 9 : 10;
  const titleFont = compact ? 10 : 11;
  const labelDist = compact ? 5 : 7;
  const titleLineHeight = compact ? 12 : 14;
  const labelLineHeight = compact ? 11 : 13;

  // 两个大球贴左边缘
  const edgePad = Math.max(28, Math.round(W * 0.04));
  const frontendX = edgePad;

  /*
   * 接口球的位置由「标签宽度」反推：标签朝右、正好贴到右边缘，
   * 所以球本身不会贴边（贴边的是这一列的整体）。两边至少要留出 70px 走扇形连线。
   */
  const apiLabelWidth = clamp(
    Math.min(Math.round(W * 0.32), W - edgePad * 2 - 70),
    80,
    300
  );
  const apiX = Math.round(W - edgePad - labelDist - apiLabelWidth);

  // 上下留一点余地给首末两行的说明文字
  const pad = 30;

  /*
   * 行：接口节点 + 上游代理（放最后一行）
   */
  const rows: Array<{ id: string; node: TrafficLike; isProxy: boolean }> = apiNodes.map((node) => ({
    id: node.id,
    node,
    isProxy: false
  }));
  if (proxyNode) rows.push({ id: 'proxy:upstream', node: proxyNode, isProxy: true });
  const rowCount = rows.length;

  // 行距随高度自适应，整体垂直居中，行数多时不会超出画布
  const apiGap = Math.max(
    26,
    Math.min(compact ? 40 : 48, (H - pad * 2) / Math.max(1, rowCount - 1))
  );
  const contentH = (rowCount - 1) * apiGap;
  const apiTop = Math.max(pad, (H - contentH) / 2);
  const centerY = apiTop + contentH / 2;

  /*
   * 左边一列三个球：前端（上）、后台（中）、上游 API（下），以接口列中线为轴对称分布。
   * 间距跟着接口列高度走，但不下探到画布最上/最下（那样看着散），
   * 也不小于球半径之和 + 间隙，免得几个球挨在一起。
   */
  const spread = clamp(contentH * 0.26, 60, 120);
  const frontendY = centerY - spread;
  const backendY = centerY;
  const upstreamY = centerY + spread;

  const backend = payload.backend || { count: 0, avgMs: 0, errors: 0, slow: 0 };
  const frontendRequests = payload.frontend?.requests ?? payload.totals.requests - backend.count;

  const nodes: any[] = [
    {
      id: 'frontend',
      name: `前端 · ${frontendRequests} 次`,
      x: frontendX,
      y: frontendY,
      symbolSize: 46,
      itemStyle: { color: '#64748b' },
      label: {
        show: true,
        // 说明放球上方并朝右排：它右边要扇出连线，放下面会被线压住
        position: 'top',
        align: 'left',
        distance: 8,
        color: '#e2e8f0',
        fontSize: titleFont,
        lineHeight: titleLineHeight
      }
    },
    {
      id: 'backend',
      name: `后台 · ${backend.count} 次`,
      x: frontendX,
      y: backendY,
      symbolSize: 38,
      itemStyle: { color: '#7c6cf0' },
      label: {
        show: true,
        // 上下都有球，说明放下面（三个球的说明各占一段，互不重叠）
        position: 'bottom',
        align: 'left',
        distance: 8,
        color: '#c4b5fd',
        fontSize: titleFont,
        lineHeight: titleLineHeight
      }
    },
    /*
     * 两个不可见的锚点，把 graph 的数据范围钉成「0,0 → W,H」。
     * graph 只认它自己的 view 坐标系，而 view 会按数据范围自适应缩放；
     * 范围正好等于画布、宽高比也一致时，映射就是 1:1 —— 下面所有 x/y 才真的是画布像素，
     * 而且横竖缩放比同样是 1，球不会被拉扁。
     */
    { id: '__anchor-nw', x: 0, y: 0, symbolSize: 0, itemStyle: { opacity: 0 }, label: { show: false } },
    { id: '__anchor-se', x: W, y: H, symbolSize: 0, itemStyle: { opacity: 0 }, label: { show: false } }
  ];
  const links: any[] = [];
  // 电流光点：与连线同一段路径、同一个 curveness，所以能严丝合缝地贴着线跑
  const signals: any[] = [];

  // 电流强度按「近窗口请求数」分档，而不是长窗口累计值
  const liveOf = (id: string) => Math.max(0, Number(live[id]) || 0);

  /**
   * 一条链路：连线画在 graph 里（保留箭头、悬停、连通高亮），这里只补一道电流。
   * quiet 表示长窗口内没有请求（线画成虚线，形态上仍看得见）；
   * liveKey 指向用哪个节点的近窗口请求数判断通电 —— 有请求才亮。
   */
  const addLink = (opts: {
    sourceId: string;
    source: { x: number; y: number };
    target: { id: string; x: number; y: number };
    node: TrafficLike;
    liveKey: string;
    quiet?: boolean;
  }) => {
    const { sourceId, source, target, node, liveKey, quiet } = opts;
    links.push({
      source: sourceId,
      target: target.id,
      value: node.count,
      lineStyle: {
        width: quiet ? 1 : 1 + Math.min(4, node.count / 20),
        type: quiet ? 'dashed' : 'solid',
        color: quiet ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.35)',
        curveness: 0.08
      }
    });

    const liveCount = liveOf(liveKey);
    if (!liveCount) return;
    signals.push({
      coords: [
        [source.x, source.y],
        [target.x, target.y]
      ],
      effect: signalEffect(liveCount, nodeColor(node))
    });
  };

  rows.forEach((row, index) => {
    const y = apiTop + index * apiGap;
    // 后台接口由「后台」球发起，其余（前台接口、上游代理）由「前端」球发起
    const fromBackend = !row.isProxy && isBackendPath((row.node as TopologyNode).name || '');
    const origin = {
      id: fromBackend ? 'backend' : 'frontend',
      x: frontendX,
      y: fromBackend ? backendY : frontendY
    };

    if (row.isProxy) {
      nodes.push({
        id: row.id,
        name: row.node.count
          ? `上游接口 (v0)\n${row.node.count} 次 · 均 ${row.node.avgMs}ms`
          : '上游接口 (v0)\n本时段无调用',
        x: apiX,
        y,
        symbolSize: 16 + Math.min(20, (row.node.count / total) * 60),
        itemStyle: { color: row.node.errors ? '#d9534f' : row.node.slow ? '#c88a2e' : '#4f86f7' },
        label: {
          show: true,
          position: 'right',
          distance: labelDist,
          align: 'left',
          color: '#94a3b8',
          fontSize: labelFont,
          lineHeight: labelLineHeight,
          width: apiLabelWidth,
          overflow: 'truncate'
        }
      });
      // 上游代理：前端 → 它，它 → 上游 API
      addLink({
        sourceId: origin.id,
        source: { x: origin.x, y: origin.y },
        target: { id: row.id, x: apiX, y },
        node: row.node,
        liveKey: row.id,
        quiet: !row.node.count
      });
      addLink({
        sourceId: 'proxy:upstream',
        source: { x: apiX, y },
        target: { id: 'upstream', x: frontendX, y: upstreamY },
        node: row.node,
        liveKey: row.id,
        quiet: !row.node.count
      });
      return;
    }

    nodes.push({
      id: row.id,
      name: `${(row.node as TopologyNode).name}\n${row.node.count} 次 · 均 ${row.node.avgMs}ms`,
      x: apiX,
      y,
      symbolSize: 14 + Math.min(20, (row.node.count / total) * 60),
      itemStyle: { color: nodeColor(row.node) },
      label: {
        show: true,
        position: 'right',
        distance: labelDist,
        align: 'left',
        color: '#94a3b8',
        fontSize: labelFont,
        lineHeight: labelLineHeight,
        width: apiLabelWidth,
        overflow: 'truncate'
      }
    });
    addLink({
      sourceId: origin.id,
      source: { x: origin.x, y: origin.y },
      target: { id: row.id, x: apiX, y },
      node: row.node,
      liveKey: row.id
    });
  });

  // 上游 API：左下角、与上游代理节点同高
  nodes.push({
    id: 'upstream',
    name: proxyNode
      ? `上游 API · 调用 ${payload.upstream.calls} 次${
          payload.upstream.cacheBuilds ? ` · 缓存 ${payload.upstream.cacheBuilds}` : ''
        }`
      : `上游 API · ${payload.upstream.calls ? `调用 ${payload.upstream.calls} 次` : '近期无调用'}`,
    x: frontendX,
    y: upstreamY,
    symbolSize: 40,
    itemStyle: { color: payload.upstream.errors ? '#d9534f' : '#94a3b8' },
    label: {
      show: true,
      // 说明放球下方并朝右排：右侧要接上游接口那条水平线
      position: 'bottom',
      align: 'left',
      distance: 8,
      color: '#e2e8f0',
      fontSize: titleFont,
      lineHeight: titleLineHeight
    }
  });

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) =>
        params.dataType === 'edge'
          ? `${params.data?.value ?? 0} 次`
          : String(params.data?.name || '').replace('\n', ' · ')
    },
    // 隐藏坐标系：只用来把「像素坐标」翻译成屏幕位置
    grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
    xAxis: { type: 'value', min: 0, max: W, show: false, axisPointer: { show: false } },
    yAxis: { type: 'value', min: 0, max: H, inverse: true, show: false, axisPointer: { show: false } },
    series: [
      {
        type: 'graph',
        // 不显式指定坐标系：graph 只支持自己的 view 坐标系（坐标由锚点钉成像素）
        layout: 'none',
        // 铺满画布，配合锚点让 view 的映射正好是 1:1
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        roam: false,
        symbol: 'circle',
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 5,
        data: nodes,
        links,
        lineStyle: { opacity: 0.9 },
        emphasis: { focus: 'adjacency' }
      },
      {
        // 电流：线本身不画（连线由上面的 graph 负责），只让光点沿同一条线跑。
        // 这里用隐藏的直角坐标系（同样铺满画布），坐标与 graph 的 view 映射重合。
        // trailLength 必须是 0：大于 0 会开 zrender 的 motionBlur，光点后面拖一条残影。
        type: 'lines',
        coordinateSystem: 'cartesian2d',
        polyline: false,
        silent: true,
        z: 3,
        lineStyle: { opacity: 0, curveness: 0.08 },
        effect: { show: true, symbol: 'circle', trailLength: 0 },
        data: signals
      }
    ]
  };
};
