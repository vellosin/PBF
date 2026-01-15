import React, { useMemo, useState } from 'react';
import { Bug, Copy, Trash2, X } from 'lucide-react';
import { clearDebugLog, debugLog, getDebugLog, isDebugEnabled, setDebugEnabled } from '../utils/debug';

export function DebugPanel({ snapshot }) {
  const enabled = isDebugEnabled();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const log = useMemo(() => {
    // Recompute when panel is opened or refreshed
    void tick;
    return getDebugLog();
  }, [tick]);

  if (!enabled) return null;

  const copy = async () => {
    const payload = {
      at: new Date().toISOString(),
      snapshot: snapshot || null,
      log
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert('Debug copiado.');
    } catch {
      window.prompt('Copie o debug abaixo:', text);
    }
  };

  const clear = () => {
    clearDebugLog();
    setTick((t) => t + 1);
  };

  const disable = () => {
    setDebugEnabled(false);
    debugLog('debug.disabled', { by: 'user' });
    window.location.href = window.location.pathname;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[60] rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/30 px-4 py-3 flex items-center gap-2"
      >
        <Bug size={16} /> Debug
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white w-full max-w-3xl rounded-3xl border border-slate-200 shadow-2xl p-6 relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>

            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">Debug</h3>
                <div className="text-xs text-slate-500 mt-1">Ativo via <span className="font-mono">?debug=1</span>. Logs ficam em localStorage.</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2"
                >
                  <Copy size={14} /> Copiar
                </button>
                <button
                  onClick={clear}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-2"
                >
                  <Trash2 size={14} /> Limpar
                </button>
                <button
                  onClick={() => setTick((t) => t + 1)}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                >
                  Atualizar
                </button>
                <button
                  onClick={disable}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold"
                >
                  Desativar
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Snapshot</div>
                <pre className="mt-2 text-[11px] leading-snug text-slate-800 whitespace-pre-wrap break-words max-h-[320px] overflow-auto">
                  {JSON.stringify(snapshot || {}, null, 2)}
                </pre>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Log ({log.length})</div>
                <div className="mt-2 space-y-2 max-h-[320px] overflow-auto">
                  {log.slice(-80).reverse().map((e, idx) => (
                    <div key={`${e.t}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-extrabold text-slate-800">{e.category}</div>
                        <div className="text-[10px] text-slate-400">{e.t}</div>
                      </div>
                      <pre className="mt-1 text-[11px] text-slate-700 whitespace-pre-wrap break-words">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
