<template>
  <div class="detail-view-wrapper">
  <div class="detail-view" v-if="monitor">
    <el-page-header ref="pageHeaderRef" @back="goBack" class="mb-4">
      <template #content>
        <div class="page-header-content">
          <span class="page-title"> {{ monitor.friendly_name }} </span>
          <el-tag :type="statusType" class="status-tag">{{ statusText }}</el-tag>
        </div>
      </template>
    </el-page-header>

    <el-row :gutter="20" class="mb-4">
      <el-col :xs="24" :md="12" class="mb-4-xs">
        <el-card class="info-card h-100">
          <template #header>
            <div class="card-header">
              <span>基本信息</span>
            </div>
          </template>
          <div class="info-list">
            <div class="info-item">
              <span class="label">监控目标</span>
              <a :href="monitor.url" target="_blank" class="value link">
                {{ monitor.url }} <el-icon><Link /></el-icon>
              </a>
            </div>
            <div class="info-item">
              <span class="label">监控类型</span>
              <span class="value">{{ getMonitorType(monitor.type) }}</span>
            </div>
            <div class="info-item">
              <span class="label">当前状态</span>
              <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
            </div>
            <div class="info-item">
              <span class="label">最后检测</span>
              <span class="value">{{ lastCheckTime }}</span>
            </div>
            <div class="info-item">
              <span class="label">运行时间</span>
              <span class="value">{{ runningTime }}</span>
            </div>
            
            <template v-if="monitor.ssl && monitor.ssl.expires">
              <el-divider content-position="left">SSL 证书信息</el-divider>
              <div class="info-item">
                <span class="label">颁发机构</span>
                <span class="value">{{ monitor.ssl.brand || '未知' }}</span>
              </div>
              <div class="info-item">
                <span class="label">过期时间</span>
                <span class="value">{{ formatSSLDate(monitor.ssl.expires) }}</span>
              </div>
              <div class="info-item">
                <span class="label">证书状态</span>
                <el-tag :type="getSSLStatusType(monitor.ssl.expires)" size="small">
                  剩余 {{ getSSLDaysRemaining(monitor.ssl.expires) }} 天
                </el-tag>
              </div>
            </template>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :md="12">
        <el-card class="stats-card h-100">
          <template #header>
            <div class="card-header">
              <span>可用性统计</span>
            </div>
          </template>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-label">24小时</div>
              <div class="stat-value" :class="getUptimeClass(uptimeRatios[0])">{{ uptimeRatios[0] }}%</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">7天</div>
              <div class="stat-value" :class="getUptimeClass(uptimeRatios[1])">{{ uptimeRatios[1] }}%</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">30天</div>
              <div class="stat-value" :class="getUptimeClass(uptimeRatios[2])">{{ uptimeRatios[2] }}%</div>
            </div>
          </div>
          <el-divider />
          <div class="summary-text">
            {{ historySummaryText }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="24" class="mb-4">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>运行状态热力图 (最近30天)</span>
            </div>
          </template>
          <UptimeHeatmap :uptime-ranges="monitor.custom_uptime_ranges" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="24" class="mb-4">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>响应时间趋势 (最近24小时)</span>
            </div>
          </template>
          <UptimeChart :data="monitor.response_times || []" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" v-if="monitor.logs && monitor.logs.length > 0">
      <el-col :span="24" class="mb-4">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近故障记录</span>
            </div>
          </template>
          <el-table :data="recentLogs" style="width: 100%" stripe>
            <el-table-column prop="datetime" label="时间" width="180">
              <template #default="{ row }">
                {{ formatLogDate(row.datetime) }}
              </template>
            </el-table-column>
            <el-table-column prop="type" label="事件" width="120">
              <template #default="{ row }">
                <el-tag :type="row.type === 1 ? 'danger' : 'success'">
                  {{ row.type === 1 ? '故障 (Down)' : '恢复 (Up)' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="原因">
              <template #default="{ row }">
                {{ getLogReason(row) }}
              </template>
            </el-table-column>
            <el-table-column prop="duration" label="持续时间" width="150">
              <template #default="{ row }">
                {{ formatDuration(row.duration) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- Debugger Section -->
    <el-row :gutter="20" class="mb-4">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>接口调试 (API Debugger)</span>
            </div>
          </template>
          
          <div class="debug-controls">
            <div class="url-inputs mb-4">
              <el-input v-model="debugPath" placeholder="/path/to/resource" class="path-input">
                <template #prepend>
                  <el-select v-model="debugMethod" style="width: 100px">
                    <el-option label="GET" value="GET" />
                    <el-option label="POST" value="POST" />
                    <el-option label="PUT" value="PUT" />
                    <el-option label="DELETE" value="DELETE" />
                    <el-option label="HEAD" value="HEAD" />
                    <el-option label="PATCH" value="PATCH" />
                  </el-select>
                </template>
                <template #append>
                  <el-button type="primary" @click="sendDebugRequest" :loading="debugLoading">发送请求</el-button>
                </template>
              </el-input>
            </div>
            
            <div class="quick-paths mb-4">
              <div class="quick-paths-header">
                <span class="label">常用路径</span>
              </div>
              <div class="quick-paths-list">
                <el-tag 
                  v-for="path in neteasePaths" 
                  :key="path" 
                  class="path-tag" 
                  @click="debugPath = path"
                  effect="plain"
                  type="info"
                >
                  {{ path }}
                </el-tag>
              </div>
            </div>
          </div>

          <el-tabs v-model="activeTab" class="mb-4">
            <el-tab-pane label="Headers" name="headers">
              <div v-for="(header, index) in debugHeaders" :key="index" class="header-row mb-2">
                <el-input v-model="header.key" placeholder="Key" style="width: 30%" />
                <span class="mx-2">:</span>
                <el-input v-model="header.value" placeholder="Value" style="width: 60%" />
                <el-button type="danger" circle :icon="Delete" @click="removeHeader(index)" v-if="debugHeaders.length > 0" class="ml-2" />
              </div>
              <el-button type="primary" link @click="addHeader">+ Add Header</el-button>
            </el-tab-pane>
            <el-tab-pane label="Body" name="body" v-if="['POST', 'PUT', 'PATCH'].includes(debugMethod)">
              <el-input v-model="debugBody" type="textarea" :rows="5" placeholder="JSON or Text body" />
            </el-tab-pane>
          </el-tabs>

          <div v-if="debugResponse" class="response-viewer">
            <el-divider content-position="left">Response</el-divider>
            <div class="response-meta mb-2">
              <el-tag :type="debugResponse.status >= 200 && debugResponse.status < 300 ? 'success' : 'danger'">
                Status: {{ debugResponse.status }} {{ debugResponse.statusText }}
              </el-tag>
              <el-tag type="info" class="ml-2">Time: {{ debugResponse.duration }}ms</el-tag>
            </div>
            
            <el-tabs type="border-card">
              <el-tab-pane label="Body">
                <pre class="code-block">{{ formatJson(debugResponse.data) }}</pre>
              </el-tab-pane>
              <el-tab-pane label="Headers">
                <pre class="code-block">{{ formatJson(debugResponse.headers) }}</pre>
              </el-tab-pane>
            </el-tabs>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-4">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>音乐搜索 (Music Search)</span>
            </div>
          </template>
          <div class="search-box">
             <el-input 
               v-model="searchKeyword" 
               placeholder="搜索歌曲、专辑、歌手..." 
               class="input-with-select" 
               @keyup.enter="() => handleSearch(false)" 
               clearable 
               @clear="clearSearch"
             >
                <template #prepend v-if="!isMobile">
                  <el-select v-model="searchType" placeholder="类型" style="width: 100px">
                    <el-option label="歌曲" :value="1" />
                    <el-option label="专辑" :value="10" />
                    <el-option label="歌手" :value="100" />
                  </el-select>
                </template>
                <template #append>
                  <el-button :icon="Search" @click="() => handleSearch(false)" :loading="searchLoading" />
                </template>
             </el-input>
             <div class="mobile-search-type mt-2" v-if="isMobile">
                <el-radio-group v-model="searchType" size="small">
                  <el-radio-button :value="1">歌曲</el-radio-button>
                  <el-radio-button :value="10">专辑</el-radio-button>
                  <el-radio-button :value="100">歌手</el-radio-button>
                </el-radio-group>
             </div>
          </div>
          
          <div v-if="searchResults && searchResults.length > 0" class="search-results mt-4" style="margin-top: 20px;">
             <!-- Mobile List View for Songs -->
             <div v-if="searchType === 1 && isMobile" class="mobile-song-list">
               <div v-for="song in searchResults" :key="song.id" class="mobile-song-item" @click="playerStore.playTrack(song, searchResults)">
                 <div class="song-info">
                   <div class="song-name">{{ song.name }}</div>
                   <div class="song-meta">
                     {{ (song.ar || song.artists || []).map((a: any) => a.name).join(', ') }} - {{ song.al?.name || song.album?.name || '未知' }}
                   </div>
                 </div>
                 <div class="song-action">
                   <el-icon><VideoPlay /></el-icon>
                 </div>
               </div>
             </div>

             <el-table v-else-if="searchType === 1" :data="searchResults" stripe style="width: 100%">
                <el-table-column prop="name" label="歌曲标题" min-width="150" />
                <el-table-column label="歌手" min-width="120">
                    <template #default="{ row }">
                        <div class="artist-name-truncate" :title="(row.ar || row.artists || []).map((a: any) => a.name).join(', ')">
                           {{ (row.ar || row.artists || []).map((a: any) => a.name).join(', ') || '未知' }}
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="专辑" min-width="120">
                    <template #default="{ row }">
                        {{ row.al?.name || row.album?.name || '未知' }}
                    </template>
                </el-table-column>
                <el-table-column label="时长" width="100">
                     <template #default="{ row }">
                        {{ formatDurationMs(row.dt || row.duration) }}
                     </template>
                </el-table-column>
                <el-table-column width="60" align="center">
                    <template #default="{ row }">
                        <el-button link :icon="VideoPlay" @click="playerStore.playTrack(row, searchResults)" />
                    </template>
                </el-table-column>
             </el-table>
             
             <div v-else-if="searchType === 10" class="album-grid">
                 <div v-for="album in searchResults" :key="album.id" class="album-item" @click="openAlbumDetail(album)">
                    <el-image :src="album.picUrl" class="album-cover" fit="cover" />
                    <div class="search-item-title">{{ album.name }}</div>
                    <div class="search-item-subtitle">{{ album.artist?.name || (album.artists && album.artists.length > 0 ? album.artists[0].name : '未知歌手') }}</div>
                 </div>
             </div>
             
             <div v-else-if="searchType === 100" class="artist-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 20px;">
                 <div v-for="artist in searchResults" :key="artist.id" class="artist-item" style="text-align: center; cursor: pointer;" @click="openArtistDetail(artist)">
                    <el-image :src="artist.picUrl" style="width: 100px; height: 100px; border-radius: 50%;" fit="cover" />
                    <div class="search-item-title">{{ artist.name }}</div>
                 </div>
             </div>
             
             <div v-if="hasMore" class="load-more-container" style="text-align: center; margin-top: 20px;">
                <el-button :loading="searchLoading" @click="handleLoadMore" type="primary" plain>加载更多</el-button>
             </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-4">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
              <span>网易云音乐登录 (Netease Login)</span>
              <el-button type="danger" size="small" @click="clearLogin" v-if="loggedInCookie">清除登录</el-button>
            </div>
          </template>
          
          <div v-if="loggedInCookie">
            <el-alert
              title="登录成功"
              type="success"
              description="已成功获取网易云音乐 Cookie，您可以在下方查看或复制，该 Cookie 已自动应用到调试器中。"
              show-icon
              :closable="false"
              class="mb-4"
            />
            <div class="cookie-viewer">
              <div v-if="userProfile" class="user-info-display mb-4" style="display: flex; align-items: center; gap: 15px;">
                <el-avatar :size="50" :src="userProfile.avatarUrl" />
                <div class="user-details">
                  <div style="font-weight: bold; font-size: 16px;">{{ userProfile.nickname }}</div>
                  <div style="font-size: 12px; color: #999;">网易云音乐用户</div>
                </div>
              </div>

              <div v-if="userPlaylists.length > 0" class="user-playlists mb-4">
                  <el-divider content-position="left">我的歌单 ({{ userPlaylists.length }})</el-divider>
                  <div class="playlist-grid">
                      <div v-for="playlist in userPlaylists" :key="playlist.id" class="playlist-item" @click="openPlaylistDetail(playlist)" style="cursor: pointer;">
                          <el-image :src="playlist.coverImgUrl" class="playlist-cover" fit="cover" loading="lazy">
                              <template #placeholder>
                                  <div class="image-slot">Loading...</div>
                              </template>
                          </el-image>
                          <div class="playlist-details">
                              <div class="playlist-name" :title="playlist.name">{{ playlist.name }}</div>
                              <div class="playlist-count">{{ playlist.trackCount }}首</div>
                          </div>
                      </div>
                  </div>
              </div>
              <div class="cookie-header mb-2" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" @click="toggleCookieInfo">
                <span class="label">
                  <el-icon class="mr-1"><component :is="showCookieInfo ? CaretBottom : CaretRight" /></el-icon>
                  Cookie 信息:
                </span>
                <div class="cookie-actions" @click.stop>
                  <el-button type="primary" link size="small" @click="fetchUserProfile">刷新数据</el-button>
                  <el-button type="primary" link size="small" @click="analyzeCookie">分析 Cookie</el-button>
                  <el-button type="primary" link size="small" @click="copyCookie">复制全部</el-button>
                </div>
              </div>
              <div v-show="showCookieInfo">
                <el-input
                  v-model="loggedInCookie"
                  type="textarea"
                  autosize
                  readonly
                />
              </div>
              
              <div v-if="showCookieAnalysis" class="cookie-analysis mt-4">
                 <el-divider content-position="left" style="cursor: pointer;" @click="toggleCookieAnalysisTable">
                    <el-icon class="mr-1"><component :is="showCookieAnalysisTable ? CaretBottom : CaretRight" /></el-icon>
                    Cookie 分析
                 </el-divider>
                 <div v-show="showCookieAnalysisTable">
                    <el-table :data="cookieAnalysisData" border style="width: 100%" size="small">
                        <el-table-column prop="key" label="字段名 (Key)" width="180" />
                        <el-table-column prop="value" label="值 (Value)" />
                    </el-table>
                 </div>
              </div>
            </div>
          </div>
          <div v-else>
             <div v-if="!showLoginQr" class="login-placeholder">
               <el-empty description="未登录" :image-size="100">
                 <el-button type="primary" @click="openLoginQr">扫码登录</el-button>
               </el-empty>
             </div>
             <div v-else class="qr-login-area" style="text-align: center; padding: 20px;">
                <div v-if="qrImg" class="qr-container mb-4">
                  <img :src="qrImg" style="width: 180px; height: 180px;" />
                </div>
                <div v-else class="loading-state mb-4" style="height: 180px; display: flex; align-items: center; justify-content: center;">
                  <el-icon class="is-loading" size="30"><Loading /></el-icon>
                </div>
                <div class="status-text mb-2">{{ loginStatus }}</div>
                <div class="qr-actions">
                  <el-button v-if="loginStatus.includes('过期')" type="primary" size="small" @click="getQrCode">刷新二维码</el-button>
                  <el-button size="small" @click="closeLoginQr">取消</el-button>
                </div>
             </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showDetailDialog" :title="detailTitle" :width="isMobile ? '95%' : '70%'">
       <div style="margin-bottom: 15px;">
          <el-button type="primary" :icon="VideoPlay" @click="() => playerStore.playTrack(detailTracks[0], detailTracks)" :disabled="detailTracks.length === 0">播放全部</el-button>
       </div>
       
       <div v-if="isMobile" class="mobile-song-list">
         <div v-for="(song, index) in detailTracks" :key="song.id" class="mobile-song-item" @click="playerStore.playTrack(song, detailTracks)">
           <div class="song-index">{{ index + 1 }}</div>
           <div class="song-info">
             <div class="song-name">{{ song.name }}</div>
             <div class="song-meta">
               {{ (song.ar || song.artists || []).map((a: any) => a.name).join(', ') }} - {{ song.al?.name || song.album?.name || '未知' }}
             </div>
           </div>
           <div class="song-action">
             <el-icon><VideoPlay /></el-icon>
           </div>
         </div>
       </div>

       <el-table v-else :data="detailTracks" v-loading="detailLoading" height="400" stripe>
          <el-table-column type="index" width="50" />
          <el-table-column prop="name" label="歌曲标题" />
          <el-table-column label="歌手">
              <template #default="{ row }">
                  <div class="artist-name-truncate" :title="row.ar ? row.ar.map((a: any) => a.name).join(', ') : (row.artists ? row.artists.map((a: any) => a.name).join(', ') : '未知')">
                     {{ row.ar ? row.ar.map((a: any) => a.name).join(', ') : (row.artists ? row.artists.map((a: any) => a.name).join(', ') : '未知') }}
                  </div>
              </template>
          </el-table-column>
          <el-table-column label="专辑">
              <template #default="{ row }">
                  {{ row.al ? row.al.name : (row.album ? row.album.name : '未知') }}
              </template>
          </el-table-column>
          <el-table-column label="时长" width="100">
               <template #default="{ row }">
                  {{ formatDurationMs(row.dt || row.duration) }}
               </template>
          </el-table-column>
          <el-table-column width="60" align="center">
              <template #default="{ row }">
                  <el-button link :icon="VideoPlay" @click="playerStore.playTrack(row, detailTracks)" />
              </template>
          </el-table-column>
       </el-table>
    </el-dialog>
  </div>
  <div v-else-if="store.loading">
    <el-skeleton animated />
  </div>
  <div v-else>
    <el-empty description="未找到监控项目" />
    <el-button @click="goBack">返回</el-button>
  </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMonitorStore } from '../stores/monitor';
import { useLayoutStore } from '../stores/layout'; // Import Layout Store
import { usePlayerStore } from '../stores/player'; // Import Player Store
import { proxyRequest } from '../services/api';
import UptimeChart from '../components/UptimeChart.vue';
import UptimeHeatmap from '../components/UptimeHeatmap.vue';
import { Link, Delete, Loading, CaretBottom, CaretRight, Search, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

defineProps<{
  id?: string | number
}>();

const route = useRoute();
const router = useRouter();
const store = useMonitorStore();
const layoutStore = useLayoutStore(); // Use Layout Store
const playerStore = usePlayerStore(); // Use Player Store

const monitorId = Number(route.params.id);

const monitor = computed(() => store.monitors.find(m => m.id === monitorId));
const pageHeaderRef = ref<HTMLElement | null>(null); // Ref for Page Header

// Mobile Check
const isMobile = ref(false);
const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768;
};

// Login Logic
const showLoginQr = ref(false);
const qrImg = ref('');
const loginStatus = ref('');
const loggedInCookie = ref('');
let loginTimer: any = null;
let unikey = '';

// Search State
const searchKeyword = ref('');
const searchType = ref(1); // 1: Song, 10: Album, 100: Artist
const searchResults = ref<any[]>([]);
const searchLoading = ref(false);
const searchOffset = ref(0);
const hasMore = ref(false);
const searchLimit = 10;

watch(searchType, () => {
  if (searchKeyword.value && searchKeyword.value.trim()) {
    handleSearch(false);
  } else {
    searchResults.value = [];
    hasMore.value = false;
    searchOffset.value = 0;
  }
});

// Detail Dialog State (Playlist, Album, Artist)
const showDetailDialog = ref(false);
const detailTitle = ref('');
const detailTracks = ref<any[]>([]);
const detailLoading = ref(false);

const goBack = () => {
  router.push('/');
};

// Scroll Handler
let ticking = false;

const checkScrollPosition = () => {
  if (!pageHeaderRef.value) return;
  // Element Plus components expose $el for the DOM node
  const el = (pageHeaderRef.value as any).$el || pageHeaderRef.value;
  if (!el || !el.getBoundingClientRect) return;

  const rect = el.getBoundingClientRect();
  // Header height is 60px.
  // When the bottom of the page header touches the bottom of the sticky header (or goes above),
  // we switch the navigation to the sticky header.
  layoutStore.setHeaderState(rect.bottom < 60);
};

const handleScroll = () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      checkScrollPosition();
      ticking = false;
    });
    ticking = true;
  }
};

const formatDurationMs = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const handleSearch = async (loadMore = false) => {
  if (!searchKeyword.value) return;
  if (!debugBaseUrl.value) {
      ElMessage.warning('请先等待监控加载完成以获取API地址');
      return;
  }
  
  searchLoading.value = true;
  
  if (!loadMore) {
      searchResults.value = [];
      searchOffset.value = 0;
      hasMore.value = false;
  }
  
  let baseUrl = debugBaseUrl.value.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  
  try {
      const res = await proxyRequest(`${baseUrl}/search?keywords=${encodeURIComponent(searchKeyword.value)}&type=${searchType.value}&limit=${searchLimit}&offset=${searchOffset.value}`, 'GET', {}, {});
      
      if (res.data?.result) {
          let newResults: any[] = [];
          if (searchType.value === 1) { // Songs
              newResults = res.data.result.songs || [];
          } else if (searchType.value === 10) { // Albums
              newResults = res.data.result.albums || [];
          } else if (searchType.value === 100) { // Artists
              newResults = res.data.result.artists || [];
          }

          if (loadMore) {
              searchResults.value = [...searchResults.value, ...newResults];
          } else {
              searchResults.value = newResults;
          }
          
          hasMore.value = newResults.length >= searchLimit;
          
          if (newResults.length > 0) {
              searchOffset.value += newResults.length;
          }
          
          if (!loadMore && newResults.length === 0) {
               ElMessage.info('未找到结果');
          }
      } else {
          if (!loadMore) ElMessage.info('未找到结果');
          hasMore.value = false;
      }
  } catch (e) {
      console.error('Search failed', e);
      ElMessage.error('搜索失败');
      hasMore.value = false;
  } finally {
      searchLoading.value = false;
  }
};

const handleLoadMore = () => {
    handleSearch(true);
};

const clearSearch = () => {
    searchKeyword.value = '';
    searchResults.value = [];
    searchOffset.value = 0;
    hasMore.value = false;
};

const openPlaylistDetail = async (playlist: any) => {
  detailTitle.value = playlist.name;
  showDetailDialog.value = true;
  detailTracks.value = [];
  detailLoading.value = true;
  
  if (!debugBaseUrl.value) return;
  let baseUrl = debugBaseUrl.value.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  
  try {
      const headers = loggedInCookie.value ? { Cookie: getCleanCookie(loggedInCookie.value) } : {};
      const res = await proxyRequest(`${baseUrl}/playlist/track/all?id=${playlist.id}&limit=1000&timestamp=${Date.now()}`, 'GET', headers, {});
      
      if (res.data?.songs) {
          detailTracks.value = res.data.songs;
      } else {
          ElMessage.warning('无法获取歌单歌曲');
      }
  } catch (e) {
      console.error('Fetch playlist tracks failed', e);
      ElMessage.error('获取歌单详情失败');
  } finally {
      detailLoading.value = false;
  }
};

const openAlbumDetail = async (album: any) => {
    detailTitle.value = album.name;
    showDetailDialog.value = true;
    detailTracks.value = [];
    detailLoading.value = true;

    if (!debugBaseUrl.value) return;
    let baseUrl = debugBaseUrl.value.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    try {
        const headers = loggedInCookie.value ? { Cookie: getCleanCookie(loggedInCookie.value) } : {};
        const res = await proxyRequest(`${baseUrl}/album?id=${album.id}`, 'GET', headers, {});
        if (res.data?.songs) {
            detailTracks.value = res.data.songs;
        } else {
            ElMessage.warning('无法获取专辑歌曲');
        }
    } catch (e) {
        console.error('Fetch album failed', e);
        ElMessage.error('获取专辑详情失败');
    } finally {
        detailLoading.value = false;
    }
};

const openArtistDetail = async (artist: any) => {
    detailTitle.value = artist.name;
    showDetailDialog.value = true;
    detailTracks.value = [];
    detailLoading.value = true;

    if (!debugBaseUrl.value) return;
    let baseUrl = debugBaseUrl.value.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    try {
        const headers = loggedInCookie.value ? { Cookie: getCleanCookie(loggedInCookie.value) } : {};
        const res = await proxyRequest(`${baseUrl}/artists?id=${artist.id}`, 'GET', headers, {});
        if (res.data?.hotSongs) {
            detailTracks.value = res.data.hotSongs;
        } else {
            ElMessage.warning('无法获取歌手热门歌曲');
        }
    } catch (e) {
        console.error('Fetch artist failed', e);
        ElMessage.error('获取歌手详情失败');
    } finally {
        detailLoading.value = false;
    }
};

// Lifecycle
onMounted(() => {
  window.scrollTo(0, 0);
  window.addEventListener('scroll', handleScroll);
  window.addEventListener('resize', checkMobile);
  checkMobile();
  
  if (monitor.value) {
    layoutStore.setPageInfo(monitor.value.friendly_name, true, goBack);
  }
  if (store.monitors.length === 0) {
    store.fetchMonitors();
  }
  
  // Load saved cookie
  const savedCookie = localStorage.getItem('netease_cookie');
  if (savedCookie) {
    loggedInCookie.value = savedCookie;
    fetchUserProfile();
  }
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', checkMobile);
  if (loginTimer) clearTimeout(loginTimer);
  layoutStore.reset();
});

const debugBaseUrl = ref('');
const debugPath = ref('');
const debugMethod = ref('GET');
const debugHeaders = ref<{key: string, value: string}[]>([{key: '', value: ''}]);
const debugBody = ref('');
const debugResponse = ref<any>(null);
const debugLoading = ref(false);
const activeTab = ref('headers');

// Cookie Analysis
const showCookieAnalysis = ref(false);
const showCookieInfo = ref(false);
const showCookieAnalysisTable = ref(true);
const cookieAnalysisData = ref<{key: string, value: string}[]>([]);
const userProfile = ref<{nickname: string, avatarUrl: string, userId?: number} | null>(null);
const userPlaylists = ref<any[]>([]);

const toggleCookieInfo = () => {
  showCookieInfo.value = !showCookieInfo.value;
};

const toggleCookieAnalysisTable = () => {
  showCookieAnalysisTable.value = !showCookieAnalysisTable.value;
};

const openLoginQr = async () => {
  showLoginQr.value = true;
  loginStatus.value = '正在获取二维码...';
  qrImg.value = '';
  await getQrCode();
};

const closeLoginQr = () => {
  showLoginQr.value = false;
  if (loginTimer) {
    clearInterval(loginTimer);
    loginTimer = null;
  }
  loginStatus.value = '';
  qrImg.value = '';
  unikey = '';
};

const clearLogin = () => {
  loggedInCookie.value = '';
  showCookieAnalysis.value = false;
  cookieAnalysisData.value = [];
  userProfile.value = null;
  userPlaylists.value = [];
  ElMessage.success('已清除登录信息');
};

const getCleanCookie = (fullCookie: string) => {
  if (!fullCookie) return '';
  return fullCookie.split(';')
    .map(part => part.trim())
    .filter(part => {
      const lower = part.toLowerCase();
      return !lower.startsWith('path=') && 
             !lower.startsWith('expires=') && 
             !lower.startsWith('max-age=') && 
             !lower.startsWith('domain=') &&
             !lower.startsWith('samesite=') &&
             !lower.startsWith('httponly') &&
             !lower.startsWith('secure');
    })
    .join('; ');
};

const fetchUserPlaylists = async () => {
  if (!loggedInCookie.value || !debugBaseUrl.value || !userProfile.value?.userId) {
    console.warn('Cannot fetch playlists: Missing cookie, url or userId');
    return;
  }

  let baseUrl = debugBaseUrl.value.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  try {
    const headers = {
        Cookie: getCleanCookie(loggedInCookie.value)
    };

    const res = await proxyRequest(`${baseUrl}/user/playlist?uid=${userProfile.value.userId}&timestamp=${Date.now()}`, 'GET', headers, {});
    
    if (res.data?.playlist) {
        userPlaylists.value = res.data.playlist;
        // ElMessage.success(`成功获取 ${res.data.playlist.length} 个歌单`);
    } else {
        console.warn('No playlists found in response', res.data);
    }
  } catch (e) {
    console.error('Failed to fetch user playlists', e);
    ElMessage.error('获取用户歌单失败');
  }
};

const fetchUserProfile = async () => {
  if (!loggedInCookie.value || !debugBaseUrl.value) {
    if (!loggedInCookie.value) ElMessage.warning('请先登录或输入 Cookie');
    return;
  }

  let baseUrl = debugBaseUrl.value.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  try {
    const headers = {
        Cookie: getCleanCookie(loggedInCookie.value)
    };

    const res = await proxyRequest(`${baseUrl}/login/status?timestamp=${Date.now()}`, 'POST', headers, {});
    
    // Normalize data structure handling both {code: 200, profile: ...} and {code: 200, data: {profile: ...}}
    const data = res.data?.data || res.data;
    
    let profile = data?.profile;
    let userId = profile?.userId;
    
    // Fallback to account ID if profile userId is missing
    if (!userId && data?.account?.id) {
        userId = data.account.id;
    }

    if (userId) {
         // If we have userId but no profile (or partial profile), try to fetch user detail
         if (!profile) {
             try {
                 const detailRes = await proxyRequest(`${baseUrl}/user/detail?uid=${userId}&timestamp=${Date.now()}`, 'GET', headers, {});
                 if (detailRes.data?.profile) {
                     profile = detailRes.data.profile;
                 }
             } catch (err) {
                 console.warn('Failed to fetch user detail fallback', err);
             }
         }

         if (profile) {
            userProfile.value = {
                nickname: profile.nickname,
                avatarUrl: profile.avatarUrl,
                userId: userId
            };
            ElMessage.success(`获取用户信息成功: ${profile.nickname}`);
            fetchUserPlaylists();
         } else {
             // Still no profile, maybe just show ID?
             userProfile.value = {
                nickname: `用户 ${userId}`,
                avatarUrl: '', // Default or empty
                userId: userId
            };
            ElMessage.success(`获取用户ID成功: ${userId}`);
            fetchUserPlaylists();
         }
    } else {
        console.warn('User profile/ID not found in response', JSON.stringify(res.data));
        ElMessage.warning('未找到用户信息，请检查 Cookie 是否有效');
    }
  } catch (e) {
    console.error('Failed to fetch user profile', e);
    ElMessage.error('获取用户信息失败');
  }
};

const analyzeCookie = () => {
  if (!loggedInCookie.value) return;
  
  const cookies = loggedInCookie.value.split(';');
  const analysis: {key: string, value: string}[] = [];
  
  cookies.forEach(c => {
    const parts = c.trim().split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim(); // Handle values with =
      if (key && value) {
        analysis.push({ key, value });
      }
    }
  });
  
  cookieAnalysisData.value = analysis;
  showCookieAnalysis.value = true;
};

const copyCookie = async () => {
  if (!loggedInCookie.value) return;
  try {
    await navigator.clipboard.writeText(loggedInCookie.value);
    ElMessage.success('Cookie 已复制到剪贴板');
  } catch (err) {
    ElMessage.error('复制失败，请手动复制');
  }
};

const getQrCode = async () => {
  if (!debugBaseUrl.value) {
    loginStatus.value = '错误：未设置基础URL';
    return;
  }
  
  // 1. Get Key
  let baseUrl = debugBaseUrl.value.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  
  try {
    const keyRes = await proxyRequest(`${baseUrl}/login/qr/key?timestamp=${Date.now()}`, 'GET', {}, null);
    if (keyRes.data?.code === 200) {
      unikey = keyRes.data.data.unikey;
      
      // 2. Create QR
      const createRes = await proxyRequest(`${baseUrl}/login/qr/create?key=${unikey}&qrimg=true&timestamp=${Date.now()}`, 'GET', {}, null);
      if (createRes.data?.code === 200) {
        qrImg.value = createRes.data.data.qrimg;
        loginStatus.value = '请使用网易云音乐APP扫码登录';
        startCheckLogin(baseUrl);
      } else {
        loginStatus.value = '获取二维码失败';
      }
    } else {
      loginStatus.value = '获取登录Key失败';
    }
  } catch (e) {
    loginStatus.value = '网络请求失败';
  }
};

const startCheckLogin = (baseUrl: string) => {
  if (loginTimer) clearTimeout(loginTimer);
  
  const check = async () => {
    if (!showLoginQr.value) return;
    
    try {
      const checkRes = await proxyRequest(`${baseUrl}/login/qr/check?key=${unikey}&timestamp=${Date.now()}`, 'GET', {}, null);
      
      let data = checkRes.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error('[QR Check Parse Error]', e);
        }
      }
      
      const code = Number(data?.code);
      console.log('[QR Check]', code, data);
      
      if (code === 800) {
        loginStatus.value = '二维码已过期，请刷新';
      } else if (code === 801) {
        loginStatus.value = '等待扫码...';
        loginTimer = setTimeout(check, 3000);
      } else if (code === 802) {
        loginStatus.value = '扫码成功，请在手机上确认';
        if (data.nickname && data.avatarUrl) {
           userProfile.value = {
              nickname: data.nickname,
              avatarUrl: data.avatarUrl
           };
        }
        loginTimer = setTimeout(check, 3000);
      } else if (code === 803) {
        loginStatus.value = '登录成功！';
        const cookie = data.cookie;
        loggedInCookie.value = cookie;
        console.log('[Login Success] Cookie:', cookie);
        
        showLoginQr.value = false;
        // Don't need to manually close dialog as we switch view
        if (loginTimer) {
            clearTimeout(loginTimer);
            loginTimer = null;
        }
        
        // Fetch User Profile
        fetchUserProfile();
      } else {
        // Unknown code, retry
         loginTimer = setTimeout(check, 3000);
      }
    } catch (e) {
      console.error('[QR Check Error]', e);
      loginTimer = setTimeout(check, 3000);
    }
  };

  check();
};



const neteasePaths = [
  '/search?keywords=海阔天空',
  '/search/hot',
  '/playlist/detail?id=24381616',
  '/song/detail?ids=347230',
  '/user/detail?uid=32953014',
  '/comment/music?id=186016&limit=1',
  '/banner',
  '/login/cellphone'
];

watch(() => monitor.value, (newVal) => {
  if (newVal) {
    debugBaseUrl.value = newVal.url;
    layoutStore.setPageInfo(newVal.friendly_name, true, goBack);
    playerStore.setApiUrl(newVal.url);
  }
}, { immediate: true });

watch(loggedInCookie, (newVal) => {
  if (newVal) {
    localStorage.setItem('netease_cookie', newVal);
    playerStore.setCookie(newVal);
  } else {
    localStorage.removeItem('netease_cookie');
    playerStore.setCookie('');
  }
}, { immediate: true });

const addHeader = () => {
  debugHeaders.value.push({ key: '', value: '' });
};

const removeHeader = (index: number) => {
  debugHeaders.value.splice(index, 1);
};

const sendDebugRequest = async () => {
  debugLoading.value = true;
  debugResponse.value = null;
  
  const headersObj: Record<string, string> = {};
  debugHeaders.value.forEach(h => {
    if (h.key) headersObj[h.key] = h.value;
  });

  let bodyData = debugBody.value;
  if (debugBody.value && (debugMethod.value === 'POST' || debugMethod.value === 'PUT')) {
     try {
       bodyData = JSON.parse(debugBody.value);
     } catch (e) {
       // Keep as string
     }
  }

  // Construct full URL
  let baseUrl = debugBaseUrl.value.trim();
  let path = debugPath.value.trim();
  
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  if (!path.startsWith('/') && path.length > 0) path = '/' + path;
  
  const fullUrl = baseUrl + path;

  debugResponse.value = await proxyRequest(fullUrl, debugMethod.value, headersObj, bodyData);
  debugLoading.value = false;
};

const formatJson = (data: any) => {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch (e) {
    return data;
  }
};

const statusType = computed(() => {
  if (!monitor.value) return 'info';
  switch (monitor.value.status) {
    case 2: return 'success';
    case 8: return 'warning';
    case 9: return 'danger';
    case 0: return 'info';
    default: return 'info';
  }
});

const statusText = computed(() => {
  if (!monitor.value) return '未知';
  switch (monitor.value.status) {
    case 2: return '运行中';
    case 8: return '疑似故障';
    case 9: return '故障';
    case 0: return '已暂停';
    default: return '未知';
  }
});

const getMonitorType = (type: number) => {
  const types: Record<number, string> = {
    1: 'HTTP(s)',
    2: 'Keyword',
    3: 'Ping',
    4: 'Port',
    5: 'Heartbeat'
  };
  return types[type] || 'Unknown';
};

const lastCheckTime = computed(() => {
  if (!monitor.value?.response_times || monitor.value.response_times.length === 0) return '未知';
  // response_times usually sorted descending? or usually we get a list.
  // Assuming the first one is the latest or we check sorting.
  // UptimeRobot API returns list, usually implies history. 
  // Let's assume index 0 is latest based on MonitorCard usage
  const latest = monitor.value.response_times[0]; 
  if (!latest) return '未知';
  const date = new Date(latest.datetime * 1000);
  return date.toLocaleString();
});

const runningTime = computed(() => {
  if (!monitor.value?.create_datetime) return '未知';
  const created = monitor.value.create_datetime * 1000;
  const now = Date.now();
  const diff = now - created;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return `${days} 天`;
});

const uptimeRatios = computed(() => {
  if (!monitor.value?.custom_uptime_ratio) return ['-', '-', '-'];
  return monitor.value.custom_uptime_ratio.split('-');
});

const getUptimeClass = (ratio: string) => {
  if (ratio === '-') return '';
  const val = parseFloat(ratio);
  if (val >= 99) return 'text-success';
  if (val >= 95) return 'text-warning';
  return 'text-danger';
};

const historySummaryText = computed(() => {
  if (!monitor.value) return '';
  const ratio30 = uptimeRatios.value[2];
  if (ratio30 === '-') return '暂无数据';
  
  const val = parseFloat(ratio30);
  const totalMinutes = 43200; // 30 days
  const downMinutes = Math.round(totalMinutes * (1 - val / 100));
  
  let durationText = '';
  if (downMinutes <= 0) {
    durationText = '0分钟';
  } else if (downMinutes < 60) {
    durationText = `${downMinutes}分钟`;
  } else {
    const h = Math.floor(downMinutes / 60);
    const m = downMinutes % 60;
    durationText = `${h}小时${m}分钟`;
  }

  const now = Date.now() / 1000;
  const thirtyDaysAgo = now - 30 * 24 * 3600;
  const failures = monitor.value.logs 
    ? monitor.value.logs.filter(l => l.type === 1 && l.datetime >= thirtyDaysAgo).length
    : 0;

  return `最近30天共发生 ${failures} 次故障，累计停机 ${durationText}`;
});

const recentLogs = computed(() => {
  if (!monitor.value?.logs) return [];
  // Show up to 10 recent logs
  return [...monitor.value.logs].sort((a, b) => b.datetime - a.datetime).slice(0, 10);
});

const formatLogDate = (ts: number) => {
  const date = new Date(ts * 1000);
  return date.toLocaleString();
};

const formatSSLDate = (ts: number) => {
  const date = new Date(ts * 1000);
  return date.toLocaleDateString();
};

const getSSLDaysRemaining = (ts: number) => {
  const now = Date.now() / 1000;
  const diff = ts - now;
  return Math.ceil(diff / (24 * 3600));
};

const getSSLStatusType = (ts: number) => {
  const days = getSSLDaysRemaining(ts);
  if (days > 30) return 'success';
  if (days > 7) return 'warning';
  return 'danger';
};

const getLogReason = (log: any) => {
  if (log.reason && log.reason.detail) return log.reason.detail;
  if (log.type === 2) return '服务恢复';
  return '连接超时/无响应';
};

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${hours}小时`;
  return `${hours}小时${m}分钟`;
};


</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.mb-4-xs { margin-bottom: 20px; }
.mb-2 { margin-bottom: 8px; }
@media (min-width: 992px) {
  .mb-4-xs { margin-bottom: 0; }
}

.h-100 { height: 100%; }

.cookie-viewer {
  background-color: var(--el-fill-color-light);
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}
.cookie-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cookie-header .label {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.page-header-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.status-tag { margin-left: 0; flex-shrink: 0; }

.card-header { font-weight: 600; }

.info-list { display: flex; flex-direction: column; gap: 16px; }
.info-item { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--el-border-color-lighter); padding-bottom: 12px; }
.info-item:last-child { border-bottom: none; padding-bottom: 0; }
.info-item .label { color: var(--el-text-color-secondary); font-size: 14px; }
.info-item .value { font-weight: 500; color: var(--el-text-color-primary); font-size: 14px; }
.info-item .link { color: var(--el-color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px; }
.info-item .link:hover { text-decoration: underline; }

.stats-grid { display: flex; justify-content: space-around; padding: 20px 0; text-align: center; }
.stat-item { display: flex; flex-direction: column; gap: 8px; }
.stat-label { font-size: 14px; color: var(--el-text-color-secondary); }
.stat-value { font-size: 24px; font-weight: 700; }
.text-success { color: var(--el-color-success); }
.text-warning { color: var(--el-color-warning); }
.text-danger { color: var(--el-color-danger); }

.summary-text { font-size: 14px; color: var(--el-text-color-secondary); text-align: center; }

.header-row { display: flex; align-items: center; }
.url-inputs { display: flex; gap: 0; }
.path-input :deep(.el-input__inner) { border-radius: 4px; }
.code-block {
  background-color: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}
.code-block::-webkit-scrollbar {
  display: none; /* Hide scrollbar for Chrome, Safari and Opera */
}
.code-block {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}
.mx-2 { margin-left: 8px; margin-right: 8px; }
.ml-2 { margin-left: 8px; }

.quick-paths {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quick-paths-header {
  margin-bottom: 4px;
}
.quick-paths-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.quick-paths .label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.path-tag {
  cursor: pointer;
  transition: all 0.2s;
}
.path-tag:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  background-color: var(--el-color-primary-light-9);
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 16px;
}

.playlist-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.2s;
  cursor: pointer;
}

.playlist-item:hover {
  transform: translateY(-4px);
}

.playlist-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.playlist-details {
  font-size: 12px;
}

.playlist-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
}

.playlist-count {
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.search-item-title {
  margin-top: 5px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.3;
  height: 2.6em; /* 2 lines * 1.3em */
  font-size: 14px;
}
.search-item-subtitle {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.artist-name-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  display: block;
}

.mobile-search-type {
  display: flex;
  justify-content: center;
  margin-top: 15px; /* Increase spacing from search input */
}

.mobile-search-type :deep(.el-radio-button__inner) {
  padding: 8px 20px; /* Increase padding inside buttons */
  margin: 0 5px; /* Add spacing between buttons */
  border-radius: 4px; /* Rounded corners for separate buttons */
  border: 1px solid var(--el-border-color); /* Full border */
  box-shadow: none !important; /* Remove default shadow overlap */
}

.mobile-search-type :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-left: 1px solid var(--el-border-color); /* Restore left border */
}

.mobile-search-type :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: white;
}

.mobile-song-list {
  display: flex;
  flex-direction: column;
}

.mobile-song-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
}

.mobile-song-item:last-child {
  border-bottom: none;
}

.mobile-song-item:active {
  background-color: var(--el-fill-color-light);
}

.song-index {
  width: 30px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  flex-shrink: 0;
}

.song-info {
  flex: 1;
  min-width: 0;
  margin-right: 10px;
}

.song-name {
  font-size: 16px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-action {
  color: var(--el-color-primary);
  font-size: 20px;
  flex-shrink: 0;
}

.image-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.search-item-title {
  margin-top: 5px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.3;
  height: 2.6em; /* Ensure fixed height for alignment */
  font-size: 14px;
}

.search-item-subtitle {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 20px;
}

.album-item {
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s;
}

.album-item:hover {
  transform: translateY(-4px);
}

.album-cover {
  width: 100%;
  border-radius: 8px;
  aspect-ratio: 1;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

@media (max-width: 768px) {
  .album-grid {
    grid-template-columns: repeat(2, 1fr); /* Force 2 columns on mobile */
    gap: 12px;
  }
}
</style>
