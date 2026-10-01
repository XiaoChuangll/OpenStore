/*
 * 应用投稿 / 问题反馈的入参归一化与校验。
 */
const normalizeSubmission = (body) => {
  const toText = (v) => String(v ?? '').trim();
  const name = toText(body?.name);
  const provider = toText(body?.provider);
  const bg_url = toText(body?.bg_url);
  const icon_url = toText(body?.icon_url);
  const download_url = toText(body?.download_url);
  return { name, provider, bg_url, icon_url, download_url };
};

const normalizeFeedback = (body) => {
  const toText = (v) => String(v ?? '').trim();
  const type = toText(body?.type);
  const title = toText(body?.title);
  const description = toText(body?.description);
  const device_type = toText(body?.device_type);
  const os = toText(body?.os);
  const browser = toText(body?.browser);
  const network = toText(body?.network);
  const page_url = toText(body?.page_url);
  const user_role = toText(body?.user_role);
  const email = toText(body?.email);
  return { type, title, description, device_type, os, browser, network, page_url, user_role, email };
};

const validateSubmission = (payload) => {
  if (!payload.name) return '应用名称不能为空';
  if (!payload.provider) return '应用提供者不能为空';
  if (!payload.bg_url) return '背景URL不能为空';
  if (!payload.icon_url) return '图标URL不能为空';
  if (!payload.download_url) return '下载链接不能为空';
  return '';
};

module.exports = { normalizeSubmission, normalizeFeedback, validateSubmission };
