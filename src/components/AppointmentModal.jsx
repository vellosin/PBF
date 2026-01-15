import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar as CalIcon, CheckCircle2, Circle, FileText, RotateCcw, CalendarClock, XCircle } from 'lucide-react';
import { format, isBefore, isSameDay, startOfDay, parse } from 'date-fns';
import { ProntuarioModal } from './ProntuarioModal';

export function AppointmentModal({ appointment, onClose, onUpdate, onUpsertNote }) {
    const { t } = useTranslation();
    const [rescheduling, setRescheduling] = useState(false);
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [notesModalOpen, setNotesModalOpen] = useState(false);
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesError, setNotesError] = useState('');

    const status = appointment?.status || 'scheduled';
    const notesDone = Boolean(appointment?.notesDone);
    const occurred = useMemo(() => status === 'occurred', [status]);

    const apptDate = useMemo(() => {
        const candidates = [appointment?.date, appointment?.originalDate];

        const toValidDate = (v) => {
            if (!v) return null;
            if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;

            // Try ISO or Date-parsable strings first
            const d1 = new Date(v);
            if (!Number.isNaN(d1.getTime())) return d1;

            // Try dd/MM/yyyy (common in PT-BR)
            if (typeof v === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(v.trim())) {
                const d2 = parse(v.trim(), 'dd/MM/yyyy', new Date());
                if (!Number.isNaN(d2.getTime())) return d2;
            }

            return null;
        };

        for (const c of candidates) {
            const d = toValidDate(c);
            if (d) return d;
        }
        return null;
    }, [appointment?.date, appointment?.originalDate]);

    const isPastOrToday = useMemo(() => {
        if (!apptDate) return false;
        const today = startOfDay(new Date());
        const day = startOfDay(apptDate);
        return isBefore(day, today) || isSameDay(day, today);
    }, [apptDate]);

    const isTerminalStatus = (s) => s === 'cancelled' || s === 'rescheduled';

    const getConfirmDone = (s) => {
        return s === 'occurred' || s === 'cancelled' || s === 'rescheduled' || s === 'missed_paid' || s === 'paid';
    };

    const pendingTasks = useMemo(() => {
        const confirmDone = getConfirmDone(status);
        const notePending = occurred && !notesDone;
        const confirmPending = !confirmDone && isPastOrToday;
        return {
            confirmPending,
            notePending,
            any: confirmPending || notePending
        };
    }, [status, occurred, notesDone, isPastOrToday]);

    if (!appointment) return null;

    const maybeAutoCloseAfterUpdate = (nextStatus, nextNotesDone) => {
        const nextOccurred = nextStatus === 'occurred';
        const nextConfirmDone = getConfirmDone(nextStatus);
        const nextConfirmPending = !nextConfirmDone && isPastOrToday;
        const nextNotePending = nextOccurred && !nextNotesDone;

        // Close when there are no pending tasks for this session.
        if (!nextConfirmPending && !nextNotePending) {
            onClose?.();
        }
    };

    const updateStatus = (nextStatus, opts = {}) => {
        const nowIso = new Date().toISOString();
        const payload = { status: nextStatus };
        if (nextStatus === 'cancelled') {
            payload.cancelledAt = nowIso;
        }
        if (nextStatus === 'scheduled') {
            // When reopening, clear terminal markers.
            payload.cancelledAt = null;
            payload.rescheduledAt = null;
            payload.rescheduledTo = null;
        }

        onUpdate?.(appointment, payload);
        setRescheduling(false);

        // UX: when user confirms the session occurred, keep the modal open if notes are still pending
        // so they can write the prontuário right away.
        if (nextStatus === 'occurred') {
            const shouldClose = Boolean(notesDone) || Boolean(opts?.closeImmediately);
            if (shouldClose) {
                onClose?.();
                return;
            }
        }

        if (opts?.closeImmediately) {
            onClose?.();
            return;
        }

        maybeAutoCloseAfterUpdate(nextStatus, notesDone);
    };

    const submitReschedule = () => {
        if (!newDate || !newTime) return;
        onUpdate?.(appointment, { status: 'rescheduled', newDate, newTime });
        setRescheduling(false);
        maybeAutoCloseAfterUpdate('rescheduled', notesDone);
    };

    const openNotes = () => {
        setNotesError('');
        setNotesModalOpen(true);
    };

    const saveNotes = async (content) => {
        if (!occurred) return;
        if (!onUpsertNote) {
            setNotesError(t('prontuario_save_not_configured'));
            return;
        }

        const appointmentKey = String(appointment?.appointmentKey || '').trim();
        if (!appointmentKey) {
            setNotesError(t('prontuario_invalid_key'));
            return;
        }

        setNotesSaving(true);
        setNotesError('');
        try {
            await onUpsertNote({
                appointmentKey,
                patientId: String(appointment?.patientId ?? appointment?.id ?? ''),
                patientName: String(appointment?.name || ''),
                sessionDate: apptDate ? apptDate.toISOString().split('T')[0] : '',
                sessionTime: String(appointment?.time || ''),
                content
            });
            setNotesModalOpen(false);
            maybeAutoCloseAfterUpdate(status, true);
        } catch (e) {
            const msg = e?.message ? String(e.message) : t('generic_error');
            setNotesError(msg);
        } finally {
            setNotesSaving(false);
        }
    };

    return (
        <div className="ui-modal-overlay">
            <div className="ui-modal-card max-w-md animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                    aria-label={t('btn_close')}
                >
                    <X size={20} />
                </button>

                <div className="ui-modal-body">
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 mb-4">
                        <CalIcon size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 break-words">{appointment.name}</h3>
                    <p className="text-sm text-slate-500 break-words">
                        {apptDate ? format(apptDate, 'dd/MM/yyyy') : '--/--/----'} - {appointment.time || '--:--'}
                    </p>
                    <div className="mt-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${occurred ? 'bg-sky-50 text-sky-700 border-sky-100' : (isTerminalStatus(status) ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-50 text-slate-600 border-slate-200')}`}>
                            {occurred ? t('status_occurred') : (status === 'cancelled' ? t('status_cancelled') : status === 'rescheduled' ? t('status_rescheduled') : t('status_pending'))}
                        </span>
                    </div>
                </div>

                {/* Task chooser */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-extrabold text-slate-800">{t('appt_modal_tasks_title')}</div>
                            <div className="text-xs text-slate-500">
                                {pendingTasks.any ? t('appt_modal_tasks_desc_pending') : t('appt_modal_tasks_desc_none')}
                            </div>
                        </div>

                        {pendingTasks.any ? (
                            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">
                                {t('calendar_legend_pending')}
                            </span>
                        ) : (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                                {t('calendar_legend_ok')}
                            </span>
                        )}
                    </div>

                    {/* Task: Confirm session handled */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getConfirmDone(status) ? 'bg-emerald-100 text-emerald-700' : (isPastOrToday ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600')}`}>
                                    {getConfirmDone(status) ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                </div>
                                <div>
                                    <div className="text-sm font-extrabold text-slate-800">{t('appt_modal_session_title')}</div>
                                    <div className="text-xs text-slate-500">
                                        {getConfirmDone(status)
                                            ? t('appt_modal_session_desc_done')
                                            : (isPastOrToday ? t('appt_modal_session_desc_open') : t('appt_modal_session_desc_future'))}
                                    </div>
                                </div>
                            </div>

                            {getConfirmDone(status) ? (
                                <button
                                    type="button"
                                    onClick={() => updateStatus('scheduled')}
                                    className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-2 flex items-center gap-2"
                                    title={t('appt_modal_reopen_title')}
                                >
                                    <RotateCcw size={16} /> {t('appt_modal_reopen')}
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => updateStatus('occurred')}
                                        className="px-3 py-2 rounded-xl font-bold text-xs bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                                    >
                                        {t('status_occurred')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRescheduling((v) => !v)}
                                        className="px-3 py-2 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2"
                                    >
                                        <CalendarClock size={16} /> {t('appt_modal_reschedule')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateStatus('cancelled')}
                                        className="px-3 py-2 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-2"
                                    >
                                        <XCircle size={16} /> {t('btn_cancel')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {rescheduling ? (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('appt_modal_reschedule_title')}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input
                                        type="date"
                                        value={newDate}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                        onChange={(e) => setNewDate(e.target.value)}
                                    />
                                    <input
                                        type="time"
                                        value={newTime}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                        onChange={(e) => setNewTime(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-3 mt-3">
                                    <button
                                        type="button"
                                        onClick={submitReschedule}
                                        disabled={!newDate || !newTime}
                                        className="flex-1 py-3 bg-indigo-600 disabled:bg-slate-300 text-white rounded-xl font-bold"
                                    >
                                        {t('btn_confirm') || 'Confirmar'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRescheduling(false)}
                                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                                    >
                                        {t('btn_close')}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Task: Notes */}
                    <div className={`rounded-2xl border p-4 ${occurred ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${notesDone ? 'bg-emerald-100 text-emerald-700' : (occurred ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')}`}>
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-extrabold text-slate-800">{t('appt_modal_notes_title')}</div>
                                    <div className="text-xs text-slate-500">{t('appt_modal_notes_desc')}</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={openNotes}
                                disabled={!occurred}
                                className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${occurred ? (notesDone ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-emerald-600 hover:bg-emerald-700 text-white') : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                            >
                                {notesDone ? t('prontuario_edit') : t('prontuario_prepare')}
                            </button>
                        </div>
                    </div>

                    <div className="text-xs text-slate-400">
                        {t('appt_modal_payments_hint')}
                    </div>
                </div>

                </div>

                {notesModalOpen ? (
                    <ProntuarioModal
                        open={notesModalOpen}
                        patientName={appointment?.name}
                        date={apptDate}
                        time={appointment?.time}
                        initialContent={appointment?.noteContent || ''}
                        onClose={() => setNotesModalOpen(false)}
                        onSave={saveNotes}
                        saving={notesSaving}
                        error={notesError}
                    />
                ) : null}
            </div>
        </div>
    );
}
