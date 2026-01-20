import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getMonitors, type Monitor } from '../services/api';

export const useMonitorStore = defineStore('monitor', () => {
  const monitors = ref<Monitor[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchMonitors = async () => {
    loading.value = true;
    error.value = null;
    try {
      monitors.value = await getMonitors();
    } catch (err: any) {
      error.value = err.message || 'Failed to load data';
    } finally {
      loading.value = false;
    }
  };

  return { monitors, loading, error, fetchMonitors };
});
