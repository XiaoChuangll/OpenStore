/*
 * 后台「数据库维护」支持的操作清单。
 *
 * 日志模式是**写进库文件**的持久设置（不像 synchronous 那样每次都恢复默认），所以切一次就长期有效。
 * wal：读写不互相阻塞，后台跑统计/维护时前台写日志不会被卡住；代价是旁边多出 .db-wal / .db-shm 两个文件，
 *      备份必须走备份接口的 VACUUM INTO，不能直接拷 .db。
 * delete：回到单文件，兼容一切"直接拷贝库文件"的旧习惯。
 */
const DB_MAINTENANCE_ACTIONS = {
  analyze: { sql: 'ANALYZE', label: '刷新统计信息 (ANALYZE)' },
  optimize: { sql: 'PRAGMA optimize', label: '优化查询计划 (PRAGMA optimize)' },
  reindex: { sql: 'REINDEX', label: '重建索引 (REINDEX)' },
  vacuum: { sql: 'VACUUM', label: '整理碎片 (VACUUM)' },
  checkpoint: { sql: 'PRAGMA wal_checkpoint(TRUNCATE)', label: 'WAL 检查点' },
  integrity: { sql: 'PRAGMA integrity_check', label: '完整性检查 (integrity_check)' },
  /*
   * 日志模式是**写进库文件**的持久设置（不像 synchronous 那样每次都恢复默认），所以切一次就长期有效。
   * wal：读写不互相阻塞，后台跑统计/维护时前台写日志不会被卡住；代价是旁边多出 .db-wal / .db-shm 两个文件，
   *      备份必须走备份接口的 VACUUM INTO，不能直接拷 .db。
   * delete：回到单文件，兼容一切"直接拷贝库文件"的旧习惯。
   */
  'journal-wal': { sql: 'PRAGMA journal_mode = WAL', label: '切换到 WAL 模式' },
  'journal-delete': { sql: 'PRAGMA journal_mode = DELETE', label: '切回 delete 模式' }
};

module.exports = { DB_MAINTENANCE_ACTIONS };
