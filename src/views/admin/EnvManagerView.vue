<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 环境变量管理 (.env) </span>
      </template>
    </el-page-header>

    <div class="toolbar">
      <el-button type="primary" @click="openChangePwd">修改管理员密码</el-button>
    </div>

    <el-row :gutter="20">
      <el-col :md="8" :xs="24" v-for="(list, cat) in envMap" :key="String(cat)">
        <el-card class="mb-4">
          <div class="card-header"><h3>{{ labels[String(cat)] || String(cat) }}</h3></div>
          <el-table :data="list" @row-click="selectItem">
            <el-table-column prop="key" label="Key" />
            <el-table-column label="Value">
              <template #default="{ row }">
                <span>{{ row.secure ? '••••••' : row.value }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button size="small" @click.stop="editItem(row)">编辑</el-button>
                <el-button size="small" @click.stop="openHistory(row)">历史</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showPwdDialog" title="修改管理员密码" :fullscreen="isMobile" :width="isMobile ? '100%' : '480px'">
      <el-form label-width="120px">
        <el-form-item label="旧密码"><el-input v-model="oldPwd" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="newPwd" type="password" show-password /></el-form-item>
        <el-alert type="info" title="需包含大小写字母、数字与特殊字符，长度≥8" show-icon class="mb-2" />
      </el-form>
      <template #footer>
        <el-button @click="showPwdDialog=false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitChangePwd">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDialog" title="编辑变量" :width="isMobile ? '90%' : '600px'">
      <el-form :model="form" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="Key"><el-input v-model="form.key" /></el-form-item>
        <el-form-item label="值"><el-input v-model="form.value" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" style="width: 200px">
            <el-option label="数据库" value="database" />
            <el-option label="缓存" value="cache" />
            <el-option label="第三方API" value="api" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="加密存储">
          <el-switch v-model="form.secure" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showHistory" title="修改历史" :width="isMobile ? '95%' : '700px'">
      <el-table :data="history">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="updated_at" label="时间" width="200" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" @click="rollback(row.id)">回滚到此版本</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showHistory=false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getEnvMap, setEnv, getEnvHistory, rollbackEnvByHistoryId, type EnvItem, changeAdminPassword } from '../../services/admin';
import { validatePasswordComplexity } from '../../utils/password';
import { ElMessage } from 'element-plus';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const envMap = ref<Record<string, EnvItem[]>>({});
const labels: Record<string, string> = { database: '数据库', cache: '缓存', api: '第三方API', other: '其他' };

const showDialog = ref(false);
const form = ref<{ key: string; value: string; category: string; secure: boolean }>({ key: '', value: '', category: 'other', secure: true });

const showHistory = ref(false);
const history = ref<Array<{ id: number; key: string; updated_at: string }>>([]);
const currentKey = ref<string>('');

const fetchMap = async () => { envMap.value = await getEnvMap(); };
onMounted(fetchMap);

const selectItem = (row: EnvItem) => { editItem(row); };
const editItem = (row: EnvItem) => {
  form.value = { key: row.key, value: row.secure ? '' : row.value, category: guessCategory(row.key), secure: row.secure };
  showDialog.value = true;
};
const guessCategory = (key: string) => {
  if (/^(DB_|DATABASE_)/.test(key)) return 'database'; if (/^(REDIS_|CACHE_)/.test(key)) return 'cache'; if (/^(VUE_APP_|API_|THIRD_|SERVICE_)/.test(key)) return 'api'; return 'other';
};
const save = async () => {
  if (!form.value.key) return;
  await setEnv(form.value);
  showDialog.value = false;
  fetchMap();
};

const openHistory = async (row: EnvItem) => {
  currentKey.value = row.key;
  const items = await getEnvHistory(row.key);
  history.value = items.map(i => ({ id: i.id, key: i.key, updated_at: i.updated_at }));
  showHistory.value = true;
};

// 修改管理员密码
const showPwdDialog = ref(false);
const oldPwd = ref('');
const newPwd = ref('');
const pwdLoading = ref(false);
const isMobile = ref(window.innerWidth <= 768);
window.addEventListener('resize', () => { isMobile.value = window.innerWidth <= 768; });
const openChangePwd = () => { showPwdDialog.value = true; oldPwd.value=''; newPwd.value=''; };
const submitChangePwd = async () => {
  if (!oldPwd.value || !newPwd.value) { ElMessage.error('请输入旧密码与新密码'); return; }
  pwdLoading.value = true;
  try {
    if (!validatePasswordComplexity(newPwd.value)) { ElMessage.error('新密码需包含大小写字母、数字、特殊字符且不少于8位'); pwdLoading.value = false; return; }
    await changeAdminPassword({ old_password: oldPwd.value, new_password: newPwd.value });
    showPwdDialog.value = false;
    ElMessage.success('管理员密码修改成功');
    await setEnv({ key: 'ADMIN_PASSWORD', value: newPwd.value, category: 'other', secure: false });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '修改失败');
  } finally {
    pwdLoading.value = false;
  }
};
const rollback = async (id: number) => {
  await rollbackEnvByHistoryId(id);
  showHistory.value = false;
  fetchMap();
};

const goBack = () => router.push('/');
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
</style>
