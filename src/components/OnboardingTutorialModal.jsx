import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download, Database, Users, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export function OnboardingTutorialModal({
  open,
  onClose,
  onComplete,
  onDownloadTemplate,
  onGoToView
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const steps = useMemo(
    () => [
      {
        title: t('tutorial_title', { appShort: t('app_short') }),
        body: t('tutorial_subtitle'),
        actions: []
      },
      {
        title: t('tutorial_step_import_title'),
        body: t('tutorial_step_import_body'),
        actions: [
          {
            id: 'download',
            label: t('tutorial_btn_download_template'),
            icon: Download,
            onClick: () => onDownloadTemplate?.()
          },
          {
            id: 'go_files',
            label: t('tutorial_btn_go_files'),
            icon: Database,
            onClick: () => onGoToView?.('files')
          }
        ]
      },
      {
        title: t('tutorial_step_manual_title'),
        body: t('tutorial_step_manual_body'),
        actions: [
          {
            id: 'go_patients',
            label: t('tutorial_btn_go_patients'),
            icon: Users,
            onClick: () => onGoToView?.('patients')
          },
          {
            id: 'go_calendar',
            label: t('tutorial_btn_go_calendar'),
            icon: CalendarDays,
            onClick: () => onGoToView?.('calendar')
          }
        ]
      }
    ],
    [onDownloadTemplate, onGoToView, t]
  );

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const current = steps[step];

  const handleBack = () => setStep((s) => Math.max(0, s - 1));
  const handleNext = () => setStep((s) => Math.min(steps.length - 1, s + 1));

  const handleFinish = async () => {
    await onComplete?.();
    onClose?.();
    setStep(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => onClose?.()} />

      <div className="relative w-full max-w-xl rounded-3xl border border-white/20 bg-white/90 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 bg-white/60">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-indigo-600">{t('tutorial')}</div>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-1">{current.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center"
            aria-label={t('btn_close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto min-h-0">
          <p className="text-slate-700 leading-relaxed whitespace-pre-line">{current.body}</p>

          {current.actions?.length ? (
            <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              {current.actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={a.onClick}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors"
                  >
                    <Icon size={18} />
                    <span className="whitespace-nowrap">{a.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="p-5 sm:p-6 border-t border-slate-100 bg-white/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={
                    `h-2.5 w-2.5 rounded-full transition-colors ` +
                    (i === step ? 'bg-indigo-600' : 'bg-slate-200')
                  }
                />
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={handleBack}
                disabled={isFirst}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <ChevronLeft size={18} />
                <span>{t('tutorial_btn_back')}</span>
              </button>

              {!isLast ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  <span>{t('tutorial_btn_next')}</span>
                  <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap"
                >
                  <span>{t('tutorial_btn_finish')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
