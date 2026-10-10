import { describe, it, expect } from 'vitest';
import { defineComponent, h, KeepAlive, nextTick, onUnmounted, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useActiveScope, usePageActive } from '../../src/utils/page-active';

// 前提：keep-alive 挂起页面时，页面内部的子组件也会收到 onDeactivated

/** 记录活动状态变化 */
const events: string[] = [];

const Child = defineComponent({
  name: 'ActiveChild',
  setup() {
    const active = usePageActive();
    let started = false;
    const scopeActive = useActiveScope(
      () => {
        started = true;
        events.push('child:start');
      },
      () => {
        started = false;
        events.push('child:stop');
      }
    );
    // 挂起 ≠ 卸载，用于证明组件留在缓存里
    onUnmounted(() => events.push('child:unmount'));
    return { active, scopeActive, started };
  },
  render() {
    return h('div', { class: 'child' }, String(this.active));
  },
});

const PageA = defineComponent({
  name: 'PageA',
  setup: () => () => h(Child),
});
const PageB = defineComponent({
  name: 'PageB',
  setup: () => () => h('div', { class: 'page-b' }, 'B'),
});

const Host = defineComponent({
  setup() {
    const current = ref<'PageA' | 'PageB'>('PageA');
    return { current };
  },
  render() {
    return h(KeepAlive, null, {
      default: () => h(this.current === 'PageA' ? PageA : PageB),
    });
  },
});

describe('usePageActive / useActiveScope', () => {
  it('缓存页切走后，页面内部子组件的活动状态跟着变 false，切回来再变 true', async () => {
    events.length = 0;
    const wrapper = mount(Host);
    await nextTick();

    const child = wrapper.findComponent(Child);
    // 首次挂载：可见，副作用启动
    expect(child.vm.active).toBe(true);
    expect(events).toEqual(['child:start']);

    // 切到另一个页面：PageA 被 keep-alive 挂起（只是搬进缓存容器，没有卸载）
    (wrapper.vm as any).current = 'PageB';
    await nextTick();
    expect(child.vm.active).toBe(false);
    expect(events).toEqual(['child:start', 'child:stop']);
    expect(events).not.toContain('child:unmount');

    // 切回来：恢复
    (wrapper.vm as any).current = 'PageA';
    await nextTick();
    expect(child.vm.active).toBe(true);
    expect(events).toEqual(['child:start', 'child:stop', 'child:start']);

    // 幂等：切来切去不会重复 stop / start；卸载时再兜底停一次
    wrapper.unmount();
    expect(events).toEqual(['child:start', 'child:stop', 'child:start', 'child:stop', 'child:unmount']);
  });

  it('没被 keep-alive 缓存的组件：挂载即为可见，卸载后停掉副作用', async () => {
    events.length = 0;
    const wrapper = mount(Child);
    await nextTick();

    expect(wrapper.vm.active).toBe(true);
    expect(events).toEqual(['child:start']);

    wrapper.unmount();
    expect(events).toEqual(['child:start', 'child:stop', 'child:unmount']);
  });
});
