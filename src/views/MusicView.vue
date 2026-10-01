<template>
  <div class="music-view" :style="{ paddingBottom: (playerStore.showPlayer && playerStore.currentTrack) ? (isMobile ? '85px' : '100px') : '20px' }">
    



    <!-- Main Content -->
    <div class="music-content" v-loading="loading">
      
      <!-- 音乐页头部：身份 + 主切换 + 搜索 + 线路/账号，合成一块，避免顶部堆两张卡 -->
      <section class="music-hero" v-if="viewMode === 'home' || viewMode === 'mine'">
         <div class="hero-head">
            <div class="hero-identity">
               <span class="hero-icon">
                  <img src="/music.png" class="hero-logo" alt="" aria-hidden="true" />
               </span>
               <div class="hero-text">
                  <h2 class="hero-title">{{ greeting }}{{ playerStore.userProfile ? '，' + playerStore.userProfile.nickname : '' }}</h2>
                  <p class="hero-sub">{{ HERO_SUB }}</p>
               </div>
            </div>

            <el-radio-group v-model="mainTab" size="small" class="hero-tabs" @change="handleMainTabChange">
               <el-radio-button label="home">首页</el-radio-button>
               <el-radio-button label="mine">歌单</el-radio-button>
               <el-radio-button label="podcast">播客</el-radio-button>
            </el-radio-group>
         </div>

         <div class="hero-bar">
             <!-- API Status (Left) -->
             <div class="api-status-wrapper">
                <el-dropdown v-if="currentApi" trigger="click" placement="bottom-start" @command="handleSwitchApi">
                   <button type="button" class="line-chip">
                     <span class="line-dot"></span>
                     <span class="line-name">{{ lineLabel(currentApi) }}</span>
                     <span v-if="currentApi.latency" class="line-latency">{{ currentApi.latency }}ms</span>
                     <el-icon :size="12" class="line-caret"><ArrowDown /></el-icon>
                   </button>
                   <template #dropdown>
                      <el-dropdown-menu>
                         <el-dropdown-item v-for="api in availableApis" :key="api.id" :command="api">
                            <span class="line-item">
                               <span class="line-name">{{ lineLabel(api) }}</span>
                               <span v-if="api.latency" class="line-latency">{{ api.latency }}ms</span>
                            </span>
                         </el-dropdown-item>
                         <el-dropdown-item v-if="availableApis.length === 0" disabled>无可用线路</el-dropdown-item>
                      </el-dropdown-menu>
                   </template>
                </el-dropdown>

                <span v-else-if="checkingApi" class="line-chip is-checking">
                  <el-icon class="is-loading" :size="12"><Loading /></el-icon>
                  正在寻找线路
                </span>
                <span v-else class="line-chip is-offline">
                  <span class="line-dot"></span>
                  无可用线路
                </span>
             </div>

             <!-- Search Box (Center/Bottom) -->
             <div class="search-box">
                 <el-input 
                   v-model="searchKeyword" 
                   placeholder="搜索歌曲、歌手、专辑..." 
                   class="search-input" 
                   @keyup.enter="handleSearch" 
                   clearable
                 >
                    <template #prefix>
                      <el-icon><Search /></el-icon>
                    </template>
                    <template #append>
                      <el-button @click="handleSearch" :loading="searchLoading">搜索</el-button>
                    </template>
                 </el-input>
             </div>

             <!-- User Controls (Right) -->
             <div class="header-right-actions">
                  <div class="api-actions">
                     <el-tooltip content="重新检测最佳线路" placement="bottom" v-if="!currentApi && !checkingApi">
                        <el-button circle size="small" :icon="Refresh" @click="findBestApi" />
                     </el-tooltip>
                  </div>

                  <!-- Login Entry -->
                  <div class="user-actions">
                      <template v-if="playerStore.userProfile">
                          <el-dropdown trigger="click" @command="handleUserCommand">
                              <div class="flex-center cursor-pointer" style="display: flex; align-items: center;">
                                  <el-avatar :size="30" :src="playerStore.userProfile.avatarUrl" style="margin-right: 8px;" />
                                  <span class="username" style="font-size: 14px; color: var(--el-text-color-regular); max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ playerStore.userProfile.nickname }}</span>
                              </div>
                              <template #dropdown>
                                  <el-dropdown-menu>
                                      <el-dropdown-item command="logout">退出登录</el-dropdown-item>
                                  </el-dropdown-menu>
                              </template>
                          </el-dropdown>
                      </template>
                      <el-button v-else link type="primary" size="small" @click="playerStore.showLoginDialog = true">
                         <span style="display: flex; align-items: center;">
                            <el-icon class="mr-1"><User /></el-icon> 登录
                         </span>
                      </el-button>
                  </div>
             </div>
         </div>
        <div class="search-type-selector mt-3" v-if="searchKeyword || searchResults.length > 0">
           <el-radio-group v-model="searchType" size="small" @change="handleSearch">
              <el-radio-button :value="1">单曲</el-radio-button>
              <el-radio-button :value="10">专辑</el-radio-button>
              <el-radio-button :value="100">歌手</el-radio-button>
           </el-radio-group>
        </div>
      </section>

      <!-- Search Results -->
      <div v-if="searchResults.length > 0" class="section mb-4">
        <div class="section-header">
           <div style="display: flex; align-items: center; gap: 8px;">
             <h3>搜索结果</h3>
             <el-select
               v-model="downloadQuality"
               size="small"
               style="width: 120px;"
             >
               <el-option label="标准" value="standard" />
               <el-option label="高" value="higher" />
               <el-option label="极高" value="exhigh" />
               <el-option label="无损" value="lossless" />
             </el-select>
           </div>
           <el-button link @click="clearSearch">清除</el-button>
        </div>
        
        <!-- Song List -->
        <div v-if="searchType === 1" class="song-list">
           <div v-for="song in searchResults" :key="song.id" class="song-item" @click="playSong(song)">
              <el-image :src="getCover(song)" class="song-cover" lazy>
                 <template #error><el-icon><Headset /></el-icon></template>
              </el-image>
              <div class="song-info">
                 <div class="song-name-row">
                   <div class="song-name" v-html="highlight(song.name)"></div>
                   <div v-if="isVipSong(song)" class="song-vip-badge">VIP</div>
                 </div>
                 <div class="song-artist">{{ getArtistName(song) }} - {{ song.al?.name || song.album?.name }}</div>
              </div>
              <div class="song-action">
                 <el-button circle size="small" :icon="Download" @click.stop="downloadSong(song)" />
              </div>
           </div>
        </div>

        <!-- Album Grid -->
        <div v-else-if="searchType === 10" class="album-grid">
           <div v-for="album in searchResults" :key="album.id" class="album-card" @click="openAlbum(album)">
              <el-image :src="album.picUrl" class="album-cover" lazy />
              <div class="album-name" v-html="highlight(album.name)"></div>
              <div class="album-artist">{{ album.artist?.name }}</div>
           </div>
        </div>

        <!-- Artist Grid -->
        <div v-else-if="searchType === 100" class="artist-grid">
           <div v-for="artist in searchResults" :key="artist.id" class="artist-card" @click="openArtist(artist)">
              <el-image :src="artist.picUrl" class="artist-cover" lazy />
              <div class="artist-name" v-html="highlight(artist.name)"></div>
           </div>
        </div>

        <!-- Pagination -->
        <div class="pagination-container mt-4" v-if="total > 0">
           <el-pagination
             background
             layout="prev, pager, next"
             :pager-count="isMobile ? 5 : 7"
             :small="isMobile"
             :total="total"
             :page-size="pageSize"
             v-model:current-page="currentPage"
             @current-change="handlePageChange"
             hide-on-single-page
           />
        </div>

      </div>

      <!-- Discovery Sections (Only show when no search) -->
      <template v-if="searchResults.length === 0">

      <Transition :name="transitionName" mode="out-in">
        <div v-if="viewMode === 'home'" key="home">
            <!-- Personalized Recommendations V2 (Home Only) -->
            <div class="section mb-4">
                <div class="personalized-grid-v2">
                    <!-- Left Column -->
                    <div class="left-col">
                    <!-- Daily Recommend -->
                    <div class="personalized-card-v2 daily-card-v2" @click="handleDailyRecommend">
                        <div class="card-icon-wrapper">
                            <el-icon :size="40" class="daily-icon"><Calendar /></el-icon>
                            <span class="daily-date">{{ currentDay }}</span>
                        </div>
                        <div class="card-text-v2">
                            <div class="card-title-v2">每日推荐</div>
                            <div class="card-desc-v2">根据你的音乐口味 · 每日更新</div>
                        </div>
                    </div>
                    
                    <!-- Liked Music -->
                    <div class="personalized-card-v2 like-card-v2" @click="handleLikedMusic">
                        <div class="card-icon-wrapper like-icon-wrapper">
                            <el-image v-if="likedPlaylistCover" :src="likedPlaylistCover" class="like-cover" fit="cover" />
                            <template v-else>
                                <div class="like-bg-stack"></div>
                                <el-icon :size="24" class="like-icon"><Star /></el-icon>
                            </template>
                        </div>
                        <div class="card-text-v2">
                            <div class="card-title-v2">喜欢的音乐</div>
                            <div class="card-desc-v2">发现你独特的音乐品味</div>
                        </div>
                    </div>
                    </div>

                    <!-- Right Column: Private FM -->
                <div class="right-col fm-card-v2" @click="handleFmPlay">
                    <div class="fm-bg-blur" :style="{ backgroundImage: `url(${(fmTrack && getCover(fmTrack)) || 'https://p2.music.126.net/6y-UleORITEDbvrOLV0Q8A==/5639395138885805.jpg'})` }"></div>
                    <div class="fm-content">
                    <div class="fm-cover-wrapper">
                        <el-image :src="(fmTrack && getCover(fmTrack)) || 'https://p2.music.126.net/6y-UleORITEDbvrOLV0Q8A==/5639395138885805.jpg'" class="fm-cover" fit="cover">
                        <template #placeholder><div class="fm-cover-placeholder"></div></template>
                        </el-image>
                        <div class="fm-tag">私人 FM</div>
                    </div>
                    <div class="fm-info-controls">
                            <div class="fm-info">
                                <div class="fm-title">{{ fmTrack?.name || '私人FM' }}</div>
                                <div class="fm-artist">
                                <el-icon><Headset /></el-icon> <span class="text-ellipsis">{{ fmTrack ? getArtistName(fmTrack) : '听见喜欢的音乐' }}</span>
                                </div>
                                <div class="fm-album" v-if="fmTrack">
                                <el-icon><Collection /></el-icon> <span class="text-ellipsis">{{ fmTrack?.al?.name || fmTrack?.album?.name || '未知专辑' }}</span>
                                </div>
                            </div>
                            
                            <div class="fm-controls">
                                <el-button circle size="large" class="fm-btn-play" @click.stop="handleFmPlay">
                                <el-icon :size="24" v-if="playerStore.playMode === 'fm' && playerStore.isPlaying"><VideoPause /></el-icon>
                                <el-icon :size="24" v-else><VideoPlay /></el-icon>
                                </el-button>
                                <el-button circle class="fm-btn-sub fm-btn-next" @click.stop="handleFmNext">
                                <el-icon :size="20"><CaretRight /></el-icon>
                                </el-button>
                                <el-button circle class="fm-btn-sub fm-btn-trash" @click.stop="handleFmTrash">
                                <el-icon :size="18"><Delete /></el-icon>
                                </el-button>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            </div>
                
            <!-- Radar Playlist (Home Preview) -->
            <div class="section mb-4">
                <div class="section-header">
                    <h3 @click="openMore('radar')" class="cursor-pointer">雷达歌单</h3>
                    <el-button link @click="openMore('radar')">更多 <el-icon><ArrowRight /></el-icon></el-button>
                </div>
                <el-skeleton :loading="radarLoading || radarPlaylists.length === 0" animated :count="1">
                    <template #template>
                    <div class="playlist-grid mobile-scroll">
                        <div v-for="i in 7" :key="i" class="playlist-card">
                        <div class="cover-wrapper">
                            <el-skeleton-item variant="image" style="width: 100%; height: 100%;" />
                        </div>
                        <el-skeleton-item variant="text" style="width: 80%" />
                        </div>
                    </div>
                    </template>
                    <template #default>
                    <div class="playlist-grid mobile-scroll">
                        <div v-for="list in radarPlaylists.slice(0, 7)" :key="list.id" class="playlist-card" @click="openPlaylist(list)">
                            <div class="cover-wrapper">
                                <el-image :src="list.coverImgUrl || list.picUrl" class="playlist-cover" lazy />
                                <div class="play-count"><el-icon><Headset /></el-icon> {{ formatCount(list.playCount) }}</div>
                            </div>
                            <div class="playlist-name">{{ list.name }}</div>
                        </div>
                        </div>
                    </template>
                </el-skeleton>
            </div>

            <!-- Recommended Playlist (Home Preview) -->
            <div class="section mb-4">
                <div class="section-header">
                    <h3 @click="openMore('recommend')" class="cursor-pointer">推荐歌单</h3>
                    <el-button link @click="openMore('recommend')">更多 <el-icon><ArrowRight /></el-icon></el-button>
                </div>
                <el-skeleton :loading="recommendLoading || recommendPlaylists.length === 0" animated>
                    <template #template>
                    <div class="playlist-grid mobile-scroll">
                        <div v-for="i in 7" :key="i" class="playlist-card">
                        <div class="cover-wrapper">
                            <el-skeleton-item variant="image" style="width: 100%; height: 100%;" />
                        </div>
                        <el-skeleton-item variant="text" style="width: 80%" />
                        </div>
                    </div>
                    </template>
                    <template #default>
                    <div class="playlist-grid mobile-scroll">
                        <div v-for="list in recommendPlaylists.slice(0, 7)" :key="list.id" class="playlist-card" @click="openPlaylist(list)">
                            <div class="cover-wrapper">
                                <el-image :src="list.picUrl || list.coverImgUrl" class="playlist-cover" lazy />
                                <div class="play-count"><el-icon><Headset /></el-icon> {{ formatCount(list.playCount) }}</div>
                            </div>
                            <div class="playlist-name">{{ list.name }}</div>
                        </div>
                        </div>
                    </template>
                </el-skeleton>
            </div>

            <!-- Rankings (Home Preview) -->
            <div class="section mb-4">
                <div class="section-header">
                    <h3 @click="openMore('rank')" class="cursor-pointer">排行榜</h3>
                    <el-button link @click="openMore('rank')">更多 <el-icon><ArrowRight /></el-icon></el-button>
                </div>
                
                <!-- Home View: List Layout -->
                <el-skeleton :loading="topList.length === 0" animated>
                    <template #template>
                    <div class="rank-grid">
                        <div v-for="i in 4" :key="i" class="rank-card">
                        <div class="rank-cover-wrapper">
                            <el-skeleton-item variant="image" style="width: 100%; height: 100%; border-radius: 8px;" />
                        </div>
                        <div class="rank-songs">
                            <div class="rank-song-row" style="white-space: normal; text-overflow: clip;">
                            <el-skeleton-item variant="text" style="width: 80%" />
                            </div>
                            <div class="rank-song-row" style="white-space: normal; text-overflow: clip;">
                            <el-skeleton-item variant="text" style="width: 80%" />
                            </div>
                            <div class="rank-song-row" style="white-space: normal; text-overflow: clip;">
                            <el-skeleton-item variant="text" style="width: 80%" />
                            </div>
                        </div>
                        <div class="playlist-name" v-if="isMobile">
                            <el-skeleton-item variant="text" style="width: 60%" />
                        </div>
                        </div>
                    </div>
                    </template>
                    <template #default>
                    <div class="rank-grid">
                        <div v-for="rank in topList.slice(0, 4)" :key="rank.id" class="rank-card" @click="openPlaylist(rank)">
                        <div class="rank-cover-wrapper">
                            <el-image :src="rank.coverImgUrl" class="rank-cover" lazy />
                        </div>
                        <div class="rank-songs">
                            <div v-for="(song, idx) in rank.tracks.slice(0, 3)" :key="idx" class="rank-song-row">
                            <span class="rank-num">{{ Number(idx) + 1 }}</span>
                            <span class="rank-song-name">{{ song.first }}</span>
                            <span class="rank-song-artist">- {{ song.second }}</span>
                            </div>
                        </div>
                        <div class="playlist-name" v-if="isMobile">{{ rank.name }}</div>
                        </div>
                    </div>
                    </template>
                </el-skeleton>
            </div>
        </div>

        <div v-else-if="viewMode === 'mine'" key="mine">
            <!-- User Playlists (Mine) -->
            <div class="section mb-4">
                <Transition :name="subTransitionName" mode="out-in">
                <!-- Playlist View -->
                <div v-if="mineSubMode === 'playlist'" key="playlist">
                <el-skeleton :loading="userPlaylistLoading" animated>
                    <template #template>
                        <div class="playlist-grid">
                            <el-skeleton-item variant="image" style="width: 100%; height: 120px; border-radius: 8px;" v-for="i in 6" :key="i" />
                        </div>
                    </template>
                    <template #default>
                        <div class="playlist-grid">
                            <div v-for="list in userPlaylists" :key="list.id" class="playlist-card" @click="openPlaylist(list)">
                                <div class="cover-wrapper">
                                    <el-image :src="list.coverImgUrl || list.picUrl" class="playlist-cover" lazy />
                                    <div class="play-count"><el-icon><Headset /></el-icon> {{ formatCount(list.playCount) }}</div>
                                    <div v-if="playerStore.userProfile?.userId === list.userId" class="delete-btn-wrapper" @click.stop="handleDeletePlaylist(list)">
                                        <el-icon><Delete /></el-icon>
                                    </div>
                                </div>
                                <div class="playlist-name">{{ list.name }}</div>
                            </div>
                        </div>
                        <div v-if="!userPlaylistLoading && userPlaylists.length === 0" class="text-center text-gray-500 py-10">
                            暂无歌单
                        </div>
                    </template>
                </el-skeleton>
                
                <div class="pagination-container mt-4" v-if="userPlaylistTotal > 0">
                <el-pagination
                    background
                    layout="prev, pager, next"
                    :pager-count="isMobile ? 5 : 7"
                    :small="isMobile"
                    :total="userPlaylistTotal"
                    :page-size="10"
                    v-model:current-page="userPlaylistPage"
                    @current-change="handleUserPageChange"
                    hide-on-single-page
                />
                </div>
                </div>

                <!-- Podcast View -->
                <div v-else-if="mineSubMode === 'podcast'" key="podcast">
                <el-skeleton :loading="userPodcastLoading" animated>
                    <template #template>
                        <div class="playlist-grid">
                            <el-skeleton-item variant="image" style="width: 100%; height: 120px; border-radius: 8px;" v-for="i in 6" :key="i" />
                        </div>
                    </template>
                    <template #default>
                        <div class="playlist-grid">
                            <div v-for="item in userPodcasts" :key="item.id" class="playlist-card" @click="openPodcast(item)">
                                <div class="cover-wrapper">
                                    <el-image :src="item.picUrl" class="playlist-cover" lazy />
                                    <div class="play-count"><el-icon><Headset /></el-icon> {{ formatCount(item.subCount || 0) }}</div>
                                </div>
                                <div class="playlist-name">{{ item.name }}</div>
                            </div>
                        </div>
                        <div v-if="!userPodcastLoading && userPodcasts.length === 0" class="text-center text-gray-500 py-10">
                            暂无收藏的播客
                        </div>
                    </template>
                </el-skeleton>
                
                <div class="pagination-container mt-4" v-if="userPodcastTotal > 0">
                    <el-pagination
                    background
                    layout="prev, pager, next"
                    :pager-count="isMobile ? 5 : 7"
                    :small="isMobile"
                    :total="userPodcastTotal"
                    :page-size="10"
                    v-model:current-page="userPodcastPage"
                    @current-change="handleUserPodcastPageChange"
                    hide-on-single-page
                    />
                </div>
                </div>
                </Transition>
            </div>
        </div>

        <div v-else-if="viewMode === 'radar'" key="radar">
            <div class="section mb-4">
                <div class="section-header">
                    <h3>雷达歌单</h3>
                </div>
                <el-skeleton :loading="radarLoading || radarPlaylists.length === 0" animated :count="1">
                    <template #template>
                    <div class="playlist-grid">
                        <div v-for="i in 12" :key="i" class="playlist-card">
                        <div class="cover-wrapper">
                            <el-skeleton-item variant="image" style="width: 100%; height: 100%;" />
                        </div>
                        <el-skeleton-item variant="text" style="width: 80%" />
                        </div>
                    </div>
                    </template>
                    <template #default>
                    <div class="playlist-grid">
                        <div v-for="list in radarPlaylists" :key="list.id" class="playlist-card" @click="openPlaylist(list)">
                            <div class="cover-wrapper">
                                <el-image :src="list.coverImgUrl || list.picUrl" class="playlist-cover" lazy />
                                <div class="play-count"><el-icon><Headset /></el-icon> {{ formatCount(list.playCount) }}</div>
                            </div>
                            <div class="playlist-name">{{ list.name }}</div>
                        </div>
                        </div>
                    </template>
                </el-skeleton>
            </div>
        </div>

        <div v-else-if="viewMode === 'recommend'" key="recommend">
             <div class="section mb-4">
                <div class="section-header">
                    <h3>推荐歌单</h3>
                </div>
                <el-skeleton :loading="recommendLoading || recommendPlaylists.length === 0" animated>
                    <template #template>
                    <div class="playlist-grid">
                        <div v-for="i in 12" :key="i" class="playlist-card">
                        <div class="cover-wrapper">
                            <el-skeleton-item variant="image" style="width: 100%; height: 100%;" />
                        </div>
                        <el-skeleton-item variant="text" style="width: 80%" />
                        </div>
                    </div>
                    </template>
                    <template #default>
                    <div class="playlist-grid">
                        <div v-for="list in recommendPlaylists" :key="list.id" class="playlist-card" @click="openPlaylist(list)">
                            <div class="cover-wrapper">
                                <el-image :src="list.picUrl || list.coverImgUrl" class="playlist-cover" lazy />
                                <div class="play-count"><el-icon><Headset /></el-icon> {{ formatCount(list.playCount) }}</div>
                            </div>
                            <div class="playlist-name">{{ list.name }}</div>
                        </div>
                        </div>
                    </template>
                </el-skeleton>
            </div>
        </div>

        <div v-else-if="viewMode === 'rank'" key="rank">
            <div class="section mb-4">
                <div class="section-header">
                    <h3>排行榜</h3>
                </div>
                <el-skeleton :loading="topList.length === 0" animated>
                    <template #template>
                    <div class="playlist-grid">
                        <div v-for="i in 8" :key="i" class="playlist-card">
                        <div class="cover-wrapper">
                            <el-skeleton-item variant="image" style="width: 100%; height: 100%;" />
                        </div>
                        <el-skeleton-item variant="text" style="width: 80%" />
                        </div>
                    </div>
                    </template>
                    <template #default>
                    <div class="playlist-grid">
                        <div v-for="rank in topList" :key="rank.id" class="playlist-card" @click="openPlaylist(rank)">
                        <div class="cover-wrapper">
                            <el-image :src="rank.coverImgUrl" class="playlist-cover" lazy />
                            <div class="play-count"><el-icon><Headset /></el-icon> {{ formatCount(rank.playCount) }}</div>
                        </div>
                        <div class="playlist-name">{{ rank.name }}</div>
                        </div>
                    </div>
                    </template>
                </el-skeleton>
            </div>
        </div>
      </Transition>

      </template>

    </div>

    <!-- Login Dialog -->
    <el-dialog v-model="playerStore.showLoginDialog" title="网易云扫码登录" width="300px" center append-to-body>
       <div class="login-container">
          <div v-if="qrImg" class="qr-code">
             <div class="qr-wrapper">
                 <img :src="qrImg" alt="QR Code" :class="{ 'expired': loginStatus === '二维码已过期' }" />
                 <div class="qr-overlay" v-if="loginStatus === '二维码已过期'" @click="refreshLogin">
                     <el-icon :size="30"><Refresh /></el-icon>
                     <span>点击刷新</span>
                 </div>
             </div>
             <div class="qr-status">{{ loginStatus }}</div>
             <div class="mt-2" v-if="loginStatus !== '二维码已过期'">
                <el-button link type="primary" size="small" @click="refreshLogin">
                   <el-icon class="mr-1"><Refresh /></el-icon> 刷新二维码
                </el-button>
             </div>
          </div>
          <div v-else class="loading-qr">
             <el-icon class="is-loading" size="30"><Loading /></el-icon>
             <p>正在获取二维码...</p>
          </div>
       </div>
    </el-dialog>

    <!-- 播单详情 -->
    <el-dialog v-model="showPlaylistDialog" title="播单" fullscreen class="playlist-dialog" append-to-body>
      <div class="pl-page">
        <!-- 歌单信息 + 操作 -->
        <header class="pl-hero">
          <el-image
            class="pl-cover"
            :src="currentPlaylist?.coverImgUrl || currentPlaylist?.picUrl"
            fit="cover"
            :preview-src-list="currentPlaylist?.coverImgUrl || currentPlaylist?.picUrl ? [currentPlaylist.coverImgUrl || currentPlaylist.picUrl] : []"
            preview-teleported
          >
            <template #error><div class="pl-cover-fallback"></div></template>
          </el-image>

          <div class="pl-info">
            <h2 class="pl-name" :title="currentPlaylist?.name">{{ currentPlaylist?.name || '歌单' }}</h2>
            <p class="pl-meta">{{ totalPlaylistTracks }} 首</p>
          </div>

          <div class="pl-actions">
            <!-- 刷新：接口对相同地址会缓存两分钟，加时间戳重拉一次，刚改过的歌单立刻能看到 -->
            <el-button
              circle
              text
              :icon="Refresh"
              :loading="playlistRefreshing"
              title="刷新播单"
              @click.stop="refreshCurrentPlaylist"
            />

            <template v-if="!isSelectionMode">
              <el-select v-model="downloadQuality" class="pl-quality">
                <el-option label="标准" value="standard" />
                <el-option label="高" value="higher" />
                <el-option label="极高" value="exhigh" />
                <el-option label="无损" value="lossless" />
              </el-select>

              <el-button round @click.stop="toggleSelectionMode">选择下载</el-button>
            </template>

            <template v-else>
              <el-checkbox
                :model-value="isPageAllSelected"
                :indeterminate="isPageIndeterminate"
                @change="handlePageSelectAll"
              >
                本页全选
              </el-checkbox>
              <el-button round @click.stop="toggleSelectionMode">取消</el-button>
              <el-button
                type="success"
                round
                :disabled="selectedTracks.length === 0"
                @click.stop="executeBatchDownload"
              >
                下载 ({{ selectedTracks.length }}<el-icon v-if="batchDownloadLoading" class="is-loading" style="margin-left: 4px;"><Loading /></el-icon>)
              </el-button>
            </template>

            <!-- 翻页跟着操作按钮排在信息条里 -->
            <div v-if="totalPages > 1" class="pl-pager">
              <el-button
                circle
                text
                :icon="ArrowLeft"
                :disabled="playlistPage === 1"
                @click.stop="playlistPage--"
              />
              <span class="pl-page-num">{{ playlistPage }} / {{ totalPages }}</span>
              <el-button
                circle
                text
                :icon="ArrowRight"
                :disabled="playlistPage >= totalPages"
                @click.stop="playlistPage++"
              />
            </div>
          </div>
        </header>

        <!-- 歌曲列表 -->
        <div class="pl-list">
          <el-table
            ref="playlistTableRef"
            :data="pagedPlaylistTracks"
            :show-header="false"
            style="width: 100%;"
            v-loading="playlistLoading"
            @row-click="playSong"
            :row-style="{ height: '60px' }"
            row-key="id"
          >
            <el-table-column v-if="isSelectionMode" width="55">
              <template #default="{ row }">
                 <el-checkbox
                   :model-value="isSelected(row)"
                   @click.stop
                   @change="(val: boolean) => toggleRowSelection(row, val)"
                 />
              </template>
            </el-table-column>
            <el-table-column
              type="index"
              class-name="pl-index-cell"
              :width="isMobile ? 44 : 56"
              :index="(i: number) => (playlistPage - 1) * 10 + i + 1"
            />
            <el-table-column min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="song-row-content">
                <el-image 
                  v-if="!['album', 'artist'].includes(currentPlaylist?.type)"
                  :src="row.al?.picUrl || row.album?.picUrl || row.coverImgUrl" 
                  class="song-row-cover" 
                  lazy
                >
                  <template #error><div class="song-row-cover-placeholder"></div></template>
                </el-image>
                <div class="song-row-info">
                  <div class="song-row-name-row">
                    <div class="song-row-name">{{ row.name }}</div>
                    <div v-if="isVipSong(row)" class="song-vip-badge">VIP</div>
                  </div>
                  <div class="song-row-artist">{{ getArtistName(row) }}</div>
                </div>
                <div class="song-row-duration">{{ formatDuration(row.dt || row.duration) }}</div>
              </div>
            </template>
            </el-table-column>
          </el-table>
        </div>

      </div>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import {
    ref,
    onMounted,
    onUnmounted,
    onActivated,
    onDeactivated,
    nextTick,
    watch,
    computed,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTitle } from '@vueuse/core';
import { usePlayerStore } from '../stores/player';
import { useLayoutStore } from '../stores/layout';
import { proxyRequest, getMusicApis } from '../services/api';
import { musicCache } from '../utils/cache'; // Import CacheManager
import { downloadDirect, proxyUrl } from '../utils/music-source';
import { ElMessage, ElMessageBox } from 'element-plus';
import { setPageShareMeta } from '../utils/page-share';
import { Search, Loading, Headset, VideoPlay, Download, ArrowLeft, ArrowRight, Refresh, ArrowDown, Calendar, Star, CaretRight, Delete, VideoPause, Collection, User } from '@element-plus/icons-vue';

defineOptions({
  name: 'MusicView'
});

const router = useRouter();
const route = useRoute();
const playerStore = usePlayerStore();
const layoutStore = useLayoutStore();
const pageHeaderRef = ref<HTMLElement | null>(null);

// Title & Description Management
const documentTitleRef = useTitle();
watch(() => playerStore.currentTrack, (track) => {
  if (track) {
    documentTitleRef.value = track.name;
    
    const artist = track.ar?.map((a: any) => a.name).join('/') || track.artists?.map((a: any) => a.name).join('/') || '未知歌手';
    const album = track.al?.name || track.album?.name || '';
    
    const desc = `歌手：${artist}${album ? ` | 专辑：${album}` : ''}`;
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', desc);
  } else {
    documentTitleRef.value = 'OpenStore | 音乐';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', '畅听海量音乐，发现你的专属歌单。');
  }
}, { immediate: true });

// Greeting Logic
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '上午好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const currentDay = ref(new Date().getDate());



// FM Logic
const fmTrack = computed(() => {
  // If we have a last played FM track, always show it
  // unless we are currently playing FM, then show current track
  if (playerStore.playMode === 'fm' && playerStore.currentTrack) {
    // Check if currentTrack is actually an FM track (to prevent flashing regular songs)
    const isFmSong = playerStore.personalFm.some((t: any) => t.id === playerStore.currentTrack?.id);
    if (isFmSong) return playerStore.currentTrack;
  }
  return playerStore.lastFmTrack;
});

const handleFmPlay = async (e?: Event) => {
  e?.stopPropagation();
  // If currently in FM mode, toggle play
  if (playerStore.playMode === 'fm') {
    playerStore.togglePlay();
  } else {
    // If not in FM mode, switch to FM mode
    // If we have a last FM track, try to resume it or just play FM
    await playerStore.playFm();
  }
};

const handleFmNext = async (e: Event) => {
  e.stopPropagation();
  await playerStore.next();
};

const handleFmTrash = async (e: Event) => {
  e.stopPropagation();
  await playerStore.fmTrash();
};

// Mobile Check
const isMobile = ref(false);
const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768;
};

// API State
const currentApi = ref<any>(null);
const checkingApi = ref(true);
const loading = ref(false);
const availableApis = ref<any[]>([]);
/** 线路编号：对外只说「路线 N」，不暴露上游真实地址 */
const lineNumbers = ref<Record<string, number>>({});

const lineKey = (api: any) => String(api?.id ?? api?.url ?? '');

const lineLabel = (api: any) => {
  const n = lineNumbers.value[lineKey(api)];
  return n ? `路线 ${n}` : '线路';
};

const qrImg = ref('');
const loginStatus = ref('');
let loginTimer: any = null;
let unikey = '';

// Content State
const searchKeyword = ref('');
const searchType = ref(1); // 1: Song, 10: Album, 100: Artist
const searchLoading = ref(false);
const searchResults = ref<any[]>([]);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);
const radarPlaylists = ref<any[]>([]);
const radarLoading = ref(false);
const recommendPlaylists = ref<any[]>([]);
const recommendLoading = ref(false);
const topList = ref<any[]>([]);
const userPlaylists = ref<any[]>([]);
const userPlaylistLoading = ref(false);
const userPlaylistPage = ref(1);
const userPlaylistTotal = ref(0);

// Podcast State
const userPodcasts = ref<any[]>([]);
const userPodcastLoading = ref(false);
const userPodcastPage = ref(1);
const userPodcastTotal = ref(0);

// Playlist Dialog
const showPlaylistDialog = ref(false);
const currentPlaylist = ref<any>(null);
const playlistTracks = ref<any[]>([]);
const totalPlaylistTracks = ref(0);
const playlistLoading = ref(false);
const playlistPage = ref(1);

const pagedPlaylistTracks = computed(() => {
    const start = (playlistPage.value - 1) * 10;
    return playlistTracks.value.slice(start, start + 10);
});

// View Mode
const viewMode = ref<'home' | 'radar' | 'recommend' | 'rank' | 'mine'>('home');
const mineSubMode = ref<'playlist' | 'podcast'>('playlist');

const transitionName = ref('slide-left');
const subTransitionName = ref('slide-left');

watch(viewMode, (newVal, oldVal) => {
  const order = ['home', 'mine'];
  const newIndex = order.indexOf(newVal);
  const oldIndex = order.indexOf(oldVal);
  
  if (newIndex !== -1 && oldIndex !== -1) {
    transitionName.value = newIndex > oldIndex ? 'slide-left' : 'slide-right';
  } else {
    // Default transition for other views
    transitionName.value = 'fade';
  }
});

watch(mineSubMode, (newVal, oldVal) => {
  const order = ['playlist', 'podcast'];
  const newIndex = order.indexOf(newVal);
  const oldIndex = order.indexOf(oldVal);
  subTransitionName.value = newIndex > oldIndex ? 'slide-left' : 'slide-right';
});

const mainTab = computed({
  get: () => {
    if (viewMode.value === 'mine') {
        return mineSubMode.value === 'podcast' ? 'podcast' : 'mine';
    }
    return 'home';
  },
  set: (val) => {
    if (val === 'mine') {
       mineSubMode.value = 'playlist';
       openMore('mine');
    } else if (val === 'podcast') {
       mineSubMode.value = 'podcast';
       openMore('mine');
    } else {
       viewMode.value = 'home';
       pageTitle.value = '在线播放';
       layoutStore.setPageInfo('在线播放', true, goBack);
    }
  }
});

const handleMainTabChange = () => {
   // Logic handled by computed setter
};

const pageTitle = ref('在线播放');

const goBack = () => {
    if (viewMode.value !== 'home') {
        viewMode.value = 'home';
        pageTitle.value = '在线播放';
        layoutStore.setPageInfo('在线播放', true, goBack);
        playerStore.viewModeRequest = ''; // Reset request
        return;
    }
    router.push('/');
};

const closePlaylistDialog = () => {
    showPlaylistDialog.value = false;
};

const restorePageTitle = () => {
    let title = '在线播放';
    if (viewMode.value === 'radar') title = '雷达歌单';
    else if (viewMode.value === 'recommend') title = '推荐歌单';
    else if (viewMode.value === 'rank') title = '排行榜';
    else if (viewMode.value === 'mine') title = '我的歌单';
    
    pageTitle.value = title;
    layoutStore.setPageInfo(title, true, goBack);
    document.title = `OpenStore | ${title}`;
};

watch(showPlaylistDialog, (val) => {
    if (val) {
         const title = '歌单';
         layoutStore.setPageInfo(title, true, closePlaylistDialog);
         document.title = `OpenStore | ${title}`;
    } else if (route.path === '/music') {
         // 只有还留在音乐页时才把标题还原；已经跳到别的页面，标题交给路由自己管
         restorePageTitle();
    }
});

/*
 * 歌单详情是 teleport 到 body 的全屏弹窗，而 MusicView 又被 keep-alive 缓存：
 * 从歌单里点开歌曲后跳去播放页，弹窗不会自己关，会整个盖住播放页。
 * 所以只要路由离开音乐页，就把弹窗一并收掉。
 */
watch(
    () => route.path,
    (path) => {
        if (path !== '/music' && showPlaylistDialog.value) {
            showPlaylistDialog.value = false;
        }
    }
);

// 双保险：只要音乐页被切走（含 keep-alive 的失活），歌单 / 播客弹窗一律收掉
onDeactivated(() => {
    if (showPlaylistDialog.value) {
        showPlaylistDialog.value = false;
    }
});

/*
 * 音乐页的分享卡片（浏览器标题 + og 图）跟着页面上那张图走：
 * - 正在放歌        → 歌名 / 歌手 / 网易云封面
 * - 首页（没在放歌）→ 私人 FM 卡片那张网易云图 + 图旁边那行字
 * - 更多歌单        → 第一张歌单的封面 + 歌单名
 * 只在音乐页生效，否则会被 keep-alive 保活的这个组件串到别的页面去。
 */

/* 首页那三个「更多」列表：分享时用第一张歌单的封面 */
const SECTION_TITLES: Record<string, string> = {
    radar: '雷达歌单',
    recommend: '推荐歌单',
    rank: '排行榜',
};

/** 音乐页顶部的图标（hero 上那张）和它下面那行字：首页分享就用这两个 */
const HERO_LOGO = '/music.png';
const HERO_SUB = '每日推荐 · 歌单 · 排行榜，由此开启好心情 ~';

const sectionMode = computed(() => (SECTION_TITLES[viewMode.value] ? viewMode.value : ''));

const firstSectionPlaylist = computed(() => {
    if (viewMode.value === 'radar') return radarPlaylists.value[0] || null;
    if (viewMode.value === 'recommend') return recommendPlaylists.value[0] || null;
    if (viewMode.value === 'rank') return topList.value[0] || null;
    return null;
});

const playlistCover = (list: any) => list?.coverImgUrl || list?.picUrl || list?.cover || '';

const syncSongShareMeta = async () => {
    if (window.location.pathname !== '/music') return;

    /*
     * 更多歌单：卡片用第一张歌单的封面和它的名字。
     * 地址上写下 ?view=，分享出去的链接服务端才知道该渲染哪个列表的封面。
     */
    if (sectionMode.value) {
        const mode = sectionMode.value;
        if (String(route.query.view || '') !== mode) {
            await router.replace({ path: '/music', query: { ...route.query, view: mode } });
        }
        const first = firstSectionPlaylist.value;
        const title = `OpenStore | ${SECTION_TITLES[mode]}`;
        setPageShareMeta({
            title,
            description: first?.name || '畅听海量音乐，发现你的专属歌单。',
            image: playlistCover(first) || HERO_LOGO,
        });
        await nextTick();
        document.title = title;
        return;
    }

    const track = playerStore.currentTrack;
    if (track) {
        // 地址上带住歌曲 id，分享出去的链接才能让服务端渲染出歌曲卡片
        if (String(route.query.track || '') !== String(track.id)) {
            await router.replace({ path: '/music', query: { ...route.query, track: String(track.id) } });
        }

        setPageShareMeta({
            title: track.name,
            description: getArtistName(track),
            image: getCover(track),
        });
        /*
         * 标签页标题保持纯歌名（这个页面原来的行为）。
         * 注册分享信息会触发 App 里的 applyPageMeta 写成「站点名 | 歌名」，所以等它跑完再覆盖。
         */
        await nextTick();
        document.title = track.name;
        return;
    }

    /*
     * 首页没在放歌：分享图和副标题就用页面上那张音乐图标 + 它下面那行字。
     * 顺手把地址上残留的歌曲 id 去掉，免得分享出去的链接还是上一首歌的卡片。
     */
    if (route.query.track) {
        const query = { ...route.query };
        delete query.track;
        await router.replace({ path: '/music', query });
    }

    const title = 'OpenStore | 音乐';
    setPageShareMeta({
        title,
        description: HERO_SUB,
        image: HERO_LOGO,
    });
    await nextTick();
    document.title = title;
};

watch(() => playerStore.currentTrack?.id, syncSongShareMeta, { immediate: true });
// 栏目切换 / 第一张歌单加载出来 / FM 换歌时，卡片跟着刷新
watch(
    [
        viewMode,
        () => radarPlaylists.value[0]?.id,
        () => recommendPlaylists.value[0]?.id,
        () => topList.value[0]?.id,
    ],
    syncSongShareMeta
);
// 从播放页返回音乐页时，把分享卡片再刷回当前歌曲
onActivated(syncSongShareMeta);

/*
 * 音乐页刷新后不再把上一首还原回来：这里不是播放页，
 * 还原了只会平白挂一条暂停的迷你播放器在页面上。
 * 歌曲只在「正在播放」页刷新时才接着放（见 PlayerView 的 restore*）。
 */

const openMore = async (mode: 'radar' | 'recommend' | 'rank' | 'mine') => {
    if (!currentApi.value) return;
    
    // Clear search results when switching views
    clearSearch();

    viewMode.value = mode;
    const baseUrl = currentApi.value.baseUrl;
    
    let title = '';
    if (mode === 'radar') title = '雷达歌单';
    else if (mode === 'recommend') title = '推荐歌单';
    else if (mode === 'rank') title = '排行榜';
    else if (mode === 'mine') title = '我的歌单';
    
    pageTitle.value = title;
    layoutStore.setPageInfo(title, true, goBack);
    
    if (mode === 'radar') {
        if (radarPlaylists.value.length <= 7) {
             radarLoading.value = true;
             try {
                 const res = await proxyRequest(`${baseUrl}/personalized?limit=50`, 'GET', {}, null);
                 if (res.data?.result) radarPlaylists.value = res.data.result;
             } finally {
                 radarLoading.value = false;
             }
        }
    } else if (mode === 'recommend') {
        if (recommendPlaylists.value.length <= 7) {
             recommendLoading.value = true;
             try {
                 const res = await proxyRequest(`${baseUrl}/top/playlist/highquality?limit=50`, 'GET', {}, null);
                 if (res.data?.playlists) recommendPlaylists.value = res.data.playlists;
             } finally {
                 recommendLoading.value = false;
             }
        }
    } else if (mode === 'rank') {
    } else if (mode === 'mine') {
        if (mineSubMode.value === 'playlist') {
            if (userPlaylists.value.length === 0) fetchUserPlaylists();
        } else if (mineSubMode.value === 'podcast') {
            if (userPodcasts.value.length === 0) fetchUserPodcasts();
        }
    }
};

const fetchUserPodcasts = async () => {
    if (!currentApi.value) return;
    
    userPodcastLoading.value = true;
    try {
        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        
        const limit = 10;
        const offset = (userPodcastPage.value - 1) * limit;

        const res = await proxyRequest(`${baseUrl}/dj/sublist?limit=${limit}&offset=${offset}&cookie=${cookieEncoded}`, 'GET', headers, {});
        
        console.log('DJ Sublist Response:', res.data);

        if (res.data?.djRadios) {
            userPodcasts.value = res.data.djRadios;
            userPodcastTotal.value = res.data.count || res.data.djRadios.length; 
        }
        
    } catch (e) {
        console.error(e);
        ElMessage.error('获取播客失败');
    } finally {
        userPodcastLoading.value = false;
    }
};

const fetchUserPlaylists = async () => {
    if (!currentApi.value || !playerStore.userProfile?.userId) return;
    
    userPlaylistLoading.value = true;
    try {
        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        
        const limit = 10;
        const offset = (userPlaylistPage.value - 1) * limit;

        const [listRes, countRes] = await Promise.all([
            proxyRequest(`${baseUrl}/user/playlist?uid=${playerStore.userProfile.userId}&limit=${limit}&offset=${offset}&cookie=${cookieEncoded}`, 'GET', headers, {}),
            proxyRequest(`${baseUrl}/user/subcount?cookie=${cookieEncoded}`, 'POST', headers, {}) // subcount often needs POST
        ]);

        if (listRes.data?.playlist) {
            userPlaylists.value = listRes.data.playlist;
        }
        
        if (countRes.data) {
             userPlaylistTotal.value = (countRes.data.createdPlaylistCount || 0) + (countRes.data.subPlaylistCount || 0);
        }
    } catch (e) {
        ElMessage.error('获取用户歌单失败');
    } finally {
        userPlaylistLoading.value = false;
    }
};

const handleUserPageChange = (page: number) => {
    userPlaylistPage.value = page;
    fetchUserPlaylists();
};

const handleDeletePlaylist = async (playlist: any) => {
    if (!currentApi.value) return;
    
    // Check if user is the owner
    if (playerStore.userProfile?.userId !== playlist.userId) {
        ElMessage.warning('只能删除自己创建的歌单');
        return;
    }

    try {
        await ElMessageBox.confirm(
            `确定要删除歌单 "${playlist.name}" 吗？此操作无法撤销。`,
            '删除确认',
            {
                confirmButtonText: '删除',
                cancelButtonText: '取消',
                type: 'warning',
            }
        );

        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        
        // Call delete API
        const res = await proxyRequest(`${baseUrl}/playlist/delete?id=${playlist.id}&cookie=${cookieEncoded}`, 'POST', headers, {});
        
        if (res.data?.code === 200) {
            ElMessage.success('删除成功');
            fetchUserPlaylists(); // Refresh list
        } else {
             ElMessage.error(res.data?.msg || '删除失败');
        }

    } catch (e) {
        if (e !== 'cancel') {
             ElMessage.error('删除操作失败');
             console.error(e);
        }
    }
};

const handleUserPodcastPageChange = (page: number) => {
    userPodcastPage.value = page;
    fetchUserPodcasts();
};

const openPodcast = (podcast: any) => {
    openDjRadio(podcast);
};

const fetchPodcastPrograms = async (radio: any, offset: number, limit: number) => {
    if (!currentApi.value) return;
    
    playlistLoading.value = true;
    try {
        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        
        const res = await proxyRequest(`${baseUrl}/dj/program?rid=${radio.id}&limit=${limit}&offset=${offset}&cookie=${cookieEncoded}`, 'GET', headers, {});
        
        if (res.data?.programs) {
            const tracks = res.data.programs.map((p: any) => ({
                id: p.mainSong.id,
                name: p.name,
                ar: p.dj ? [{ name: p.dj.nickname }] : [],
                al: { ...radio, picUrl: p.coverUrl },
                dt: p.duration,
                picUrl: p.coverUrl
            }));
            
            for (let i = 0; i < tracks.length; i++) {
                if (offset + i < playlistTracks.value.length) {
                    playlistTracks.value[offset + i] = tracks[i];
                }
            }
        }
    } catch (e) {
        console.error(e);
        ElMessage.error('加载更多播客失败');
    } finally {
        playlistLoading.value = false;
    }
};

const openDjRadio = async (radio: any) => {
    if (!currentApi.value) return;
    currentPlaylist.value = { 
        name: radio.name, 
        coverImgUrl: radio.picUrl,
        type: 'podcast',
        radio: radio
    };
    showPlaylistDialog.value = true;
    playlistLoading.value = true;
    playlistTracks.value = [];
    playlistPage.value = 1;
    totalPlaylistTracks.value = 0;

    try {
        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        
        const res = await proxyRequest(`${baseUrl}/dj/program?rid=${radio.id}&limit=50&offset=0&cookie=${cookieEncoded}`, 'GET', headers, {});
        
        if (res.data?.count) {
             totalPlaylistTracks.value = res.data.count;
             // Initialize array with holes
             playlistTracks.value = new Array(res.data.count).fill(undefined);
        }

        if (res.data?.programs) {
            const tracks = res.data.programs.map((p: any) => ({
                id: p.mainSong.id, // Use mainSong id for playback
                name: p.name,
                ar: p.dj ? [{ name: p.dj.nickname }] : [],
                al: { ...radio, picUrl: p.coverUrl },
                dt: p.duration,
                picUrl: p.coverUrl
            }));
            
            // If we didn't get count (sometimes happens?), assume length
            if (totalPlaylistTracks.value === 0) {
                 totalPlaylistTracks.value = tracks.length;
                 playlistTracks.value = tracks;
            } else {
                 // Fill first 50
                 for (let i = 0; i < tracks.length; i++) {
                     playlistTracks.value[i] = tracks[i];
                 }
            }
        }
    } catch (e) {
        ElMessage.error('获取播客内容失败');
        console.error(e);
    } finally {
        playlistLoading.value = false;
    }
};

watch(playlistPage, (newPage) => {
    if (currentPlaylist.value?.type === 'podcast' && currentPlaylist.value.radio) {
        const start = (newPage - 1) * 10;
        // Check if data exists at start (and maybe end of page)
        if (!playlistTracks.value[start]) {
             const batchSize = 50;
             const offset = Math.floor(start / batchSize) * batchSize;
             fetchPodcastPrograms(currentPlaylist.value.radio, offset, batchSize);
        }
    }
});

// Watch for view mode request from App.vue
watch(() => playerStore.viewModeRequest, (val) => {
    if (val === 'mine') {
        if (!playerStore.userProfile) {
            ElMessage.warning('请先登录');
            playerStore.showLoginDialog = true;
            playerStore.viewModeRequest = '';
            return;
        }
        openMore('mine');
        playerStore.viewModeRequest = ''; 
    }
});

/*
 * 首页音乐卡片的四个入口用 /music?view=radar|recommend|rank 指过来。
 * 音乐接口列表是异步拉取的，openMore 又要求 currentApi 就绪，
 * 所以先挂起，等 currentApi 到位再执行一次。
 */
const pendingViewMode = ref('');

const applyPendingViewMode = () => {
    const mode = pendingViewMode.value;
    if (!mode) return;

    // 每日推荐就是默认首页，不依赖音乐接口列表
    if (mode === 'home') {
        pendingViewMode.value = '';
        viewMode.value = 'home';
        pageTitle.value = '在线播放';
        layoutStore.setPageInfo('在线播放', true, goBack);
        return;
    }

    if (!currentApi.value) return;
    pendingViewMode.value = '';
    openMore(mode as 'radar' | 'recommend' | 'rank');
};

watch(
    () => route.query.view,
    (val) => {
        const mode = String(val || '');
        if (mode === 'home' || mode === 'radar' || mode === 'recommend' || mode === 'rank') {
            pendingViewMode.value = mode;
            applyPendingViewMode();
        }
    },
    { immediate: true }
);

watch(currentApi, applyPendingViewMode);

// Watch mineSubMode to fetch data
watch(mineSubMode, (val) => {
    if (viewMode.value === 'mine') {
        if (val === 'playlist' && userPlaylists.value.length === 0) {
            fetchUserPlaylists();
        } else if (val === 'podcast' && userPodcasts.value.length === 0) {
            fetchUserPodcasts();
        }
    }
});

// Watch user profile to fetch playlists
watch(() => playerStore.userProfile, (newVal) => {
    if (newVal) {
        fetchUserPlaylists();
    }
}, { immediate: true });

/*
 * 在播放页收藏 / 取消收藏后回到音乐页：把「我的歌单」重新拉一遍，
 * 否则列表（含喜欢的音乐那张卡）还是收藏之前的数据，看着像没收藏上。
 */
watch(() => playerStore.likeRevision, () => {
    if (playerStore.userProfile?.userId) fetchUserPlaylists();
});

const likedPlaylistCover = computed(() => {
    if (userPlaylists.value.length > 0) {
        return userPlaylists.value[0].coverImgUrl;
    }
    return '';
});

// --- Personalized Actions ---
const checkLogin = () => {
    if (!playerStore.userProfile) {
        ElMessage.warning('请先登录');
        playerStore.showLoginDialog = true;
        return false;
    }
    return true;
};

const handleDailyRecommend = async () => {
    if (!checkLogin()) return;
    if (!currentApi.value) return;
    
    currentPlaylist.value = { name: '每日推荐', coverImgUrl: '' };
    showPlaylistDialog.value = true;
    playlistLoading.value = true;
    playlistTracks.value = [];
    playlistPage.value = 1;
    
    try {
        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        
        const res = await proxyRequest(`${baseUrl}/recommend/songs?cookie=${cookieEncoded}`, 'GET', headers, {});
        if (res.data?.data?.dailySongs) {
             playlistTracks.value = res.data.data.dailySongs;
        }
    } catch (e) {
        ElMessage.error('获取每日推荐失败');
    } finally {
        playlistLoading.value = false;
    }
};



const handleLikedMusic = async () => {
    if (!checkLogin()) return;
    
    // Check if we have user playlists
    if (userPlaylists.value.length === 0) {
        await fetchUserPlaylists();
    }
    
    if (userPlaylists.value.length > 0) {
        openPlaylist(userPlaylists.value[0]);
    } else {
        ElMessage.warning('未找到喜欢的音乐歌单');
    }
};

// --- API Selection Logic ---
const findBestApi = async () => {
  checkingApi.value = true;
  try {
      const apis = await getMusicApis();
      
      const valid = apis.map((api: any) => {
          let baseUrl = api.url.trim();
          if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
          return {
              ...api,
              baseUrl,
              friendly_name: api.name // Map name to friendly_name for UI
          };
      });

      if (valid.length > 0) {
          availableApis.value = valid;

          // 按本次拿到的顺序编号，界面上只出现「路线 N」
          const numbers: Record<string, number> = {};
          valid.forEach((api: any, index: number) => {
              numbers[lineKey(api)] = index + 1;
          });
          lineNumbers.value = numbers;
           
          // Default to the first one (backend already sorts by latency)
          let bestApi = valid[0];
          
          // Try to restore from playerStore if available
          if (playerStore.apiUrl) {
             const savedUrl = playerStore.apiUrl.trim().replace(/\/$/, '');
             const found = valid.find(a => a.baseUrl === savedUrl);
             if (found) bestApi = found;
          }
          
          currentApi.value = bestApi;
          playerStore.setApiUrl(bestApi.url);
          
          initData();
      } else {
          ElMessage.error('无可用 API 接口，请在后台添加');
          availableApis.value = [];
      }
  } catch (e) {
      console.error('Failed to load music APIs:', e);
      ElMessage.error('加载接口列表失败');
  } finally {
      checkingApi.value = false;
  }
};

const handleSwitchApi = (api: any) => {
    if (!api || api.id === currentApi.value?.id) return;
    currentApi.value = api;
    playerStore.setApiUrl(api.url);
    ElMessage.success(`已切换至 ${lineLabel(api)}`);
    initData();
};

// --- Data Fetching ---
const initData = async () => {
  fetchUserProfile();
  fetchDiscovery();
};



const fetchDiscovery = async (forceRefresh = false) => {
   if (!currentApi.value) return;
   
   const CACHE_KEY = 'discovery_data';
   
   if (!forceRefresh) {
       const cached = musicCache.get<any>(CACHE_KEY);
       if (cached) {
           console.log('[MusicView] Cache hit for discovery data');
           radarPlaylists.value = cached.radar;
           recommendPlaylists.value = cached.recommend;
           topList.value = cached.topList;
           return;
       }
   }
   
   radarLoading.value = true;
   recommendLoading.value = true;
   
   const baseUrl = currentApi.value.baseUrl;
   
   try {
       const [radarRes, recRes, topRes] = await Promise.all([
           proxyRequest(`${baseUrl}/personalized?limit=7`, 'GET', {}, null), // Radar/Personalized
           proxyRequest(`${baseUrl}/personalized/newsong?limit=7`, 'GET', {}, null), // Actually recommended songs, but let's use playlists
           proxyRequest(`${baseUrl}/toplist/detail`, 'GET', {}, null)
       ]);

       const radar = radarRes.data?.result || [];
       let recommend = [];
       
       // Try Highquality for recommended
       const hqRes = await proxyRequest(`${baseUrl}/top/playlist/highquality?limit=7`, 'GET', {}, null);
       if (hqRes.data?.playlists) {
           recommend = hqRes.data.playlists;
       } else if (recRes.data?.result) {
           recommend = recRes.data.result;
       }

       const tops = topRes.data?.list || [];

       radarPlaylists.value = radar;
       recommendPlaylists.value = recommend;
       topList.value = tops;
       
       musicCache.set(CACHE_KEY, {
           radar,
           recommend,
           topList: tops
       });

   } catch (e) {
       console.error('Fetch discovery failed', e);
       // Fallback to cache if refresh failed
       if (forceRefresh) {
           const cached = musicCache.get<any>(CACHE_KEY);
           if (cached) {
               radarPlaylists.value = cached.radar;
               recommendPlaylists.value = cached.recommend;
               topList.value = cached.topList;
               ElMessage.warning('刷新失败，已恢复缓存数据');
           }
       }
   } finally {
       radarLoading.value = false;
       recommendLoading.value = false;
   }
};

// --- Login Logic ---
const getCookie = () => localStorage.getItem('netease_cookie') || '';

const fetchUserProfile = async () => {
  const cookie = getCookie();
  console.log('[MusicView] Fetching profile, cookie length:', cookie?.length || 0);
  
  if (!cookie || !currentApi.value) {
      console.log('[MusicView] No cookie or API ready');
      return;
  }

  playerStore.setCookie(cookie);

  try {
      const baseUrl = currentApi.value.baseUrl;
      const headers = { Cookie: cookie };
      const cookieEncoded = encodeURIComponent(cookie);
      
      console.log('[MusicView] Requesting login status...');
      const res = await proxyRequest(`${baseUrl}/login/status?timestamp=${Date.now()}&cookie=${cookieEncoded}`, 'POST', headers, {});
      
      const data = res.data?.data || res.data;
      console.log('[MusicView] Login status data:', data);

      if (data?.profile) {
          console.log('[MusicView] Found profile directly');
          playerStore.setUserProfile(data.profile);
      } else if (data?.account?.id) {
          console.log('[MusicView] Found account ID:', data.account.id, 'fetching detail...');
          // Fetch detail
          const detailRes = await proxyRequest(`${baseUrl}/user/detail?uid=${data.account.id}&cookie=${cookieEncoded}`, 'GET', headers, {});
          console.log('[MusicView] User detail res keys:', Object.keys(detailRes.data || {}));
            
            if (detailRes.data?.profile) {
                console.log('[MusicView] Profile found in detail:', detailRes.data.profile);
                playerStore.setUserProfile(detailRes.data.profile);
            } else {
                console.warn('[MusicView] Profile MISSING in user detail response');
                // Try to construct basic profile from account if available in detail or status
                if (data.account) {
                     console.log('[MusicView] Using account info as fallback profile');
                     playerStore.setUserProfile({
                         userId: data.account.id,
                         nickname: data.account.userName || '用户',
                         avatarUrl: '' // No avatar in account usually
                     });
                }
            }
        } else {
            console.warn('[MusicView] No profile or account ID found in status');
        }
  } catch (e) {
      console.error('[MusicView] Profile fetch failed', e);
  }
};

// Watch for login dialog request
watch(() => playerStore.showLoginDialog, (val) => {
  if (val) {
    openLogin();
  }
});

const openLogin = async () => {
  if (!currentApi.value) {
     ElMessage.warning('API 未就绪');
     playerStore.showLoginDialog = false;
     return;
  }
  loginStatus.value = '正在获取二维码...';
  qrImg.value = '';
  
  try {
      const baseUrl = currentApi.value.baseUrl;
      const keyRes = await proxyRequest(`${baseUrl}/login/qr/key?timestamp=${Date.now()}`, 'GET', {}, null);
      if (keyRes.data?.data?.unikey) {
          unikey = keyRes.data.data.unikey;
          const createRes = await proxyRequest(`${baseUrl}/login/qr/create?key=${unikey}&qrimg=true&timestamp=${Date.now()}`, 'GET', {}, null);
          if (createRes.data?.data?.qrimg) {
              qrImg.value = createRes.data.data.qrimg;
              loginStatus.value = '请使用网易云音乐APP扫码';
              checkLoginStatus();
          }
      }
  } catch (e) {
      loginStatus.value = '获取失败，请重试';
  }
};

const checkLoginStatus = () => {
   if (loginTimer) clearTimeout(loginTimer);
   loginTimer = setTimeout(async () => {
       if (!playerStore.showLoginDialog) return;
       try {
           const baseUrl = currentApi.value.baseUrl;
           const res = await proxyRequest(`${baseUrl}/login/qr/check?key=${unikey}&timestamp=${Date.now()}`, 'GET', {}, null);
           const code = res.data?.code;
           if (code === 800) {
               loginStatus.value = '二维码已过期';
               // Timer stops here, user needs to refresh
           } else if (code === 801) {
               checkLoginStatus();
           } else if (code === 802) {
               loginStatus.value = '扫码成功，请确认';
               checkLoginStatus();
           } else if (code === 803) {
               loginStatus.value = '登录成功';
               const cookie = res.data.cookie;
               localStorage.setItem('netease_cookie', cookie);
               playerStore.setCookie(cookie);
               playerStore.showLoginDialog = false;
               fetchUserProfile();
               ElMessage.success('登录成功');
           }
       } catch (e) {
           checkLoginStatus();
       }
   }, 3000);
};

const refreshLogin = () => {
    openLogin();
};

const handleUserCommand = (cmd: string) => {
    if (cmd === 'logout') {
        localStorage.removeItem('netease_cookie');
        playerStore.setCookie('');
        playerStore.setUserProfile(null);
        ElMessage.success('已退出登录');
        // Clear user playlists
        userPlaylists.value = [];
        userPodcasts.value = [];
    }
};

// Ideally clear profile on logout
watch(() => playerStore.userProfile, (val) => {
    if (!val) {
        // Logged out externally
    }
});

// --- Search Logic ---
const executeSearch = async () => {
   if (!searchKeyword.value.trim() || !currentApi.value) return;
   searchLoading.value = true;
   try {
       const baseUrl = currentApi.value.baseUrl;
       const offset = (currentPage.value - 1) * pageSize.value;
       const res = await proxyRequest(
           `${baseUrl}/search?keywords=${encodeURIComponent(searchKeyword.value)}&type=${searchType.value}&limit=${pageSize.value}&offset=${offset}`, 
           'GET', {}, null
       );
       
       if (searchType.value === 1 && res.data?.result?.songs) {
           // Fetch full song details to get correct cover images
           const songs = res.data.result.songs;
           const songIds = songs.map((s: any) => s.id).join(',');
           
           try {
               const detailRes = await proxyRequest(`${baseUrl}/song/detail?ids=${songIds}`, 'GET', {}, null);
               if (detailRes.data?.songs) {
                   searchResults.value = detailRes.data.songs;
               } else {
                   searchResults.value = songs;
               }
           } catch (e) {
               console.warn('Failed to fetch song details, using search results');
               searchResults.value = songs;
           }
           
           total.value = res.data.result.songCount || 0;
       } else if (searchType.value === 10 && res.data?.result?.albums) {
           searchResults.value = res.data.result.albums;
           total.value = res.data.result.albumCount || 0;
       } else if (searchType.value === 100 && res.data?.result?.artists) {
           searchResults.value = res.data.result.artists;
           total.value = res.data.result.artistCount || 0;
       } else {
           searchResults.value = [];
           total.value = 0;
       }
   } catch (e) {
       ElMessage.error('搜索失败');
       searchResults.value = [];
       total.value = 0;
   } finally {
       searchLoading.value = false;
   }
};

const handleSearch = () => {
    currentPage.value = 1;
    executeSearch();
};

const handlePageChange = (page: number) => {
    currentPage.value = page;
    executeSearch();
};

const clearSearch = () => {
    searchKeyword.value = '';
    searchResults.value = [];
    total.value = 0;
    currentPage.value = 1;
    searchType.value = 1; // Reset type
};

// --- Playback & Detail Logic ---
const openAlbum = async (album: any) => {
    if (!currentApi.value) return;
    // 带上 id：刷新时可以直接重跑这个 loader
    currentPlaylist.value = { id: album.id, name: album.name, coverImgUrl: album.picUrl, type: 'album' }; // Mock playlist obj
    showPlaylistDialog.value = true;
    playlistLoading.value = true;
    playlistTracks.value = [];
    playlistPage.value = 1;
    
    try {
        const baseUrl = currentApi.value.baseUrl;
        const res = await proxyRequest(`${baseUrl}/album?id=${album.id}`, 'GET', {}, null);
        if (res.data?.songs) {
            playlistTracks.value = res.data.songs;
            totalPlaylistTracks.value = res.data.songs.length;
        }
    } catch (e) {
        ElMessage.error('获取专辑详情失败');
    } finally {
        playlistLoading.value = false;
    }
};

const openArtist = async (artist: any) => {
    if (!currentApi.value) return;
    currentPlaylist.value = { id: artist.id, name: artist.name, coverImgUrl: artist.picUrl, type: 'artist' };
    showPlaylistDialog.value = true;
    playlistLoading.value = true;
    playlistTracks.value = [];
    playlistPage.value = 1;
    
    try {
        const baseUrl = currentApi.value.baseUrl;
        const res = await proxyRequest(`${baseUrl}/artists?id=${artist.id}`, 'GET', {}, null);
        if (res.data?.hotSongs) {
            playlistTracks.value = res.data.hotSongs;
            totalPlaylistTracks.value = res.data.hotSongs.length;
        }
    } catch (e) {
        ElMessage.error('获取歌手详情失败');
    } finally {
        playlistLoading.value = false;
    }
};

const playSong = (song: any) => {
    // Switch to normal mode when playing regular songs
    playerStore.playMode = 'normal';

    // Standardize track object
    const track = {
        id: song.id,
        name: song.name,
        ar: song.ar || song.artists,
        al: song.al || song.album,
        dt: song.dt || song.duration,
        picUrl: song.al?.picUrl || song.album?.picUrl || song.coverImgUrl
    };
    
    // If playing from a list (search results or playlist), pass the whole list
    let list = [];
    if (searchResults.value.length > 0 && searchResults.value.find(s => s.id === song.id)) {
        list = searchResults.value.map(s => ({
            id: s.id,
            name: s.name,
            ar: s.ar || s.artists,
            al: s.al || s.album,
            dt: s.dt || s.duration,
            picUrl: s.al?.picUrl || s.album?.picUrl || s.coverImgUrl
        }));
    } else if (playlistTracks.value.length > 0) {
        list = playlistTracks.value;
    }

    playerStore.playTrack(track, list.length > 0 ? list : undefined);
};

const batchDownloadLoading = ref(false);
const isSelectionMode = ref(false);
const selectedTracks = ref<any[]>([]);
const playlistTableRef = ref();
const downloadQuality = ref<'standard' | 'higher' | 'exhigh' | 'lossless'>('lossless');

const getBitrateByQuality = (quality: 'standard' | 'higher' | 'exhigh' | 'lossless') => {
    if (quality === 'higher') return 192000;
    if (quality === 'exhigh') return 320000;
    if (quality === 'lossless') return 999000;
    return 128000;
};

const isSelected = (row: any) => selectedTracks.value.some(t => t.id === row.id);

/** 播单页总页数（每页 10 首），用于翻页控件 */
const totalPages = computed(() => Math.ceil(totalPlaylistTracks.value / 10) || 1);

const isPageAllSelected = computed(() => {
    if (pagedPlaylistTracks.value.length === 0) return false;
    return pagedPlaylistTracks.value.every(row => isSelected(row));
});

const isPageIndeterminate = computed(() => {
    if (pagedPlaylistTracks.value.length === 0) return false;
    const selectedCount = pagedPlaylistTracks.value.filter(row => isSelected(row)).length;
    return selectedCount > 0 && selectedCount < pagedPlaylistTracks.value.length;
});

const handlePageSelectAll = (val: boolean) => {
    if (val) {
        // Add all current page tracks to selection if not already selected
        pagedPlaylistTracks.value.forEach(row => {
            if (!isSelected(row)) {
                selectedTracks.value.push(row);
            }
        });
    } else {
        // Remove all current page tracks from selection
        selectedTracks.value = selectedTracks.value.filter(
            t => !pagedPlaylistTracks.value.some(p => p.id === t.id)
        );
    }
};

const toggleRowSelection = (row: any, selected: boolean) => {
    if (selected) {
        if (!isSelected(row)) {
            selectedTracks.value.push(row);
        }
    } else {
        selectedTracks.value = selectedTracks.value.filter(t => t.id !== row.id);
    }
};

const toggleSelectionMode = () => {
    isSelectionMode.value = !isSelectionMode.value;
    selectedTracks.value = [];
};

const executeBatchDownload = async () => {
    if (selectedTracks.value.length === 0) return;
    
    try {
        await ElMessageBox.confirm(
            `确定要下载选中的 ${selectedTracks.value.length} 首歌曲吗？`,
            '批量下载',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'info',
            }
        );
        
        batchDownloadLoading.value = true;
        ElMessage.info('开始批量下载...');
        
        const tracks = [...selectedTracks.value];
        let successCount = 0;
        
        for (const song of tracks) {
            try {
                await downloadSong(song);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                console.error('Batch download error', e);
            }
        }
        
        toggleSelectionMode(); // Exit selection mode after download
    } catch (e) {
        // Cancelled
    } finally {
        batchDownloadLoading.value = false;
    }
};

const downloadSong = async (song: any) => {
    if (!currentApi.value) return;
    try {
        const baseUrl = currentApi.value.baseUrl;
        const level = downloadQuality.value;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        let data: any = null;
        let url: string | undefined;

        try {
            const res = await proxyRequest(
                `${baseUrl}/song/download/url/v1?id=${song.id}&level=${level}&cookie=${cookieEncoded}`,
                'GET',
                headers,
                {}
            );
            const raw = res.data?.data;
            const d = Array.isArray(raw) ? raw[0] : raw;
            if (d && d.url) {
                data = d;
                url = d.url;
            }
        } catch (e) {
            console.warn('song.download.url.v1 failed', e);
        }

        if (!url) {
            try {
                const br = getBitrateByQuality(level);
                const res = await proxyRequest(
                    `${baseUrl}/song/url?id=${song.id}&br=${br}&cookie=${cookieEncoded}`,
                    'GET',
                    headers,
                    {}
                );
                const raw = res.data?.data;
                const d = Array.isArray(raw) ? raw[0] : raw;
                if (d && d.url) {
                    data = d;
                    url = d.url;
                }
            } catch (e) {
                console.warn('song.url fallback failed', e);
            }
        }

        if (!url) {
            try {
                const res = await proxyRequest(
                    `${baseUrl}/song/url/match?id=${song.id}&cookie=${cookieEncoded}`,
                    'GET',
                    headers,
                    {}
                );
                const raw = res.data?.data;
                const d = Array.isArray(raw) ? raw[0] : raw;
                if (d && d.url) {
                    data = d;
                    url = d.url;
                }
            } catch (e) {
                console.warn('song.url.match fallback failed', e);
            }
        }

        if (url && data) {
            let ext = 'mp3';
            if (data.type) {
                ext = data.type.toLowerCase();
            } else if (url.includes('.')) {
                const parts = url.split('.');
                const last = parts[parts.length - 1].split('?')[0];
                if (last.length <= 4) ext = last;
            }

            const artist = getArtistName(song);
            const filename = `${song.name} - ${artist}.${ext}`;

            try {
                // 优先浏览器直连下载：流量走「浏览器 ↔ CDN」，不经过服务器。
                // 实测网易云 CDN 支持 https 且 Access-Control-Allow-Origin: *，所以前端能直接取到文件。
                await downloadDirect(url, filename);
                ElMessage.success(`已开始下载: ${filename}`);
            } catch (directError) {
                // 直连失败（比如该主机只支持 http，前端取不了）时回退到服务器中转，行为与以前一致
                console.warn('直连下载失败，回退到服务器中转', directError);
                try {
                    const fallbackUrl = proxyUrl(url, filename);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = fallbackUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    ElMessage.success(`已加入下载队列: ${filename}`);
                } catch (error) {
                    console.warn('Download trigger failed', error);
                    window.open(url, '_blank');
                }
            }
        } else {
            ElMessage.warning('无法获取下载链接,已尝试所有可用接口');
            ElMessage.info('建议检查 API 配置或尝试切换音质等级');
        }
    } catch (e) {
        console.error('下载出错:', e);
        ElMessage.error('下载出错,请稍后重试');
    }
};

// --- Helpers ---
const getCover = (song: any) => {
    if (!song) return '';
    let url = song.al?.picUrl || 
           song.album?.picUrl || 
           song.picUrl ||
           song.cover ||
           song.artists?.[0]?.img1v1Url || 
           song.img1v1Url || 
           '';
    return url ? url.replace(/^http:/, 'https:') : '';
};
const getArtistName = (song: any) => (song.ar || song.artists || []).map((a: any) => a.name).join(', ');
const formatDuration = (ms: number) => {
  if (!ms) return '00:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
const isVipSong = (song: any) => {
    const fee = song.fee ?? song.privilege?.fee;
    return typeof fee === 'number' && fee !== 0;
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
));
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/*
 * 这个函数的结果会走 v-html，而输入是第三方接口返回的歌名/歌手名，
 * 所以必须先转义再高亮：以前直接 replace 会把歌名里的 HTML 当标签解析；
 * 另外搜索词没转义就丢进 RegExp，用户输入 "(" 会直接抛异常把页面弄崩。
 */
const highlight = (text: string) => {
    const raw = escapeHtml(String(text ?? ''));
    const keyword = searchKeyword.value?.trim();
    if (!keyword) return raw;
    try {
        return raw.replace(new RegExp(escapeRegExp(keyword), 'gi'), match => `<span class="text-primary">${match}</span>`);
    } catch {
        return raw;
    }
};
const formatCount = (count: number) => {
    if (count > 100000000) return (count / 100000000).toFixed(1) + '亿';
    if (count > 10000) return (count / 10000).toFixed(1) + '万';
    return count;
};

const openPlaylist = async (list: any, options: { fresh?: boolean } = {}) => {
    if (!currentApi.value) return;
    currentPlaylist.value = list;
    showPlaylistDialog.value = true;
    playlistLoading.value = true;
    playlistTracks.value = [];
    playlistPage.value = 1;
    
    try {
        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        // 刷新时带时间戳，绕开接口两分钟的缓存
        const stamp = options.fresh ? `&timestamp=${Date.now()}` : '';
        const res = await proxyRequest(`${baseUrl}/playlist/detail?id=${list.id}&cookie=${cookieEncoded}${stamp}`, 'GET', headers, {});
        if (res.data?.playlist?.tracks) {
            playlistTracks.value = res.data.playlist.tracks.map((t: any) => ({
                id: t.id,
                name: t.name,
                ar: t.ar,
                al: t.al,
                dt: t.dt
            }));
            totalPlaylistTracks.value = playlistTracks.value.length;
        }
    } catch (e) {
        ElMessage.error('获取歌单详情失败');
    } finally {
        playlistLoading.value = false;
    }
};

/*
 * 刷新当前播单：网易云接口对相同地址有两分钟缓存，
 * 刚收藏 / 刚改过的歌单可能还是旧数据，这里带时间戳重拉一次。
 */
const playlistRefreshing = ref(false);

const refreshCurrentPlaylist = async () => {
    const list = currentPlaylist.value;
    if (!list || !currentApi.value || playlistRefreshing.value) return;

    playlistRefreshing.value = true;
    try {
        if (list.type === 'podcast' && list.radio) {
            await openDjRadio(list.radio);
        } else if (list.type === 'album' && list.id) {
            await openAlbum(list);
        } else if (list.type === 'artist' && list.id) {
            await openArtist(list);
        } else if (list.name === '每日推荐') {
            await handleDailyRecommend();
        } else if (list.id) {
            await openPlaylist(list, { fresh: true });
        }
        ElMessage.success('已刷新');
    } catch (e) {
        console.error(e);
        ElMessage.error('刷新失败');
    } finally {
        playlistRefreshing.value = false;
    }
};

let ticking = false;

const checkScrollPosition = () => {
  if (!pageHeaderRef.value) return;
  const el = (pageHeaderRef.value as any).$el || pageHeaderRef.value;
  if (!el || !el.getBoundingClientRect) return;

  const rect = el.getBoundingClientRect();
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

onMounted(async () => {
    document.documentElement.classList.add('no-scrollbar');
    
    findBestApi();

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', checkMobile);
    checkMobile();
    layoutStore.setPageInfo('在线播放', true, goBack);
});

onUnmounted(() => {
    document.documentElement.classList.remove('no-scrollbar');
    if (loginTimer) clearTimeout(loginTimer);
    window.removeEventListener('scroll', handleScroll);
    window.removeEventListener('resize', checkMobile);
    layoutStore.reset();
});
</script>

<style scoped>
.music-view {
  max-width: 1200px;
  margin: 0 auto;
}
.mb-4 { margin-bottom: 20px; }
.mt-3 { margin-top: 12px; }
.mt-4 { margin-top: 20px; }
.ml-1 { margin-left: 4px; }
.ml-2 { margin-left: 8px; }
.cursor-pointer { cursor: pointer; }
.pagination-container {
  display: flex;
  justify-content: center;
  padding-bottom: 20px;
}
.text-center { text-align: center; }
.py-10 { padding-top: 40px; padding-bottom: 40px; }
.text-gray-500 { color: var(--el-text-color-secondary); }
.mr-1 { margin-right: 4px; }
.mr-3 { margin-right: 12px; }
.api-tag { margin-left: 0; }
.flex-center { display: flex; align-items: center; }
.no-wrap-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%; }

:deep(.el-page-header__content) {
  display: flex;
  align-items: center;
}

.api-status-bar {
  padding-left: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  box-sizing: border-box;
  text-align: left;
}

.status-tag-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  text-align: left;
}

.api-actions {
  display: flex;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
}
.user-avatar-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 20px;
  transition: background-color 0.2s;
}
.user-avatar-wrapper:hover {
  background-color: var(--el-fill-color);
}
.username {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.search-card {
  border-radius: 12px;
}
.search-box {
  display: flex;
  justify-content: center;
}
.search-input {
  max-width: 600px;
  width: 100%;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header h3 {
  position: relative;
  margin: 0;
  padding-left: 12px;
  font-size: 17px;
  font-weight: 600;
}

/* 栏目标题前的短色条：与首页卡片标题保持同一套视觉语言 */
.section-header h3::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 15px;
  border-radius: 4px;
  background-color: var(--el-color-primary);
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 20px;
}

.playlist-card {
  cursor: pointer;
  transition: transform 0.2s;
}
.playlist-card:hover {
  transform: translateY(-4px);
}
.cover-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--el-box-shadow-light);
  margin-bottom: 8px;
}
.playlist-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.play-count {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
}

.delete-btn-wrapper {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  z-index: 10;
}

.delete-btn-wrapper:hover {
  background: rgba(255, 0, 0, 0.8);
  transform: scale(1.1);
}

.playlist-card:hover .delete-btn-wrapper {
  opacity: 1;
}

@media (max-width: 768px) {
  .delete-btn-wrapper {
    opacity: 1;
    background: rgba(0, 0, 0, 0.6);
  }
}

.playlist-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.rank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.rank-card {
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  gap: 16px;
  box-shadow: none;
  cursor: pointer;
  transition: transform 0.2s;
  position: relative; /* Ensure relative positioning for ::after */
}
.rank-card::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  pointer-events: none;
  box-sizing: border-box;
  z-index: 10;
}
.rank-card:hover { transform: translateY(-2px); }
.rank-cover-wrapper {
  width: 100px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rank-cover {
  width: 100px;
  height: 100px;
  border-radius: 8px;
}
.rank-songs {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  overflow: hidden;
}
.rank-song-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rank-num {
  font-weight: bold;
  margin-right: 6px;
  color: var(--el-text-color-secondary);
}

.song-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.song-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border-radius: 8px;
  gap: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.song-item:hover {
  background-color: var(--el-fill-color-light);
}
.song-cover {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  flex-shrink: 0;
}
.song-info {
  flex: 1;
  overflow: hidden;
}
.song-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.song-name {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 4px;
}
.song-vip-badge {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background-color: var(--el-color-danger);
  color: #fff;
  line-height: 1.4;
  flex-shrink: 0;
}
.song-artist {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.song-action {
  display: flex;
  gap: 8px;
}

.song-row-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.login-container {
  text-align: center;
  padding: 20px 0;
}
.qr-wrapper {
  position: relative;
  width: 180px;
  height: 180px;
  margin: 0 auto 16px;
}
.qr-wrapper img {
  width: 100%;
  height: 100%;
  display: block;
}
.qr-wrapper img.expired {
  opacity: 0.2;
}
.qr-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(0,0,0,0.05);
  cursor: pointer;
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.qr-code img {
}
.qr-status {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .hidden-xs-only { display: none; }
  .rank-grid { grid-template-columns: 1fr; }
}

.album-grid, .artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 20px;
  padding: 10px 0;
}

.album-card, .artist-card {
  cursor: pointer;
  text-align: center;
  transition: transform 0.2s;
}
.album-card:hover, .artist-card:hover {
  transform: translateY(-4px);
}

.album-cover, .artist-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  margin-bottom: 8px;
}
.artist-cover {
  border-radius: 50%;
}

.album-name, .artist-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.album-artist {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.personalized-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.personalized-card {
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}
.personalized-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--el-box-shadow);
}

/* 去掉粉/紫/青高饱和渐变，改用中性面色 + 语义色图标 */
.daily-card,
.fm-card,
.like-card {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-primary);
}

.daily-card .card-icon { color: var(--el-color-danger); }
.fm-card .card-icon { color: var(--el-color-primary); }
.like-card .card-icon { color: var(--el-color-success); }

.card-icon {
  font-size: 32px;
  margin-right: 16px;
  display: flex;
  align-items: center;
}

.card-text {
  flex: 1;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.card-desc {
  font-size: 12px;
  opacity: 0.9;
}
/* New V2 Layout Styles */
.flex-between-center {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.greet-section {
  padding: 10px 0;
}
.greet-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: var(--el-text-color-primary);
}
.greet-subtitle {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  opacity: 0.8;
}

.personalized-grid-v2 {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 20px;
}

@media (max-width: 768px) {
  .personalized-grid-v2 {
    grid-template-columns: 1fr;
  }
}

.left-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.right-col {
  /* Auto height */
}

.personalized-card-v2 {
  background: var(--el-fill-color-darker);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  flex: 1; /* Take equal height in left col */
}

.personalized-card-v2:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow);
}

.daily-card-v2, .like-card-v2 {
  background: #2b303b; /* Dark fallback */
  background: linear-gradient(145deg, rgba(45, 50, 65, 0.9), rgba(30, 35, 45, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.card-icon-wrapper {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  position: relative;
}

.daily-icon {
  color: #fff;
  opacity: 0.9;
}
.daily-date {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -40%); /* Adjust for calendar icon visual center */
  font-size: 16px;
  font-weight: bold;
  color: #fff;
  margin-top: 2px;
}

.like-icon-wrapper {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}
.like-icon {
  color: #fff;
}
.like-cover {
  width: 100%;
  height: 100%;
  border-radius: 8px;
}

.card-text-v2 {
  flex: 1;
}
.card-title-v2 {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 6px;
}
.card-desc-v2 {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* FM Card Specifics */
.fm-card-v2 {
  position: relative;
  display: flex;
  /*
   * 高度下限按最坏情况算：标题两行 + 歌手 + 专辑 + 12px 间距 + 48px 按钮 + 上下内边距。
   * 卡片被压得比这个还矮时，按钮就会被 overflow:hidden 裁掉。
   */
  min-height: 210px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: #000;
  transition: transform 0.2s, box-shadow 0.2s;
}
.fm-card-v2:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow);
}

.fm-card-v2::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  pointer-events: none;
  box-sizing: border-box;
  z-index: 10;
}

.fm-bg-blur {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  filter: blur(40px) brightness(0.6);
  z-index: 1;
  transform: scale(1.2); /* Prevent white edges from blur */
}

.fm-content {
  position: relative;
  z-index: 2;
  flex: 1;
  min-width: 0;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.fm-cover-wrapper {
  position: relative;
  width: 140px;
  height: 140px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.fm-cover {
  width: 100%;
  height: 100%;
}
.fm-cover-placeholder {
  width: 100%;
  height: 100%;
  background: #333;
}

.fm-tag {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}

.fm-info-controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  /*
   * 这里不能用 overflow: hidden —— 它的左边和底边正好贴着下面那排按钮，
   * 按钮 hover 放大/发亮时会被这条看不见的边切掉一角。
   * 文字省略交给内层的 .fm-info 处理就够了。
   */
  overflow: visible;
}

.fm-info {
  margin-top: 0;
  min-width: 0;
  overflow: hidden;
}

.fm-title {
  font-size: 24px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 8px;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fm-artist {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.fm-album {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  overflow: hidden;
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.fm-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  /* 按钮不参与压缩：空间不够时让文字先省略，而不是把按钮挤出去 */
  flex-shrink: 0;
}

.fm-btn-play {
  width: 48px;
  height: 48px;
  font-size: 24px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  transition: all 0.2s;
}
.fm-btn-play:hover {
  background: rgba(255, 255, 255, 0.3);
  /* 不用 scale：外层 .fm-info-controls 是 overflow:hidden，放大后的边缘会被切掉 */
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
}

.fm-btn-sub {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
}
.fm-btn-sub:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

@media (max-width: 768px) {
  .fm-card-v2 {
    height: auto;
    /* 手机上封面缩到 80，卡片跟着内容走就行 */
    min-height: 0;
  }
  .fm-content {
    height: auto;
    padding: 12px;
    gap: 12px;
  }
  .fm-cover-wrapper {
    width: 80px;
    height: 80px;
    flex-shrink: 0;
  }
  .fm-title {
    font-size: 16px;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .fm-artist, .fm-album {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }
  .fm-artist .el-icon, .fm-album .el-icon {
    display: inline-block;
    vertical-align: -2px;
    margin-right: 4px;
  }
  .fm-info-controls {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    height: auto;
    overflow: hidden; /* Ensure controls don't get pushed out if calculation fails */
  }
  .fm-info {
    flex: 1;
    min-width: 0; /* Enable text truncation */
    overflow: hidden;
  }
  .fm-controls {
    gap: 0;
    flex-shrink: 0;
  }
  .fm-btn-play, .fm-btn-trash {
    display: none;
  }
}
.horizontal-scroll-container {
  display: flex;
  overflow-x: auto;
  gap: 12px;
  padding-bottom: 8px; /* For scrollbar space if visible */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
.horizontal-scroll-container::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.horizontal-scroll-item {
  flex: 0 0 140px; /* Fixed width for items */
  width: 140px;
}

/* ---------- 播单页 ---------- */
.pl-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* 固定高度，内部列表自己滚，信息条始终留在顶部 */
  height: calc(100vh - 96px);
  padding-bottom: 12px;
  box-sizing: border-box;
}

/* 歌单信息条：封面 + 名称 + 操作，一次排开 */
.pl-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background-color: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.pl-cover {
  width: 84px;
  height: 84px;
  flex-shrink: 0;
  border-radius: 12px;
  background-color: var(--el-fill-color-light);
}

.pl-cover-fallback {
  width: 100%;
  height: 100%;
  background-color: var(--el-fill-color-light);
}

.pl-info {
  flex: 1;
  min-width: 0;
}

.pl-name {
  margin: 0;
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pl-meta {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.pl-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pl-quality {
  /* 和两侧按钮同高（全局控件高度 36px），宽度收到 96px 刚好放下「无损」+ 箭头 */
  width: 96px;
}

.pl-list {
  /* 歌曲列表是可滑动区域：内容超出就在这里面滚，不动整页 */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* 序号列：两位数（10）不许折行，居中 + 等宽数字 */
.pl-list :deep(.pl-index-cell .cell) {
  white-space: nowrap;
  padding: 0 2px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.pl-pager {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px dashed var(--el-border-color-light);
}

.pl-page-num {
  min-width: 38px;
  text-align: center;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .pl-page {
    height: calc(100vh - 76px);
    gap: 10px;
  }

  .pl-hero {
    gap: 12px;
    padding: 12px;
  }

  .pl-cover {
    width: 64px;
    height: 64px;
    border-radius: 10px;
  }

  .pl-name {
    font-size: 16px;
  }

  /* 窄屏：操作按钮整行铺开，按压目标更大 */
  .pl-actions {
    width: 100%;
  }

  .pl-quality {
    flex: 1;
    width: auto;
  }
}

/* ---------- 音乐页头部（身份 + 主切换 + 搜索 + 线路/账号） ---------- */
.music-hero {
  position: relative;
  margin-bottom: 20px;
  padding: 18px 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background-color: var(--el-bg-color);
  background-image: radial-gradient(
    120% 150% at 0% 0%,
    color-mix(in srgb, var(--el-color-primary) 10%, transparent),
    transparent 62%
  );
  box-shadow: var(--el-box-shadow-light);
}

.hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.hero-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

/* 头部图标直接用首页音乐卡片的那张 logo，两处保持一致 */
.hero-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.28));
}

.hero-text {
  min-width: 0;
}

.hero-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.35;
  color: var(--el-text-color-primary);
}

.hero-sub {
  margin: 3px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.hero-tabs {
  flex-shrink: 0;
}

.hero-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--el-border-color-light);
}

.search-box {
  min-width: 0;
}

.header-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.api-status-wrapper {
  display: flex;
  align-items: center;
}

/* ---------- 线路选择器：只暴露「路线 N」，不显示上游地址 ---------- */
.line-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background-color: var(--el-fill-color-lighter);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background-color 0.16s ease;
}

.line-chip:hover {
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color);
  background-color: var(--el-fill-color-light);
}

.line-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background-color: var(--el-color-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-success) 18%, transparent);
}

.line-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.line-latency {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.line-caret {
  color: var(--el-text-color-placeholder);
}

.line-chip.is-checking {
  cursor: default;
  color: var(--el-text-color-secondary);
}

.line-chip.is-offline {
  cursor: default;
}

.line-chip.is-offline .line-dot {
  background-color: var(--el-color-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-danger) 18%, transparent);
}

/* 下拉里的每一项：左边线路名，右边延迟 */
.line-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-width: 116px;
}

@media (max-width: 768px) {
  .music-hero {
    padding: 15px;
    border-radius: 14px;
  }

  /* 窄屏：搜索独占一行，线路和账号在下面一行 */
  .hero-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'search search'
      'api actions';
    gap: 10px;
  }

  .hero-bar .search-box {
    grid-area: search;
  }

  .hero-bar .api-status-wrapper {
    grid-area: api;
  }

  .hero-bar .header-right-actions {
    grid-area: actions;
  }
}

/* Mobile specific adjustments */
@media (max-width: 768px) {
  .playlist-grid.mobile-scroll {
    display: flex !important;
    overflow-x: auto;
    gap: 12px;
    padding: 10px 0;
    grid-template-columns: none; /* Reset grid */
    scrollbar-width: none;
    -ms-overflow-style: none;
    scroll-snap-type: x mandatory;
  }
  .playlist-grid.mobile-scroll::-webkit-scrollbar {
    display: none;
  }
  
  .playlist-grid.mobile-scroll .playlist-card {
    flex: 0 0 120px; /* Slightly smaller on mobile */
    width: 120px;
    margin-right: 0;
    scroll-snap-align: start;
  }
  
  .rank-grid {
    display: flex !important;
    overflow-x: auto;
    gap: 12px;
    padding: 10px 0;
    grid-template-columns: none;
    scrollbar-width: none;
    -ms-overflow-style: none;
    scroll-snap-type: x mandatory;
  }
  .rank-grid::-webkit-scrollbar {
    display: none;
  }
  
  .rank-card {
    flex: 0 0 300px;
    width: 300px;
    padding: 12px;
    flex-direction: row;
    gap: 12px;
    background: var(--el-bg-color);
    box-shadow: none;
    align-items: center;
    position: relative;
    scroll-snap-align: start;
  }


  .rank-cover-wrapper {
    width: 80px;
    height: 80px;
  }
  
  .rank-cover {
    width: 80px;
    height: 80px;
    border-radius: 8px;
  }
  
  /* Show rank songs on mobile */
  .rank-songs {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    overflow: hidden;
  }
  
  .rank-song-row {
    font-size: 12px;
  }

  /* Hide the extra name we added for cover-only mode */
  .rank-card .playlist-name {
    display: none;
  }

  /* Personalized Cards Horizontal on Mobile */
  .left-col {
    flex-direction: row;
  }
  .personalized-card-v2 {
    padding: 12px;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    gap: 8px;
  }
  .card-icon-wrapper {
    margin-right: 0;
    width: 48px;
    height: 48px;
  }
  .daily-icon { font-size: 32px !important; }
  .card-title-v2 {
    font-size: 14px;
  }
  .card-desc-v2 {
    display: none;
  }
  .song-name-row {
    flex-wrap: nowrap;
  }
  .song-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .song-artist {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* Page Transitions */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Song Row Styles */
.song-row-content {
  display: flex;
  align-items: center;
  gap: 12px;
}
.song-row-cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  flex-shrink: 0;
}
.song-row-cover-placeholder {
  width: 100%;
  height: 100%;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}
.song-row-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  flex: 1;
}
.song-row-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}
.song-row-artist {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.song-row-duration {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: auto;
  padding-left: 8px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.header-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-right: 8px;
  flex-shrink: 0;
}
.header-pagination .page-info {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.table-header-bar > span {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
</style>
