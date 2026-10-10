import { describe, it, expect } from 'vitest';
import { collectPerfCheckRoutes } from '../../server/lib/perf-check.cjs';

type Layer = { route?: { path: unknown; methods?: Record<string, boolean> }; handle?: { stack?: Layer[] } };

const leaf = (path: unknown, methods: string[] = ['get']): Layer => ({
  route: { path, methods: Object.fromEntries(methods.map((m) => [m, true])) },
});
const nested = (stack: Layer[]): Layer => ({ handle: { stack } });
const app = (stack: Layer[]) => ({ router: { stack } });

describe('接口体检的路由挑选', () => {
  it('收集 GET /api 接口，并递归进子 router', () => {
    const routes = collectPerfCheckRoutes(
      app([leaf('/api/public/apps'), nested([leaf('/api/admin/freshness')]), leaf('/api/v0/apps/list')])
    );

    expect(routes).toEqual(['/api/admin/freshness', '/api/public/apps', '/api/v0/apps/list']);
  });

  it('跳过下载类与有副作用的接口（含数据库备份）', () => {
    const skipped = [
      '/api/admin/database/backup',
      '/api/visitors/export',
      '/api/public/track',
      '/api/screenshot/capture',
      '/api/admin/replay',
      '/api/admin/auth/login',
      '/api/admin/perf-check',
      '/api/admin/live',
    ];

    const routes = collectPerfCheckRoutes(app([...skipped.map((p) => leaf(p)), leaf('/api/public/blogs')]));

    expect(routes).toEqual(['/api/public/blogs']);
  });

  it('跳过动态参数、SSE 流、写接口与非 /api 路径', () => {
    const routes = collectPerfCheckRoutes(
      app([
        leaf('/api/public/apps/:pkg'),
        leaf('/api/admin/live-log'),
        leaf('/api/public/events-sse'),
        leaf('/api/public/submit', ['post']),
        leaf('/assets/app.js'),
        leaf('/health'),
        leaf('/api/about'),
      ])
    );

    expect(routes).toEqual(['/api/about']);
  });

  it('结果按路径升序，便于和上一次体检对比', () => {
    const routes = collectPerfCheckRoutes(app([leaf('/api/z'), leaf('/api/a'), leaf('/api/m')]));

    expect(routes).toEqual(['/api/a', '/api/m', '/api/z']);
  });
});
