import { MethodBadge } from '../../../atoms/MethodBadge';
import type { Capability } from '../types';

export interface CapabilityNavProps {
  /** Module names, in registry order — these become the collapsible groups. */
  modules: string[];
  /** Capabilities surviving the current search filter. */
  items: Capability[];
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  openGroups: Record<string, boolean>;
  onToggleGroup: (module: string) => void;
}

/**
 * Part — the capability picker: a search box over a module-grouped list of
 * every live-API method. Groups with no surviving matches are omitted.
 */
export function CapabilityNav({
  modules,
  items,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  openGroups,
  onToggleGroup,
}: CapabilityNavProps) {
  return (
    <nav aria-label="Capabilities">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Filter capabilities…"
        aria-label="Filter capabilities"
      />

      {modules.map((module) => {
        const group = items.filter((c) => c.module === module);
        if (group.length === 0) return null;
        const open = openGroups[module] !== false;

        return (
          <section key={module}>
            <button type="button" onClick={() => onToggleGroup(module)} aria-expanded={open}>
              {module}
            </button>

            {open && (
              <ul>
                {group.map((cap) => (
                  <li key={cap.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(cap.id)}
                      aria-current={cap.id === selectedId}
                    >
                      <MethodBadge method={cap.method} />
                      {cap.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
