import { useState } from 'react';
import { People, Profile, SearchNormal1 } from 'iconsax-react';
import { errorMessage } from '../../data/dataverse';
import { searchPrincipals, type Principal } from '../../data/recordActions';

/** Search box for users and teams (Assign / Share). */
export function PrincipalPicker({ value, onChange }: { value: Principal | null; onChange: (principal: Principal | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Principal[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const search = async (text: string) => {
    setOpen(true);
    setStatus('Searching…');
    try {
      const found = await searchPrincipals(text);
      setResults(found);
      setStatus(found.length ? null : 'No users or teams found.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  if (value) {
    return (
      <div className="attach-row">
        {value.kind === 'team' ? <People size={14} color="currentColor" /> : <Profile size={14} color="currentColor" />}
        <span style={{ flex: 1 }} dir="auto">{value.name}</span>
        <span className="sbadge sbadge-gray">{value.kind === 'team' ? 'Team' : 'User'}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }

  return (
    <div className="search-select">
      <span className="ss-icon"><SearchNormal1 size={12} color="currentColor" /></span>
      <input
        className="field-input"
        placeholder="Search users or teams"
        aria-label="Search users or teams"
        dir="auto"
        value={query}
        autoFocus
        onFocus={() => void search(query)}
        onChange={(event) => {
          setQuery(event.target.value);
          void search(event.target.value);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
      />
      <div className={`ss-list${open ? ' open' : ''}`} role="listbox">
        {status && <div className="ss-empty">{status}</div>}
        {!status &&
          results.map((principal) => (
            <div
              key={`${principal.kind}-${principal.id}`}
              className="ss-row"
              role="option"
              aria-selected={false}
              tabIndex={0}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(principal);
                setOpen(false);
              }}
            >
              {principal.kind === 'team' ? <People size={13} color="currentColor" /> : <Profile size={13} color="currentColor" />}
              <bdi>{principal.name}</bdi>
            </div>
          ))}
      </div>
    </div>
  );
}
