import { describe, it, expect } from 'vitest';
import { buildTopologyOption, liveSignature, nodeColor } from '../../src/utils/topology-layout';
import type { TopologyData } from '../../src/services/admin';

const node = (id: string, count: number, extra: Partial<TopologyData['apiNodes'][number]> = {}) => ({
  id,
  name: `/api/${id}`,
  count,
  avgMs: 20,
  maxMs: 40,
  errors: 0,
  slow: 0,
  ...extra
});

const payload = (over: Partial<TopologyData> = {}): TopologyData => ({
  windowSeconds: 900,
  totals: { requests: 120, errors: 0, slow: 0, cacheBuilds: 0, upstreamErrors: 0, upstreamRequests: 0 },
  apiNodes: [node('busy', 90), node('slowish', 10, { slow: 3, avgMs: 500 }), node('broken', 20, { errors: 1 })],
  upstreamProxy: { count: 5, avgMs: 120, errors: 0, slow: 0, paths: [] },
  upstream: { calls: 5, avgMs: 110, cacheBuilds: 1, errors: 0 },
  ...over
});

/** 取某个 series / 节点，省得每处都写断言路径 */
const parts = (data: TopologyData, size = { width: 800, height: 380 }, live: Record<string, number> = {}) => {
  const option = buildTopologyOption(data, size, live);
  const series = (option.series || []) as any[];
  const graph = series.find((s) => s.type === 'graph');
  const lines = series.find((s) => s.type === 'lines');
  const at = (id: string) => graph.data.find((n: any) => n.id === id);
  return { option, graph, lines, at, series };
};

/** 三个接口 + 上游代理都在近窗口里来过请求 */
const ALL_LIVE: Record<string, number> = {
  busy: 12,
  slowish: 2,
  broken: 4,
  'proxy:upstream': 3
};

describe('调用拓扑布局', () => {
  it('两个大球在左边缘同侧，接口球在对侧', () => {
    const W = 800;
    const { at } = parts(payload(), { width: W, height: 380 });
    const edgePad = Math.max(28, Math.round(W * 0.04));

    // 前端与上游 API 都在左边缘
    expect(at('frontend').x).toBe(edgePad);
    expect(at('upstream').x).toBe(edgePad);
    // 球外缘离画布边缘只剩几像素 —— 看着就是「靠边」
    expect(at('frontend').x - 23).toBeLessThanOrEqual(10);

    // 接口球全在对侧（右半边）
    for (const id of ['busy', 'slowish', 'broken', 'proxy:upstream']) {
      expect(at(id).x).toBeGreaterThan(W / 2);
      expect(at(id).x).toBeGreaterThan(at('frontend').x);
    }
  });

  it('接口说明朝右、正好贴到右边缘（不越界也不浪费宽度）', () => {
    const W = 800;
    const { at } = parts(payload(), { width: W, height: 380 });
    const edgePad = Math.max(28, Math.round(W * 0.04));
    const busy = at('busy');

    const rightEdgeOfLabel = busy.x + busy.label.distance + busy.label.width;
    expect(rightEdgeOfLabel).toBeLessThanOrEqual(W - edgePad + 1);
    expect(rightEdgeOfLabel).toBeGreaterThan(W - edgePad - 60);
    expect(busy.label.position).toBe('right');
    expect(busy.label.overflow).toBe('truncate');
  });

  it('两个大球以接口列中线为轴对称分布（不贴画布上下边缘）', () => {
    const { at } = parts(payload(), { width: 800, height: 380 });
    const rows = ['busy', 'slowish', 'broken', 'proxy:upstream'].map((id) => at(id).y);
    const center = (Math.min(...rows) + Math.max(...rows)) / 2;
    const frontend = at('frontend').y;
    const upstream = at('upstream').y;

    // 对称，且都在中线两侧
    expect(center - frontend).toBeCloseTo(upstream - center, 5);
    expect(frontend).toBeLessThan(center);
    expect(upstream).toBeGreaterThan(center);
    // 不能贴到画布最上/最下（球半径 23 + 说明文字要放得下）
    expect(frontend).toBeGreaterThan(46);
    expect(upstream).toBeLessThan(380 - 46);
    // 两个球之间要留出间隙，不能挨在一起
    expect(upstream - frontend).toBeGreaterThan(60);
  });

  it('窄画布下依然是「左边两个球 / 右边接口列」', () => {
    const W = 420;
    const { at } = parts(payload(), { width: W, height: 320 });

    expect(at('frontend').x).toBe(Math.max(28, Math.round(W * 0.04)));
    expect(at('upstream').x).toBe(at('frontend').x);
    for (const id of ['busy', 'slowish', 'broken', 'proxy:upstream']) {
      expect(at(id).x).toBeGreaterThan(W / 2);
    }
    // 两侧至少留出 70px 走扇形连线
    expect(at('busy').x - at('frontend').x).toBeGreaterThanOrEqual(70);
  });

  it('行距随高度收缩，所有节点都落在画布内', () => {
    const sizes = [
      { width: 1280, height: 380 },
      { width: 800, height: 380 },
      { width: 640, height: 320 },
      { width: 420, height: 320 },
      { width: 320, height: 300 }
    ];
    for (const size of sizes) {
      const { at } = parts(payload(), size);
      for (const id of ['frontend', 'upstream', 'busy', 'slowish', 'broken', 'proxy:upstream']) {
        const n = at(id);
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x).toBeLessThanOrEqual(size.width);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeLessThanOrEqual(size.height);
      }
    }
  });

  it('电流用隐藏坐标系、graph 用被锚点钉死的 view，两者都是像素坐标', () => {
    const { option, graph, lines } = parts(payload(), { width: 800, height: 380 });

    // 电流走隐藏的直角坐标系，坐标系铺满画布，数据坐标即像素
    expect(lines.coordinateSystem).toBe('cartesian2d');
    expect((option.xAxis as any).max).toBe(800);
    expect((option.yAxis as any).max).toBe(380);
    // y 轴翻成屏幕方向（0 在上）
    expect((option.yAxis as any).inverse).toBe(true);
    expect(option.grid).toMatchObject({ left: 0, right: 0, top: 0, bottom: 0 });

    // graph 不能挂 cartesian2d（节点会拿不到坐标，球整个消失），靠锚点把数据范围钉成画布，
    // view 坐标系因此是 1:1 映射；真实渲染里的断言见 topology-layout.render.test.ts
    expect(graph.coordinateSystem).toBeUndefined();
    expect(graph.left).toBe(0);
    expect(graph.right).toBe(0);
    expect(graph.data.filter((n: any) => n.id.startsWith('__anchor'))).toHaveLength(2);
  });

  it('只有近窗口真有请求的链路才通电', () => {
    // 长窗口里三条接口都有几十次请求，但近 15 秒只有 busy 来过 → 只有它那条亮
    const { lines, graph, at } = parts(payload(), { width: 800, height: 380 }, { busy: 3 });

    expect(lines.data).toHaveLength(1);
    expect(lines.data[0].coords[1]).toEqual([at('busy').x, at('busy').y]);
    // 连线本身都在（形态不受影响），只是没通电
    expect(graph.links).toHaveLength(5);
  });

  it('近窗口一个请求都没有就不亮，哪怕长窗口里累计很多', () => {
    const { lines, graph } = parts(payload(), { width: 800, height: 380 });

    expect(lines.data).toHaveLength(0);
    expect(graph.links.length).toBeGreaterThan(0);
  });

  it('每条有流量的链路都有一道电流，路径两端就是节点圆心', () => {
    const { at, lines } = parts(payload(), { width: 800, height: 380 }, ALL_LIVE);
    const coords = lines.data.map((d: any) => d.coords);

    // busy / slowish / broken / 前端→上游接口 / 上游接口→上游 API
    expect(lines.data).toHaveLength(5);
    const pairs = [
      [at('frontend'), at('busy')],
      [at('frontend'), at('slowish')],
      [at('frontend'), at('broken')],
      [at('frontend'), at('proxy:upstream')],
      [at('proxy:upstream'), at('upstream')]
    ];
    pairs.forEach(([from, to]) => {
      expect(coords).toContainEqual([
        [from.x, from.y],
        [to.x, to.y]
      ]);
    });
  });

  it('长窗口内没有请求的链路不亮、并且画成虚线', () => {
    const idleProxy = payload({
      upstreamProxy: { count: 0, avgMs: 0, errors: 0, slow: 0, paths: [] }
    });
    const { lines, graph, at } = parts(idleProxy, { width: 800, height: 380 }, ALL_LIVE);

    const upstreamLink = graph.links.find((l: any) => l.target === 'upstream');
    expect(upstreamLink.lineStyle.type).toBe('dashed');
    // 近窗口有请求、长窗口没有：上游那条仍然通电（请求确实在进来，只是还没汇总进长窗口）
    expect(lines.data.some((d: any) => d.coords[1][0] === at('upstream').x)).toBe(true);
  });

  it('电流强度按近窗口请求数比较：越忙周期越短、光点越大，颜色跟链路状态一致', () => {
    const { lines } = parts(payload(), { width: 800, height: 380 }, ALL_LIVE);
    const periods = lines.data.map((d: any) => d.effect.period);
    const busy = lines.data.find((d: any) => d.effect.period === Math.min(...periods));
    const slow = lines.data.find((d: any) => d.effect.color === '#c88a2e');
    const broken = lines.data.find((d: any) => d.effect.color === '#d9534f');

    expect(lines.data).toHaveLength(5);
    // 三条接口链路 + 上游那条，状态色都覆盖到了：正常蓝 / 慢黄 / 错误红
    expect(new Set(lines.data.map((d: any) => d.effect.color))).toEqual(
      new Set(['#4f86f7', '#c88a2e', '#d9534f'])
    );
    expect(busy.effect.period).toBeLessThan(slow.effect.period);
    expect(busy.effect.symbolSize).toBeGreaterThan(slow.effect.symbolSize);
    expect(broken).toBeTruthy();
  });

  it('贴着边缘的两个大球说明朝向画布内部', () => {
    const { at } = parts(payload(), { width: 800, height: 380 });

    // 前端球贴左边缘：说明放上方、朝右排
    expect(at('frontend').label.position).toBe('top');
    expect(at('frontend').label.align).toBe('left');
    // 上游球在左下：说明放下方、朝右排（右侧要接上游接口那条水平线）
    expect(at('upstream').label.position).toBe('bottom');
    expect(at('upstream').label.align).toBe('left');
  });

  it('节点配色：有错红、慢黄、正常蓝', () => {
    expect(nodeColor({ errors: 1, slow: 0, avgMs: 10 })).toBe('#d9534f');
    expect(nodeColor({ errors: 0, slow: 1, avgMs: 10 })).toBe('#c88a2e');
    expect(nodeColor({ errors: 0, slow: 0, avgMs: 400 })).toBe('#c88a2e');
    expect(nodeColor({ errors: 0, slow: 0, avgMs: 20 })).toBe('#4f86f7');
  });

  it('没有上游代理节点时，上游球落在左下且没有那条连线', () => {
    const noProxy = payload({ upstreamProxy: null });
    const { at, graph } = parts(noProxy);

    expect(at('upstream')).toBeTruthy();
    expect(graph.links.some((l: any) => l.target === 'upstream')).toBe(false);
    expect(at('upstream').x).toBe(at('frontend').x);
  });
});

describe('后台球', () => {
  const withAdmin = payload({
    frontend: { requests: 60 },
    backend: { count: 30, avgMs: 40, errors: 0, slow: 0 },
    apiNodes: [node('pub', 60), node('adminx', 30, { name: '/api/admin/topology' })]
  });

  it('左边缘自上而下是 前端 / 后台 / 上游 API', () => {
    const { at } = parts(withAdmin, { width: 800, height: 380 });

    expect(at('backend')).toBeTruthy();
    for (const id of ['frontend', 'backend', 'upstream']) expect(at(id).x).toBe(at('frontend').x);
    expect(at('frontend').y).toBeLessThan(at('backend').y);
    expect(at('backend').y).toBeLessThan(at('upstream').y);
    // 三个球等距分布在接口列中线上
    expect(at('backend').y - at('frontend').y).toBeCloseTo(at('upstream').y - at('backend').y, 5);
    // 说明文字里的次数：前台不含后台接口
    expect(at('frontend').name).toBe('前端 · 60 次');
    expect(at('backend').name).toBe('后台 · 30 次');
  });

  it('后台接口由后台球发起，前台接口仍由前端球发起', () => {
    const { graph, at } = parts(withAdmin, { width: 800, height: 380 });

    expect(graph.links.find((l: any) => l.target === 'pub').source).toBe('frontend');
    expect(graph.links.find((l: any) => l.target === 'adminx').source).toBe('backend');

    // 电流从各自的起点出发
    const { lines } = parts(withAdmin, { width: 800, height: 380 }, { pub: 5, adminx: 3 });
    expect(lines.data).toContainEqual(
      expect.objectContaining({ coords: [[at('backend').x, at('backend').y], [at('adminx').x, at('adminx').y]] })
    );
    expect(lines.data).toContainEqual(
      expect.objectContaining({ coords: [[at('frontend').x, at('frontend').y], [at('pub').x, at('pub').y]] })
    );
  });

  it('没给 backend 字段时退化成 0 次，不会算错前台次数', () => {
    const legacy = payload();
    const { at } = parts(legacy, { width: 800, height: 380 });

    expect(at('backend').name).toBe('后台 · 0 次');
    expect(at('frontend').name).toBe('前端 · 120 次');
  });
});

describe('电流指纹 liveSignature', () => {
  it('请求数小幅变化不改变指纹（避免每 5 秒重画一次、光点被打回起点）', () => {
    expect(liveSignature({ a: 10, b: 5 })).toBe(liveSignature({ a: 11, b: 5 }));
    expect(liveSignature({ a: 10, b: 5 })).toBe(liveSignature({ a: 9, b: 5 }));
    // 档位按绝对值分，最忙的那条抖动不会连带改掉别人的档位
    expect(liveSignature({ a: 6, b: 2 })).toBe(liveSignature({ a: 11, b: 2 }));
  });

  it('亮灯集合或强度档位变了就要变', () => {
    const base = liveSignature({ a: 10, b: 5 });

    expect(liveSignature({ a: 10, b: 5, c: 1 })).not.toBe(base);
    expect(liveSignature({ a: 40, b: 5 })).not.toBe(base);
    expect(liveSignature({ a: 10 })).not.toBe(base);
  });

  it('全灭是空指纹', () => {
    expect(liveSignature({})).toBe('');
    expect(liveSignature({ a: 0, b: 0 })).toBe('');
  });
});
