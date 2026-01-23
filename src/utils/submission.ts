export type SubmissionPayload = {
  name: string;
  provider: string;
  bg_url: string;
  icon_url: string;
  download_url: string;
};

export const validateSubmissionPayload = (payload: SubmissionPayload) => {
  if (!payload.name) return '请输入应用名称';
  if (!payload.provider) return '请输入应用提供者';
  if (!payload.bg_url) return '请输入背景URL';
  if (!payload.icon_url) return '请输入图标URL';
  if (!payload.download_url) return '请输入下载链接';
  return '';
};
