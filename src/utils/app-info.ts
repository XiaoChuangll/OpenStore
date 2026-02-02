export const getGitHubInfo = (url: string) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  } catch {}
  return null;
};

export const getAppIconUrl = (item: any) => {
  if (item.icon_url) return item.icon_url;
  const direct = item.icon || item.logo;
  if (direct) return direct;
  
  const link = item.url || item.link || item.homepage || item.download_url || item.downloadLink;
  if (link) {
    const gh = getGitHubInfo(link);
    if (gh) return `https://images.weserv.nl/?url=github.com/${gh.owner}.png`;
  }
  
  if (!link) return null;
  try {
    const u = new URL(link);
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
};
