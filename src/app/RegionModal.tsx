import { REGION_CURRENCY, REGION_LABEL, REGION_MARK, REGIONS, type Region } from './region';

interface RegionOptionsProps {
  current: Region | null;
  onSelect: (region: Region) => void;
}

/** The EGY / KSA choice cards — used inline on the Service Hub landing and inside the modal. */
export function RegionOptions({ current, onSelect }: RegionOptionsProps) {
  return (
    <>
      {REGIONS.map((region) => (
        <div
          key={region}
          className="region-opt"
          role="button"
          tabIndex={0}
          aria-pressed={region === current}
          onClick={() => onSelect(region)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(region);
            }
          }}
        >
          <div className="region-flag">{REGION_MARK[region]}</div>
          <div>
            <div className="region-name">
              {REGION_LABEL[region]} ({region})
            </div>
            <div className="region-hint">
              {region === current ? 'Current region' : `Business units and prices in ${REGION_CURRENCY[region]}`}
            </div>
          </div>
        </div>
      ))}
    </>
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
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="region-modal-title">
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
