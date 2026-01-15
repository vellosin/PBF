import React, { useEffect, useMemo, useState } from 'react';
import {
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    format,
    isSameMonth,
    isSameDay,
    isToday,
    startOfDay,
    isBefore,
    addDays,
    addMonths
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, FileText, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Calendar({ currentDate, appointments = [], onAppointmentClick, locale, onDateChange, language }) {
    const { t, i18n } = useTranslation();
    const lang = String(language || i18n?.language || 'pt').split('-')[0] || 'pt';

    const [view, setView] = useState('month');
    const [monthSelectedDayIso, setMonthSelectedDayIso] = useState(null);

    const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const START_HOUR = 5;
    const END_HOUR = 21;

    const HOURS = useMemo(
        () => Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR),
        [START_HOUR, END_HOUR]
    );

    const today = useMemo(() => startOfDay(new Date()), []);

    const setDateSafe = (next) => {
        if (!onDateChange) return;
        if (typeof next === 'function') {
            onDateChange(next);
            return;
        }
        const d = next instanceof Date ? next : new Date(next);
        if (!Number.isNaN(d.getTime())) onDateChange(d);
    };

    const monthInputValue = useMemo(() => {
        const d = currentDate instanceof Date ? currentDate : new Date(currentDate);
        if (Number.isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }, [currentDate]);

    const headerLabel = useMemo(() => {
        const d = currentDate instanceof Date ? currentDate : new Date(currentDate);
        if (Number.isNaN(d.getTime())) return '';

        if (view === 'month') return format(d, 'MMMM yyyy', { locale: locale || ptBR });
        if (view === 'day') {
            const fmt = lang === 'en' ? 'MMMM d, yyyy' : "d 'de' MMMM yyyy";
            return format(d, fmt, { locale: locale || ptBR });
        }

        const weekStart = startOfWeek(d, { locale: locale || ptBR });
        const weekEnd = endOfWeek(weekStart, { locale: locale || ptBR });
        const sameMonth = isSameMonth(weekStart, weekEnd);
        const left = format(weekStart, sameMonth ? 'd' : 'd MMM', { locale: locale || ptBR });
        const right = format(weekEnd, 'd MMM', { locale: locale || ptBR });
        return `${left} – ${right}`;
    }, [currentDate, view, locale, lang]);

    const shiftCurrentDate = (dir) => {
        const delta = dir === 'prev' ? -1 : 1;
        if (view === 'month') {
            setDateSafe((d) => addMonths(new Date(d), delta));
            return;
        }
        if (view === 'week') {
            setDateSafe((d) => addDays(new Date(d), 7 * delta));
            return;
        }
        setDateSafe((d) => addDays(new Date(d), delta));
    };

    const normalizeDate = (d) => {
        const dd = d instanceof Date ? d : new Date(d);
        return Number.isNaN(dd.getTime()) ? null : dd;
    };

    const parseTimeToMinutes = (t) => {
        if (!t) return 0;
        const [h, m] = String(t).split(':').map(Number);
        const hh = Number.isFinite(h) ? h : 0;
        const mm = Number.isFinite(m) ? m : 0;
        return hh * 60 + mm;
    };

    const getDurationMinutes = (evt) => {
        const d = parseInt(evt?.duration, 10);
        return Number.isFinite(d) && d > 0 ? d : (evt?.kind === 'payment' ? 30 : 50);
    };

    const minutesToTime = (totalMinutes) => {
        const m = Math.max(0, Math.floor(totalMinutes));
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    // Payments don't have a real time; for week/day grids we place them in free slots
    // so they stack vertically without creating tiny overlapped "stripes".
    const placePaymentsInFreeSlots = (events, dayStartMin, dayEndMin) => {
        const arr = Array.isArray(events) ? events : [];
        const sessions = arr.filter((e) => (e?.kind || 'session') !== 'payment');
        const payments = arr.filter((e) => (e?.kind || 'session') === 'payment');
        if (payments.length === 0) return arr;

        const normalizeInterval = (startMin, durationMin) => {
            const s = Math.max(0, startMin);
            const e = Math.max(s, s + Math.max(1, durationMin));
            return [s, e];
        };

        const overlaps = (a, b) => a[0] < b[1] && a[1] > b[0];

        const occupied = [];
        sessions.forEach((evt) => {
            const startMin = parseTimeToMinutes(evt?.time);
            const dur = getDurationMinutes(evt);
            occupied.push(normalizeInterval(startMin, dur));
        });

        const PAY_STEP = 5;
        const PAY_DUR = 25;

        // Preferred window for payments (05:00–08:00), clamped to the visible grid.
        const preferredStart = Math.max(dayStartMin, 5 * 60);
        const preferredEnd = Math.min(dayEndMin, 8 * 60);

        const placedPayments = [...payments]
            .sort((a, b) => {
                const an = String(a?.name || '').toLowerCase();
                const bn = String(b?.name || '').toLowerCase();
                if (an !== bn) return an.localeCompare(bn);
                return String(a?.patientId || a?.id || '').localeCompare(String(b?.patientId || b?.id || ''));
            })
            .map((evt) => {
                let chosen = null;

                const tryRange = (fromMin, toMin) => {
                    for (let t = fromMin; t + PAY_DUR <= toMin; t += PAY_STEP) {
                        const cand = normalizeInterval(t, PAY_DUR);
                        const bad = occupied.some((o) => overlaps(cand, o));
                        if (!bad) {
                            chosen = t;
                            occupied.push(cand);
                            return true;
                        }
                    }
                    return false;
                };

                // 1) Prefer 05:00–08:00 (or the part visible in the grid).
                if (preferredEnd - preferredStart >= PAY_DUR) {
                    tryRange(preferredStart, preferredEnd);
                }

                // 2) Fallback: anywhere in the visible day grid.
                if (chosen === null) {
                    tryRange(dayStartMin, dayEndMin);
                }

                // If the day is completely packed, append payments after the grid end, stacked.
                if (chosen === null) {
                    const base = dayEndMin + PAY_STEP;
                    let t = base;
                    while (occupied.some((o) => overlaps(normalizeInterval(t, PAY_DUR), o))) t += PAY_STEP;
                    chosen = t;
                    occupied.push(normalizeInterval(chosen, PAY_DUR));
                }

                return {
                    ...evt,
                    time: minutesToTime(chosen),
                    duration: PAY_DUR
                };
            });

        // Keep sessions order, but use the placed versions of payments.
        return [...sessions, ...placedPayments];
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const isPastOrToday = (d) => {
        const dd = startOfDay(d);
        return isBefore(dd, today) || isSameDay(dd, today);
    };

    const getSessionTaskState = (evt) => {
        const status = evt?.status || 'scheduled';
        const occurred = status === 'occurred';
        const cancelled = status === 'cancelled';
        const rescheduled = status === 'rescheduled';
        const missedPaid = status === 'missed_paid';
        const paidLegacy = status === 'paid';

        const confirmDone = occurred || cancelled || rescheduled || missedPaid || paidLegacy;
        const notesDone = occurred ? Boolean(evt?.notesDone) : false;

        return {
            status,
            occurred,
            cancelled,
            rescheduled,
            missedPaid,
            confirmDone,
            notesDone
        };
    };

    const getPaymentTaskState = (evt) => {
        const status = evt?.status || 'pending';
        return {
            status,
            isPaid: status === 'paid',
            isOverdue: status === 'overdue'
        };
    };

    const sessionBadge = (evt) => {
        const d = normalizeDate(evt?.date);
        const s = getSessionTaskState(evt);

        if (s.cancelled) return { label: t('calendar_session_cancelled'), className: 'bg-slate-100 text-slate-700 border-slate-200' };
        if (s.rescheduled) return { label: t('calendar_session_rescheduled'), className: 'bg-slate-100 text-slate-700 border-slate-200' };
        if (s.missedPaid) return { label: t('calendar_session_missed_paid'), className: 'bg-amber-50 text-amber-800 border-amber-100' };
        if (s.occurred && s.notesDone) return { label: '2/2', className: 'bg-emerald-50 text-emerald-800 border-emerald-100' };
        if (s.occurred && !s.notesDone) return { label: '1/2', className: 'bg-sky-50 text-sky-800 border-sky-100' };
        if (d && isPastOrToday(d)) return { label: '0/2', className: 'bg-rose-50 text-rose-800 border-rose-100' };
        return { label: null, className: '' };
    };

    const paymentBadge = (evt) => {
        const p = getPaymentTaskState(evt);
        if (p.isPaid) return { label: t('calendar_payment_paid_badge'), className: 'bg-emerald-50 text-emerald-800 border-emerald-100' };
        if (p.isOverdue) return { label: t('calendar_payment_overdue_badge'), className: 'bg-rose-50 text-rose-800 border-rose-100' };
        return { label: t('calendar_payment_pending_badge'), className: 'bg-violet-50 text-violet-800 border-violet-100' };
    };

    const getEventAttentionLevel = (evt) => {
        const kind = evt?.kind || 'session';
        const d = normalizeDate(evt?.date);
        if (!d) return 'none';
        const due = isPastOrToday(d);

        if (kind === 'payment') {
            const p = getPaymentTaskState(evt);
            if (p.isPaid) return 'done';
            if (p.isOverdue) return 'danger';
            return due ? 'warn' : 'none';
        }

        const s = getSessionTaskState(evt);
        if (s.cancelled || s.rescheduled) return 'neutral';
        if (s.occurred && s.notesDone) return 'done';
        if (s.occurred && !s.notesDone) return due ? 'warn' : 'none';
        if (!s.confirmDone && due) return 'danger';
        return 'none';
    };

    const normalizedAppointments = useMemo(() => {
        return (appointments || [])
            .map((evt) => ({
                ...evt,
                date: normalizeDate(evt?.date) || evt?.date
            }))
            .filter((evt) => normalizeDate(evt?.date));
    }, [appointments]);

    const sortedAppointments = useMemo(() => {
        const arr = [...normalizedAppointments];
        arr.sort((a, b) => {
            const da = normalizeDate(a.date);
            const db = normalizeDate(b.date);
            if (!da || !db) return 0;
            if (da - db !== 0) return da - db;
            return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
        });
        return arr;
    }, [normalizedAppointments]);

    const buildLanes = (dayEvents) => {
        const sorted = [...dayEvents].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
        const active = []; // { endMin, lane }
        const usedLanes = new Set();
        let maxLanes = 1;

        const items = sorted.map((evt) => {
            const startMin = parseTimeToMinutes(evt.time);
            const dur = getDurationMinutes(evt);
            const endMin = startMin + dur;

            for (let i = active.length - 1; i >= 0; i--) {
                if (active[i].endMin <= startMin) active.splice(i, 1);
            }

            usedLanes.clear();
            active.forEach((a) => usedLanes.add(a.lane));
            let lane = 0;
            while (usedLanes.has(lane)) lane++;

            active.push({ endMin, lane });
            maxLanes = Math.max(maxLanes, lane + 1);

            return { evt, startMin, dur, lane };
        });

        return { items, maxLanes };
    };

    const EventProgressIcons = ({ evt, compact = false }) => {
        const kind = evt?.kind || 'session';

        if (kind === 'payment') {
            const { status, isPaid, isOverdue } = getPaymentTaskState(evt);
            const tone = isPaid ? 'text-emerald-700' : (isOverdue ? 'text-rose-700' : 'text-violet-700');
            return (
                <div className={`flex items-center gap-1 ${compact ? '' : 'gap-1.5'}`}>
                    <Wallet size={compact ? 14 : 16} className={tone} />
                    {status === 'paid' ? (
                        <CheckCircle2 size={compact ? 14 : 16} className="text-emerald-700" />
                    ) : status === 'overdue' ? (
                        <AlertCircle size={compact ? 14 : 16} className="text-rose-700" />
                    ) : (
                        <Clock size={compact ? 14 : 16} className="text-violet-700" />
                    )}
                </div>
            );
        }

        const { occurred, confirmDone, notesDone } = getSessionTaskState(evt);

        return (
            <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
                {confirmDone ? (
                    <CheckCircle2 size={compact ? 14 : 16} className={occurred ? 'text-sky-700' : 'text-slate-600'} />
                ) : (
                    <Circle size={compact ? 14 : 16} className="text-slate-400" />
                )}
                {occurred ? (
                    <FileText size={compact ? 14 : 16} className={notesDone ? 'text-emerald-700' : 'text-amber-700'} />
                ) : (
                    <FileText size={compact ? 14 : 16} className="text-slate-300" />
                )}
            </div>
        );
    };

    const EventBadge = ({ evt }) => {
        const kind = evt?.kind || 'session';
        const badge = kind === 'payment' ? paymentBadge(evt) : sessionBadge(evt);
        if (!badge.label) return null;
        return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.className}`}>
                {badge.label}
            </span>
        );
    };

    const TimedBlock = ({ evt, style }) => {
        const kind = evt?.kind || 'session';
        const attention = getEventAttentionLevel(evt);

        const heightPxRaw = style?.height;
        const heightPx = typeof heightPxRaw === 'number'
            ? heightPxRaw
            : (typeof heightPxRaw === 'string' ? parseFloat(heightPxRaw) : 0);
        const isTiny = (heightPx || 0) < 40;
        const isShort = (heightPx || 0) < 56;
        const canShowDetail = kind === 'payment' ? (heightPx || 0) >= 44 : (heightPx || 0) >= 62;
        const canShowIcons = (heightPx || 0) >= 52;

        const padding = isTiny
            ? 'px-3 py-1.5'
            : isShort
                ? 'px-3.5 py-2'
                : 'px-3.5 py-2.5';

        const base = `absolute rounded-2xl border shadow-sm hover:shadow-md transition-shadow text-left box-border ${padding}`;
        const tone = (() => {
            if (kind === 'payment') {
                const p = getPaymentTaskState(evt);
                if (p.isPaid) return 'bg-emerald-50 border-emerald-100';
                if (p.isOverdue) return 'bg-rose-50 border-rose-100';
                return 'bg-violet-50 border-violet-100';
            }

            if (attention === 'done') return 'bg-emerald-50 border-emerald-100';
            if (attention === 'danger') return 'bg-rose-50 border-rose-100';
            if (attention === 'warn') return 'bg-amber-50 border-amber-100';
            if (attention === 'neutral') return 'bg-slate-50 border-slate-200';
            return 'bg-white border-slate-200';
        })();

        const topLine = kind === 'payment' ? t('calendar_payment_title') : (evt.time || '--:--');
        const name = evt?.name || '';
        const hasRate = evt?.rate !== undefined && evt?.rate !== null;
        const sessionsCount = Number.isFinite(Number(evt?.sessionsCount)) ? Number(evt.sessionsCount) : null;
        const paymentPrimary = (hasRate ? `${name} • R$ ${evt.rate}` : name);
        const paymentDetail = sessionsCount !== null ? t('sessions_count', { count: sessionsCount }) : '';
        const primaryLine = kind === 'payment' ? paymentPrimary : name;
        const detail = kind === 'payment'
            ? paymentDetail
            : '';

        const nameSize = kind === 'payment'
            ? (isTiny ? 'text-[11px]' : isShort ? 'text-[13px]' : 'text-sm')
            : (isTiny ? 'text-[11px]' : 'text-sm');

        const compactLine = `${topLine} • ${primaryLine}`;

        return (
            <button
                type="button"
                onClick={() => onAppointmentClick && onAppointmentClick(evt)}
                className={`${base} ${tone}`}
                style={style}
                title={name}
            >
                {isTiny ? (
                    <div className="h-full w-full flex items-center min-w-0">
                        <div className="min-w-0">
                            <div className="text-[11px] font-extrabold text-slate-800 truncate leading-none">{compactLine}</div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full w-full flex items-start justify-between gap-2 min-h-0">
                        <div className="min-w-0 min-h-0">
                            <div className={`${isShort ? 'text-[9px]' : 'text-[10px]'} font-extrabold uppercase tracking-wider text-slate-500 leading-tight`}>{topLine}</div>
                            <div className={`${nameSize} font-extrabold text-slate-800 truncate leading-tight`}>{primaryLine}</div>
                            {canShowDetail && detail ? (
                                <div className={`${kind === 'payment' ? 'text-[10px]' : 'text-[11px]'} text-slate-500 truncate mt-0.5 leading-tight`}>{detail}</div>
                            ) : null}
                        </div>

                        {isShort ? null : canShowIcons ? (
                            <div className="flex flex-col items-end gap-1 shrink-0 pl-1">
                                <EventBadge evt={evt} />
                                <EventProgressIcons evt={evt} compact />
                            </div>
                        ) : (
                            <div className="shrink-0">
                                <EventBadge evt={evt} />
                            </div>
                        )}
                    </div>
                )}
            </button>
        );
    };

    const renderHeader = () => (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1 whitespace-nowrap">
                <button
                    onClick={() => setView('month')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    {t('calendar_view_month')}
                </button>
                <button
                    onClick={() => setView('week')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    {t('calendar_view_week')}
                </button>
                <button
                    onClick={() => setView('day')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    {t('calendar_view_day')}
                </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => shiftCurrentDate('prev')}
                        className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
                        title={view === 'month' ? t('calendar_prev_month') : view === 'week' ? t('calendar_prev_week') : t('calendar_prev_day')}
                        disabled={!onDateChange}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="min-w-[160px] text-center">
                        <div className="text-sm font-extrabold text-slate-800 capitalize">{headerLabel}</div>
                        <div className="text-[11px] text-slate-500">
                            {view === 'month' ? t('calendar_view_month_desc') : view === 'week' ? t('calendar_view_week_desc') : t('calendar_view_day_desc')}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => shiftCurrentDate('next')}
                        className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
                        title={view === 'month' ? t('calendar_next_month') : view === 'week' ? t('calendar_next_week') : t('calendar_next_day')}
                        disabled={!onDateChange}
                    >
                        <ChevronRight size={16} />
                    </button>

                    <input
                        type="month"
                        value={monthInputValue}
                        onChange={(e) => {
                            const v = String(e.target.value || '').trim();
                            if (!v) return;
                            const [yy, mm] = v.split('-').map((x) => parseInt(x, 10));
                            if (!Number.isFinite(yy) || !Number.isFinite(mm)) return;
                            const next = new Date(yy, Math.max(0, Math.min(11, mm - 1)), 1);
                            setDateSafe(next);
                        }}
                        className="ml-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 max-w-[160px]"
                        disabled={!onDateChange}
                        aria-label={t('calendar_select_month')}
                    />
                </div>
            </div>

            <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 justify-end">
                <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> {t('calendar_legend_ok')}
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> {t('calendar_legend_pending')}
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> {t('calendar_legend_overdue')}
                </span>
            </div>
        </div>
    );

    const renderMonthView = () => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { locale: locale || ptBR });
        const endDate = endOfWeek(monthEnd, { locale: locale || ptBR });
        const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <>
                <div className="grid grid-cols-7 mb-2">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 py-2">
                            {format(addDays(startDate, i), 'EEE', { locale: locale || ptBR })}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {calendarDays.map((day) => {
                        const dayEvents = sortedAppointments.filter((evt) => isSameDay(normalizeDate(evt.date), day));
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isTodayFlag = isToday(day);
                        const iso = format(day, 'yyyy-MM-dd');
                        const isSelected = monthSelectedDayIso ? monthSelectedDayIso === iso : false;

                        const attention = dayEvents.reduce((acc, evt) => {
                            const lvl = getEventAttentionLevel(evt);
                            if (lvl === 'danger') return 'danger';
                            if (lvl === 'warn' && acc !== 'danger') return 'warn';
                            if (lvl === 'done' && acc === 'none') return 'done';
                            if (lvl === 'neutral' && acc === 'none') return 'neutral';
                            return acc;
                        }, 'none');

                        const dayTone = (() => {
                            if (!isCurrentMonth) return 'bg-slate-50/40 border-slate-100';
                            if (attention === 'danger') return 'bg-rose-50 border-rose-100';
                            if (attention === 'warn') return 'bg-amber-50 border-amber-100';
                            if (attention === 'done' && dayEvents.length > 0) return 'bg-emerald-50 border-emerald-100';
                            return 'bg-white border-slate-200';
                        })();

                        return (
                            <div
                                key={day.toISOString()}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    setMonthSelectedDayIso(iso);
                                    if (onDateChange) {
                                        setDateSafe(day);
                                        setView('day');
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter' && e.key !== ' ') return;
                                    e.preventDefault();
                                    setMonthSelectedDayIso(iso);
                                    if (onDateChange) {
                                        setDateSafe(day);
                                        setView('day');
                                    }
                                }}
                                className={`rounded-2xl border p-3 min-h-[120px] cursor-pointer ${dayTone} ${isTodayFlag ? 'ring-2 ring-indigo-200' : ''} ${isSelected ? 'ring-2 ring-indigo-300' : ''}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className={`text-sm font-extrabold ${isCurrentMonth ? 'text-slate-800' : 'text-slate-400'}`}>
                                        {format(day, 'd')}
                                    </div>
                                    {attention === 'danger' ? (
                                        <AlertCircle size={16} className="text-rose-600" />
                                    ) : attention === 'warn' ? (
                                        <Clock size={16} className="text-amber-700" />
                                    ) : attention === 'done' && dayEvents.length > 0 ? (
                                        <CheckCircle2 size={16} className="text-emerald-700" />
                                    ) : null}
                                </div>

                                {dayEvents.length === 0 ? (
                                    <div className="text-xs text-slate-400">&nbsp;</div>
                                ) : (
                                    <div className="space-y-1">
                                        {dayEvents.slice(0, 4).map((evt, idx) => {
                                            const kind = evt?.kind || 'session';
                                            const left = kind === 'payment' ? t('calendar_payment_short') : (evt.time || '--:--');
                                            return (
                                                <button
                                                    key={`${kind}-${evt.id ?? evt.patientId ?? idx}-${left}-${idx}`}
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onAppointmentClick && onAppointmentClick(evt);
                                                    }}
                                                    className="w-full text-left rounded-xl px-2 py-1 hover:bg-black/5 transition-colors"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{left}</div>
                                                            <div className="text-xs font-bold text-slate-800 truncate">{evt.name}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <EventBadge evt={evt} />
                                                            <EventProgressIcons evt={evt} compact />
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}

                                        {dayEvents.length > 4 ? (
                                            <div className="text-[11px] font-bold text-slate-500 px-2">{t('calendar_more', { count: dayEvents.length - 4 })}</div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </>
        );
    };

    const renderWeekView = () => {
        const weekStart = startOfWeek(currentDate, { locale: locale || ptBR });
        const weekEnd = endOfWeek(weekStart, { locale: locale || ptBR });
        const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

        const SLOT_HEIGHT = viewportWidth < 640 ? 56 : viewportWidth < 1024 ? 64 : 72; // px per hour
        const pxPerMinute = SLOT_HEIGHT / 60;
        const gridHeight = (END_HOUR - START_HOUR + 1) * SLOT_HEIGHT;
        const dayStartMin = START_HOUR * 60;
        const dayEndMin = END_HOUR * 60;
        const toY = (min) => (min - dayStartMin) * pxPerMinute;

        return (
            <div className="overflow-x-auto">
                <div className="min-w-[760px] lg:min-w-[860px]">
                    <div className="rounded-3xl border border-slate-100 bg-white p-2">
                        <div className="grid grid-cols-[72px_repeat(7,1fr)] sm:grid-cols-[88px_repeat(7,1fr)] rounded-2xl overflow-hidden bg-white">
                        <div className="bg-white border-b border-r border-slate-100" />
                        {days.map((day) => (
                            <div key={day.toISOString()} className={`text-center p-3 border-b border-slate-100 ${isToday(day) ? 'bg-indigo-50/50' : ''}`}>
                                <div className="text-xs font-bold text-slate-400 uppercase">{format(day, 'EEE', { locale: locale || ptBR })}</div>
                                <div className={`text-xl font-extrabold mt-1 ${isToday(day) ? 'text-indigo-600' : 'text-slate-700'}`}>{format(day, 'd')}</div>
                            </div>
                        ))}

                        <div className="border-r border-slate-100 bg-white">
                            <div style={{ height: gridHeight }} className="relative">
                                {HOURS.map((h, idx) => (
                                    <div
                                        key={h}
                                        className={`flex items-start justify-end pr-2 sm:pr-3 text-xs font-semibold text-slate-400 border-b border-slate-100 ${idx === 0 ? 'pt-2' : ''}`}
                                        style={{ height: SLOT_HEIGHT }}
                                    >
                                        <span className="leading-none">{h}:00</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {days.map((day) => {
                            const dayEvents = sortedAppointments
                                .filter((evt) => isSameDay(normalizeDate(evt.date), day))
                                .filter((evt) => {
                                    const m = parseTimeToMinutes(evt.time);
                                    return m >= dayStartMin - 60 && m <= END_HOUR * 60 + 60;
                                });

                            const layoutEvents = placePaymentsInFreeSlots(dayEvents, dayStartMin, dayEndMin);

                            const { items, maxLanes } = buildLanes(layoutEvents);
                            const widthPct = 100 / Math.max(1, maxLanes);
                            const useLaneGap = maxLanes <= 6;

                            return (
                                <div key={day.toISOString()} className="relative bg-white" style={{ height: gridHeight }}>
                                    {HOURS.map((h) => (
                                        <div key={h} className="border-b border-slate-100" style={{ height: SLOT_HEIGHT }} />
                                    ))}

                                    <div className="absolute inset-0 px-2 sm:px-3">
                                        {items.map(({ evt, startMin, dur, lane }, idx) => {
                                            const top = clamp(toY(startMin), 0, gridHeight - 8);
                                            const height = clamp(dur * pxPerMinute, (evt?.kind === 'payment' ? 24 : 20), gridHeight);
                                            const leftPct = lane * widthPct;
                                            return (
                                                <TimedBlock
                                                    key={`${evt.kind || 'session'}-${evt.id ?? evt.patientId ?? idx}-${day.toISOString()}-${evt.time}-${idx}`}
                                                    evt={evt}
                                                    style={{
                                                        top,
                                                        height,
                                                        left: useLaneGap ? `calc(${leftPct}% + 6px)` : `${leftPct}%`,
                                                        width: useLaneGap ? `calc(${widthPct}% - 12px)` : `${widthPct}%`,
                                                        zIndex: 10 + lane
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderDayView = () => {
        const day = startOfDay(currentDate);
        const rawDayEvents = sortedAppointments
            .filter((evt) => isSameDay(normalizeDate(evt.date), day))
            .filter((evt) => {
                const m = parseTimeToMinutes(evt.time);
                return m >= START_HOUR * 60 - 60 && m <= END_HOUR * 60 + 60;
            });

        const dayStartMin = START_HOUR * 60;
        const dayEndMin = END_HOUR * 60;
        const dayEvents = placePaymentsInFreeSlots(rawDayEvents, dayStartMin, dayEndMin);

        const dayList = [...dayEvents].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

        const SLOT_HEIGHT = viewportWidth < 640 ? 72 : viewportWidth < 1024 ? 84 : 96; // px per hour (day view)
        const pxPerMinute = SLOT_HEIGHT / 60;
        const gridHeight = (END_HOUR - START_HOUR + 1) * SLOT_HEIGHT;
        const toY = (min) => (min - dayStartMin) * pxPerMinute;

        const { items, maxLanes } = buildLanes(dayEvents);
        const useLaneGap = maxLanes <= 6;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0">
                <div className="bg-white rounded-3xl border border-slate-100 p-2">
                    <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[88px_1fr] bg-white rounded-2xl overflow-hidden">
                    <div className="border-r border-slate-100 bg-white">
                        <div style={{ height: gridHeight }} className="relative">
                            {HOURS.map((h, idx) => (
                                <div
                                    key={h}
                                    className={`flex items-start justify-end pr-2 sm:pr-3 text-xs font-semibold text-slate-400 border-b border-slate-100 ${idx === 0 ? 'pt-2' : ''}`}
                                    style={{ height: SLOT_HEIGHT }}
                                >
                                    <span className="leading-none">{h}:00</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white">
                        <div style={{ height: gridHeight }} className="relative">
                            {HOURS.map((h) => (
                                <div key={h} className="border-b border-slate-100" style={{ height: SLOT_HEIGHT }} />
                            ))}

                            <div className="absolute inset-0 px-2 sm:px-3">
                                {items.map(({ evt, startMin, dur, lane }, idx) => {
                                    const top = clamp(toY(startMin), 0, gridHeight - 8);
                                    const height = clamp(dur * pxPerMinute, (evt?.kind === 'payment' ? 26 : 22), gridHeight);
                                    const widthPct = 100 / Math.max(1, maxLanes);
                                    const leftPct = lane * widthPct;

                                    return (
                                        <TimedBlock
                                            key={`${evt.kind || 'session'}-${evt.id ?? evt.patientId ?? idx}-${day.toISOString()}-${evt.time}-${idx}`}
                                            evt={evt}
                                            style={{
                                                top,
                                                height,
                                                left: useLaneGap ? `calc(${leftPct}% + 8px)` : `${leftPct}%`,
                                                width: useLaneGap ? `calc(${widthPct}% - 16px)` : `${widthPct}%`,
                                                zIndex: 10 + lane
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    </div>
                </div>

                <div className="border-t lg:border-t-0 lg:border-l border-slate-100 bg-slate-50/50 p-5 rounded-b-3xl lg:rounded-b-none lg:rounded-r-3xl">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-extrabold text-slate-800">{t('calendar_day_tasks_title')}</div>
                        <div className="text-xs text-slate-500">{t('calendar_day_tasks_hint')}</div>
                    </div>

                    {dayList.length === 0 ? (
                        <div className="text-sm text-slate-500">{t('calendar_day_none')}</div>
                    ) : (
                        <div className="space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                            {dayList.map((evt, idx) => {
                                const kind = evt?.kind || 'session';
                                const title = evt?.name || '';

                                const containerTone = (() => {
                                    const lvl = getEventAttentionLevel(evt);
                                    if (kind === 'payment') {
                                        const p = getPaymentTaskState(evt);
                                        if (p.isPaid) return 'bg-emerald-50 border-emerald-100';
                                        if (p.isOverdue) return 'bg-rose-50 border-rose-100';
                                        return 'bg-violet-50 border-violet-100';
                                    }
                                    if (lvl === 'done') return 'bg-emerald-50 border-emerald-100';
                                    if (lvl === 'danger') return 'bg-rose-50 border-rose-100';
                                    if (lvl === 'warn') return 'bg-amber-50 border-amber-100';
                                    if (lvl === 'neutral') return 'bg-slate-50 border-slate-200';
                                    return 'bg-white border-slate-200';
                                })();

                                return (
                                    <button
                                        key={`${kind}-${evt.id ?? evt.patientId ?? idx}-${evt.time ?? ''}-${idx}`}
                                        onClick={() => onAppointmentClick && onAppointmentClick(evt)}
                                        className={`w-full text-left rounded-2xl border p-4 transition-shadow hover:shadow-md ${containerTone}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                    {kind === 'payment' ? t('calendar_payment_title') : (evt.time || '--:--')}
                                                </div>
                                                <div className="font-extrabold text-slate-800 truncate">{title}</div>
                                                {kind === 'payment' ? (
                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                        {(evt?.rate !== undefined && evt?.rate !== null) ? `R$ ${evt.rate}` : 'R$ 0'}
                                                        {Number.isFinite(Number(evt?.sessionsCount)) ? ` • ${t('sessions_count', { count: Number(evt.sessionsCount) })}` : ''}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="flex flex-col items-end gap-2">
                                                <EventBadge evt={evt} />
                                                <EventProgressIcons evt={evt} />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {renderHeader()}

            {view === 'month' ? renderMonthView() : null}
            {view === 'week' ? renderWeekView() : null}
            {view === 'day' ? renderDayView() : null}
        </div>
    );
}

// Sub-component for individual appointment items
function AppointmentItem({ appt, onClick, compact = false, fullWidth = false }) {
    const { t } = useTranslation();
    const kind = appt?.kind || 'session';

    let statusColor = kind === 'payment'
        ? "bg-violet-50 border-violet-100 text-violet-700"
        : "bg-indigo-50 border-indigo-100 text-indigo-700";

    if (kind === 'payment') {
        if (appt.status === 'paid') statusColor = "bg-emerald-100 border-emerald-200 text-emerald-800";
        if (appt.status === 'overdue') statusColor = "bg-rose-50 border-rose-100 text-rose-700";
    } else {
        // Session statuses
        const occurred = appt.status === 'occurred';
        const notesDone = Boolean(appt?.notesDone);

        if (occurred && notesDone) statusColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
        else if (occurred) statusColor = "bg-sky-50 border-sky-100 text-sky-700";

        if (appt.status === 'paid') statusColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
        if (appt.status === 'missed_paid') statusColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
        if (appt.status === 'cancelled') statusColor = "bg-rose-50 border-rose-100 text-rose-700 opacity-60 line-through";
        if (appt.status === 'rescheduled') statusColor = "bg-slate-50 border-slate-200 text-slate-600 opacity-70";
    }

    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick && onClick(appt); }}
            className={`
                text-left group relative flex flex-col justify-center rounded-lg border transition-all hover:scale-[1.02] hover:shadow-md
                ${statusColor}
                ${compact ? 'p-1.5 text-[10px]' : 'p-2 text-xs'}
                ${fullWidth ? 'w-full flex-row items-center justify-between px-4 py-3' : 'w-full'}
            `}
        >
            <div className={`font-bold ${fullWidth ? 'text-sm' : 'mb-0.5'}`}>
                {kind === 'payment' ? t('calendar_payment_title') : appt.time}
            </div>
            <div className={`truncate font-medium opacity-90 ${fullWidth ? 'text-base flex-1 ml-4' : ''}`}>
                {kind === 'payment' ? `${t('calendar_payment_title')}: ${appt.name}` : appt.name}
            </div>
            {fullWidth && appt.rate && (
                <div className="text-sm font-bold opacity-70">
                    R$ {appt.rate}
                </div>
            )}
        </button>
    );
}

function TimedAppointmentBlock({ appt, onClick, style, heightPx }) {
    const { t } = useTranslation();
    const kind = appt?.kind || 'session';

    let statusColor = kind === 'payment'
        ? "bg-violet-50 border-violet-100 text-violet-700"
        : "bg-indigo-50 border-indigo-100 text-indigo-700";

    if (kind === 'payment') {
        if (appt.status === 'paid') statusColor = "bg-emerald-100 border-emerald-200 text-emerald-800";
        if (appt.status === 'overdue') statusColor = "bg-rose-50 border-rose-100 text-rose-700";
    } else {
        const occurred = appt.status === 'occurred';
        const notesDone = Boolean(appt?.notesDone);

        if (occurred && notesDone) statusColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
        else if (occurred) statusColor = "bg-sky-50 border-sky-100 text-sky-700";

        if (appt.status === 'paid') statusColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
        if (appt.status === 'missed_paid') statusColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
        if (appt.status === 'cancelled') statusColor = "bg-rose-50 border-rose-100 text-rose-700 opacity-60 line-through";
        if (appt.status === 'rescheduled') statusColor = "bg-slate-50 border-slate-200 text-slate-600 opacity-70";
    }

    const isTiny = (heightPx || 0) < 34;
    const isShort = (heightPx || 0) < 54;
    const canShowIcons = (heightPx || 0) >= 44;
    const kindIconColor = kind === 'payment' ? 'text-violet-700' : 'text-slate-500';

    const occurred = kind === 'session' && appt.status === 'occurred';
    const notesDone = kind === 'session' && Boolean(appt?.notesDone);
    const paymentPaid = kind === 'payment' && appt.status === 'paid';
    const paymentOverdue = kind === 'payment' && appt.status === 'overdue';

    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick && onClick(appt); }}
            className={`absolute rounded-lg border shadow-sm hover:shadow-md transition-shadow ${statusColor}`}
            style={style}
            title={`${appt.time || ''} ${appt.name || ''}`.trim()}
        >
            <div className={`h-full w-full ${isTiny ? 'px-2 py-1' : 'px-3 py-2'} flex flex-col justify-start`}
            >
                <div className={`${isTiny ? 'text-[10px]' : 'text-xs'} font-extrabold leading-tight`}> {kind === 'payment' ? t('calendar_payment_title') : appt.time}</div>
                {!isTiny && (
                    <div className={`${isShort ? 'text-[11px]' : 'text-xs'} font-semibold truncate leading-snug`}>{kind === 'payment' ? `${t('calendar_payment_title')}: ${appt.name}` : appt.name}</div>
                )}
                {canShowIcons && (
                    <div className="mt-auto pt-1 flex items-center gap-2">
                        {kind === 'session' ? (
                            <>
                                {occurred ? (
                                    <CheckCircle2 size={14} className="text-sky-700" />
                                ) : (
                                    <Circle size={14} className="text-slate-400" />
                                )}
                                {occurred ? (
                                    <FileText size={14} className={notesDone ? 'text-emerald-700' : 'text-amber-700'} />
                                ) : (
                                    <FileText size={14} className="text-slate-300" />
                                )}
                            </>
                        ) : (
                            <>
                                <Wallet size={14} className={kindIconColor} />
                                {paymentPaid ? (
                                    <CheckCircle2 size={14} className="text-emerald-700" />
                                ) : paymentOverdue ? (
                                    <AlertCircle size={14} className="text-rose-700" />
                                ) : (
                                    <Clock size={14} className="text-violet-700" />
                                )}
                            </>
                        )}
                    </div>
                )}
                {!isShort && appt.rate && (
                    <div className="mt-auto text-[11px] font-bold opacity-70">R$ {appt.rate}</div>
                )}
            </div>
        </button>
    );
}
