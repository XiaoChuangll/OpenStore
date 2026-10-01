import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { proxyRequest } from '../services/api';
import { mustProxy, preferHttps, proxyUrl } from '../utils/music-source';
import { ElMessage } from 'element-plus';

export interface Track {
  id: number;
  name: string;
  ar?: { id: number; name: string }[]; // Search result format
  artists?: { id: number; name: string }[]; // Detail format
  al?: { id: number; name: string; picUrl: string }; // Search result format
  album?: { id: number; name: string; picUrl: string }; // Detail format
  dt?: number; // Duration
  duration?: number;
  picUrl?: string; // Sometimes directly on track
}

export const usePlayerStore = defineStore('player', () => {
  const currentTrack = ref<Track | null>(null);
  const playlist = ref<Track[]>([]);
  const currentIndex = ref(-1);
  const isPlaying = ref(false);
  const showPlayer = ref(false);
  const volume = ref(0.5);
  const currentTime = ref(0);
  const duration = ref(0);
  const audioUrl = ref('');
  const loading = ref(false);
  // 记住上次用的音乐接口：直接进 /player（没经过音乐页）也能取到播放地址和歌词
  const apiUrl = ref(localStorage.getItem('player_api_url') || '');
  // 和 apiUrl 一样把登录态读回来：直接进 /player（没经过音乐页）也能取播放地址、查收藏
  const cookie = ref(localStorage.getItem('netease_cookie') || '');
  const userProfile = ref<{nickname: string; avatarUrl: string; userId: number} | null>(null);
  const showLoginDialog = ref(false);
  const viewModeRequest = ref(''); // 'mine', 'home', etc.
  const playMode = ref<'normal' | 'fm'>('normal');
  const personalFm = ref<Track[]>([]);
  const lastFmTrack = ref<Track | null>(null);
  const fmLoading = ref(false);
  /** 进 FM 之前的播放现场：退出 FM 时用来还原那张歌单和那首歌 */
  const fmSnapshot = ref<{ playlist: Track[]; index: number; trackId: number | null } | null>(null);

  /*
   * 播放队列落盘：刷新页面后 Pinia 状态会清空，
   * 若只按 ?track=<id> 还原成「只有一首」的队列，
   * 系统媒体控制（耳机 / 键盘 / 锁屏）的上一首、下一首就会失效。
   * 这里把队列和当前曲目存下来，刷新后原样接上。
   */
  const QUEUE_STORAGE_KEY = 'player_queue';
  const QUEUE_STORAGE_LIMIT = 500;

  const persistQueue = () => {
    try {
      let list = playlist.value;
      let index = currentIndex.value;

      // 队列太长时只留当前曲目附近的一段，避免把 localStorage 撑爆
      if (list.length > QUEUE_STORAGE_LIMIT) {
        const offset = Math.max(
          0,
          Math.min(index - Math.floor(QUEUE_STORAGE_LIMIT / 2), list.length - QUEUE_STORAGE_LIMIT)
        );
        list = list.slice(offset, offset + QUEUE_STORAGE_LIMIT);
        index = index - offset;
      }

      localStorage.setItem(
        QUEUE_STORAGE_KEY,
        JSON.stringify({
          trackId: currentTrack.value?.id ?? null,
          index,
          playlist: list,
          playMode: playMode.value,
          personalFm: playMode.value === 'fm' ? personalFm.value.slice(0, QUEUE_STORAGE_LIMIT) : [],
        })
      );
    } catch {
      /* 存不下就放弃，不影响播放 */
    }
  };

  const loadPersistedQueue = (): {
    trackId: number | null;
    index: number;
    playlist: Track[];
    playMode: 'normal' | 'fm';
    personalFm: Track[];
  } | null => {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.playlist) || parsed.playlist.length === 0) return null;
      return {
        trackId: typeof parsed.trackId === 'number' ? parsed.trackId : null,
        index: typeof parsed.index === 'number' ? parsed.index : 0,
        playlist: parsed.playlist,
        playMode: parsed.playMode === 'fm' ? 'fm' : 'normal',
        personalFm: Array.isArray(parsed.personalFm) ? parsed.personalFm : [],
      };
    } catch {
      return null;
    }
  };

  watch([playlist, currentIndex, currentTrack, playMode, personalFm], persistQueue, { deep: true });

  // HTML Audio Element
  // 直连失败时的代理兜底地址（只有 https 页面上的 http 地址才需要），以及本次播放是否已经回退过
  let proxyFallbackUrl = '';
  let proxyRetryUsed = false;

  const audio = new Audio();
  audio.volume = volume.value;

  // Sync state with audio events
  audio.ontimeupdate = () => {
    currentTime.value = audio.currentTime;
  };
  audio.onloadedmetadata = () => {
    duration.value = audio.duration;
  };
  audio.onended = () => {
    isPlaying.value = false;
    next();
  };
  audio.onplay = () => isPlaying.value = true;
  audio.onpause = () => isPlaying.value = false;
  audio.onwaiting = () => loading.value = true;
  audio.onplaying = () => {
    loading.value = false;
    isPlaying.value = true;
  };
  audio.onerror = (e) => {
    console.error('Audio error', e);
    // 该主机不支持 https 等情况下直连会失败：自动切到服务器代理重试一次，用户无感
    if (proxyFallbackUrl && !proxyRetryUsed) {
      proxyRetryUsed = true;
      const fallback = proxyFallbackUrl;
      proxyFallbackUrl = '';
      loading.value = true;
      audio.src = fallback;
      audio.load();
      audio.play().catch(() => {});
      return;
    }
    isPlaying.value = false;
    loading.value = false;
    ElMessage.error('播放出错');
  };

  /*
   * play() 被拒绝分三种情况，只有最后一种值得打扰用户：
   *   AbortError      —— 播放被新的加载/切歌打断，属正常现象（切歌、连点两下都会出现）
   *   NotAllowedError —— 浏览器自动播放限制（例如带 ?track= 直接进页面时还没有用户手势），
   *                      不是故障，等用户点一下播放键即可
   *   其它            —— 真的播不了，才提示
   */
  const handlePlayFailure = (error: unknown) => {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'AbortError') return;
    if (name === 'NotAllowedError') {
      console.warn('[player] 自动播放被浏览器拦截，等待用户交互后再播');
      return;
    }
    if (!audio.paused) return; // 其实已经在播了，不用提示
    console.error('Play failed', error);
    ElMessage.error('无法自动播放');
  };

  const setApiUrl = (url: string) => {
    apiUrl.value = url;
    localStorage.setItem('player_api_url', url);
  };

  const setCookie = (c: string) => {
    cookie.value = c;
    if (c) localStorage.setItem('netease_cookie', c);
    else localStorage.removeItem('netease_cookie');
  };

  const setUserProfile = (profile: any) => {
    userProfile.value = profile;
  };

  /**
   * 系统媒体控制条（Chrome/Edge 的播放悬浮层、手机锁屏、耳机按键面板）读的是 Media Session，
   * 不设置的话它只显示站点 favicon。这里把当前歌曲的封面 / 歌名 / 歌手 / 专辑写进去。
   */
  const mediaArtwork = (track: Track) => {
    const cover = track?.picUrl || track?.al?.picUrl || track?.album?.picUrl || '';
    return cover ? [{ src: cover, sizes: '512x512' }] : [];
  };

  const mediaArtist = (track: Track) => {
    const list = track?.ar || track?.artists || [];
    const names = list.map((a) => a?.name).filter(Boolean);
    return names.length ? names.join(' / ') : '';
  };

  const updateMediaSession = (track: Track) => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const MediaMetadataCtor = (window as any).MediaMetadata;
    if (typeof MediaMetadataCtor !== 'function') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadataCtor({
        title: track?.name || '',
        artist: mediaArtist(track),
        album: track?.al?.name || track?.album?.name || '',
        artwork: mediaArtwork(track),
      });
    } catch (e) {
      console.warn('[player] 设置媒体信息失败', e);
    }
  };

  /** 耳机 / 键盘上的播放、暂停、上一首、下一首按键 */
  const bindMediaSessionActions = () => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const handlers: Array<[string, () => void]> = [
      // 刷新后audio.src还没取，直接 audio.play() 会静默失败，所以走 togglePlay
      ['play', () => { togglePlay(); }],
      ['pause', () => audio.pause()],
      ['previoustrack', () => prev()],
      ['nexttrack', () => next()],
    ];
    handlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler);
      } catch {
        /* 个别浏览器不支持某个动作，忽略即可 */
      }
    });
  };

  const playTrack = async (track: Track, list?: Track[]) => {
    // Note: Do NOT reset playMode here. Let the caller decide.
    // If we are in FM mode, this track is an FM track.
    if (playMode.value === 'fm') {
        lastFmTrack.value = track;
    }

    if (list) {
      playlist.value = [...list];
      currentIndex.value = list.findIndex(t => t.id === track.id);
    } else {
       // Check if track is in current playlist
       const foundIndex = playlist.value.findIndex(t => t.id === track.id);
       if (foundIndex !== -1) {
           currentIndex.value = foundIndex;
       } else {
           // Not in playlist, replace
           playlist.value = [track];
           currentIndex.value = 0;
       }
    }

    currentTrack.value = track;
    showPlayer.value = true;
    loading.value = true;
    // 系统媒体控制（浏览器 / 锁屏 / 播放键悬浮层）显示的是这首歌的封面和名字
    updateMediaSession(track);
    
    // Reset audio
    audio.pause();
    audioUrl.value = '';
    
    try {
        if (!apiUrl.value) {
            throw new Error('API URL not set');
        }

        let baseUrl = apiUrl.value.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        const headers = cookie.value ? { Cookie: cookie.value } : {};
        // Netease Song URL API
        // Standard: /song/url?id=xxx
        // New: /song/url/v1?id=xxx&level=standard
        const res = await proxyRequest(withCookie(`${baseUrl}/song/url?id=${track.id}`), 'GET', headers, {});
        
        if (res.data?.data && res.data.data.length > 0) {
            const url = res.data.data[0].url;
            if (url) {
                /*
                 * 优先让浏览器直连 CDN：https 页面上的 http 地址升级成同主机 https
                 * （实测网易云 CDN 支持 https + Access-Control-Allow-Origin: *），
                 * 这样音频流量不再经过服务器，浏览器也能正常发 Range 请求（进度条可拖动）。
                 * 只有升级后仍不可用时，才在 onerror 里回退到 /api/music-proxy。
                 */
                const finalUrl = preferHttps(url);
                proxyRetryUsed = false;
                proxyFallbackUrl = mustProxy(url) ? proxyUrl(url) : '';

                audioUrl.value = finalUrl;
                audio.src = finalUrl;

                // Check for cover image if missing
                if (!track.picUrl && !track.al?.picUrl && !track.album?.picUrl) {
                   try {
                       const detailRes = await proxyRequest(withCookie(`${baseUrl}/song/detail?ids=${track.id}`), 'GET', headers, {});
                       if (detailRes.data?.songs && detailRes.data.songs.length > 0) {
                           const songDetail = detailRes.data.songs[0];
                           if (songDetail.al?.picUrl) {
                               // Update current track info with cover
                               if (currentTrack.value && currentTrack.value.id === track.id) {
                                   currentTrack.value = {
                                       ...currentTrack.value,
                                       al: songDetail.al,
                                       picUrl: songDetail.al.picUrl
                                   };
                               }
                           }
                       }
                   } catch (e) {
                       console.warn('Failed to fetch song detail for cover', e);
                   }
                }

                audio.play().catch(handlePlayFailure);
            } else {
                ElMessage.warning('无法获取歌曲链接 (可能需要VIP)');
                next(); // Skip if fails
            }
        } else {
             ElMessage.warning('获取歌曲链接失败');
        }
    } catch (e) {
        console.error('Failed to get song url', e);
        ElMessage.error('播放失败');
    } finally {
        loading.value = false;
    }
  };

  const togglePlay = async () => {
    if (audio.paused) {
        if (audio.src) audio.play().catch(handlePlayFailure);
        // 刷新后还原的歌曲还没取过播放地址，这时再按播放才去取（用户操作，不会被浏览器拦）
        else if (currentTrack.value) await playTrack(currentTrack.value);
    } else {
        audio.pause();
    }
  };

  const seek = (time: number) => {
    audio.currentTime = time;
  };

  const setVolume = (val: number) => {
    volume.value = val;
    audio.volume = val;
  };

  const prev = () => {
    if (playlist.value.length <= 1) return;
    let nextIndex = currentIndex.value - 1;
    if (nextIndex < 0) nextIndex = playlist.value.length - 1;
    playTrack(playlist.value[nextIndex]);
  };

  const fetchPersonalFm = async () => {
    if (fmLoading.value) return;
    fmLoading.value = true;
    try {
        if (!apiUrl.value) throw new Error('API URL not set');
        let baseUrl = apiUrl.value.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        const headers = cookie.value ? { Cookie: cookie.value } : {};

        const res = await proxyRequest(`${baseUrl}/personal_fm?timestamp=${Date.now()}`, 'GET', headers, {});
        if (res.data?.data) {
            const newTracks = res.data.data;
            personalFm.value.push(...newTracks);
            
            // If in FM mode, sync with playlist
            if (playMode.value === 'fm') {
                // If playlist was empty or we are appending
                // We should append these to the playlist
                // But avoid duplicates just in case
                const existingIds = new Set(playlist.value.map(t => t.id));
                const toAdd = newTracks.filter((t: Track) => !existingIds.has(t.id));
                playlist.value.push(...toAdd);
                
                // If we were not playing, start playing
                if (!currentTrack.value && playlist.value.length > 0) {
                    playTrack(playlist.value[0]);
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch personal FM', e);
    } finally {
        fmLoading.value = false;
    }
  };

  const next = async () => {
    if (playMode.value === 'fm') {
      if (personalFm.value.length === 0) {
        await fetchPersonalFm();
      } else {
        let nextIndex = currentIndex.value + 1;
        
        // If we are running out of songs (e.g. only 1 left), fetch more
        if (playlist.value.length - nextIndex <= 1) {
            await fetchPersonalFm(); // This appends to personalFm and playlist
        }

        // Check again after fetch
        if (nextIndex >= playlist.value.length) {
            // Should not happen if fetch works
            return; 
        }
        
        playTrack(playlist.value[nextIndex]);
      }
      return;
    }

    if (playlist.value.length <= 1) return;
    let nextIndex = currentIndex.value + 1;
    if (nextIndex >= playlist.value.length) nextIndex = 0;
    playTrack(playlist.value[nextIndex]);
  };

  const playFm = async () => {
      // 1. If already playing FM, just toggle
      if (playMode.value === 'fm' && currentTrack.value && personalFm.value.some(t => t.id === currentTrack.value?.id)) {
          togglePlay();
          return;
      }

      // 记下进 FM 之前放的是什么，退出时要原样还回去
      fmSnapshot.value = {
          playlist: [...playlist.value],
          index: currentIndex.value,
          trackId: currentTrack.value?.id ?? null
      };

      playMode.value = 'fm';

      // 2. Resume from existing FM list if available
      if (personalFm.value.length > 0) {
          playlist.value = [...personalFm.value];
          
          let trackToPlay = playlist.value[0];
          // Try to resume last played FM track
          if (lastFmTrack.value) {
              const found = playlist.value.find(t => t.id === lastFmTrack.value?.id);
              if (found) trackToPlay = found;
          }
          
          currentIndex.value = playlist.value.findIndex(t => t.id === trackToPlay.id);
          await playTrack(trackToPlay);
          return;
      }
      
      // 3. First time or empty: fetch new
      playlist.value = [];
      currentIndex.value = -1;
      
      await fetchPersonalFm();
      
      if (playlist.value.length > 0) {
          playTrack(playlist.value[0]);
      } else {
          // 拉不到 FM 歌单（多为未登录或接口异常）：安静地回退，别把原有队列清空
          restoreFmSnapshot();
      }
  };

  /**
   * 用「进 FM 之前的现场」还原队列与当前曲目。
   * 只改状态，不弹提示 —— 切换本身在界面上就能看出来。
   */
  const restoreFmSnapshot = () => {
      const snapshot = fmSnapshot.value;
      playMode.value = 'normal';
      fmSnapshot.value = null;

      // 直接以 FM 起步（没有现场）时，只退出 FM 模式，当前这首歌继续放着
      if (!snapshot || snapshot.playlist.length === 0) {
          return;
      }

      playlist.value = [...snapshot.playlist];
      const found = snapshot.trackId != null
          ? playlist.value.findIndex(t => t.id === snapshot.trackId)
          : -1;
      const index = found >= 0
          ? found
          : (snapshot.index >= 0 && snapshot.index < playlist.value.length ? snapshot.index : 0);
      currentIndex.value = index;

      // 当前放着的本来就是这首歌（例如 FM 拉歌失败的回退）就别从头重放
      const target = playlist.value[index];
      if (!target) return;
      if (currentTrack.value?.id !== target.id) {
          playTrack(target);
      }
  };

  /** 退出私人 FM：回到进 FM 之前的那张播放列表和那首歌 */
  const exitFm = () => restoreFmSnapshot();

  /**
   * 刷新 / 直接打开带 ?track=<id> 的页面时，把这首歌还原出来。
   * 只还原「歌名 / 歌手 / 封面 / 队列」，不取播放地址也不自动播放：
   * 浏览器不允许无操作自动出声，地址留到用户点播放时再取（见 togglePlay）。
   */
  const restoreTrackById = async (rawId: unknown) => {
      const trackId = Number(rawId);
      if (!trackId || !isFinite(trackId)) return null;
      if (currentTrack.value && currentTrack.value.id === trackId) return currentTrack.value;

      const base = (apiUrl.value || '').trim().replace(/\/$/, '');

      // 上次留下的队列（刷新后 Pinia 已清空，队列只存在 localStorage 里）
      const saved = playlist.value.length === 0 ? loadPersistedQueue() : null;
      const savedIndex = saved ? saved.playlist.findIndex((t) => t.id === trackId) : -1;

      // 拉一次详情：既用来兜底，也用来在队列里补全封面等字段
      let detail: Track | null = null;
      if (base) {
          try {
              const res = await proxyRequest(`${base}/song/detail?ids=${trackId}`, 'GET', {}, {});
              const payload = res?.data?.data ?? res?.data;
              const list = payload?.songs || payload?.data || [];
              const song = Array.isArray(list) ? list[0] : null;
              if (song?.name) {
                  detail = {
                      id: song.id ?? trackId,
                      name: song.name,
                      ar: song.ar || song.artists,
                      al: song.al || song.album,
                      dt: song.dt || song.duration,
                      picUrl: song.al?.picUrl || song.album?.picUrl || song.picUrl
                  };
              }
          } catch (error) {
              console.warn('[player] 还原歌曲失败', error);
          }
      }

      // 队列里就有这首歌：整条队列一起还原，媒体控制的上一首/下一首才有效
      if (saved && savedIndex >= 0) {
          const tracks = [...saved.playlist];
          const merged: Track = { ...tracks[savedIndex] };
          if (detail) {
              merged.id = trackId;
              merged.name = detail.name || merged.name;
              merged.ar = detail.ar || merged.ar;
              merged.al = detail.al || merged.al;
              merged.dt = detail.dt || merged.dt;
              merged.picUrl = detail.picUrl || merged.picUrl;
          }
          tracks[savedIndex] = merged;

          playMode.value = saved.playMode;
          personalFm.value = saved.personalFm;
          if (saved.playMode === 'fm') lastFmTrack.value = merged;
          playlist.value = tracks;
          currentIndex.value = savedIndex;
          currentTrack.value = merged;
          showPlayer.value = true;
          updateMediaSession(merged);
          return merged;
      }

      const track = detail;
      if (!track) return null;
      currentTrack.value = track;
      playlist.value = [track];
      currentIndex.value = 0;
      showPlayer.value = true;
      updateMediaSession(track);
      return track;
  };

  /**
   * 地址上没有 ?track= 时（例如直接刷新播放页），用上次留下的一整条队列接着放。
   */
  const restoreLastSession = async () => {
      if (currentTrack.value) return currentTrack.value;
      const saved = loadPersistedQueue();
      const trackId = saved?.trackId ?? saved?.playlist?.[0]?.id;
      if (!trackId) return null;
      return restoreTrackById(trackId);
  };

  /* ---------- 收藏 / 不感兴趣 ---------- */
  /** 当前这首歌是否已收藏（null = 还没查出来） */
  const trackLiked = ref<boolean | null>(null);
  const likePending = ref(false);
  /** 查过的结果记一下，来回切歌不用反复问接口 */
  const likedCache = new Map<number, boolean>();
  /** 收藏状态变一次就 +1：音乐页那边靠它知道该刷新「我的歌单」了 */
  const likeRevision = ref(0);

  const musicBase = () => (apiUrl.value || '').trim().replace(/\/$/, '');
  const musicHeaders = (): Record<string, string> => (cookie.value ? { Cookie: cookie.value } : {});

  /**
   * 这套接口的登录态是认 URL 上的 cookie 参数（不是请求头），
   * 只带请求头会被当成匿名请求：接口照样回 200，但什么都没写进去。
   */
  const withCookie = (url: string) => {
      const value = cookie.value;
      if (!value) return url;
      return `${url}${url.includes('?') ? '&' : '?'}cookie=${encodeURIComponent(value)}`;
  };

  /** 需要登录的接口在登录态失效时回 301 / 302 */
  const isAuthError = (res: any) => {
      const code = res?.data?.code ?? res?.data?.body?.code;
      return code === 301 || code === 302;
  };

  const LOGIN_EXPIRED = '登录已过期，请重新登录网易云账号';

  /** 各家版本这个接口的返回结构不太一样，能认的都认一下 */
  const readLikedFlag = (payload: any, trackId: number, depth = 0): boolean | null => {
      if (!payload || typeof payload !== 'object' || depth > 3) return null;
      if (typeof payload.liked === 'boolean') return payload.liked;

      // 实测这套接口返回的是「已收藏的 id 列表」：{ ids: [347230], code: 200 }
      if (Array.isArray(payload.ids)) {
          return payload.ids.some((id: any) => String(id) === String(trackId));
      }

      const direct = payload[String(trackId)] ?? payload[trackId];
      if (typeof direct === 'boolean') return direct;

      if (Array.isArray(payload)) {
          const hit = payload.find(
              (item: any) => Number(item?.songId ?? item?.trackId ?? item?.id) === trackId
          );
          return hit ? readLikedFlag(hit, trackId, depth + 1) : null;
      }

      for (const key of ['data', 'body', 'songs']) {
          const nested = payload[key];
          if (nested && nested !== payload) {
              const flag = readLikedFlag(nested, trackId, depth + 1);
              if (flag !== null) return flag;
          }
      }
      return null;
  };

  /** 问一下这首歌收藏了没有（没登录 / 查不出来就当没收藏，不打扰用户） */
  const refreshTrackLiked = async () => {
      const trackId = currentTrack.value?.id;
      trackLiked.value = null;
      if (!trackId) return;
      if (likedCache.has(trackId)) {
          trackLiked.value = likedCache.get(trackId) ?? null;
          return;
      }

      const base = musicBase();
      if (!base || !cookie.value) return;

      try {
          const ids = encodeURIComponent(`[${trackId}]`);
          const res = await proxyRequest(
              withCookie(`${base}/song/like/check?ids=${ids}&timestamp=${Date.now()}`),
              'GET',
              musicHeaders(),
              {}
          );
          const flag = readLikedFlag(res?.data, trackId);
          if (flag === null) return;
          trackLiked.value = flag;
          likedCache.set(trackId, flag);
      } catch (error) {
          console.warn('[player] 查询收藏状态失败', error);
      }
  };

  /** 点爱心：收藏 / 取消收藏 */
  const toggleLike = async () => {
      const trackId = currentTrack.value?.id;
      if (!trackId) return;

      const like = trackLiked.value !== true;
      const failText = like ? '收藏失败' : '取消收藏失败';

      const base = musicBase();
      if (!base) {
          ElMessage.warning(`${failText}：还没选好音乐线路`);
          return;
      }
      if (!cookie.value) {
          ElMessage.warning(`${failText}：请先登录网易云账号`);
          return;
      }
      if (likePending.value) return;

      likePending.value = true;
      try {
          const headers = musicHeaders();
          const res = await proxyRequest(
              withCookie(`${base}/like?id=${trackId}&like=${like}&timestamp=${Date.now()}`),
              'POST',
              headers,
              {}
          );
          if (isAuthError(res)) {
              ElMessage.error(`${failText}：${LOGIN_EXPIRED}`);
              return;
          }
          const code = res?.data?.code ?? res?.data?.body?.code;
          if (code && code !== 200) throw new Error(`code ${code}`);

          /*
           * 这个接口在没登录 / 登录过期时也会回 200（列表是空的），
           * 所以再核一遍，别让爱心白亮一场、歌单里却什么都没有。
           */
          const verified = await verifyLiked(trackId, headers);
          // 注意是「和预期不一致」才算失败：取消收藏时接口答不在列表里才是对的
          if (verified !== null && verified !== like) {
              likedCache.set(trackId, verified);
              trackLiked.value = verified;
              ElMessage.error(`${failText}：接口没记上，稍后再试一次`);
              return;
          }

          trackLiked.value = like;
          likedCache.set(trackId, like);
          likeRevision.value += 1;
      } catch (error) {
          console.error('[player] 收藏失败', error);
          ElMessage.error(`${failText}，稍后再试一次`);
      } finally {
          likePending.value = false;
      }
  };

  /** 复核一次收藏结果；接口答不上来时返回 null（当作没意见，不拦用户） */
  const verifyLiked = async (trackId: number, headers: Record<string, string>) => {
      const base = musicBase();
      if (!base) return null;
      try {
          const ids = encodeURIComponent(`[${trackId}]`);
          const res = await proxyRequest(
              withCookie(`${base}/song/like/check?ids=${ids}&timestamp=${Date.now()}`),
              'GET',
              headers,
              {}
          );
          return readLikedFlag(res?.data, trackId);
      } catch (error) {
          console.warn('[player] 复核收藏结果失败', error);
          return null;
      }
  };

  /**
   * 不感兴趣：
   * - 私人 FM 里直接丢垃圾桶；
   * - 其它场景先走「日推不感兴趣」，接口不认（例如这首歌不在今日推荐里，会返回 432）
   *   再退到 FM 垃圾桶。两者都是「别再给我推这首」，所以顺手跳到下一首。
   */
  const dislikeTrack = async () => {
      const trackId = currentTrack.value?.id;
      if (!trackId) return;

      const base = musicBase();
      if (!base) {
          ElMessage.warning('还没选好音乐线路');
          return;
      }
      if (!cookie.value) {
          ElMessage.warning('请先登录网易云账号');
          return;
      }

      const headers = musicHeaders();
      let accepted = false;

      if (playMode.value !== 'fm') {
          try {
              const res = await proxyRequest(
                  withCookie(`${base}/recommend/songs/dislike?id=${trackId}&timestamp=${Date.now()}`),
                  'POST',
                  headers,
                  {}
              );
              if (isAuthError(res)) {
                  ElMessage.error(`不感兴趣失败：${LOGIN_EXPIRED}`);
                  return;
              }
              const code = res?.data?.code ?? res?.data?.body?.code;
              accepted = !code || code === 200;
          } catch (error) {
              console.warn('[player] 日推不感兴趣失败', error);
          }
      }

      if (!accepted) {
          try {
              const res = await proxyRequest(
                  withCookie(`${base}/fm_trash?id=${trackId}&timestamp=${Date.now()}`),
                  'POST',
                  headers,
                  {}
              );
              if (isAuthError(res)) {
                  ElMessage.error(`不感兴趣失败：${LOGIN_EXPIRED}`);
                  return;
              }
          } catch (error) {
              console.error('[player] 不感兴趣失败', error);
              ElMessage.error('不感兴趣失败，稍后再试一次');
              return;
          }
      }

      await next();
  };

  // 换歌就把收藏状态重新问一遍
  watch(() => currentTrack.value?.id, refreshTrackLiked);

  const fmTrash = async () => {
      if (!currentTrack.value) return;
      const trackId = currentTrack.value.id;
      
      try {
        if (!apiUrl.value) throw new Error('API URL not set');
        let baseUrl = apiUrl.value.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        const headers = cookie.value ? { Cookie: cookie.value } : {};
        
        // /fm_trash?id=xxx
        const res = await proxyRequest(
            withCookie(`${baseUrl}/fm_trash?id=${trackId}&timestamp=${Date.now()}`),
            'POST',
            headers,
            {}
        );
        const code = res?.data?.code ?? res?.data?.body?.code;
        if (code && code !== 200) {
            ElMessage.error(isAuthError(res) ? `移出私人 FM 失败：${LOGIN_EXPIRED}` : '移出私人 FM 失败');
            return;
        }
        
        // Play next
        next();
      } catch (e) {
          console.error('Failed to trash FM song', e);
          ElMessage.error('移出私人 FM 失败，稍后再试一次');
      }
  };

  const addToQueue = (track: Track) => {
      if (!playlist.value.some(t => t.id === track.id)) {
          playlist.value.push(track);
          ElMessage.success('已添加到播放列表');
      }
  };

  // 耳机线控 / 键盘多媒体键接管一次即可
  bindMediaSessionActions();

  return {
    currentTrack,
    playlist,
    currentIndex,
    isPlaying,
    showPlayer,
    volume,
    currentTime,
    duration,
    loading,
    apiUrl,
    cookie,
    userProfile,
    showLoginDialog,
    setApiUrl,
    setCookie,
    setUserProfile,
    playTrack,
    togglePlay,
    seek,
    setVolume,
    prev,
    next,
    addToQueue,
    viewModeRequest,
    playMode,
    playFm,
    exitFm,
    restoreTrackById,
    restoreLastSession,
    fmTrash,
    trackLiked,
    likeRevision,
    likePending,
    refreshTrackLiked,
    toggleLike,
    dislikeTrack,
    fetchPersonalFm,
    lastFmTrack,
    personalFm
  };
});
