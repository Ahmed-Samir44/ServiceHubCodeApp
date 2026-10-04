import { useState } from 'react';
import { ArrowRight2 } from 'iconsax-react';
import discImage from '../../assets/region-disc.jpg';
import { REGION_CURRENCY, REGION_LABEL, REGION_MARK, REGIONS, type Region } from '../../app/region';

/** Where each region sits on the rendered disc (percent of the 1470 × 704 image). */
const PIN_AT: Record<Region, { left: number; top: number }> = {
  EGY: { left: 42.3, top: 44 },
  KSA: { left: 61.5, top: 52 },
};

/**
 * Service Hub landing: the rendered glass map disc (a light sage tint over the silver render) with
 * a glass pin and card per region; a pin or its card picks the region.
 */
export function RegionMap({ onSelect }: { onSelect: (region: Region) => void }) {
  const [hover, setHover] = useState<Region | null>(null);
  return (
    <div className="rmap">
      <img className="rmap-img" src={discImage} alt="" draggable={false} />
      <span className="rmap-tint" aria-hidden="true" />
      {REGIONS.map((region) => (
        <span
          key={region}
          className={`rmap-glow${hover === region ? ' hover' : ''}`}
          style={{ left: `${PIN_AT[region].left}%`, top: `${PIN_AT[region].top}%` }}
          aria-hidden="true"
        />
      ))}

      {REGIONS.map((region) => (
        <button
          key={region}
          type="button"
          className={`rmap-pin rmap-pin-${region === 'EGY' ? 'left' : 'right'}`}
          style={{ left: `${PIN_AT[region].left}%`, top: `${PIN_AT[region].top}%` }}
          onClick={() => onSelect(region)}
          onMouseEnter={() => setHover(region)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(region)}
          onBlur={() => setHover(null)}
          aria-label={`Open ${REGION_LABEL[region]}`}
        >
          <span className="rmap-drop">
            <span className="rmap-mark">{REGION_MARK[region]}</span>
          </span>
          <span className="rmap-label">
            <span className="rmap-name">{REGION_LABEL[region]}</span>
            <span className="rmap-hint">
              Business units and prices in <b>{REGION_CURRENCY[region]}</b>
            </span>
            <span className="rmap-go">
              Open {REGION_LABEL[region]}
              <ArrowRight2 size={14} color="currentColor" />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
