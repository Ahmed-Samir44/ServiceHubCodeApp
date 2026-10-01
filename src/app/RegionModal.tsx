import { ArrowRight2 } from 'iconsax-react';
import { REGION_CURRENCY, REGION_LABEL, REGION_MARK, REGIONS, type Region } from './region';

interface RegionOptionsProps {
  current: Region | null;
  onSelect: (region: Region) => void;
}

/**
 * The EGY / KSA choice as tiles (the region code as a large watermark) — used on the Service Hub
 * landing and inside the modal.
 */
export function RegionOptions({ current, onSelect }: RegionOptionsProps) {
  return (
    <div className="rl-grid">
      {REGIONS.map((region) => (
        <button
          key={region}
          type="button"
          className={`rl-card${region === current ? ' current' : ''}`}
          aria-pressed={region === current}
          onClick={() => onSelect(region)}
        >
          <span className="rl-watermark" aria-hidden="true">
            {REGION_MARK[region]}
          </span>
          <span className="rl-top">
            <span className="rl-mark">{REGION_MARK[region]}</span>
            <span className="rl-title">
              <span className="rl-name">{REGION_LABEL[region]}</span>
              <span className="rl-code">{region}</span>
            </span>
          </span>
          <span className="rl-line">
            {region === current ? (
              'Current region'
            ) : (
              <>
                Business units and prices in <b>{REGION_CURRENCY[region]}</b>
              </>
            )}
          </span>
          <span className="rl-go">
            Open {REGION_LABEL[region]}
            <ArrowRight2 size={14} color="currentColor" />
          </span>
        </button>
      ))}
    </div>
  );
}

interface RegionModalProps extends RegionOptionsProps {
  onCancel: () => void;
}

/** Change-region dialog opened from the navbar region chip. */
export function RegionModal({ current, onSelect, onCancel }: RegionModalProps) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal-box region-modal" role="dialog" aria-modal="true" aria-labelledby="region-modal-title">
        <div className="modal-hdr">
          <div className="modal-title" id="region-modal-title">Select Your Region</div>
          <div className="modal-sub">Choose a region to view doctors, services and offers</div>
        </div>
        <div className="modal-body">
          <RegionOptions current={current} onSelect={onSelect} />
          <button type="button" className="btn btn-outline btn-block" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
