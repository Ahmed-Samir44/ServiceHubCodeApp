import { useState } from 'react';
import { Copy, TickCircle } from 'iconsax-react';
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
  const banks = [...new Set(accounts.filter((account) => account.buId === buId).map((account) => account.bankName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const account = accounts.find((item) => item.buId === buId && item.bankName === bankName);

  return (
    <div className="bento">
      <div className="sub-hdr">Business Unit</div>
      <div className="filter-bar" role="tablist" aria-label="Business units">
        {bus.map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={id === buId} className={`btn ${id === buId ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setBuId(id); setBankName(''); }}>
            {name}
          </button>
        ))}
      </div>
      {buId && (
        <>
          <div className="sub-hdr">Bank</div>
          <div className="filter-bar" role="tablist" aria-label="Banks">
            {banks.map((bank) => (
              <button key={bank} type="button" role="tab" aria-selected={bank === bankName} className={`btn ${bank === bankName ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBankName(bank)}>
                {bank}
              </button>
            ))}
          </div>
        </>
      )}
      {account ? <AccountCard account={account} /> : <p className="hub-muted">{buId ? 'Select a bank to see its account.' : 'Select a business unit to see its bank accounts.'}</p>}
    </div>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
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
    <div className="kv-item">
      <span className="k">{label}</span>
      <span className="v hub-copy">
        <span className="hub-mono" dir="ltr">{value || '—'}</span>
        {value && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
            {copied ? <TickCircle size={14} color="currentColor" /> : <Copy size={14} color="currentColor" />}
          </button>
        )}
      </span>
    </div>
  );
}

function AccountCard({ account }: { account: BankAccount }) {
  return (
    <div className="ro-card hub-account">
      <div className="ro-title" dir="auto">{account.bankName}</div>
      <div className="kv-item">
        <span className="k">Account Owner</span>
        <span className="v" dir="auto">{account.owner || '—'}</span>
      </div>
      <CopyValue label="Account Number" value={account.accountNumber} />
      <CopyValue label="IBAN" value={account.iban} />
      <div className="hub-subblock">
        <div className="field-lbl">Notes</div>
        {account.notes ? <RichBlock value={account.notes} /> : <p className="hub-muted">—</p>}
      </div>
    </div>
  );
}
