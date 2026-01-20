import { defineStore } from 'pinia';
import { ref } from 'vue';
import { proxyRequest } from '../services/api';
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
  const apiUrl = ref('');
  const cookie = ref('');
  const userProfile = ref<{nickname: string; avatarUrl: string; userId: number} | null>(null);
  const showLoginDialog = ref(false);
  const viewModeRequest = ref(''); // 'mine', 'home', etc.
  const playMode = ref<'normal' | 'fm'>('normal');
  const personalFm = ref<Track[]>([]);
  const lastFmTrack = ref<Track | null>(null);
  const fmLoading = ref(false);

  // HTML Audio Element
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
    isPlaying.value = false;
    loading.value = false;
    ElMessage.error('播放出错');
  };

  const setApiUrl = (url: string) => {
    apiUrl.value = url;
    localStorage.setItem('player_api_url', url);
  };

  const setCookie = (c: string) => {
    cookie.value = c;
  };

  const setUserProfile = (profile: any) => {
    userProfile.value = profile;
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
        const res = await proxyRequest(`${baseUrl}/song/url?id=${track.id}`, 'GET', headers, {});
        
        if (res.data?.data && res.data.data.length > 0) {
            const url = res.data.data[0].url;
            if (url) {
                let finalUrl = url;
                // If we are on HTTPS and the song URL is HTTP, use our backend proxy to avoid Mixed Content error
                if (location.protocol === 'https:' && url.startsWith('http:')) {
                    finalUrl = `/api/music-proxy?url=${encodeURIComponent(url)}`;
                }

                audioUrl.value = finalUrl;
                audio.src = finalUrl;

                // Check for cover image if missing
                if (!track.picUrl && !track.al?.picUrl && !track.album?.picUrl) {
                   try {
                       const detailRes = await proxyRequest(`${baseUrl}/song/detail?ids=${track.id}`, 'GET', headers, {});
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

                audio.play().catch(e => {
                    console.error('Play failed', e);
                    ElMessage.error('无法自动播放');
                });
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

  const togglePlay = () => {
    if (audio.paused) {
        if (audio.src) audio.play();
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
      }
  };

  const fmTrash = async () => {
      if (!currentTrack.value) return;
      const trackId = currentTrack.value.id;
      
      try {
        if (!apiUrl.value) throw new Error('API URL not set');
        let baseUrl = apiUrl.value.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        const headers = cookie.value ? { Cookie: cookie.value } : {};
        
        // /fm_trash?id=xxx
        await proxyRequest(`${baseUrl}/fm_trash?id=${trackId}&timestamp=${Date.now()}`, 'POST', headers, {});
        
        // Play next
        next();
      } catch (e) {
          console.error('Failed to trash FM song', e);
          ElMessage.error('操作失败');
      }
  };

  const addToQueue = (track: Track) => {
      if (!playlist.value.some(t => t.id === track.id)) {
          playlist.value.push(track);
          ElMessage.success('已添加到播放列表');
      }
  };

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
    fmTrash,
    fetchPersonalFm,
    lastFmTrack,
    personalFm
  };
});