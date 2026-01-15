import React from 'react';
import { X, Wallet, CheckCircle2, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

export function PaymentModal({ paymentEvent, onClose, onUpdatePayment }) {
  const { t } = useTranslation();
  if (!paymentEvent) return null;

  const status = paymentEvent.status || 'pending';
  const isPaid = status === 'paid';

  const hasAmount = paymentEvent.rate !== undefined && paymentEvent.rate !== null;
  const sessionsCount = Number.isFinite(Number(paymentEvent.sessionsCount)) ? Number(paymentEvent.sessionsCount) : null;
  const hasPeriod = paymentEvent.periodStart && paymentEvent.periodEnd;

  const markPaid = () => {
    onUpdatePayment?.(paymentEvent.patientId, paymentEvent.date, { status: 'paid', paidAt: new Date().toISOString() });
    onClose?.();
  };

  const markPending = () => {
    onUpdatePayment?.(paymentEvent.patientId, paymentEvent.date, { status: 'pending', paidAt: null });
    onClose?.();
  };

  return (
    <div className="ui-modal-overlay">
      <div className="ui-modal-card max-w-md animate-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600" aria-label={t('btn_close')}>
          <X size={20} />
        </button>

        <div className="ui-modal-body">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mb-4">
            <Wallet size={22} />
          </div>
          <h3 className="text-xl font-bold text-slate-800">{t('calendar_payment_title')}</h3>
          <p className="text-sm text-slate-500 mt-1 break-words">
            {paymentEvent.name} • {format(paymentEvent.date, 'dd/MM/yyyy')}
          </p>

        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('label_status')}</div>
              <div className={`text-sm font-extrabold ${isPaid ? 'text-emerald-700' : 'text-slate-700'}`}>
                {isPaid ? t('payment_status_paid') : (status === 'overdue' ? t('payment_status_overdue') : t('payment_status_pending'))}
              </div>
            </div>
            {hasAmount ? (
              <div className="text-right">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('payment_reference')}</div>
                <div className="text-sm font-extrabold text-slate-800">R$ {paymentEvent.rate}</div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('payment_sessions_in_period')}</div>
              <div className="text-sm font-extrabold text-slate-800">
                {sessionsCount === null ? '-' : sessionsCount}
              </div>
            </div>

            {hasPeriod ? (
              <div className="text-right">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('payment_period')}</div>
                <div className="text-sm font-extrabold text-slate-800">
                  {format(new Date(paymentEvent.periodStart), 'dd/MM/yyyy')} – {format(new Date(paymentEvent.periodEnd), 'dd/MM/yyyy')}
                </div>
              </div>
            ) : null}
          </div>
        </div>

          <div className="ui-modal-footer pt-0">
          <div className="flex gap-3">
          {!isPaid ? (
            <button
              onClick={markPaid}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={18} /> {t('payment_confirm')}
            </button>
          ) : (
            <button
              onClick={markPending}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Undo2 size={18} /> {t('payment_back_pending')}
            </button>
          )}
        </div>
          </div>
          </div>
      </div>
    </div>
  );
}
