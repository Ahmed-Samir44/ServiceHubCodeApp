import { useCallback, useState, type KeyboardEvent } from 'react';
import { HambergerMenu, Moon, Sun1 } from 'iconsax-react';
import { ServiceHubScreen } from '../screens/ServiceHubScreen';
import { TableScreen } from '../screens/TableScreen';
import { DEFAULT_HUB_SECTION_ID, type HubSectionId } from './hubSections';
import { DEFAULT_NAV_ITEM_ID, NAV_GROUPS, SERVICE_HUB_ITEM, getNavItem, type NavItem } from './navigation';
import { usePermissions } from './permissionsContext';
import { REGION_LABEL, REGION_MARK, type Region } from './region';
import { useRegionContext } from './regionContext';
import { RegionModal } from './RegionModal';
import { useCurrentUser } from './useCurrentUser';
import { TEXT_SIZES, readTextSize, textZoom, writeTextSize, type TextSizeId } from './preferences';

const THEME_STORAGE_KEY = 'servicehub.theme';

function readStoredDarkMode(): boolean {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Keyboard activation for the div-based sidebar items (markup/classes kept identical to base.css). */
const activateOnKey = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
};

export function AppShell() {
  const { region, setRegion } = useRegionContext();
  const user = useCurrentUser();
  const [activeItemId, setActiveItemId] = useState<string>(DEFAULT_NAV_ITEM_ID);
  // Kept here (not inside the hub screen) so the chosen section survives visiting a table and coming back.
  const [hubSectionId, setHubSectionId] = useState<HubSectionId>(DEFAULT_HUB_SECTION_ID);
  const [darkMode, setDarkMode] = useState(readStoredDarkMode);
  const [textSize, setTextSizeState] = useState<TextSizeId>(readTextSize);
  const setTextSize = useCallback((size: TextSizeId) => {
    setTextSizeState(size);
    writeTextSize(size);
  }, []);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { ready: permissionsReady, privileges } = usePermissions();
  // Tables the user has no Read privilege on are hidden, as in the model-driven sitemap.
  // Until privileges are known, table entries wait (the Service Hub page is always available).
  const isVisible = (item: NavItem) => item.kind === 'hub' || (permissionsReady && privileges.can(item.table.logicalName, 'read'));
  const requestedItem = getNavItem(activeItemId);
  const activeItem = isVisible(requestedItem) ? requestedItem : SERVICE_HUB_ITEM;
  const userName = user?.fullName ?? '';

  const setTheme = useCallback((dark: boolean) => {
    setDarkMode(dark);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Preference just won't persist.
    }
  }, []);

  const openItem = useCallback((id: string) => {
    setActiveItemId(id);
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  const openHubSection = useCallback((id: HubSectionId) => {
    setHubSectionId(id);
    window.scrollTo({ top: 0 });
  }, []);

  const pickRegion = useCallback(
    (next: Region) => {
      setRegion(next);
      setRegionModalOpen(false);
    },
    [setRegion],
  );

  return (
    <div className={`servhub-app${darkMode ? ' dark' : ''}`}>
      <nav className="navbar">
        <div className="nav-l">
          <button
            type="button"
            className="nav-burger"
            aria-label="Open menu"
            aria-expanded={mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen((open) => !open)}
          >
            <HambergerMenu size={16} color="currentColor" />
          </button>
          <div className="nav-brand">SH</div>
          <div className="nav-title">ServiceHub</div>
        </div>
        <div className="nav-r">
          <div className="text-size-toggle" role="group" aria-label="Text size">
            {TEXT_SIZES.map((size, index) => (
              <button
                key={size.id}
                type="button"
                className={`text-size-btn size-${index}${size.id === textSize ? ' active' : ''}`}
                title={size.title}
                aria-label={size.title}
                aria-pressed={size.id === textSize}
                onClick={() => setTextSize(size.id)}
              >
                {size.label}
              </button>
            ))}
          </div>
          {/* Region drives the Service Hub page and which view (EGY / KSA) each table opens on. */}
          <button
            type="button"
            className="region-chip"
            onClick={() => setRegionModalOpen(true)}
            aria-label={region ? `Region: ${REGION_LABEL[region]}. Change region` : 'Select region'}
          >
            {region && <span className="rb-flag">{REGION_MARK[region]}</span>}
            {region ? REGION_LABEL[region] : 'Select region'}
            <span className="rb-chevron">▼</span>
          </button>
          {userName && (
            <>
              <span className="nav-dot" />
              <span className="nav-user">{userName}</span>
              <div className="nav-avatar" aria-hidden="true">{initialsOf(userName)}</div>
            </>
          )}
        </div>
      </nav>

      <div className="shell">
        <aside className={`sidebar${mobileSidebarOpen ? ' mobile-open' : ''}`} aria-label="ServiceHub navigation">
          <div className="sb-brand">
            <div className="sb-app">ServiceHub</div>
            <div className="sb-org">ANDALUSIA GROUP</div>
          </div>
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(isVisible);
            if (!items.length && permissionsReady) return null;
            return (
            <div key={group.id} role="group" aria-label={group.label}>
              <div className="sb-label">{group.label}</div>
              {!permissionsReady && group.items.some((item) => item.kind === 'table') && (
                <div className="sb-item" aria-busy="true" style={{ cursor: 'default', opacity: 0.6 }}>
                  <span className="sb-item-text">Checking access…</span>
                </div>
              )}
              {items.map((item) => {
                const active = item.id === activeItem.id;
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={`sb-item${active ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => openItem(item.id)}
                    onKeyDown={activateOnKey(() => openItem(item.id))}
                  >
                    <ItemIcon size={16} color="currentColor" variant={active ? 'Bold' : 'Linear'} />
                    <span className="sb-item-text">{item.label}</span>
                  </div>
                );
              })}
            </div>
            );
          })}
          <div className="sb-theme-toggle" role="group" aria-label="Theme">
            <button type="button" className={`theme-btn${darkMode ? '' : ' active'}`} aria-pressed={!darkMode} onClick={() => setTheme(false)}>
              <Sun1 size={14} color="currentColor" />
              Light
            </button>
            <button type="button" className={`theme-btn${darkMode ? ' active' : ''}`} aria-pressed={darkMode} onClick={() => setTheme(true)}>
              <Moon size={14} color="currentColor" />
              Dark
            </button>
          </div>
        </aside>
        <div
          className={`sidebar-backdrop${mobileSidebarOpen ? ' show' : ''}`}
          role="presentation"
          onClick={() => setMobileSidebarOpen(false)}
        />
        {/* Text size scales the whole content area, so spacing grows with the fonts. */}
        <main className="main" style={{ zoom: textZoom(textSize) }}>
          {activeItem.kind === 'hub' ? (
            <ServiceHubScreen
              region={region}
              onSelectRegion={setRegion}
              sectionId={hubSectionId}
              onSelectSection={openHubSection}
            />
          ) : (
            <TableScreen key={activeItem.id} label={activeItem.label} table={activeItem.table} region={region} />
          )}
        </main>
      </div>

      {regionModalOpen && (
        <RegionModal current={region} onSelect={pickRegion} onCancel={() => setRegionModalOpen(false)} />
      )}
    </div>
  );
}
