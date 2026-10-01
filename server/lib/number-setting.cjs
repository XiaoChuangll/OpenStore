/*
 * 读取「每分钟限流」这类数值配置：优先后台 env_vars 表，其次 .env / 进程环境变量。
 */
const db = require('../database.cjs');
const { decrypt } = require('./secret.cjs');
const { readEnvFile } = require('./env-file.cjs');
const readNumberSetting = async (key, fallback) => {
  try {
    const fromDb = await new Promise((resolve) => {
      db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, [key], (e1, row) => {
        if (!e1 && row && row.value_encrypted) {
          const n = Number(decrypt(row.value_encrypted));
          if (Number.isFinite(n)) return resolve(n);
        }
        resolve(null);
      });
    });
    if (fromDb !== null) return fromDb;
  } catch {}
  const envFile = readEnvFile();
  const n = Number(envFile[key] ?? process.env[key]);
  return Number.isFinite(n) ? n : fallback;
};

module.exports = { readNumberSetting };
