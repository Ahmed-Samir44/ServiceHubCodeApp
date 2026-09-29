/**
 * Turns the image links people paste into Dataverse text columns into URLs an <img> can load.
 * Handles: missing scheme ("www…", "//…"), HTML snippets (<img src=…>), Google Drive share links,
 * Dropbox share links and SharePoint / OneDrive sharing links.
 */
export function imageUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  // Rich-text / HTML value: take the first image (or link) inside it.
  const htmlSrc = /<img[^>]+src=["']([^"']+)["']/i.exec(value)?.[1] ?? /<a[^>]+href=["']([^"']+)["']/i.exec(value)?.[1];
  if (htmlSrc) value = htmlSrc.replace(/&amp;/g, '&');

  if (value.startsWith('//')) value = `https:${value}`;
  else if (/^www\./i.test(value)) value = `https://${value}`;
  else if (value.startsWith('data:image/')) return value;
  if (!/^https?:\/\//i.test(value)) return null;
  // Browsers block plain-http images inside the https Power Apps host.
  value = value.replace(/^http:\/\//i, 'https://');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  // SharePoint "Access Denied" page saved instead of the image (happened for the EGY locations):
  // the real file URL is its Source parameter. It only loads for users who can open that site.
  if (/\/_layouts\/15\/AccessDenied\.aspx$/i.test(url.pathname)) {
    const source = url.searchParams.get('Source');
    if (!source || !/^https:\/\//i.test(source)) return null;
    try {
      return new URL(source).toString();
    } catch {
      return null;
    }
  }

  // Google Drive: /file/d/<id>/view, open?id=<id>, uc?id=<id>
  if (/(^|\.)drive\.google\.com$/i.test(url.hostname) || /(^|\.)docs\.google\.com$/i.test(url.hostname)) {
    const id = /\/d\/([\w-]+)/.exec(url.pathname)?.[1] ?? url.searchParams.get('id');
    if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
  }
  // Dropbox share link: ask for the raw file.
  if (/(^|\.)dropbox\.com$/i.test(url.hostname)) {
    url.searchParams.delete('dl');
    url.searchParams.set('raw', '1');
    return url.toString();
  }
  // SharePoint / OneDrive sharing link (…/:i:/…): ask for the file itself. Direct file URLs are left alone.
  const isShareLink = /sharepoint\.com$/i.test(url.hostname) ? /^\/:[a-z]:\//i.test(url.pathname) : /1drv\.ms$|onedrive\.live\.com$/i.test(url.hostname);
  if (isShareLink && !url.searchParams.has('download')) {
    url.searchParams.set('download', '1');
    return url.toString();
  }
  return url.toString();
}
