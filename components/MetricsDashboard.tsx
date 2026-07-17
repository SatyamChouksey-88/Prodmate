import React, { useCallback, useEffect, useState } from 'react';
import { apiGetMetricsSummary, type MetricsSummary } from '../services/apiClient';

const MetricsDashboard: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [data, setData] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGetMetricsSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !data && !loading) void load();
  }, [isOpen, data, loading, load]);

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 text-left"
      >
        <h3 className="text-lg font-bold text-foreground">Usage metrics</h3>
        <span className="text-foreground-muted text-sm">{isOpen ? 'Hide' : 'Show'}</span>
      </button>
      {isOpen && (
        <div className="border-t border-border p-4 space-y-4">
          <p className="text-sm text-foreground-secondary">
            Numbers come from your <code className="text-xs">audit_logs</code> rows (last 30 days).
            Badges mark measured vs proxy values.
          </p>
          {loading && <p className="text-sm text-foreground-muted">Loading…</p>}
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {data && (
            <>
              <ul className="space-y-3">
                {data.metrics.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg p-3 border ${
                      m.kind === 'measured'
                        ? 'border-solid border-border-strong'
                        : 'border-dashed border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">{m.label}</p>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          m.kind === 'measured'
                            ? 'bg-success-bg text-success'
                            : 'bg-warning-bg text-warning'
                        }`}
                      >
                        {m.kind === 'measured' ? 'Measured' : 'Proxy'}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {m.value == null ? '—' : m.value}
                    </p>
                    <p className="text-xs text-foreground-muted mt-1">{m.how}</p>
                    {m.sampleSize != null && (
                      <p className="text-xs text-foreground-muted">Based on {m.sampleSize} paired rows.</p>
                    )}
                  </li>
                ))}
              </ul>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Recent audit actions</p>
                <ul className="max-h-40 overflow-y-auto text-xs text-foreground-secondary space-y-1">
                  {data.recentActions.map((a, i) => (
                    <li key={`${a.action}-${a.created_at}-${i}`}>
                      <span className="font-mono">{a.action}</span> · {a.created_at}
                    </li>
                  ))}
                </ul>
              </div>
              <button type="button" onClick={() => void load()} className="text-sm text-accent hover:underline">
                Refresh
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MetricsDashboard;
