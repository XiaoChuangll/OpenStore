import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { readFileSync } from 'node:fs';

// SEO 面板依赖的接口整体替身，只验证布局，不关心数据
vi.mock('../../src/services/admin', async () => {
  const actual = await vi.importActual<any>('../../src/services/admin');
  return {
    ...actual,
    getSeoStatus: async () => ({
      config: {
        enabled: 1,
        autoSubmit: 1,
        bingEnabled: 1,
        indexNowEnabled: 1,
        siteUrl: 'https://x.test',
        batchSize: 200,
        dailyLimit: 5000,
        submitHour: 0,
        minHits: 1,
        requestDelayMs: 1200,
        bingKeyMasked: '',
        bingKeyConfigured: false,
        indexNowKey: 'k'.repeat(32),
        indexNowKeyLocation: 'https://x.test/indexnow-key.txt'
      },
      stats: { pending: 0, totalQueued: 0, submittedToday: 0, failedToday: 0, successRecent: 0 },
      runtime: { running: false, lastRunDay: null, ranToday: false, nextRunText: '今天 00:00（北京时间）', siteOrigin: 'https://x.test' }
    }),
    getSeoPending: async () => ({ items: [], minHits: 1, siteUrl: 'https://x.test' }),
    getSeoSubmissions: async () => ({ total: 0, page: 1, limit: 50, items: [] })
  };
});

import SeoSubmitView from '../../src/views/admin/SeoSubmitView.vue';

/** 按视口宽度挂载 */
const mountAt = async (width: number) => {
  window.innerWidth = width;
  const wrapper = mount(SeoSubmitView, {
    props: { embedded: true },
    global: {
      stubs: {
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div class="stub-form-item"><slot /></div>' },
        'el-divider': { template: '<div><slot /></div>' },
        'el-switch': true,
        'el-input': true,
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        'el-button': { template: '<button><slot /></button>' },
        'el-table': { template: '<div><slot /></div>' },
        'el-table-column': true,
        'el-tag': { template: '<span><slot /></span>' },
        'el-pagination': true
      }
    }
  });
  await flushPromises();
  return wrapper;
};

describe('SEO 面板移动端适配', () => {
  let wrapper: any;

  beforeEach(() => {
    window.innerWidth = 1280;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    window.innerWidth = 1280;
  });

  it('窄屏加上 is-mobile 类，宽屏不加', async () => {
    wrapper = await mountAt(1280);
    expect(wrapper.find('.seo-page').classes()).not.toContain('is-mobile');
    wrapper.unmount();

    wrapper = await mountAt(390);
    expect(wrapper.find('.seo-page').classes()).toContain('is-mobile');
  });

  it('窄屏表格列下限收窄，宽屏用较大值', async () => {
    wrapper = await mountAt(1280);
    const widePending = wrapper.vm.pendingCols.url;
    const wideSubs = wrapper.vm.submissionCols.time;
    wrapper.unmount();

    wrapper = await mountAt(390);
    expect(wrapper.vm.pendingCols.url).toBeLessThan(widePending);
    expect(wrapper.vm.submissionCols.time).toBeLessThan(wideSubs);
  });

  it('窄屏表单标签上移（label-position=top）', async () => {
    wrapper = await mountAt(1280);
    expect(wrapper.vm.isMobile).toBe(false);
    wrapper.unmount();

    wrapper = await mountAt(390);
    expect(wrapper.vm.isMobile).toBe(true);
  });

  it('窗口尺寸变化时实时切换', async () => {
    wrapper = await mountAt(1280);
    expect(wrapper.vm.isMobile).toBe(false);

    window.innerWidth = 390;
    window.dispatchEvent(new Event('resize'));
    await flushPromises();
    expect(wrapper.vm.isMobile).toBe(true);
    expect(wrapper.find('.seo-page').classes()).toContain('is-mobile');
  });

  it('卸载后不再监听 resize', async () => {
    wrapper = await mountAt(390);
    const spy = vi.spyOn(window, 'removeEventListener');
    wrapper.unmount();
    expect(spy).toHaveBeenCalledWith('resize', expect.any(Function));
    wrapper = null;
    spy.mockRestore();
  });

  it('样式表为 is-mobile 提供了布局规则', () => {
    const source = readFileSync('src/views/admin/SeoSubmitView.vue', 'utf8');
    // 由 is-mobile 驱动的规则覆盖表单、统计卡与表格
    for (const selector of [
      '.seo-page.is-mobile .stat-grid',
      '.seo-page.is-mobile .config-form :deep(.el-form-item)',
      '.seo-page.is-mobile .form-hint',
      '.seo-page.is-mobile :deep(.section-card)'
    ]) {
      expect(source).toContain(selector);
    }
  });
});
