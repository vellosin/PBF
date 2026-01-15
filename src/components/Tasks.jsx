import React, { useMemo, useState } from 'react';
import { isBefore, isSameDay, startOfDay } from 'date-fns';
import { CheckCircle2, Clock, FileText, Wallet, Calendar as CalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppointmentModal } from './AppointmentModal';
import { PaymentModal } from './PaymentModal';
import { debugLog } from '../utils/debug';

const isoDate = (d) => {
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return '';
  return dd.toISOString().split('T')[0];
};

export function Tasks({ appointments = [], onUpdateAppointment, onUpdatePayment, onUpsertNote }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);

  const today = useMemo(() => startOfDay(new Date()), []);

  const { openTasks, doneTasks } = useMemo(() => {
    const open = [];
    const done = [];

    appointments.forEach((evt) => {
      const kind = evt.kind || 'session';
      const date = evt.date ? new Date(evt.date) : null;
      if (!date || Number.isNaN(date.getTime())) return;

      // Only create tasks for today/past (open) to avoid noise.
      const inPastOrToday = isBefore(date, today) || isSameDay(date, today);

      if (kind === 'session') {
        const status = evt.status || 'scheduled';
        const occurred = status === 'occurred';
        const cancelledOrRescheduled = status === 'cancelled' || status === 'rescheduled';

        if (inPastOrToday && !occurred && !cancelledOrRescheduled && status !== 'missed_paid' && status !== 'paid') {
          open.push({
            id: `task_confirm_${evt.id}_${isoDate(date)}_${evt.time}`,
            type: 'confirm',
            title: t('task_confirm_session', { name: evt.name }),
            due: date,
            event: evt
          });
        } else {
          done.push({
            id: `task_confirm_${evt.id}_${isoDate(date)}_${evt.time}`,
            type: 'confirm',
            title: t('task_session_handled', { name: evt.name }),
            due: date,
            event: evt
          });
        }

        if (occurred && inPastOrToday && !evt.notesDone) {
          open.push({
            id: `task_note_${evt.id}_${isoDate(date)}_${evt.time}`,
            type: 'note',
            title: t('task_write_notes', { name: evt.name }),
            due: date,
            event: evt
          });
        } else if (occurred && evt.notesDone) {
          done.push({
            id: `task_note_${evt.id}_${isoDate(date)}_${evt.time}`,
            type: 'note',
            title: t('task_notes_done', { name: evt.name }),
            due: date,
            event: evt
          });
        }

        return;
      }

      if (kind === 'payment') {
        const status = evt.status || 'pending';
        const isPaid = status === 'paid';

        if (!isPaid) {
          open.push({
            id: `task_pay_${evt.patientId}_${isoDate(date)}`,
            type: 'payment',
            title: t('task_payment_due', { name: evt.name }),
            due: date,
            event: evt
          });
        } else {
          done.push({
            id: `task_pay_${evt.patientId}_${isoDate(date)}`,
            type: 'payment',
            title: t('task_payment_confirmed', { name: evt.name }),
            due: date,
            event: evt
          });
        }
      }
    });

    const byDue = (a, b) => new Date(a.due) - new Date(b.due);
    open.sort(byDue);
    done.sort(byDue);

    return { openTasks: open, doneTasks: done };
  }, [appointments, t, today]);

  const iconFor = (type) => {
    if (type === 'confirm') return CalIcon;
    if (type === 'payment') return Wallet;
    return FileText;
  };

  const colorFor = (type) => {
    if (type === 'confirm') return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    if (type === 'payment') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    return 'bg-amber-50 text-amber-800 border-amber-100';
  };

  const openEvent = (evt) => {
    debugLog('tasks.openEvent', {
      kind: evt?.kind || 'session',
      id: evt?.id,
      patientId: evt?.patientId,
      name: evt?.name,
      date: evt?.date,
      originalDate: evt?.originalDate,
      time: evt?.time,
      status: evt?.status
    });
    setSelected(evt);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{t('tasks_title')}</h2>
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <Clock size={16} />
          <span>{t('tasks_open_count', { count: openTasks.length })}</span>
          <span className="text-slate-300">•</span>
          <span>{t('tasks_done_count', { count: doneTasks.length })}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl shadow-slate-200/50">
          <h3 className="text-lg font-extrabold text-slate-800 mb-4">{t('tasks_open')}</h3>
          {openTasks.length === 0 ? (
            <div className="text-sm text-slate-500">{t('tasks_none_open')}</div>
          ) : (
            <div className="space-y-3">
              {openTasks.map((t) => {
                const Icon = iconFor(t.type);
                return (
                  <button
                    key={t.id}
                    onClick={() => openEvent(t.event)}
                    className={`w-full text-left rounded-2xl border p-4 hover:shadow-md transition-shadow ${colorFor(t.type)}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/70 border border-white/50 flex items-center justify-center">
                        <Icon size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="font-extrabold text-sm">{t.title}</div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {isoDate(t.due)}{t.event?.time ? ` • ${t.event.time}` : ''}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl shadow-slate-200/50">
          <h3 className="text-lg font-extrabold text-slate-800 mb-4">{t('tasks_done')}</h3>
          {doneTasks.length === 0 ? (
            <div className="text-sm text-slate-500">{t('tasks_none_done')}</div>
          ) : (
            <div className="space-y-3">
              {doneTasks.slice(-30).reverse().map((t) => (
                <button
                  key={t.id}
                  onClick={() => openEvent(t.event)}
                  className="w-full text-left rounded-2xl border border-slate-200 p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="font-extrabold text-sm text-slate-800">{t.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {isoDate(t.due)}{t.event?.time ? ` • ${t.event.time}` : ''}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {selected ? (
        selected?.kind === 'payment' ? (
          <PaymentModal
            paymentEvent={selected}
            onClose={() => setSelected(null)}
            onUpdatePayment={onUpdatePayment}
          />
        ) : (
          <AppointmentModal
            appointment={selected}
            onClose={() => setSelected(null)}
            onUpdate={onUpdateAppointment}
            onUpsertNote={onUpsertNote}
          />
        )
      ) : null}
    </div>
  );
}
