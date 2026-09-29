import { useState, type ReactNode } from 'react';
import { ArrowLeft, Calendar } from 'iconsax-react';
import { REGION_CURRENCY, type Region } from '../../app/region';
import { clearHubCache, foundText, includesText } from '../../data/hub/common';
import { EXPIRY_FILTER, EXPIRY_LABEL, expiryStatus, loadEgyOffers, loadKsaOffers, loadUpcomingOffers, type ExpiryStatus, type Offer, type OffersData } from '../../data/hub/offers';
import { useAsyncData } from '../../data/useAsyncData';
import { CardFields, FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, RichBlock, SearchField } from './HubCommon';

/**
 * Legacy Offers: Egypt shows cr301_newofferdataset offers; KSA shows approved offer requests with
 * an "Upcoming Offers" view. `specialty` pre-filters (opened from a specialty hub — KSA offers use
 * their own specialty table, matched by name like the legacy page did).
 */
export function OffersSection({ region, specialty }: { region: Region; specialty?: { id: string; name: string } }) {
  const [upcoming, setUpcoming] = useState(false);
  if (region === 'KSA' && upcoming) {
    return (
      <>
        <button type="button" className="back-link" onClick={() => setUpcoming(false)}>
          <ArrowLeft size={12} color="currentColor" /> Back to KSA Offers
        </button>
        <div className="sub-hdr">Upcoming Offers · Approved upcoming offers – KSA</div>
        <OffersList key="upcoming" region={region} source="upcoming" specialty={specialty} />
      </>
    );
  }
  return (
    <OffersList
      key="current"
      region={region}
      source={region === 'EGY' ? 'egy' : 'ksa'}
      specialty={specialty}
      extra={
        region === 'KSA' ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setUpcoming(true)}>
            <Calendar size={14} color="currentColor" /> Upcoming Offers
          </button>
        ) : null
      }
    />
  );
}

type Source = 'egy' | 'ksa' | 'upcoming';

const LOADERS: Record<Source, (region: Region) => Promise<OffersData>> = { egy: loadEgyOffers, ksa: loadKsaOffers, upcoming: loadUpcomingOffers };
const CACHE_KEY: Record<Source, string> = { egy: 'offers', ksa: 'offers', upcoming: 'upcoming-offers' };

function OffersList({ region, source, specialty, extra }: { region: Region; source: Source; specialty?: { id: string; name: string }; extra?: ReactNode }) {
  const [reload, setReload] = useState(0);
  const data = useAsyncData(`${source}:${region}:${reload}`, () => LOADERS[source](region));
  const retry = () => {
    clearHubCache(`${CACHE_KEY[source]}:${region}`);
    clearHubCache(`offer-lookups:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading offers…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load offers" message={data.error ?? ''} onRetry={retry} /></div>;

  const initialSpecialty = specialty ? (source === 'egy' ? specialty.id : (data.data.specialties.find((item) => item.name.trim().toLowerCase() === specialty.name.trim().toLowerCase())?.id ?? '')) : '';
  return <OffersGrid key={initialSpecialty} data={data.data} region={region} source={source} initialSpecialty={initialSpecialty} extra={extra} />;
}

interface OfferFilters {
  bu: string;
  type: string;
  specialty: string;
  expiry: '' | ExpiryStatus;
  search: string;
}

function OffersGrid({ data, region, source, initialSpecialty, extra }: { data: OffersData; region: Region; source: Source; initialSpecialty: string; extra?: ReactNode }) {
  const empty: OfferFilters = { bu: '', type: '', specialty: '', expiry: '', search: '' };
  const [filters, setFilters] = useState<OfferFilters>({ ...empty, specialty: initialSpecialty });
  const set = <K extends keyof OfferFilters>(key: K, value: OfferFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));

  const list = data.offers.filter(
    (offer) =>
      (!filters.bu || offer.buId === filters.bu) &&
      (!filters.type || offer.type === filters.type) &&
      (!filters.specialty || offer.specialtyId === filters.specialty) &&
      (!filters.expiry || expiryStatus(offer.end) === filters.expiry) &&
      includesText([offer.name, offer.nameAr], filters.search),
  );

  return (
    <>
      <FilterPanel summary={foundText(list.length, 'offer')} canClear={JSON.stringify(filters) !== JSON.stringify(empty)} onClear={() => setFilters(empty)}>
        <FilterSelect label="Business Unit" allLabel="All BUs" value={filters.bu} options={data.bus.map((bu) => ({ value: bu.id, label: bu.name }))} onChange={(value) => set('bu', value)} />
        <FilterSelect label="Offer Type" allLabel="All Types" value={filters.type} options={data.types} onChange={(value) => set('type', value)} />
        <FilterSelect label="Specialty" allLabel="All Specialties" value={filters.specialty} options={data.specialties.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => set('specialty', value)} />
        {source !== 'upcoming' && (
          <FilterSelect label={source === 'egy' ? 'Expiration Status' : 'Expiration'} allLabel="All" value={filters.expiry} options={EXPIRY_FILTER} onChange={(value) => set('expiry', value as OfferFilters['expiry'])} />
        )}
        <SearchField label="Search Offer" value={filters.search} placeholder="Search by offer name (EN / AR)" onChange={(value) => set('search', value)} />
        {extra}
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title={source === 'upcoming' ? 'No upcoming offers found' : 'No offers found'} sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid">
          {list.map((offer) => (
            <OfferCard key={offer.id} offer={offer} currency={REGION_CURRENCY[region]} upcoming={source === 'upcoming'} />
          ))}
        </div>
      )}
    </>
  );
}

const TAG_CLASS: Record<ExpiryStatus, string> = { soon: 'sbadge-amber', active: 'sbadge-green', recentExpired: 'sbadge-gray', expired: 'sbadge-red' };
const formatDate = (date: Date | null) => (date ? date.toLocaleDateString() : '—');

function OfferCard({ offer, currency, upcoming }: { offer: Offer; currency: string; upcoming: boolean }) {
  const status = expiryStatus(offer.end);
  const money = (value: number | null) => (value === null ? '' : `${value.toLocaleString()} ${currency}`);
  const discount = offer.priceBefore && offer.priceAfter !== null && offer.priceBefore > offer.priceAfter ? Math.round((1 - offer.priceAfter / offer.priceBefore) * 100) : null;
  return (
    <article className={`ro-card hub-card sc-card${!upcoming && status === 'soon' ? ' hub-card-warn' : ''}`}>
      <div className="sc-top">
        {upcoming ? <span className="sbadge sbadge-gold">⏳ Upcoming</span> : <span className={`sbadge ${TAG_CLASS[status]}`}>{EXPIRY_LABEL[status]}</span>}
        {discount !== null && discount > 0 && <span className="sbadge sbadge-green">-{discount}%</span>}
      </div>
      <h3 className="sc-title" dir="auto" title={offer.name}>{offer.name || 'N/A'}</h3>
      {offer.nameAr && <div className="sc-ar" dir="rtl">{offer.nameAr}</div>}
      <CardFields
        fields={[
          { label: 'Business Unit', value: offer.buName },
          { label: 'Specialty', value: offer.specialtyName },
          { label: 'Offer Type', value: offer.typeLabel },
          { label: 'Start Date', value: formatDate(offer.start) },
          { label: 'End Date', value: formatDate(offer.end) },
          { label: 'Before Discount', value: money(offer.priceBefore) },
          { label: 'After Discount', value: money(offer.priceAfter), strong: true },
        ]}
      />
      {offer.description && (
        <div className="hub-subblock">
          <div className="field-lbl">Offer Description</div>
          <RichBlock value={offer.description} />
        </div>
      )}
    </article>
  );
}
