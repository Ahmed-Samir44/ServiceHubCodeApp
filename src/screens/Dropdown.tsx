import { useCallback, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { SearchNormal1, TickSquare } from 'iconsax-react';
import { useDismiss } from './useDismiss';

/**
 * Single-choice dropdown styled like the Doctors "Business Unit" picker — replaces native
 * <select>s so every list in the app looks the same. Long lists get a search box; groups render
 * as headers (e.g. My Views / System Views). Keyboard: ↑/↓, Home/End, Enter, Esc, type to search.
 */

export interface DropdownOption {
  value: string;
  label: string;
  /** Group header shown above the first option of each group (options must be ordered by group). */
  group?: string;
}

interface DropdownProps {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  /** Shown when no option matches `value`. */
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  style?: CSSProperties;
  /** Show the search box (default: when there are more than 8 options). */
  searchable?: boolean;
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

export function Dropdown({ value, options, onChange, placeholder = 'Select…', id, ariaLabel, disabled, style, searchable }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const showSearch = searchable ?? options.length > 8;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  useDismiss(rootRef, open, close);

  const selected = options.find((option) => option.value === value);
  const visible = useMemo(() => {
    const term = normalize(query);
    return term ? options.filter((option) => normalize(option.label).includes(term)) : options;
  }, [options, query]);

  const openMenu = () => {
    if (disabled) return;
    const index = options.findIndex((option) => option.value === value);
    setActive(Math.max(0, index));
    setOpen(true);
    // Scroll the chosen option into view once the menu has rendered.
    window.requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  };

  const choose = (option: DropdownOption) => {
    onChange(option.value);
    close();
    buttonRef.current?.focus();
  };

  const move = (next: number) => {
    const index = Math.min(Math.max(next, 0), visible.length - 1);
    setActive(index);
    listRef.current?.querySelectorAll('[role="option"]')[index]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(active + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(active - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(visible.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (visible[active]) choose(visible[active]);
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  return (
    <div className={`dd${open ? ' open' : ''}`} ref={rootRef} style={style} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="field-input dd-btn"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openMenu())}
      >
        <span className={`dd-value${selected ? '' : ' placeholder'}`} dir="auto">{selected?.label ?? placeholder}</span>
        <span className="dd-arrow" aria-hidden="true">▼</span>
      </button>
      {open && (
        <div className="dd-menu">
          {showSearch && (
            <div className="dd-search">
              <SearchNormal1 size={14} color="currentColor" aria-hidden="true" />
              <input
                autoFocus
                dir="auto"
                value={query}
                placeholder="Search…"
                aria-label="Search options"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            </div>
          )}
          <div className="dd-list" role="listbox" id={listId} ref={listRef} aria-label={ariaLabel}>
            {visible.length === 0 && <div className="dd-empty">No matches</div>}
            {visible.map((option, index) => {
              const header = option.group && option.group !== visible[index - 1]?.group ? option.group : null;
              const isSelected = option.value === value;
              return (
                <div key={`${option.group ?? ''}:${option.value}`}>
                  {header && <div className="dd-group">{header}</div>}
                  <div
                    role="option"
                    aria-selected={isSelected}
                    className={`dd-opt${isSelected ? ' selected' : ''}${index === active ? ' active' : ''}`}
                    dir="auto"
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    <span className="dd-opt-label">{option.label}</span>
                    {isSelected && <TickSquare size={15} color="currentColor" variant="Bold" aria-hidden="true" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
