import type { ReactNode } from 'react';
import type { Icon } from 'iconsax-react';

/**
 * The title block at the top of every page: a deep-teal "Band" strip with the page's icon.
 * `compact` (table pages) is one slim line, leaving the height to the grid rows.
 */
export function PageHeader({ title, subtitle, icon: PageIcon, compact }: { title: ReactNode; subtitle?: ReactNode; icon?: Icon; compact?: boolean }) {
  return (
    <div className={`page-hdr${compact ? ' compact' : ''}`}>
      {PageIcon && (
        <span className="ph-icon" aria-hidden="true">
          <PageIcon size={22} color="currentColor" variant="Bulk" />
        </span>
      )}
      <div className="ph-text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
    </div>
  );
}
