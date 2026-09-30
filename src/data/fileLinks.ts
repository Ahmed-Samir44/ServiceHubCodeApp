import { embedUrl, openInNewTab } from './hub/library';

/**
 * Links to documents on SharePoint (Excel, Word, PowerPoint, PDF) open in one pop-up window centred
 * on the screen (85%), everywhere in the app. SharePoint won't let the code-app host frame its pages
 * (frame-ancestors), and the app doesn't download files itself (user decision, 2026-09-30). The
 * window shows Office Online's clean read-only view; only its short "Opening…" screen is ours.
 */

const SHAREPOINT_HOST = /(^|\.)sharepoint\.com$/i;
const OFFICE_PAGE = /\/_layouts\/15\/(doc|doc2|wopiframe|wopiframe2|xlviewer)\.aspx$/i;
const SHARING_LINK = /^\/:[a-z]:\//i;
const DOCUMENT_FILE = /\.(xlsx|xlsm|xlsb|xls|csv|docx|docm|doc|pptx|pptm|ppt|pdf)$/i;

/** Whether a link points to a document on SharePoint (opened in the pop-up window). */
export function isSharePointDocument(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (!SHAREPOINT_HOST.test(url.hostname)) return false;
  return OFFICE_PAGE.test(url.pathname) || SHARING_LINK.test(url.pathname) || DOCUMENT_FILE.test(decodeURIComponent(url.pathname));
}

/**
 * Office Online's embed view (no ribbon or menus) with Excel's row/column headers and gridlines
 * hidden, so a designed sheet reads like a page. Other links are returned unchanged.
 */
function cleanViewUrl(raw: string): string {
  const embed = embedUrl(raw);
  if (!/action=embedview/i.test(embed)) return raw;
  const url = new URL(embed);
  url.searchParams.delete('mobileredirect');
  url.searchParams.set('wdHideHeaders', 'True');
  url.searchParams.set('wdHideGridlines', 'True');
  return url.toString();
}

const POPUP_NAME = 'servicehub-file';
const POPUP_SHARE = 0.85;

/** Each further open window is shifted by this much, so stacked windows stay visible. */
const CASCADE = 32;

/** Centred at 85% of the screen; the n-th extra open window is shifted down-right. */
function popupFeatures(shift: number): string {
  const width = Math.round(screen.availWidth * POPUP_SHARE);
  const height = Math.round(screen.availHeight * POPUP_SHARE);
  const screenLeft = (screen as Screen & { availLeft?: number }).availLeft ?? 0;
  const screenTop = (screen as Screen & { availTop?: number }).availTop ?? 0;
  const room = Math.min(screen.availWidth - width, screen.availHeight - height) / 2;
  const offset = room > 0 ? (shift * CASCADE) % Math.max(CASCADE, room) : 0;
  const left = Math.round(screenLeft + (screen.availWidth - width) / 2 + offset);
  const top = Math.round(screenTop + (screen.availHeight - height) / 2 + offset);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

/**
 * One window per link (kept by reference: with its opener cleared, a window name no longer finds
 * it). Opening a link again brings its window to the front; another link gets its own window.
 */
const windows = new Map<string, Window>();
let opened = 0;

function openWindows(): number {
  for (const [key, popup] of windows) if (popup.closed) windows.delete(key);
  return windows.size;
}

/** The app-styled screen shown until Office Online loads. */
function paintOpening(popup: Window, name: string): void {
  const doc = popup.document;
  doc.title = name ? `${name} · ServiceHub` : 'ServiceHub';
  doc.head.innerHTML = `<style>
    *{box-sizing:border-box}
    body{margin:0;height:100vh;display:flex;flex-direction:column;font-family:'Urbanist',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;background:#f3f5f6;color:#1d2b2a}
    header{display:flex;align-items:center;gap:10px;padding:0 18px;height:52px;background:linear-gradient(90deg,#063b36,#0d594b);color:#fff;font-weight:700;font-size:16px}
    .logo{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(135deg,#2fd3a3,#126e5c);font-size:12px}
    main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
    .spin{width:34px;height:34px;border-radius:50%;border:3px solid #d9f8ec;border-top-color:#126e5c;animation:s .8s linear infinite}
    .name{font-weight:700;font-size:17px}.sub{color:#6b7775;font-size:14px}
    @keyframes s{to{transform:rotate(360deg)}}
  </style>`;
  doc.body.innerHTML = '<header><span class="logo">SH</span>ServiceHub</header><main><div class="spin"></div><div class="name"></div><div class="sub">Opening…</div></main>';
  const label = doc.querySelector('.name');
  if (label) label.textContent = name;
}

/** Opens a document in its own pop-up window (brought to the front if already open); a new tab if pop-ups are blocked. */
export function openInPopup(url: string, name = ''): void {
  const key = url.trim();
  const existing = windows.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }
  const shift = openWindows();
  opened += 1;
  const popup = window.open('', `${POPUP_NAME}-${opened}`, popupFeatures(shift));
  if (!popup) {
    openInNewTab(url);
    return;
  }
  paintOpening(popup, name);
  popup.opener = null;
  windows.set(key, popup);
  popup.location.href = cleanViewUrl(url);
  popup.focus();
}

/** Opens one link: documents in the pop-up window; with `newTab` (system links), other sites in a new tab. */
export function openLink(link: string, name = '', newTab = false): void {
  if (newTab && !isSharePointDocument(link)) openInNewTab(link);
  else openInPopup(link, name);
}

/**
 * Click handler for plain <a href> links (grids, forms): SharePoint documents go to the pop-up
 * window instead of a new tab; other links keep their normal behaviour.
 */
export function onFileLinkClick(event: { preventDefault: () => void; stopPropagation: () => void }, url: string, name = ''): void {
  event.stopPropagation();
  if (!isSharePointDocument(url)) return;
  event.preventDefault();
  openInPopup(url, name);
}
