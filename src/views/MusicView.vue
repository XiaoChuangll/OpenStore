<template>
  <div class="music-view" :style="{ paddingBottom: (playerStore.showPlayer && playerStore.currentTrack) ? (isMobile ? '85px' : '100px') : '20px' }">
    



    <!-- Main Content -->
    <div class="music-content" v-loading="loading">
      
      <!-- Search & Header Bar -->
      <el-card class="mb-4 search-card" shadow="hover" v-if="viewMode === 'home' || viewMode === 'mine'">
         <div class="header-bar" :class="{ 'mobile-layout': isMobile }">
             <!-- API Status (Left) -->
             <div class="api-status-wrapper">
                <el-dropdown v-if="currentApi" trigger="click" @command="handleSwitchApi">
                   <el-tag type="success" size="small" effect="plain" class="api-tag cursor-pointer">
                     <span class="flex-center">
                       API: {{ currentApi.friendly_name }} ({{ currentApi.latency }}ms)
                       <el-icon class="ml-1"><ArrowDown /></el-icon>
                     </span>
                   </el-tag>
                   <template #dropdown>
                      <el-dropdown-menu>
                         <el-dropdown-item v-for="api in availableApis" :key="api.id" :command="api">
                            {{ api.friendly_name }}
                            <el-tag v-if="api.latency" size="small" type="info" class="ml-2">{{ api.latency }}ms</el-tag>
                         </el-dropdown-item>
                         <el-dropdown-item v-if="availableApis.length === 0" disabled>无可用节点</el-dropdown-item>
                      </el-dropdown-menu>
                   </template>
                </el-dropdown>

                <el-tag v-else-if="checkingApi" type="warning" size="small" effect="plain" class="api-tag">
                  <span class="flex-center">
                    <el-icon class="is-loading mr-1"><Loading /></el-icon> 正在寻找...
                  </span>
                </el-tag>
                <el-tag v-else type="danger" size="small" effect="plain" class="api-tag">
                  <span class="flex-center">
                    无可用线路
                  </span>
                </el-tag>
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
      </el-card>

      <!-- Search Results -->
      <div v-if="searchResults.length > 0" class="section mb-4">
        <div class="section-header">
           <h3>搜索结果</h3>
           <el-button link @click="clearSearch">清除</el-button>
        </div>
        
        <!-- Song List -->
        <div v-if="searchType === 1" class="song-list">
           <div v-for="song in searchResults" :key="song.id" class="song-item" @click="playSong(song)">
              <el-image :src="getCover(song)" class="song-cover" lazy>
                 <template #error><el-icon><Headset /></el-icon></template>
              </el-image>
              <div class="song-info">
                 <div class="song-name" v-html="highlight(song.name)"></div>
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

        <!-- Greet Section (Home/Mine) -->
      <div class="section mb-4" v-if="viewMode === 'home' || viewMode === 'mine'">
         <div class="greet-section mb-3">
            <div class="flex-between-center">
               <h2 class="greet-title">{{ greeting }}{{ playerStore.userProfile ? '，' + playerStore.userProfile.nickname : '' }}</h2>
               
               <el-radio-group v-model="mainTab" size="small" class="custom-switch" @change="handleMainTabChange">
                  <el-radio-button label="home">首页</el-radio-button>
                  <el-radio-button label="mine">歌单</el-radio-button>
                  <el-radio-button label="podcast">播客</el-radio-button>
               </el-radio-group>
            </div>
            <div class="greet-subtitle">由此开启好心情 ~</div>
         </div>
      </div>

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

    <!-- Playlist Detail Dialog -->
    <el-dialog v-model="showPlaylistDialog" title="歌单" fullscreen class="playlist-dialog" append-to-body>
      <div class="playlist-table-wrapper">
        <el-table :data="pagedPlaylistTracks" stripe style="width: 100%; height: 100%;" v-loading="playlistLoading" @row-click="playSong" :row-style="{ height: '60px' }">
          <el-table-column type="index" :width="isMobile ? 40 : 60" :index="(i: number) => (playlistPage - 1) * 10 + i + 1">
            <template #header>
              <el-image 
                v-if="currentPlaylist?.coverImgUrl || currentPlaylist?.picUrl"
                :src="currentPlaylist.coverImgUrl || currentPlaylist.picUrl" 
                style="width: 30px; height: 30px; border-radius: 4px; vertical-align: middle; cursor: pointer;" 
                fit="cover"
                :preview-src-list="[currentPlaylist.coverImgUrl || currentPlaylist.picUrl]"
                preview-teleported
              />
            </template>
          </el-table-column>
          <el-table-column min-width="200" show-overflow-tooltip>
            <template #header>
              <div class="table-header">
                <div class="table-header-title">{{ currentPlaylist?.name || '歌单' }}</div>
                <div class="table-header-bar">
                  <span>歌曲</span>
                  <div class="header-pagination">
                    <el-button 
                       size="small" 
                       circle 
                       text 
                       :icon="ArrowLeft" 
                       :disabled="playlistPage === 1" 
                       @click.stop="playlistPage--" 
                    />
                    <span class="page-info">{{ playlistPage }}/{{ Math.ceil(totalPlaylistTracks / 10) || 1 }}</span>
                    <el-button 
                       size="small" 
                       circle 
                       text 
                       :icon="ArrowRight" 
                       :disabled="playlistPage >= (Math.ceil(totalPlaylistTracks / 10) || 1)" 
                       @click.stop="playlistPage++" 
                    />
                  </div>
                </div>
              </div>
            </template>
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
                  <div class="song-row-name">{{ row.name }}</div>
                  <div class="song-row-artist">{{ getArtistName(row) }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useLayoutStore } from '../stores/layout';
import { proxyRequest, getMusicApis } from '../services/api';
import { musicCache } from '../utils/cache'; // Import CacheManager
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Loading, Headset, VideoPlay, Download, ArrowLeft, ArrowRight, Refresh, ArrowDown, Calendar, Star, CaretRight, Delete, VideoPause, Collection, User } from '@element-plus/icons-vue';

defineOptions({
  name: 'MusicView'
});

const router = useRouter();
const playerStore = usePlayerStore();
const layoutStore = useLayoutStore();
const pageHeaderRef = ref<HTMLElement | null>(null);

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

// User State (Moved to Store)
// const userProfile = ref<any>(null);
// const checkingLogin = ref(false);
// const showLoginDialog = ref(false);
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
    document.title = `${title} - OpenStore`;
};

watch(showPlaylistDialog, (val) => {
    if (val) {
         const title = '歌单';
         layoutStore.setPageInfo(title, true, closePlaylistDialog);
         document.title = `${title} - OpenStore`;
    } else {
         restorePageTitle();
    }
});

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
        // topList already has all data from init
    } else if (mode === 'mine') {
        // Fetch user playlists if empty
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

        // DJ Sublist (Subscribed Podcasts)
        const res = await proxyRequest(`${baseUrl}/dj/sublist?limit=${limit}&offset=${offset}&cookie=${cookieEncoded}`, 'GET', headers, {});
        
        // Debug
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
    // Re-use playlist dialog logic if structure is similar, or just log for now
    // Podcasts usually have tracks/programs.
    // Let's treat it as a playlist for now, might need adjustment for API endpoints.
    // For now, let's use a simple alert or reuse openPlaylist if compatible.
    // Actually, DJ radios have programs, not tracks in the same way.
    // Let's try to fetch programs.
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
            
            // Fill array
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
        
        // Initial fetch to get count and first page
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
          
          // Init data
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
    ElMessage.success(`已切换至: ${api.friendly_name}`);
    initData();
};

// --- Data Fetching ---
const initData = async () => {
  fetchUserProfile();
  fetchDiscovery();
};



const fetchDiscovery = async (forceRefresh = false) => {
   if (!currentApi.value) return;
   
   // Cache Key
   const CACHE_KEY = 'discovery_data';
   
   // Check Cache
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
   
   // Parallel fetch
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
       
       // Set Cache
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
  // showLoginDialog.value = true; // Controlled by store
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
    currentPlaylist.value = { name: album.name, coverImgUrl: album.picUrl, type: 'album' }; // Mock playlist obj
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
    currentPlaylist.value = { name: artist.name, coverImgUrl: artist.picUrl, type: 'artist' };
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

const downloadSong = async (song: any) => {
    if (!currentApi.value) return;
    try {
        const baseUrl = currentApi.value.baseUrl;
        const cookie = getCookie();
        const headers = cookie ? { Cookie: cookie } : {};
        const cookieEncoded = cookie ? encodeURIComponent(cookie) : '';
        const res = await proxyRequest(`${baseUrl}/song/url?id=${song.id}&cookie=${cookieEncoded}`, 'GET', headers, {});
        const url = res.data?.data?.[0]?.url;
        if (url) {
            window.open(url, '_blank');
        } else {
            ElMessage.warning('无法获取下载链接');
        }
    } catch (e) {
        ElMessage.error('下载出错');
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
const highlight = (text: string) => {
    if (!searchKeyword.value) return text;
    return text.replace(new RegExp(searchKeyword.value, 'gi'), match => `<span class="text-primary">${match}</span>`);
};
const formatCount = (count: number) => {
    if (count > 100000000) return (count / 100000000).toFixed(1) + '亿';
    if (count > 10000) return (count / 10000).toFixed(1) + '万';
    return count;
};

const openPlaylist = async (list: any) => {
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
        const res = await proxyRequest(`${baseUrl}/playlist/detail?id=${list.id}&cookie=${cookieEncoded}`, 'GET', headers, {});
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

// Scroll Handler
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
    
    // Load APIs
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
  margin: 0;
  font-size: 18px;
  font-weight: 600;
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
.song-name {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 4px;
}
.song-artist {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.song-action {
  display: flex;
  gap: 8px;
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
  /* Removed simple img style in favor of wrapper */
  /* width: 180px; height: 180px; display: block; margin: 0 auto 16px; */
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

.daily-card { background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%); color: #fff; }
.fm-card { background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%); color: #fff; }
.like-card { background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%); color: #fff; }

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
  height: 100%;
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
  overflow: hidden;
}

.fm-info {
  margin-top: 0;
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
  transform: scale(1.05);
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

.playlist-table-wrapper {
  height: calc(100vh - 80px);
  padding-bottom: 90px; /* Reserve space for dock */
  box-sizing: border-box;
}
.table-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.table-header-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.table-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
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
  min-width: 40px;
  text-align: center;
}

/* Header Bar Layout */
.header-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.header-bar.mobile-layout {
  flex-wrap: wrap;
}
.header-bar.mobile-layout .api-status-wrapper {
  order: 1;
}
.header-bar.mobile-layout .header-right-actions {
  order: 2;
  margin-left: auto;
}
.header-bar.mobile-layout .search-box {
  order: 3;
  width: 100%;
  flex: 0 0 100%;
}
.header-bar .search-box {
  flex: 1;
  min-width: 200px;
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

  /* .rank-card::after style moved to global */
  
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
