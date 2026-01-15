import React from 'react';
import { clearDebugLog, clearLastError, getDebugLog, getLastError, isDebugEnabled } from '../utils/debug';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });

    try {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, info);
    } catch {
      // ignore
    }
  }

  copyReport = async () => {
    const report = {
      at: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      lastError: getLastError(),
      reactError: this.state.error ? { message: this.state.error.message, stack: this.state.error.stack } : null,
      componentStack: this.state.info?.componentStack || null,
      debugEnabled: isDebugEnabled(),
      log: getDebugLog()
    };

    const text = JSON.stringify(report, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      alert('Relatório copiado para a área de transferência.');
    } catch {
      // Fallback: prompt
      window.prompt('Copie o relatório abaixo:', text);
    }
  };

  reset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  clearLogs = () => {
    clearDebugLog();
    clearLastError();
    alert('Logs limpos.');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8">
          <h1 className="text-2xl font-extrabold text-slate-800">Ocorreu um erro (evitou tela branca)</h1>
          <p className="text-slate-600 mt-2">
            Ative o modo debug com <span className="font-mono">?debug=1</span> e repita o clique para capturar logs.
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mensagem</div>
              <div className="text-sm font-semibold text-slate-800 break-words mt-1">
                {this.state.error?.message || 'Erro desconhecido'}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
              >
                Recarregar
              </button>
              <button
                onClick={this.copyReport}
                className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
              >
                Copiar relatório
              </button>
              <button
                onClick={this.clearLogs}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
              >
                Limpar logs
              </button>
              <button
                onClick={this.reset}
                className="px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold"
              >
                Tentar continuar
              </button>
            </div>

            <div className="text-xs text-slate-400">
              Dica: No Chrome/Edge, abra DevTools → Console → marque “Preserve log” e “Pause on exceptions”.
            </div>
          </div>
        </div>
      </div>
    );
  }
}
