import { describe, expect, it } from 'vitest';
import { onlyTrackQueryChanged } from './route-scroll';

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
