import { afterEach, describe, expect, it } from 'vitest';
import { goBackOrHome, onlyTrackQueryChanged } from './route-scroll';

describe('onlyTrackQueryChanged', () => {
  it('只有 track 变了（切歌）=> true，表示不该重置滚动', () => {
    expect(onlyTrackQueryChanged({ track: '111' }, { track: '222' })).toBe(true);
    expect(
      onlyTrackQueryChanged({ view: 'home', track: '111' }, { view: 'home', track: '222' })
    ).toBe(true);
  });

  it('track 增加或移除也算切歌', () => {
    expect(onlyTrackQueryChanged({ track: '111' }, {})).toBe(true);
    expect(onlyTrackQueryChanged({}, { track: '111' })).toBe(true);
  });

  it('其它参数变了（例如切换 view）=> false，仍应回到顶部', () => {
    expect(
      onlyTrackQueryChanged({ view: 'mine', track: '222' }, { view: 'home', track: '111' })
    ).toBe(false);
    expect(onlyTrackQueryChanged({ view: 'mine' }, { view: 'home' })).toBe(false);
  });

  it('完全相同的 query 不影响判定', () => {
    expect(onlyTrackQueryChanged({ view: 'home' }, { view: 'home' })).toBe(true);
  });
});

describe('goBackOrHome', () => {
  const makeRouter = () => {
    const calls: string[] = [];
    return {
      calls,
      back: () => {
        calls.push('back');
      },
      push: (to: string) => {
        calls.push(`push:${to}`);
        return Promise.resolve();
      },
    };
  };

  afterEach(() => {
    window.history.replaceState(null, '');
  });

  it('有应用内上一页时优先后退', () => {
    window.history.replaceState({ back: '/apps' }, '');
    const router = makeRouter();
    goBackOrHome(router);
    expect(router.calls).toEqual(['back']);
  });

  it('没有上一页（直接输 URL / 刷新进来）时回首页，而不是原地不动', () => {
    window.history.replaceState({ back: null }, '');
    const router = makeRouter();
    goBackOrHome(router);
    expect(router.calls).toEqual(['push:/']);
  });

  it('可以指定兜底页面（例如更新列表）', () => {
    window.history.replaceState({ back: null }, '');
    const router = makeRouter();
    goBackOrHome(router, '/updates');
    expect(router.calls).toEqual(['push:/updates']);
  });

  it('history.state 为空时也走兜底', () => {
    window.history.replaceState(null, '');
    const router = makeRouter();
    goBackOrHome(router, '/topics');
    expect(router.calls).toEqual(['push:/topics']);
  });
});
