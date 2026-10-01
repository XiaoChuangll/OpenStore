/*
 * 环境变量敏感值的对称加密（AES-256-GCM）。
 *
 * 密钥来源优先级：ENV_SECRET_KEY（hex） > server/secret.key > 首次启动随机生成并落盘。
 * 后台「环境变量」面板里标记为 secure 的键，落库前都过这里的 encrypt()。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const secretKeyPath = path.join(__dirname, '..', 'secret.key');

function getSecretKey() {
  const envKey = process.env.ENV_SECRET_KEY;
  if (envKey) return Buffer.from(envKey, 'hex');
  if (fs.existsSync(secretKeyPath)) {
    return fs.readFileSync(secretKeyPath);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(secretKeyPath, key);
  return key;
}

const KEY = getSecretKey();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(data) {
  try {
    const buf = Buffer.from(data, 'base64');
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

module.exports = { getSecretKey, encrypt, decrypt, KEY };
