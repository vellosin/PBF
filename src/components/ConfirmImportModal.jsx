import React, { useEffect } from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ConfirmImportModal({
  open,
  hasExistingData,
  onCancel,
  onDownloadOld,
  onContinue
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="ui-modal-overlay">
      <div className="ui-modal-card max-w-lg animate-in zoom-in-95 duration-200">
        <div className="ui-modal-header">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle size={18} />
            </div>
            {t('upload_confirm_title')}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label={t('btn_cancel')}>
            <X size={20} />
          </button>
        </div>

        <div className="ui-modal-body">
          <p className="text-sm text-slate-600">
            {hasExistingData ? t('upload_confirm_desc_has_data') : t('upload_confirm_desc_no_data')}
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
            >
              {t('btn_cancel')}
            </button>

            <button
              type="button"
              onClick={onDownloadOld}
              disabled={!hasExistingData}
              className="px-4 py-3 bg-white border border-slate-200 text-indigo-700 rounded-xl font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center"
            >
              <Download size={18} />
              {t('upload_confirm_download_old')}
            </button>

            <button
              type="button"
              onClick={onContinue}
              className="px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors"
            >
              {t('upload_confirm_continue')}
            </button>
          </div>

          {hasExistingData ? (
            <div className="mt-4 text-xs text-slate-500">
              {t('upload_confirm_tip')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
