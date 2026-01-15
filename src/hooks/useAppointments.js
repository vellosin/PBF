import { useState, useMemo, useEffect } from 'react';
import { endOfMonth, startOfMonth, eachDayOfInterval, isSameMonth, getDay, startOfDay, addMonths, addDays } from 'date-fns';
import { generateAppointments } from '../utils/parser';
import { scopedKey } from '../utils/storageKeys';

const WEEKDAY_MAP = {
    'domingo': 0,
    'segunda': 1, 'segunda-feira': 1,
    'terça': 2, 'terça-feira': 2, 'terca': 2, 'terca-feira': 2,
    'quarta': 3, 'quarta-feira': 3,
    'quinta': 4, 'quinta-feira': 4,
    'sexta': 5, 'sexta-feira': 5,
    'sábado': 6, 'sabado': 6
};

const isoDate = (d) => {
    const dd = new Date(d);
    if (Number.isNaN(dd.getTime())) return '';
    return dd.toISOString().split('T')[0];
};

export function useAppointments(patients) {
    const opts = arguments.length > 1 ? arguments[1] : {};
    const workspaceId = opts?.workspaceId || '';
    const useSupabase = Boolean(opts?.useSupabase);
    const supabase = opts?.supabase || null;
    const minDateRaw = opts?.minDate || null;

    const minDate = useMemo(() => {
        if (!minDateRaw) return null;
        const d = minDateRaw instanceof Date ? minDateRaw : new Date(minDateRaw);
        if (Number.isNaN(d.getTime())) return null;
        return startOfDay(d);
    }, [minDateRaw]);

    const [currentDate, setCurrentDate] = useState(new Date());
    const [generatedAppointments, setGeneratedAppointments] = useState([]);

    const storageKeys = useMemo(() => {
        return {
            overrides: scopedKey('appointment_overrides', workspaceId),
            extra: scopedKey('extra_sessions', workspaceId),
            payment: scopedKey('payment_overrides', workspaceId)
        };
    }, [workspaceId]);

    const [overrides, setOverrides] = useState({});
    const [extraSessions, setExtraSessions] = useState([]);
    const [paymentOverrides, setPaymentOverrides] = useState({});

    const readJson = (key, fallback) => {
        try {
            const saved = localStorage.getItem(key);
            if (!saved) return fallback;
            const parsed = JSON.parse(saved);
            return parsed ?? fallback;
        } catch {
            return fallback;
        }
    };

    // Load from local cache when workspace changes.
    useEffect(() => {
        setOverrides(() => {
            const parsed = readJson(storageKeys.overrides, {});
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        });
        setExtraSessions(() => {
            const parsed = readJson(storageKeys.extra, []);
            return Array.isArray(parsed) ? parsed : [];
        });
        setPaymentOverrides(() => {
            const parsed = readJson(storageKeys.payment, {});
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKeys.overrides, storageKeys.extra, storageKeys.payment]);

    // Load from Supabase (source of truth) for this workspace.
    useEffect(() => {
        if (!useSupabase || !supabase || !workspaceId) return;

        let cancelled = false;
        const load = async () => {
            const { data, error } = await supabase
                .from('workspace_settings')
                .select('appointment_overrides, extra_sessions, payment_overrides')
                .eq('workspace_id', workspaceId)
                .maybeSingle();

            if (cancelled) return;
            if (error) return;

            const ov = data?.appointment_overrides;
            const ex = data?.extra_sessions;
            const pay = data?.payment_overrides;

            setOverrides((ov && typeof ov === 'object' && !Array.isArray(ov)) ? ov : {});
            setExtraSessions(Array.isArray(ex) ? ex : []);
            setPaymentOverrides((pay && typeof pay === 'object' && !Array.isArray(pay)) ? pay : {});
        };

        load();
        return () => { cancelled = true; };
    }, [useSupabase, supabase, workspaceId]);

    const toValidDate = (v) => {
        if (!v) return null;
        if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    const isOnOrAfterMinDate = (d) => {
        if (!minDate) return true;
        const dd = toValidDate(d);
        if (!dd) return true;
        return startOfDay(dd) >= minDate;
    };

    const occurrenceKey = (appt) => {
        const baseId = appt?.id;
        const raw = appt?.originalDate ?? appt?.date;
        const d = toValidDate(raw);
        const iso = d ? d.toISOString() : String(raw || '');
        return `${baseId}_${iso}`;
    };

    useEffect(() => {
        try { localStorage.setItem(storageKeys.overrides, JSON.stringify(overrides)); } catch { /* ignore */ }
    }, [overrides, storageKeys.overrides]);

    useEffect(() => {
        try { localStorage.setItem(storageKeys.extra, JSON.stringify(extraSessions)); } catch { /* ignore */ }
    }, [extraSessions, storageKeys.extra]);

    useEffect(() => {
        try { localStorage.setItem(storageKeys.payment, JSON.stringify(paymentOverrides)); } catch { /* ignore */ }
    }, [paymentOverrides, storageKeys.payment]);

    // Persist to Supabase (debounced) so state survives logout/login.
    useEffect(() => {
        if (!useSupabase || !supabase || !workspaceId) return;

        const t = setTimeout(() => {
            supabase
                .from('workspace_settings')
                .upsert(
                    {
                        workspace_id: workspaceId,
                        appointment_overrides: overrides,
                        extra_sessions: extraSessions,
                        payment_overrides: paymentOverrides
                    },
                    { onConflict: 'workspace_id' }
                )
                .then(() => {})
                .catch(() => {});
        }, 600);

        return () => clearTimeout(t);
    }, [useSupabase, supabase, workspaceId, overrides, extraSessions, paymentOverrides]);

    useEffect(() => {
        if (patients) {
            const raw = generateAppointments(patients, currentDate);
            setGeneratedAppointments(raw);
        }
    }, [patients, currentDate]);

    const displayAppointments = useMemo(() => {
        const normalizeMoney = (v) => {
            const n = typeof v === 'number' ? v : parseFloat(v);
            return Number.isFinite(n) ? n : 0;
        };

        const patientRateById = new Map(
            (patients || []).map((p) => [String(p?.id ?? ''), normalizeMoney(p?.rate)])
        );

        const applyOverridesToSession = (appt) => {
            const key = occurrenceKey(appt);
            const override = overrides[key];
            if (override) {
                return { ...appt, ...override, kind: 'session', patientId: String(appt?.id ?? '') };
            }
            return { ...appt, kind: 'session', patientId: String(appt?.id ?? '') };
        };

        // Sessions shown in the UI are only for the selected month.
        const regular = generatedAppointments.map(applyOverridesToSession);

        // Billing needs access to sessions from the previous month too (e.g. payDay=5 covers last month days 6..end).
        // This list is used ONLY for payment amount calculation.
        const prevMonth = addMonths(currentDate, -1);
        const billingPrevRaw = generateAppointments(patients || [], prevMonth);
        const billingPrev = billingPrevRaw.map(applyOverridesToSession);

        const extra = (extraSessions || []).map(s => {
            const date = toValidDate(s?.date) || s?.date;
            const originalDate = toValidDate(s?.originalDate) || toValidDate(s?.date) || s?.originalDate;
            return {
                ...s,
                kind: 'session',
                date,
                originalDate,
                isExtra: Boolean(s?.isExtra),
                patientId: String(s?.patientId ?? '')
            };
        });

        const isBillableSessionForReceivable = (evt) => {
            const status = String(evt?.status || 'scheduled');
            // For "a receber", we count every session in the window except sessions explicitly cancelled or moved.
            return status !== 'cancelled' && status !== 'rescheduled';
        };

        // Billing window: (prevPayDate, payDate]
        const isInBillingWindow = (d, prevPayDate, payDate) => {
            const dd = toValidDate(d);
            const prev = toValidDate(prevPayDate);
            const cur = toValidDate(payDate);
            if (!dd || !cur) return false;

            const x = startOfDay(dd).getTime();
            const end = startOfDay(cur).getTime();
            if (x > end) return false;
            if (!prev) return true;
            return x > startOfDay(prev).getTime();
        };

        const sessionEventsForBilling = [...billingPrev, ...regular, ...extra]
            .filter((evt) => (evt?.kind || 'session') === 'session')
            .filter((evt) => Boolean(evt?.patientId));

        const sumBillableSessionsInWindow = (patientId, prevPayDate, payDate) => {
            return sessionEventsForBilling.reduce(
                (acc, evt) => {
                    if (String(evt.patientId) !== String(patientId)) return acc;
                    if (!isBillableSessionForReceivable(evt)) return acc;
                    if (!isInBillingWindow(evt.date, prevPayDate, payDate)) return acc;

                    const sessionRate = (() => {
                        const direct = normalizeMoney(evt?.rate);
                        if (direct > 0) return direct;
                        const fallback = patientRateById.get(String(patientId));
                        return normalizeMoney(fallback);
                    })();

                    acc.total += sessionRate;
                    acc.count += 1;
                    return acc;
                },
                { total: 0, count: 0 }
            );
        };

        const clampDayInMonth = (year, month0, dayRaw) => {
            const d = Math.max(1, Math.min(parseInt(dayRaw, 10) || 1, 31));
            const dim = endOfMonth(new Date(year, month0, 1)).getDate();
            return Math.max(1, Math.min(d, dim));
        };

        // Payment events for the current month
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const daysInMonth = monthEnd.getDate();

        const paymentEvents = (patients || [])
            .filter(p => p && p.active === 'Sim')
            .filter(p => p.payDay || p.payRecurrence)
            .flatMap(p => {
                const recurrence = p.payRecurrence || 'Mensal';
                const base = {
                    id: `pay_${p.id}`,
                    patientId: p.id,
                    psychologist: p.psychologist,
                    mode: p.mode,
                    payRecurrence: recurrence,
                    payDay: p.payDay,
                    kind: 'payment',
                    duration: 30,
                    time: '09:00',
                    name: p.name,
                    rate: p.rate,
                    unitRate: p.rate
                };

                if (recurrence === 'Mensal') {
                    const day = Math.max(1, Math.min(parseInt(p.payDay, 10) || 1, daysInMonth));
                    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
                    if (!isSameMonth(date, monthStart)) return [];
                    if (!isOnOrAfterMinDate(date)) return [];

                    const prev = addMonths(date, -1);
                    const prevDay = clampDayInMonth(prev.getFullYear(), prev.getMonth(), p.payDay);
                    const prevPayDate = new Date(prev.getFullYear(), prev.getMonth(), prevDay);
                    const periodStart = addDays(prevPayDate, 1);
                    const periodEnd = date;
                    const { total: cycleValue, count: sessionsCount } = sumBillableSessionsInWindow(p.id, prevPayDate, date);

                    const key = `pay_${p.id}_${isoDate(date)}`;
                    const ov = paymentOverrides[key] || {};
                    return [{
                        ...base,
                        date,
                        originalDate: date,
                        rate: cycleValue,
                        sessionsCount,
                        periodStart,
                        periodEnd,
                        status: ov.status || (new Date(date) < new Date(new Date().toISOString().split('T')[0]) ? 'overdue' : 'pending')
                    }];
                }

                // Semanal: payDay as weekday label
                const wKey = String(p.payDay || '').toLowerCase().trim();
                const wIdx = WEEKDAY_MAP[wKey];
                if (wIdx === undefined) return [];

                return days
                    .filter(d => getDay(d) === wIdx)
                    .filter(d => isOnOrAfterMinDate(d))
                    .map(d => {
                        const prevPayDate = addDays(d, -7);
                        const periodStart = addDays(prevPayDate, 1);
                        const periodEnd = d;
                        const { total: cycleValue, count: sessionsCount } = sumBillableSessionsInWindow(p.id, prevPayDate, d);

                        const key = `pay_${p.id}_${isoDate(d)}`;
                        const ov = paymentOverrides[key] || {};
                        return {
                            ...base,
                            date: d,
                            originalDate: d,
                            rate: cycleValue,
                            sessionsCount,
                            periodStart,
                            periodEnd,
                            status: ov.status || (new Date(d) < new Date(new Date().toISOString().split('T')[0]) ? 'overdue' : 'pending')
                        };
                    });
            });

        // Merge and Sort
        const merged = [...regular, ...extra, ...paymentEvents]
            .filter((evt) => isOnOrAfterMinDate(evt?.date))
            // UX rule: once a single occurrence is rescheduled/cancelled, the original slot disappears from the calendar.
            .filter((evt) => {
                if ((evt?.kind || 'session') !== 'session') return true;
                const status = String(evt?.status || 'scheduled');
                return status !== 'rescheduled' && status !== 'cancelled';
            });

        return merged.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA - dateB !== 0) return dateA - dateB;
            // Time compare
            const [hA, mA] = (a.time || '00:00').split(':').map(Number);
            const [hB, mB] = (b.time || '00:00').split(':').map(Number);
            return (hA * 60 + mA) - (hB * 60 + mB); // Fix: Correct variable usage
        });
    }, [generatedAppointments, overrides, extraSessions, patients, currentDate, paymentOverrides, minDate]);

    const handleUpdateAppointment = (appt, newStatusObj) => {
        if (appt.isExtra) {
            setExtraSessions(prev => prev.map(s => s.id === appt.id ? { ...s, ...newStatusObj } : s));
        } else {
            const key = occurrenceKey(appt);
            setOverrides(prev => ({
                ...prev,
                [key]: { ...(prev[key] || {}), ...newStatusObj }
            }));
        }
    };

    const handleUpdatePayment = (patientId, date, newObj) => {
        const key = `pay_${patientId}_${isoDate(date)}`;
        setPaymentOverrides(prev => ({
            ...prev,
            [key]: { ...(prev[key] || {}), ...newObj }
        }));
    };

    const handleAddAppointment = (newAppt) => {
        const patientId = String(newAppt?.patientId ?? newAppt?.id ?? '').trim();
        const appt = {
            ...newAppt,
            id: `extra_${Date.now()}`,
            patientId,
            isExtra: true,
            status: 'scheduled'
        };
        setExtraSessions(prev => [...prev, appt]);
    };

    return {
        currentDate,
        setCurrentDate,
        displayAppointments,
        handleUpdateAppointment,
        handleAddAppointment,
        handleUpdatePayment
    };
}
