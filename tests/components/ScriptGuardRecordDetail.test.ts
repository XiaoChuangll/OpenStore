import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ScriptGuardRecordDetail from '../../src/components/ScriptGuardRecordDetail.vue';
import type { ScriptGuardBlockRecord } from '../../src/services/admin';

// 关注两点：UTC 存储按东八区显示；「封禁至」= 记录时间 + 封禁时长
const record: ScriptGuardBlockRecord = {
  id: 42,
  ip: '58.212.206.47',
  location: 'Nanjing CN',
  ua: 'AppGalleryData/2.0',
  path: '/api/v0/apps/list/529?page_size=100',
  hits: 20,
  strikes: 2,
  block_ms: 900000, // 15 分钟
  created_at: '2026-10-02 21:32:10' // UTC
};

const mountDetail = (active = true) =>
  mount(ScriptGuardRecordDetail, {
    props: { record, active },
    global: {
      stubs: {
        // 必须把 $event 一起抛出去：模板上用的是 @click.stop，缺了事件对象它会对 undefined 调 stopPropagation
        'el-button': { template: '<button @click="$emit(\'click\', $event)"><slot /></button>' }
      }
    }
  });

describe('ScriptGuardRecordDetail', () => {
  it('完整展示 UA 与触发请求', () => {
    const text = mountDetail().text();
    expect(text).toContain('AppGalleryData/2.0');
    expect(text).toContain('/api/v0/apps/list/529?page_size=100');
    expect(text).toContain('58.212.206.47');
    expect(text).toContain('Nanjing CN');
    expect(text).toContain('#42');
  });

  it('把 UTC 记录时间转成东八区显示', () => {
    // 2026-10-02 21:32:10 UTC = 2026-10-03 05:32:10 +08
    expect(mountDetail().text()).toContain('2026/10/3 05:32:10');
  });

  it('封禁至 = 记录时间 + 封禁时长', () => {
    // 21:32:10 + 15 分钟 = 21:47:10 UTC = 次日 05:47:10 +08
    expect(mountDetail().text()).toContain('2026/10/3 05:47:10');
  });

  it('违规次数与封禁时长按人话展示', () => {
    const text = mountDetail().text();
    expect(text).toContain('第 2 次');
    expect(text).toContain('15 分钟');
    expect(text).toContain('20 次配额');
  });

  it('仍在封禁中才给解封按钮，点击抛 unblock', async () => {
    const active = mountDetail(true);
    expect(active.text()).toContain('解除该 IP 的封禁');
    await active.find('button').trigger('click');
    expect(active.emitted('unblock')?.[0]).toEqual(['58.212.206.47']);

    const expired = mountDetail(false);
    expect(expired.text()).toContain('已过期');
    expect(expired.text()).not.toContain('解除该 IP 的封禁');
  });

  it('UA 为空时不显示成空白', () => {
    const wrapper = mount(ScriptGuardRecordDetail, {
      props: { record: { ...record, ua: '' }, active: false },
      global: { stubs: { 'el-button': true } }
    });
    expect(wrapper.text()).toContain('(空)');
  });
});
