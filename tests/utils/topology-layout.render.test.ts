import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as echarts from 'echarts';
import { buildTopologyOption } from '../../src/utils/topology-layout';
import type { TopologyData } from '../../src/services/admin';

/*
 * 布局模块算出来的坐标，必须在真实 ECharts 里就是屏幕像素、并且真的画出来。
 *
 * graph 挂到 cartesian2d 上时节点 layout 会是 NaN、
 * 电流还在但球全没了 —— 所以既要断言坐标映射，也要断言 SVG 里确实有节点。
 */

const payload: TopologyData = {
  windowSeconds: 900,
  totals: { requests: 120, errors: 0, slow: 0, cacheBuilds: 0, upstreamErrors: 0, upstreamRequests: 0 },
  apiNodes: [
    { id: 'a', name: '/api/a', count: 90, avgMs: 20, maxMs: 40, errors: 0, slow: 0 },
    { id: 'b', name: '/api/b', count: 12, avgMs: 40, maxMs: 80, errors: 0, slow: 0 }
  ],
  upstreamProxy: { count: 5, avgMs: 120, errors: 0, slow: 0, paths: [] },
  upstream: { calls: 5, avgMs: 110, cacheBuilds: 1, errors: 0 }
};

const charts: echarts.ECharts[] = [];

/** 近窗口请求数：让所有链路都通电，方便断言电流的坐标 */
const LIVE = { a: 8, b: 3, 'proxy:upstream': 4 };

const render = (width: number, height: number, live: Record<string, number> = LIVE) => {
  // SVG 渲染器不支持 motionBlur 拖尾，会打 warning：这里测的是坐标，不是拖尾
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const el = document.createElement('div');
  document.body.appendChild(el);
  const chart = echarts.init(el, null, { renderer: 'svg', width, height });
  charts.push(chart);
  const option = buildTopologyOption(payload, { width, height }, live) as any;
  chart.setOption(option);
  const model = (chart as any).getModel();
  const graphSeries = model.getSeriesByIndex(0);
  const graphData = graphSeries.getData();
  return { chart, el, option, graphSeries, graphData };
};

/** 从 SVG 的 transform="matrix(a,b,c,d,e,f)" 里取出平移量（第 5、6 个分量） */
const svgPoints = (el: HTMLElement) =>
  [...el.querySelectorAll('[transform]')]
    .map((node) => /matrix\(([^)]+)\)/.exec(node.getAttribute('transform') || ''))
    .filter(Boolean)
    .map((m) => m![1].split(',').map(Number))
    .map((parts) => [parts[4], parts[5]]);

afterEach(() => {
  charts.splice(0).forEach((chart) => chart.dispose());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

beforeEach(() => {
  // jsdom 没有 canvas：zrender 量文字宽度时走 getContext，给个最小替身免得刷一屏 "Not implemented"
  HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: (text: string) => ({ width: String(text).length * 6 })
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('调用拓扑在真实 ECharts 里的坐标', () => {
  it('节点拿到的是画布坐标，不是 NaN（球必须画得出来）', () => {
    const W = 800;
    const H = 380;
    const { graphData, option } = render(W, H);
    const layouts: number[][] = [];
    for (let i = 0; i < graphData.count(); i += 1) layouts.push(graphData.getItemLayout(i));

    // 一个都不许是空坐标
    layouts.forEach((point) => {
      expect(Number.isFinite(point?.[0])).toBe(true);
      expect(Number.isFinite(point?.[1])).toBe(true);
    });

    const at = (id: string) => option.series[0].data.find((n: any) => n.id === id);
    const edgePad = Math.max(28, Math.round(W * 0.04));
    const nodes = option.series[0].data.filter((n: any) => !n.id.startsWith('__anchor'));

    // 每个节点的落点都等于布局算出来的坐标
    nodes.forEach((node: any) => {
      const index = option.series[0].data.indexOf(node);
      expect(layouts[index][0]).toBeCloseTo(node.x, 0);
      expect(layouts[index][1]).toBeCloseTo(node.y, 0);
    });
    // 两个大球都贴在左边缘，接口球在对侧
    expect(at('frontend').x).toBe(edgePad);
    expect(at('upstream').x).toBe(edgePad);
    expect(at('a').x).toBeGreaterThan(W / 2);
  });

  it('view 坐标系被锚点钉成 1:1（不缩放、不偏移），电流两端落在同一像素上', () => {
    const W = 800;
    const H = 380;
    const { chart, graphSeries, option } = render(W, H);
    const coord = graphSeries.coordinateSystem as any;

    expect(coord.type).toBe('view');
    expect(coord.x).toBeCloseTo(0, 1);
    expect(coord.y).toBeCloseTo(0, 1);
    expect(coord.scaleX).toBeCloseTo(1, 2);
    expect(coord.scaleY).toBeCloseTo(1, 2);

    // lines 系列用隐藏直角坐标系，数据坐标 = 像素
    const signal = option.series[1].data[0];
    const [sx, sy] = chart.convertToPixel({ seriesIndex: 1 }, signal.coords[0]) as unknown as number[];
    expect(sx).toBeCloseTo(signal.coords[0][0], 0);
    expect(sy).toBeCloseTo(signal.coords[0][1], 0);
  });

  it('各种画布尺寸下横竖缩放比都相等 —— 圆球不会被拉成椭圆', () => {
    // 这两条正是「球变形」的根因：view 按数据范围自适应，横竖缩放不一致就成了椭圆
    const sizes = [
      { width: 1280, height: 380 },
      { width: 900, height: 380 },
      { width: 640, height: 320 },
      { width: 460, height: 300 },
      { width: 320, height: 240 },
      { width: 700, height: 260 }
    ];

    for (const size of sizes) {
      const { graphSeries, graphData } = render(size.width, size.height);
      const coord = graphSeries.coordinateSystem as any;
      expect(coord.scaleX, `${size.width}x${size.height} 的横向缩放`).toBeCloseTo(coord.scaleY, 3);
      expect(coord.scaleX, `${size.width}x${size.height} 应该是 1:1`).toBeCloseTo(1, 2);

      // 节点必须都有坐标，不能是 NaN（挂错坐标系时球会整个消失）
      for (let i = 0; i < graphData.count(); i += 1) {
        const point = graphData.getItemLayout(i);
        expect(Number.isFinite(point?.[0]), `${size.width}x${size.height} 第 ${i} 个节点 x`).toBe(true);
        expect(Number.isFinite(point?.[1]), `${size.width}x${size.height} 第 ${i} 个节点 y`).toBe(true);
      }
    }
  });

  it('SVG 里真的画出了节点，位置就是算好的坐标', () => {
    const W = 800;
    const H = 380;
    const { el, option } = render(W, H);
    const points = svgPoints(el);

    expect(el.querySelector('svg')).toBeTruthy();
    option.series[0].data
      .filter((n: any) => !n.id.startsWith('__anchor'))
      .forEach((node: any) => {
        const hit = points.some(
          ([x, y]) => Math.abs(x - node.x) < 1 && Math.abs(y - node.y) < 1
        );
        expect(hit, `节点 ${node.id} 没画在 (${node.x}, ${node.y})`).toBe(true);
      });
  });

  it('窄画布下两个大球仍贴左边缘、接口球在对侧', () => {
    const W = 420;
    const { graphData, option } = render(W, 320);
    const layouts: number[][] = [];
    for (let i = 0; i < graphData.count(); i += 1) layouts.push(graphData.getItemLayout(i));
    layouts.forEach((point) => expect(Number.isFinite(point?.[0])).toBe(true));

    const at = (id: string) => option.series[0].data.find((n: any) => n.id === id);
    expect(at('frontend').x).toBe(28);
    expect(at('upstream').x).toBe(28);
    expect(at('a').x).toBeGreaterThan(W / 2);
  });
});
