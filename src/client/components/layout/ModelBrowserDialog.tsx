import { useState, useMemo } from 'react';
import { X, Check, Search, Loader2, Shield } from 'lucide-react';
import { useModelBrowser, useSetAiModel, useAiModel, type BrowseModel } from '../../api/hooks';
import { useToast } from './Toast';

const PRICE_FILTERS = [
  { label: 'Alle', max: Infinity },
  { label: 'Kostenlos', max: 0 },
  { label: '< $1/M', max: 1 },
  { label: '< $5/M', max: 5 },
] as const;

function formatCtx(len: number): string {
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(1)}M ctx`;
  if (len >= 1000) return `${Math.round(len / 1000)}k ctx`;
  return `${len} ctx`;
}

function formatPrice(price: number): string {
  if (price === 0) return 'Kostenlos';
  if (price < 0.01) return `$${price.toFixed(4)}/M`;
  if (price < 1) return `$${price.toFixed(2)}/M`;
  return `$${price.toFixed(1)}/M`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ModelBrowserDialog({ open, onClose }: Props) {
  const { data: browserData, isLoading } = useModelBrowser(open);
  const { data: settings } = useAiModel();
  const setModel = useSetAiModel();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [priceFilter, setPriceFilter] = useState<number>(Infinity);
  const [zdrOnly, setZdrOnly] = useState(false);

  const hasKey = settings?.hasApiKey ?? false;
  const current = settings?.current ?? '';

  const topProviders = useMemo(() => {
    if (!browserData) return [];
    const counts = new Map<string, number>();
    for (const m of browserData.models) {
      counts.set(m.provider, (counts.get(m.provider) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([p]) => p);
  }, [browserData]);

  const filtered = useMemo(() => {
    if (!browserData) return [];
    const q = search.toLowerCase();
    return browserData.models.filter(m => {
      if (q && !m.name.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) return false;
      if (providerFilter && m.provider !== providerFilter) return false;
      if (priceFilter === 0 && !m.isFree) return false;
      if (priceFilter !== Infinity && priceFilter > 0 && m.promptPrice > priceFilter) return false;
      if (zdrOnly && !m.supportsZdr) return false;
      return true;
    });
  }, [browserData, search, providerFilter, priceFilter, zdrOnly]);

  const handleSelect = (model: BrowseModel) => {
    if (!model.isFree && !hasKey) {
      toast('API-Key erforderlich — setze OPENROUTER_API_KEY in .env', 'error');
      return;
    }
    setModel.mutate(model.id, {
      onSuccess: () => {
        toast(`Modell gewechselt: ${model.name}`);
        onClose();
      },
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-card-hover border border-border w-full max-w-2xl mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(80vh, 640px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h3 className="font-heading font-semibold text-[14px] text-text">Modell-Browser</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-2 text-text-3 hover:text-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search + Filters */}
        <div className="px-5 py-3 border-b border-border space-y-2.5 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Modell suchen..."
              autoFocus
              className="w-full text-[13px] bg-surface-2 border border-border rounded-lg pl-9 pr-3 py-2 outline-none text-text placeholder:text-text-3 focus:border-accent transition-colors"
            />
          </div>

          {/* Provider chips */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setProviderFilter(null)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                !providerFilter
                  ? 'bg-accent/10 border-accent/30 text-accent font-medium'
                  : 'border-border text-text-3 hover:text-text hover:border-border'
              }`}
            >
              Alle
            </button>
            {topProviders.map(p => (
              <button
                key={p}
                onClick={() => setProviderFilter(providerFilter === p ? null : p)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  providerFilter === p
                    ? 'bg-accent/10 border-accent/30 text-accent font-medium'
                    : 'border-border text-text-3 hover:text-text hover:border-border'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Price filter + ZDR filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRICE_FILTERS.map(pf => (
              <button
                key={pf.label}
                onClick={() => setPriceFilter(priceFilter === pf.max ? Infinity : pf.max)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  priceFilter === pf.max
                    ? 'bg-accent/10 border-accent/30 text-accent font-medium'
                    : 'border-border text-text-3 hover:text-text hover:border-border'
                }`}
              >
                {pf.label}
              </button>
            ))}
            <button
              onClick={() => setZdrOnly(!zdrOnly)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1 ${
                zdrOnly
                  ? 'bg-accent/10 border-accent/30 text-accent font-medium'
                  : 'border-border text-text-3 hover:text-text hover:border-border'
              }`}
            >
              <Shield size={10} /> ZDR
            </button>
          </div>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-text-3">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-[13px]">Modelle werden geladen...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-[13px] text-text-3">Keine Modelle gefunden</span>
            </div>
          ) : (
            filtered.map(m => {
              const disabled = !m.isFree && !hasKey;
              const isActive = current === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m)}
                  className={`flex items-center gap-3 w-full px-5 py-2.5 text-left transition-colors ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isActive
                        ? 'bg-accent/5'
                        : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="w-4 shrink-0">
                    {isActive && <Check size={13} className="text-accent" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-text truncate flex items-center gap-1.5">
                      {m.name}
                      {m.supportsZdr && <Shield size={10} className="text-accent/60 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-text-3 truncate">{m.id}</div>
                  </div>
                  <span className="text-[10px] text-text-3 shrink-0 hidden sm:block">
                    {formatCtx(m.contextLength)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    m.isFree
                      ? 'text-emerald-400 bg-emerald-400/10 font-medium'
                      : 'text-text-3 bg-surface-2'
                  }`}>
                    {formatPrice(m.promptPrice)}
                  </span>
                  {disabled && (
                    <span className="text-[9px] text-amber-500 shrink-0">API-Key fehlt</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-border shrink-0">
          <span className="text-[11px] text-text-3">
            {filtered.length} Modelle gefunden
          </span>
        </div>
      </div>
    </div>
  );
}
