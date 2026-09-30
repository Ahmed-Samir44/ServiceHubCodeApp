import { useState } from 'react';
import { Bank, Copy, TickCircle } from 'iconsax-react';
import type { Region } from '../../app/region';
import { loadBankAccounts, type BankAccount } from '../../data/hub/clinics';
import { clearHubCache } from '../../data/hub/common';
import { useAsyncData } from '../../data/useAsyncData';
import { HubEmpty, HubError, HubLoading, RichBlock } from './HubCommon';

/** Legacy "Bank Accounts" (KSA): pick a business unit, then a bank, to see the account. */
export function BankAccountsSection({ region }: { region: Region }) {
  const [buId, setBuId] = useState('');
  const [bankName, setBankName] = useState('');
  const [reload, setReload] = useState(0);
  const data = useAsyncData(`bank-accounts:${region}:${reload}`, () => loadBankAccounts(region));
  const retry = () => {
    clearHubCache(`bank-accounts:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading bank accounts…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load bank accounts" message={data.error ?? ''} onRetry={retry} /></div>;
  const accounts = data.data;
  if (accounts.length === 0) return <div className="bento"><HubEmpty title="No bank accounts" sub="No bank accounts are listed for this region yet." /></div>;

  const bus = [...new Map(accounts.map((account) => [account.buId, account.buName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  // The first business unit and bank are shown until the user picks others.
  const activeBu = bus.some(([id]) => id === buId) ? buId : (bus[0]?.[0] ?? '');
  const banks = [...new Set(accounts.filter((account) => account.buId === activeBu).map((account) => account.bankName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const activeBank = banks.includes(bankName) ? bankName : (banks[0] ?? '');
  const account = accounts.find((item) => item.buId === activeBu && item.bankName === activeBank);

  return (
    <div className="bento">
      <div className="sub-hdr">Business Unit</div>
      <div className="filter-bar" role="tablist" aria-label="Business units">
        {bus.map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={id === activeBu} className={`btn ${id === activeBu ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setBuId(id); setBankName(''); }}>
            {name}
          </button>
        ))}
      </div>
      {activeBu && (
        <>
          <div className="sub-hdr">Bank</div>
          <div className="filter-bar" role="tablist" aria-label="Banks">
            {banks.map((bank) => (
              <button key={bank} type="button" role="tab" aria-selected={bank === activeBank} className={`btn ${bank === activeBank ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBankName(bank)}>
                {bank}
              </button>
            ))}
          </div>
        </>
      )}
      {account ? <AccountCard account={account} /> : <p className="hub-muted">No account listed for this bank.</p>}
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <button type="button" className={`bank-copy${copied ? ' done' : ''}`} onClick={copy} aria-label={`Copy ${label}`} title={copied ? 'Copied' : `Copy ${label}`}>
      {copied ? <TickCircle size={15} color="currentColor" /> : <Copy size={15} color="currentColor" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

/** Full-width "Band" card (user choice, 2026-09-30): teal header with the bank, then the fields as tiles, notes below. */
function AccountCard({ account }: { account: BankAccount }) {
  const fields = [
    { label: 'Account Owner', value: account.owner, copy: false },
    { label: 'Account Number', value: account.accountNumber, copy: true },
    { label: 'IBAN', value: account.iban, copy: true },
  ];
  return (
    <div className="bank-card">
      <div className="bank-band-hdr">
        <Bank size={26} color="currentColor" variant="Bulk" />
        <div>
          <div className="bank-name" dir="auto">{account.bankName}</div>
          <div className="bank-sub">{account.buName}</div>
        </div>
      </div>
      <div className="bank-tiles">
        {fields.map((field) => (
          <div key={field.label} className="bank-tile">
            <div className="bank-label">{field.label}</div>
            <div className="bank-tile-value">
              {field.copy ? <span className="bank-mono" dir="ltr">{field.value || '—'}</span> : <span className="bank-text" dir="auto">{field.value || '—'}</span>}
              {field.copy && <CopyButton label={field.label} value={field.value} />}
            </div>
          </div>
        ))}
      </div>
      <div className="bank-notes">
        <div className="bank-label">Notes</div>
        {account.notes ? <RichBlock value={account.notes} /> : <p className="hub-muted">—</p>}
      </div>
    </div>
  );
}
