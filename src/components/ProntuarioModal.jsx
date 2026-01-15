import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save } from 'lucide-react';
import { format } from 'date-fns';

export function ProntuarioModal({
  open,
  patientName,
  date,
  time,
  initialContent,
  onClose,
  onSave,
  saving,
  error
}) {
  const { t, i18n } = useTranslation();
  const [content, setContent] = useState(() => initialContent || '');

  const dateLabel = useMemo(() => {
    try {
      if (!date) return '--/--/----';
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return '--/--/----';
      return format(d, 'dd/MM/yyyy');
    } catch {
      return '--/--/----';
    }
  }, [date]);

  if (!open) return null;

  return (
    <div className="ui-modal-overlay">
      <div className="ui-modal-card max-w-2xl animate-in zoom-in-95 duration-200">
        <button
          onClick={() => onClose?.()}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          aria-label={t('btn_close')}
        >
          <X size={20} />
        </button>

        <div className="ui-modal-body">
          <div className="mb-5">
            <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">{t('prontuario_modal_title')}</div>
            <div className="text-lg font-extrabold text-slate-900 break-words mt-1">{patientName || t('prontuario_patient_unknown')}</div>
            <div className="text-sm text-slate-500 mt-1">{dateLabel}{time ? ` • ${time}` : ''}</div>
          </div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            spellCheck={true}
            lang={i18n?.language || 'pt-BR'}
            placeholder={t('prontuario_placeholder')}
            className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">{t('prontuario_hint')}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
              >
                {t('btn_close')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave?.(content)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold flex items-center gap-2"
              >
                <Save size={16} /> {saving ? '...' : t('prontuario_save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
