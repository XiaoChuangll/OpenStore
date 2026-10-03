<template>
  <el-dialog
    :model-value="modelValue"
    title="脚本护栏"
    :width="dialogWidth"
    :fullscreen="isMobile"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="handleOpen"
  >
    <el-tabs v-model="tab" class="guard-tabs">
      <!-- ------------------------------ 拦截记录 ------------------------------ -->
      <el-tab-pane label="拦截记录" name="records">
        <p class="guard-hint">
          每次<b>触发封禁</b>都会在这里落一条（宽限期内正常放行的请求不记）。
          同一 IP 屡犯会有多条，正好是它被封禁时长逐步升级的过程。
          表里只保留最近 1000 条。
        </p>

        <div class="guard-summary">
          <span class="summary-item">
            <b>{{ activeIps.size }}</b> 个 IP 正在封禁中
          </span>
          <span class="summary-item">
            累计拦截 <b>{{ records.length }}</b> 次
          </span>
          <span class="summary-item muted">「拦截中」是内存状态，重启服务即清空；表里的记录会一直留着</span>
        </div>

        <el-table
          v-if="!isMobile"
          ref="tableRef"
          v-loading="loadingRecords"
          :data="records"
          size="small"
          :max-height="tableHeight"
          class="guard-table is-expandable"
          @row-click="toggleRow"
        >
          <!-- 点整行或点箭头都能展开详情，两种方式都由表格自己的展开状态管理（见 toggleRow） -->
          <el-table-column type="expand" width="44">
            <template #default="{ row }">
              <ScriptGuardRecordDetail :record="row" :active="isActive(row)" @unblock="release" />
            </template>
          </el-table-column>
          <el-table-column label="时间" width="150">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="来源" min-width="140">
            <template #default="{ row }">
              <div class="cell-ip">{{ row.ip }}</div>
              <div class="cell-sub">{{ row.location || '未知地区' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="User-Agent" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="cell-ua">{{ row.ua || '(空)' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="触发请求" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">
              <code class="cell-path">{{ row.path }}</code>
            </template>
          </el-table-column>
          <!-- 违规次数和封禁时长合成一列，窄屏时能少一列横向滚动 -->
          <el-table-column label="违规 / 封禁" width="130">
            <template #default="{ row }">
              <span class="cell-strikes">第 {{ row.strikes }} 次</span>
              <span class="cell-block">{{ humanMs(row.block_ms) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="92">
            <template #default="{ row }">
              <el-tag v-if="isActive(row)" type="danger" size="small" effect="dark">拦截中</el-tag>
              <el-tag v-else type="info" size="small">已过期</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="76">
            <template #default="{ row }">
              <el-button v-if="isActive(row)" link type="primary" @click="release(row.ip)">解封</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <span class="guard-empty-inline">暂无拦截记录</span>
          </template>
        </el-table>

        <!-- 窄屏不用表格：8 列在手机上只能横向拖，改成卡片一眼看完 -->
        <div v-else v-loading="loadingRecords" class="guard-cards">
          <div v-for="row in records" :key="row.id" class="guard-card">
            <div class="guard-card-top" @click="toggleCard(row.id)">
              <span class="card-ip">{{ row.ip }}</span>
              <el-tag v-if="isActive(row)" type="danger" size="small" effect="dark">拦截中</el-tag>
              <el-tag v-else type="info" size="small">已过期</el-tag>
              <el-icon class="card-caret" :class="{ 'is-open': expandedCards.has(row.id) }">
                <ArrowRight />
              </el-icon>
            </div>
            <div class="card-sub" @click="toggleCard(row.id)">
              {{ row.location || '未知地区' }} · 第 {{ row.strikes }} 次 · 封 {{ humanMs(row.block_ms) }}
            </div>
            <div class="card-ua">{{ row.ua || '(空 UA)' }}</div>
            <code class="card-path">{{ row.path }}</code>

            <!-- 展开：完整字段走和表格同一个详情组件 -->
            <div v-if="expandedCards.has(row.id)" class="guard-card-detail">
              <ScriptGuardRecordDetail :record="row" :active="isActive(row)" @unblock="release" />
            </div>

            <div class="guard-card-foot">
              <span class="card-time">{{ formatTime(row.created_at) }}</span>
              <span class="card-foot-actions">
                <el-button link type="primary" size="small" @click="toggleCard(row.id)">
                  {{ expandedCards.has(row.id) ? '收起' : '详情' }}
                </el-button>
                <el-button v-if="isActive(row)" link type="primary" size="small" @click="release(row.ip)">
                  解封
                </el-button>
              </span>
            </div>
          </div>
          <p v-if="!loadingRecords && records.length === 0" class="guard-empty-inline">暂无拦截记录</p>
        </div>
      </el-tab-pane>

      <!-- ------------------------------ 硬封禁 ------------------------------ -->
      <el-tab-pane label="硬封禁" name="bans">
        <p class="guard-hint">
          硬封禁<b>不区分 UA</b>：命中后这个 IP 的<b>一切</b>请求都返回 429，<b>连浏览器也打不开本站</b>。
          名单存在库里，重启服务依然有效。
        </p>
        <p class="guard-warn">
          后台 <code>/api/admin/*</code> 与 <code>/admin</code> 不受影响，所以就算误封自己的出口 IP，也还能进后台解除。
          但同一 NAT 出口下的所有设备都会一起被挡 —— 公网 IP 是动态的，封之前想清楚。
        </p>

        <div class="ban-form">
          <el-input v-model="banForm.ip" placeholder="要封禁的 IP，例如 58.212.206.47" class="ban-ip" clearable />
          <el-input v-model="banForm.reason" placeholder="原因（可选）" class="ban-reason" clearable />
          <el-select v-model="banForm.durationMs" class="ban-duration">
            <el-option v-for="opt in BAN_DURATIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <el-button type="danger" :loading="banSaving" @click="submitBan">封禁</el-button>
        </div>

        <div v-loading="loadingBans" class="ban-list">
          <div v-for="item in hardBans" :key="item.ip" class="ban-row">
            <div class="ban-row-main">
              <span class="ban-row-ip">{{ item.ip }}</span>
              <el-tag v-if="item.permanent" type="danger" size="small" effect="dark">永久</el-tag>
              <el-tag v-else type="warning" size="small">剩余 {{ humanMs(item.remainMs) }}</el-tag>
              <span v-if="item.hits" class="ban-row-hits">已挡 {{ item.hits }} 次</span>
            </div>
            <div class="ban-row-sub">
              {{ item.reason || '未填原因' }} · 封于 {{ formatTime(item.created_at) }}
            </div>
            <el-button link type="primary" size="small" @click="removeBan(item.ip)">解除</el-button>
          </div>
          <p v-if="!loadingBans && hardBans.length === 0" class="guard-empty-inline">名单为空</p>
        </div>
      </el-tab-pane>

      <!-- ------------------------------ 自定义 ------------------------------ -->
      <el-tab-pane label="自定义" name="edit">
        <p class="guard-hint">
          改完点「保存」<b>立刻生效</b>，不用重启服务。正文与提示条目支持两个标记：
          <code>**加粗**</code> 和 <code v-pre>{{site}}</code>（自动替换成本站地址）。
        </p>

        <p class="guard-warn">
          <b>这段文案会被被拦的客户端原样看到</b>，所以别把判定依据写进去
          （例如「没有浏览器标识」「没带 User-Agent」「访问太快」这类）。
          对方照着改一下就能绕过 —— 只说「检测到自动化访问」就够了。
        </p>

        <el-form v-loading="loadingConfig" label-position="top" class="guard-form">
          <el-form-item label="顶部标签">
            <el-input v-model="form.badge" maxlength="40" show-word-limit placeholder="429 · RATE LIMITED" />
          </el-form-item>

          <el-form-item label="大标题">
            <el-input v-model="form.title" maxlength="60" show-word-limit placeholder="本站已限制自动化访问" />
          </el-form-item>

          <el-form-item label="正文说明">
            <el-input
              v-model="form.message"
              type="textarea"
              :rows="4"
              maxlength="800"
              show-word-limit
              placeholder="检测到来自该地址的**自动化访问行为**……"
            />
          </el-form-item>

          <el-form-item label="提示条目（一行一条，最多 6 条）">
            <el-input
              v-model="tipsText"
              type="textarea"
              :rows="5"
              maxlength="1200"
              :placeholder="tipsPlaceholder"
            />
          </el-form-item>

          <el-form-item label="底部入口文案">
            <el-input v-model="form.contactLabel" maxlength="60" show-word-limit placeholder="需要放行或想说明用途" />
          </el-form-item>

          <el-form-item label="底部入口链接">
            <el-input v-model="form.contactUrl" maxlength="300" placeholder="https://… 或 /about" />
          </el-form-item>

          <el-form-item label="显示技术信息（状态码 / 来源 IP / 请求路径 / UA）">
            <el-switch v-model="form.showDetails" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ------------------------------ 预览 ------------------------------ -->
      <el-tab-pane label="预览" name="preview">
        <p class="guard-hint">
          自动化客户端（脚本 / 爬虫）被拦下时收到的就是这张 <b>429</b> 页面：
          它们拿到的是 HTML 而不是 JSON，会直接解析失败。
          下面用的是示例数据（IP 为文档专用段），<b>不会真的拦截任何 IP，也不消耗配额</b>。
        </p>

        <!-- 一键触发后的真实响应标记：和示例预览明确区分开 -->
        <div v-if="realResult" class="guard-real">
          <span class="guard-real-tag">真实触发</span>
          <span class="guard-real-text">
            HTTP {{ realResult.status }} · {{ realResult.ip }} · 第 {{ realResult.strikes }} 次 · 封禁
            {{ humanMs(realResult.blockMs) }}
          </span>
          <el-button link type="primary" size="small" @click="resetPreview">回到示例预览</el-button>
        </div>

        <div v-loading="previewing" class="guard-stage">
          <iframe v-if="html" class="guard-frame" title="脚本护栏警告页预览" :srcdoc="html" sandbox="" />
          <p v-else-if="!previewing" class="guard-empty">{{ previewError || '预览加载失败' }}</p>
        </div>
      </el-tab-pane>

    </el-tabs>

    <template #footer>
      <template v-if="tab === 'edit'">
        <el-button :loading="resetting" :disabled="!configLoaded" @click="restoreDefaults">恢复默认</el-button>
        <el-button type="primary" :loading="saving" :disabled="!configLoaded" @click="save">保存并预览</el-button>
      </template>
      <template v-else-if="tab === 'bans'">
        <el-button :loading="loadingBans" @click="loadBans">刷新</el-button>
        <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      </template>
      <template v-else-if="tab === 'records'">
        <el-button type="danger" :loading="triggering" @click="triggerReal">触发拦截</el-button>
        <el-button type="danger" plain :loading="clearing" @click="clearRecords">清空记录</el-button>
        <el-button :loading="loadingRecords" @click="loadRecords">刷新</el-button>
        <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      </template>
      <template v-else>
        <el-button type="danger" :loading="triggering" @click="triggerReal">触发拦截</el-button>
        <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/* 脚本护栏面板：拦截记录 / 硬封禁 / 警告页自定义 / 预览 */
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowRight } from '@element-plus/icons-vue';
import ScriptGuardRecordDetail from './ScriptGuardRecordDetail.vue';
import {
  getScriptGuardPreview,
  getScriptGuardPageConfig,
  saveScriptGuardPageConfig,
  resetScriptGuardPageConfig,
  getScriptGuardBlocks,
  clearScriptGuardBlocks,
  unblockScriptGuardIp,
  triggerScriptGuardBlock,
  getScriptGuardBans,
  addScriptGuardBan,
  removeScriptGuardBan,
  type ScriptGuardPageConfig,
  type ScriptGuardBlockRecord,
  type ScriptGuardTriggerResult,
  type ScriptGuardHardBan
} from '../services/admin';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits(['update:modelValue']);

// 默认停在「拦截记录」——它是这个弹窗最常看的一页，另外两页是偶尔调整
const tab = ref<'preview' | 'edit' | 'records' | 'bans'>('records');

// 模板里的 {{site}} 只能写成 <code v-pre>，写成 {{ '{{site}}' }} 会被 Vue 在第一个 }} 处截断
const tipsPlaceholder = '如果你是**正常访客**：这大概率是误判，请刷新重试；仍无法访问请通过下面的入口联系我们。';

const html = ref('');
const previewing = ref(false);
const previewError = ref('');
// 一键触发后的真实响应；有值时预览区显示的是真实拦截结果而不是示例
const realResult = ref<ScriptGuardTriggerResult | null>(null);
const triggering = ref(false);

const loadingConfig = ref(false);
const saving = ref(false);
const resetting = ref(false);
// 只有成功读到过一次配置才允许保存，避免用空表单覆盖线上自定义
const configLoaded = ref(false);

const form = reactive<ScriptGuardPageConfig>({
  badge: '',
  title: '',
  message: '',
  tips: [],
  contactLabel: '',
  contactUrl: '',
  showDetails: true
});
// 提示条目在表里是数组，在输入框里是「一行一条」
const tipsText = ref('');

// 断点与后台其它页面一致：768 手机 / 1120 窄屏；高度也要跟视口挂钩，否则弹窗会顶出屏幕
const viewport = reactive({ w: window.innerWidth, h: window.innerHeight });
const syncViewport = () => {
  viewport.w = window.innerWidth;
  viewport.h = window.innerHeight;
};

const isMobile = computed(() => viewport.w < 768);
const isNarrow = computed(() => viewport.w < 1120);

// 手机全屏、窄屏几乎占满，宽屏固定 880px
// 桌面给足宽度：记录表最小列宽合计约 970px，比它窄就会把各列压成省略号
const dialogWidth = computed(() =>
  isMobile.value ? '92vw' : isNarrow.value ? '94vw' : 'min(1120px, 92vw)'
);

// 记录表高度跟着视口走：太高会顶出弹窗，太矮又看不全几行
const tableHeight = computed(() => Math.max(240, Math.min(420, viewport.h - 380)));

const applyConfig = (config: ScriptGuardPageConfig) => {
  form.badge = config.badge;
  form.title = config.title;
  form.message = config.message;
  form.tips = [...(config.tips || [])];
  form.contactLabel = config.contactLabel;
  form.contactUrl = config.contactUrl;
  form.showDetails = config.showDetails !== false;
  tipsText.value = form.tips.join('\n');
};

const loadPreview = async () => {
  previewing.value = true;
  previewError.value = '';
  try {
    html.value = await getScriptGuardPreview();
  } catch (e: any) {
    previewError.value = e?.response?.data?.error || e?.message || '预览加载失败';
  } finally {
    previewing.value = false;
  }
};

/** 从「真实触发结果」退回示例预览 */
const resetPreview = () => {
  realResult.value = null;
  void loadPreview();
};

// 一键触发是真实封禁（写记录 + 进封禁表），不是预览；重复触发按 4 倍升级
const triggerReal = async () => {
  try {
    await ElMessageBox.confirm(
      '这会在你当前的出口 IP 上执行一次真实封禁：写入拦截记录、进入封禁表，重复触发按 4 倍升级。' +
        '你的浏览器访问不受影响（浏览器 UA 本就不会被计入），万一影响别的工具，可在「拦截记录」里解封。',
      '一键触发真实拦截',
      { type: 'warning', confirmButtonText: '确认触发', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }

  triggering.value = true;
  try {
    const result = await triggerScriptGuardBlock();
    realResult.value = result;
    html.value = result.html;
    await loadRecords();
    ElMessage.success(
      `已真实封禁 ${result.ip}：第 ${result.strikes} 次违规，封禁 ${humanMs(result.blockMs)}`
    );
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '触发失败');
  } finally {
    triggering.value = false;
  }
};

const loadConfig = async () => {
  loadingConfig.value = true;
  try {
    const { config } = await getScriptGuardPageConfig();
    applyConfig(config);
    configLoaded.value = true;
  } catch (e: any) {
    // 加载失败时必须保持「不可保存」：表单是空的，保存会把默认值覆盖到已有自定义上
    configLoaded.value = false;
    ElMessage.error(e?.response?.data?.error || e?.message || '配置加载失败');
  } finally {
    loadingConfig.value = false;
  }
};

const handleOpen = () => {
  // 默认页签是拦截记录：已在该页就手动刷新，否则切过来让 watch 去加载（两条路径各只发一次）
  if (tab.value === 'records') void loadRecords();
  else tab.value = 'records';

  // 每次打开都从「示例预览」开始，避免上次的真实触发结果被当成示例数据
  realResult.value = null;

  // 另外几页的数据一并预取，切过去就不用等
  void loadPreview();
  void loadConfig();
  void loadBans();
};

/* ---------------------------- 拦截记录 ---------------------------- */

const records = ref<ScriptGuardBlockRecord[]>([]);
const activeList = ref<Array<{ ip: string; ua: string; strikes: number; remainMs: number }>>([]);
const loadingRecords = ref(false);
const clearing = ref(false);

// 展开详情：表格用 toggleRowExpansion（状态交给 el-table），卡片用 Set 自己记
const tableRef = ref();
const expandedCards = ref(new Set<number>());

const toggleRow = (row: ScriptGuardBlockRecord) => {
  tableRef.value?.toggleRowExpansion(row);
};

const toggleCard = (id: number) => {
  const next = new Set(expandedCards.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedCards.value = next;
};

const activeIps = computed(() => new Set(activeList.value.map((a) => a.ip)));

// 一个 IP 可能有多条记录，只有最新那条代表当前状态（列表按 id 倒序，首次遇到即最新）
const latestIdByIp = computed(() => {
  const map: Record<string, number> = {};
  for (const row of records.value) {
    if (map[row.ip] === undefined) map[row.ip] = row.id;
  }
  return map;
});

const isActive = (row: ScriptGuardBlockRecord) =>
  activeIps.value.has(row.ip) && latestIdByIp.value[row.ip] === row.id;

const loadRecords = async () => {
  loadingRecords.value = true;
  try {
    const data = await getScriptGuardBlocks(200);
    records.value = data.items || [];
    activeList.value = data.active || [];
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '拦截记录加载失败');
  } finally {
    loadingRecords.value = false;
  }
};

const clearRecords = async () => {
  try {
    await ElMessageBox.confirm('清空后无法恢复（正在封禁的 IP 不受影响，仍会继续被拦）。', '清空拦截记录', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    });
  } catch {
    return;
  }
  clearing.value = true;
  try {
    await clearScriptGuardBlocks();
    await loadRecords();
    ElMessage.success('已清空拦截记录');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '清空失败');
  } finally {
    clearing.value = false;
  }
};

const release = async (ip: string) => {
  try {
    const released = await unblockScriptGuardIp(ip);
    await loadRecords();
    ElMessage.success(released ? `已解除 ${ip} 的封禁` : `${ip} 当前已不在封禁中`);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '解封失败');
  }
};

/* ---------------------------- 硬封禁 ---------------------------- */

const BAN_DURATIONS = [
  { label: '永久', value: 0 },
  { label: '1 小时', value: 60 * 60 * 1000 },
  { label: '1 天', value: 24 * 60 * 60 * 1000 },
  { label: '7 天', value: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 天', value: 30 * 24 * 60 * 60 * 1000 }
];

const hardBans = ref<ScriptGuardHardBan[]>([]);
const loadingBans = ref(false);
const banSaving = ref(false);
const banForm = reactive({ ip: '', reason: '', durationMs: 0 });

const loadBans = async () => {
  loadingBans.value = true;
  try {
    hardBans.value = await getScriptGuardBans();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '名单加载失败');
  } finally {
    loadingBans.value = false;
  }
};

const submitBan = async () => {
  const ip = banForm.ip.trim();
  if (!ip) {
    ElMessage.warning('先填要封禁的 IP');
    return;
  }

  const durationText = BAN_DURATIONS.find((d) => d.value === banForm.durationMs)?.label || '';
  try {
    await ElMessageBox.confirm(
      `将对 ${ip} 执行硬封禁（${durationText}）：该 IP 的一切请求都会返回 429，` +
        '连浏览器也打不开本站（后台 /admin 与 /api/admin 除外）。同一 NAT 出口下的设备会一起被挡。',
      '硬封禁确认',
      { type: 'warning', confirmButtonText: '确认封禁', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }

  banSaving.value = true;
  try {
    hardBans.value = await addScriptGuardBan({
      ip,
      reason: banForm.reason.trim(),
      durationMs: banForm.durationMs
    });
    banForm.ip = '';
    banForm.reason = '';
    ElMessage.success(`已硬封禁 ${ip}`);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '封禁失败');
  } finally {
    banSaving.value = false;
  }
};

const removeBan = async (ip: string) => {
  try {
    await ElMessageBox.confirm(`解除对 ${ip} 的硬封禁？`, '解除硬封禁', {
      type: 'warning',
      confirmButtonText: '解除',
      cancelButtonText: '取消'
    });
  } catch {
    return;
  }
  try {
    hardBans.value = await removeScriptGuardBan(ip);
    ElMessage.success(`已解除 ${ip}`);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '解除失败');
  }
};

/** 库里存的是 UTC，按和访客日志一致的口径转成东八区显示 */
const formatTime = (val: string) => {
  if (!val) return '';
  const date = new Date(val.endsWith('Z') ? val : val.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return val;
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const humanMs = (ms: number) => {
  const n = Number(ms) || 0;
  if (n >= 3600000) return `${Math.round(n / 3600000)} 小时`;
  if (n >= 60000) return `${Math.round(n / 60000)} 分钟`;
  return `${Math.max(1, Math.round(n / 1000))} 秒`;
};

// 切到记录/硬封禁页签就刷新一次，省得看到过期数据
watch(tab, (next) => {
  if (next === 'records') void loadRecords();
  if (next === 'bans') void loadBans();
});

const save = async () => {
  if (!configLoaded.value) {
    ElMessage.warning('配置还没加载成功，先点「重新打开」再试，避免覆盖已有自定义');
    return;
  }
  const tips = tipsText.value
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

  saving.value = true;
  try {
    const config = await saveScriptGuardPageConfig({ ...form, tips });
    applyConfig(config);
    await loadPreview();
    tab.value = 'preview';
    ElMessage.success('已保存，下一个被拦的请求就会用新文案');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const restoreDefaults = async () => {
  resetting.value = true;
  try {
    const config = await resetScriptGuardPageConfig();
    applyConfig(config);
    await loadPreview();
    ElMessage.success('已恢复默认文案');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '恢复默认失败');
  } finally {
    resetting.value = false;
  }
};

onMounted(() => window.addEventListener('resize', syncViewport));
onBeforeUnmount(() => window.removeEventListener('resize', syncViewport));
</script>

<style scoped>
.guard-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
.guard-hint {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
.guard-hint b {
  color: var(--el-text-color-primary);
}
.guard-hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
/* 「别把判定依据写进去」的提醒：比普通说明更醒目，但不用错误色，避免显得像出了故障 */
.guard-warn {
  margin: 0 0 16px;
  padding: 10px 14px;
  border-radius: 8px;
  border-left: 3px solid var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}
.guard-warn b {
  color: var(--el-color-warning);
}
/* 真实触发结果的标记条：黄色，和示例预览区分开 */
.guard-real {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  font-size: 13px;
}
.guard-real-tag {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 12px;
}
.guard-real-text {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-regular);
  word-break: break-all;
}
.guard-stage {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
  background: #0d1117;
}
/* iframe 高度跟视口走，避免顶出弹窗 */
.guard-frame {
  display: block;
  width: 100%;
  height: clamp(320px, 62vh, 640px);
  border: 0;
}
.guard-empty {
  margin: 0;
  padding: 60px 20px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.guard-form {
  max-height: min(56vh, 560px);
  overflow-y: auto;
  padding-right: 6px;
}

/* ---- 硬封禁 ---- */
.ban-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.ban-ip {
  flex: 1 1 220px;
  min-width: 0;
}
.ban-reason {
  flex: 1 1 160px;
  min-width: 0;
}
.ban-duration {
  flex: 0 0 120px;
}
.ban-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 80px;
  max-height: min(46vh, 420px);
  overflow-y: auto;
}
.ban-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 4px 12px;
  padding: 10px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}
.ban-row-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ban-row-ip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.ban-row-hits {
  font-size: 12px;
  color: var(--el-color-danger);
}
.ban-row-sub {
  grid-column: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ban-row > .el-button {
  grid-row: 1 / span 2;
  grid-column: 2;
}
@media (max-width: 768px) {
  .ban-duration {
    flex: 1 1 100px;
  }
  .ban-list {
    max-height: none;
  }
}

/* ---- 拦截记录 ---- */
.guard-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.summary-item b {
  color: var(--el-color-danger);
  font-size: 15px;
}
.summary-item.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.guard-table {
  border-radius: 10px;
  overflow: hidden;
}
/* 整行可点开详情，给个手型提示 */
.guard-table.is-expandable :deep(.el-table__row) {
  cursor: pointer;
}
.guard-table.is-expandable :deep(.el-table__expanded-cell) {
  padding: 14px 16px 16px 48px;
  background: var(--el-fill-color-lighter);
}
.guard-table.is-expandable :deep(.el-table__expand-icon) {
  color: var(--el-text-color-secondary);
}
.cell-ip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cell-ua {
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}
.cell-path {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 12px;
}
.cell-strikes {
  display: block;
  font-size: 13px;
}
.cell-block {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.guard-empty-inline {
  display: block;
  padding: 16px 0;
  font-size: 13px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

/* ---- 拦截记录：窄屏卡片（表格 8 列在手机上只能横向拖）---- */
.guard-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
}
.guard-card {
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}
.guard-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  cursor: pointer;
}
.card-caret {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
  transition: transform 0.2s;
}
.card-caret.is-open {
  transform: rotate(90deg);
}
.guard-card-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.card-foot-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.card-ip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
.card-sub {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.card-ua {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}
.card-path {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
  font-size: 12px;
  word-break: break-all;
}
.guard-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.card-time {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* 窄屏：说明文字和间距收紧一点，按钮不换行 */
@media (max-width: 768px) {
  .guard-hint {
    margin-bottom: 12px;
    font-size: 12px;
  }
  .guard-warn {
    margin-bottom: 12px;
    padding: 9px 12px;
    font-size: 12px;
  }
  .guard-form {
    max-height: none;
    padding-right: 0;
  }
  .guard-summary {
    gap: 4px 12px;
    font-size: 12px;
  }
  .summary-item.muted {
    display: none; /* 手机上一句长解释太占地方，说明已在页签说明里 */
  }
  .guard-frame {
    height: clamp(300px, 58vh, 520px);
  }
}

/* 极窄（小屏手机竖屏）：预览页头部说明再缩一档 */
@media (max-width: 420px) {
  .guard-frame {
    height: clamp(280px, 54vh, 460px);
  }
  .card-path,
  .cell-path {
    font-size: 11px;
  }
}
</style>
