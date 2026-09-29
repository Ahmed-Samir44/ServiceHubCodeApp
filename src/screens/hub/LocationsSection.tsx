import { useState } from 'react';
import { Location as LocationPin, Map1 } from 'iconsax-react';
import type { Region } from '../../app/region';
import { loadLocations, type Location } from '../../data/hub/centers';
import { clearHubCache, foundText, includesText } from '../../data/hub/common';
import { useAsyncData } from '../../data/useAsyncData';
import { imageUrl } from '../../data/hub/images';
import { CardFields, FilterPanel, HubEmpty, HubError, HubLoading, SearchField } from './HubCommon';

/** Legacy "Andalusia Locations": branch cards with photo, address and a Google Maps link. */
export function LocationsSection({ region }: { region: Region }) {
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const data = useAsyncData(`locations:${region}:${reload}`, () => loadLocations(region));
  const retry = () => {
    clearHubCache(`locations:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading locations…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load locations" message={data.error ?? ''} onRetry={retry} /></div>;

  const list = data.data.filter((location) => includesText([location.branchName, location.area, location.address], search));
  return (
    <>
      <FilterPanel summary={foundText(list.length, 'location')} canClear={Boolean(search)} onClear={() => setSearch('')}>
        <SearchField label="Search Locations" value={search} placeholder="Search by branch, area or address…" onChange={setSearch} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No locations found" sub={search ? 'Try another search' : 'No branches are listed for this region yet.'} /></div>
      ) : (
        <div className="hub-grid">
          {list.map((location) => (
            <LocationCard key={location.id} location={location} />
          ))}
        </div>
      )}
    </>
  );
}

const isWebUrl = (value: string) => /^https?:\/\//i.test(value.trim());

function LocationCard({ location }: { location: Location }) {
  const src = imageUrl(location.imageUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const onImageError = () => {
    setImageFailed(true);
    // Local Play / dev only: shows what the column holds, to support new link formats.
    if (import.meta.env.DEV) console.info('[locations] image did not load', { branch: location.branchName, stored: location.imageUrl, tried: src });
  };
  const showImage = src !== null && !imageFailed;

  return (
    <article className="ro-card hub-card loc-card">
      {/* Map-style placeholder (user choice) sits under the photo, so a slow or missing image never leaves a blank box. */}
      <div className="loc-cover loc-ph-map">
        <span className="loc-ph-map-pin" aria-hidden="true">
          <LocationPin size={34} color="currentColor" variant="Bold" />
        </span>
        {showImage && <img src={src} alt={location.branchName} loading="lazy" referrerPolicy="no-referrer" onError={onImageError} />}
        {location.area && <span className="loc-area">{location.area}</span>}
      </div>
      <div className="loc-body">
        <h3 className="sc-title" dir="auto">{location.branchName || 'N/A'}</h3>
        <CardFields
          fields={[
            { label: 'Area', value: location.area },
            { label: 'Address', value: location.address },
          ]}
        />
        <div className="loc-actions">
          {isWebUrl(location.mapUrl) && (
            <a className="btn btn-primary" href={location.mapUrl} target="_blank" rel="noreferrer">
              <Map1 size={15} color="currentColor" /> View on Google Maps
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
