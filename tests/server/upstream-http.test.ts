import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createGate, attachStreamGuards, streamGuardStats } from '../../server/lib/upstream-http.cjs';

/** 够用的 Express 响应替身：会被 guard 挂 close 监听、也可能被 destroy */
const makeRes = () => {
  const res: any = new EventEmitter();
  res.writableEnded = false;
  res.destroyed = false;
  res.destroy = () => {
    res.destroyed = true;
    res.emit('close');
  };
  return res;
};

const makeStream = () => {
  const stream = new PassThrough();
  // 客户端断开时 guard 会 destroy(new Error(...))，测试里必须先接住 error
  stream.on('error', () => {});
  return stream;
};

describe('上游并发闸门', () => {
  it('到上限后不再等待，直接返回 null（调用方好回 503）', async () => {
    const gate = createGate(2);
    const first = await gate.acquire(0);
    const second = await gate.acquire(0);

    expect(await gate.acquire(0)).toBeNull();

    first!();
    expect(await gate.acquire(0)).not.toBeNull();
    second!();
  });

  it('排队超过等待时间就放弃', async () => {
    const gate = createGate(1);
    const held = await gate.acquire(0);

    const startedAt = Date.now();
    expect(await gate.acquire(30)).toBeNull();
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);

    held!();
  });

  it('释放时把名额直接转交给排队者', async () => {
    const gate = createGate(1);
    const held = await gate.acquire(0);
    const queued = gate.acquire(1000);

    held!();
    const slot = await queued;

    expect(slot).not.toBeNull();
    expect(gate.stats()).toMatchObject({ active: 1, waiting: 0 });

    slot!();
    expect(gate.stats()).toMatchObject({ active: 0 });
  });

  it('重复释放不会凭空多出名额', async () => {
    const gate = createGate(1);
    const slot = await gate.acquire(0);

    slot!();
    slot!();

    expect(gate.stats().active).toBe(0);
    expect(await gate.acquire(0)).not.toBeNull();
  });
});

describe('流式传输护栏', () => {
  it('客户端提前断开时掐断上游连接', () => {
    const stream = makeStream();
    const res = makeRes();
    const reasons: string[] = [];

    const guard = attachStreamGuards({ data: stream, request: null }, res, {
      idleMs: 0,
      maxMs: 0,
      label: '测试',
      onAbort: (reason: string) => reasons.push(reason)
    });

    res.emit('close');

    expect(stream.destroyed).toBe(true);
    expect(res.destroyed).toBe(true);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/客户端提前断开/);
    expect(guard.aborted).toBe(true);
  });

  it('正常发完（writableEnded）不掐断上游', () => {
    const stream = makeStream();
    const res = makeRes();
    const reasons: string[] = [];

    const guard = attachStreamGuards({ data: stream, request: null }, res, {
      idleMs: 0,
      maxMs: 0,
      onAbort: (reason: string) => reasons.push(reason)
    });

    res.writableEnded = true;
    res.emit('close');

    expect(stream.destroyed).toBe(false);
    expect(reasons).toEqual([]);
    expect(guard.aborted).toBe(false);
    expect(guard.settled).toBe(true);
  });

  it('超过单次传输总时长上限就掐断', async () => {
    const stream = makeStream();
    const res = makeRes();
    const reasons: string[] = [];

    attachStreamGuards({ data: stream, request: null }, res, {
      idleMs: 0,
      maxMs: 20,
      label: '测试',
      onAbort: (reason: string) => reasons.push(reason)
    });

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(stream.destroyed).toBe(true);
    expect(reasons[0]).toMatch(/上限/);
  });

  it('SSE 长流（text/event-stream）不套总时长上限', async () => {
    const stream = makeStream();
    const res = makeRes();
    const reasons: string[] = [];

    attachStreamGuards(
      { data: stream, request: null, headers: { 'content-type': 'text/event-stream; charset=utf-8' } },
      res,
      {
        idleMs: 0,
        maxMs: 20,
        label: '同步进度流',
        onAbort: (reason: string) => reasons.push(reason)
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(stream.destroyed).toBe(false);
    expect(reasons).toEqual([]);

    // 但客户端断开时依然要掐断上游
    res.emit('close');
    expect(stream.destroyed).toBe(true);
    expect(reasons[0]).toMatch(/客户端提前断开/);
  });

  it('dispose 幂等，在线条数不会算漏', () => {
    const stream = makeStream();
    const before = streamGuardStats().active;

    const guard = attachStreamGuards({ data: stream, request: null }, null, { idleMs: 0, maxMs: 0 });
    expect(streamGuardStats().active).toBe(before + 1);

    guard.dispose();
    guard.dispose();
    expect(streamGuardStats().active).toBe(before);
  });

  it('挂监听前客户端就已经断开（排队期间跑掉）也要掐断上游', () => {
    const stream = makeStream();
    const res = makeRes();
    res.destroyed = true; // close 事件已经发过，后面不会再触发
    const reasons: string[] = [];

    attachStreamGuards({ data: stream, request: null }, res, {
      idleMs: 0,
      maxMs: 0,
      onAbort: (reason: string) => reasons.push(reason)
    });

    expect(stream.destroyed).toBe(true);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/客户端已断开/);
  });
});
