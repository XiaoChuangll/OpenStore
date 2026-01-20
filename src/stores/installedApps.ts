import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAppDetail, searchApps } from '../services/next-api';

export interface InstalledApp {
  id: number | string;
  name: string;
  packageName?: string;
  version: string;
  icon?: string;
  installedAt: number;
}

export interface AppUpdate {
  app: InstalledApp;
  latestVersion: string;
  latestVersionCode?: number;
  updateInfo?: any; // Full app detail from API
}

export const useInstalledAppsStore = defineStore('installedApps', () => {
  const installedApps = ref<InstalledApp[]>([]);
  const availableUpdates = ref<AppUpdate[]>([]);
  const loading = ref(false);
  const initialized = ref(false);

  // Helper to compare versions (v1 is installed, v2 is latest)
  // Returns true if v2 > v1
  const hasUpdate = (v1: string, v2: string): boolean => {
    if (!v1 || !v2) return false;
    const p1 = v1.replace(/[^0-9.]/g, '').split('.').map(Number);
    const p2 = v2.replace(/[^0-9.]/g, '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n2 > n1) return true;
      if (n2 < n1) return false;
    }
    return false;
  };

  // Initialize with some mock data if empty
  // We fetch some real apps and "install" them with downgraded versions
  const initialize = async () => {
    if (initialized.value) return;
    loading.value = true;
    try {
      // Fetch some popular apps to simulate installation
      // We use search or category to get a list
      const res = await searchApps('', 1, 10);
      const apps = res.data?.data || [];
      
      if (apps.length > 0) {
        // Randomly pick 5 apps to be "installed"
        const shuffled = apps.sort(() => 0.5 - Math.random()).slice(0, 5);
        
        installedApps.value = shuffled.map((app: any) => {
          // Downgrade version logic: 
          // If version is 1.2.3, make it 1.2.0 or 1.0.0
          const realVersion = app.versionName || app.version_name || '1.0.0';
          const parts = realVersion.split('.');
          let fakeVersion = '1.0.0';
          if (parts.length >= 2) {
             // Simply decrement the last number or set to 0
             parts[parts.length - 1] = '0';
             fakeVersion = parts.join('.');
             // If they happen to be equal (e.g. original was 1.0.0), make it 0.9.0
             if (fakeVersion === realVersion) {
                 fakeVersion = '0.9.0';
             }
          }

          return {
            id: app.appId || app.id,
            name: app.name,
            version: fakeVersion,
            icon: app.icon || app.icon_url,
            installedAt: Date.now() - Math.floor(Math.random() * 10000000000)
          };
        });
      }
    } catch (e) {
      console.error('Failed to initialize installed apps', e);
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  };

  const checkForUpdates = async () => {
    loading.value = true;
    availableUpdates.value = [];
    
    try {
      const updates: AppUpdate[] = [];
      
      for (const app of installedApps.value) {
        try {
          // Fetch latest detail
          const detailRes = await getAppDetail(String(app.id));
          // The API structure might vary, adjust as needed based on actual response
          const latestApp = detailRes.data || detailRes; 
          
          const latestVersion = latestApp.versionName || latestApp.version_name;
          
          if (latestVersion && hasUpdate(app.version, latestVersion)) {
            updates.push({
              app,
              latestVersion,
              updateInfo: latestApp
            });
          }
        } catch (err) {
          console.warn(`Failed to check update for ${app.name}`, err);
        }
      }
      
      availableUpdates.value = updates;
    } catch (e) {
      console.error('Check updates failed', e);
    } finally {
      loading.value = false;
    }
  };

  const updateApp = (appId: string | number) => {
    // Simulate update process
    const updateIndex = availableUpdates.value.findIndex(u => u.app.id === appId);
    if (updateIndex !== -1) {
      const update = availableUpdates.value[updateIndex];
      // Update the installed version
      const appIndex = installedApps.value.findIndex(a => a.id === appId);
      if (appIndex !== -1) {
        installedApps.value[appIndex].version = update.latestVersion;
      }
      // Remove from available updates
      availableUpdates.value.splice(updateIndex, 1);
    }
  };

  return {
    installedApps,
    availableUpdates,
    loading,
    initialized,
    initialize,
    checkForUpdates,
    updateApp
  };
});
