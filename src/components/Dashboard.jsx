import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isSameMonth, differenceInYears, endOfMonth } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { StatsCard } from './StatsCard';
import { Users, DollarSign, UserPlus, UserMinus, AlertTriangle, ChevronLeft, ChevronRight, Wallet } from 'lucide-react';

export function Dashboard({ patients, appointments, currentDate, onDateChange }) {
    const { t, i18n } = useTranslation();

    const normalizeText = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    };

    const frequencyLabel = (freqRaw) => {
        const f = normalizeText(freqRaw || 'Semanal');
        if (f.includes('quinzenal')) {
            if (/(^|[^a-z0-9])impar([^a-z0-9]|$)/.test(f)) return t('frequency_biweekly_odd');
            if (/(^|[^a-z0-9])par([^a-z0-9]|$)/.test(f)) return t('frequency_biweekly_even');
            return t('frequency_biweekly');
        }
        return t('frequency_weekly');
    };

    const [filters, setFilters] = useState({
        frequency: 'ALL',
        payRecurrence: 'ALL',
        mode: 'ALL'
    });

    // Note: 'appointments' passed here are already processed with overrides by the parent hook

    const dateLocale = useMemo(() => {
        if (i18n.language === 'en') return enUS;
        if (i18n.language === 'es') return es;
        return ptBR;
    }, [i18n.language]);

    const filteredPatients = useMemo(() => {
        const list = patients || [];
        return list.filter(p => {
            if (filters.frequency !== 'ALL' && (p.frequency || 'Semanal') !== filters.frequency) return false;
            if (filters.payRecurrence !== 'ALL' && (p.payRecurrence || 'Mensal') !== filters.payRecurrence) return false;
            if (filters.mode !== 'ALL' && (p.mode || 'Online') !== filters.mode) return false;
            return true;
        });
    }, [patients, filters]);

    const filteredAppointments = useMemo(() => {
        const list = appointments || [];
        return list.filter(a => {
            if (filters.frequency !== 'ALL' && (a.frequency || 'Semanal') !== filters.frequency) return false;
            if (filters.payRecurrence !== 'ALL' && (a.payRecurrence || 'Mensal') !== filters.payRecurrence) return false;
            if (filters.mode !== 'ALL' && (a.mode || 'Online') !== filters.mode) return false;
            return true;
        });
    }, [appointments, filters]);

    const parseMoney = (v) => {
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        const s = String(v ?? '').trim();
        if (!s) return 0;
        // Accept formats like "200", "200,50", "R$ 200,50"
        const cleaned = s
            .replace(/[^0-9,.-]/g, '')
            .replace(/\.(?=\d{3}(?:\D|$))/g, '') // drop thousands dot
            .replace(',', '.');
        const n = parseFloat(cleaned);
        return Number.isFinite(n) ? n : 0;
    };

    const revenue = useMemo(() => {
        const list = filteredAppointments || [];
        const payments = list.filter(e => (e.kind || 'session') === 'payment');

        const real = payments
            .filter(p => (p.status || 'pending') === 'paid')
            .reduce((acc, p) => acc + parseMoney(p.rate), 0);

        const overdue = payments
            .filter(p => (p.status || 'pending') === 'overdue')
            .reduce((acc, p) => acc + parseMoney(p.rate), 0);

        const paidCount = payments.filter(p => (p.status || 'pending') === 'paid').length;
        const overdueCount = payments.filter(p => (p.status || 'pending') === 'overdue').length;
        const pendingCount = payments.filter(p => {
            const s = p.status || 'pending';
            return s !== 'paid';
        }).length;

        return { real, overdue, paidCount, overdueCount, pendingCount };
    }, [filteredAppointments]);

    // Metrics Calculation
    const metrics = useMemo(() => {
        // 2. Patient Flow
        const newPatients = filteredPatients.filter(p => p.startDate && isSameMonth(p.startDate, currentDate)).length;
        const exitedPatients = filteredPatients.filter(p => p.endDate && isSameMonth(p.endDate, currentDate)).length;
        const activeCount = filteredPatients.filter(p => p.active === 'Sim').length;

        // 4. Overdue adjustments
        const overdueAdjustments = filteredPatients.filter(p => {
            if (!p.lastAdjustment) return false;
            return differenceInYears(currentDate, new Date(p.lastAdjustment)) >= 1 && p.active === 'Sim';
        });

        return {
            newPatients,
            exitedPatients,
            activeCount,
            overdueCount: overdueAdjustments.length,
            count: filteredAppointments.length
        };
    }, [filteredAppointments, filteredPatients, currentDate]);

    const overduePatients = useMemo(() => {
        const list = filteredPatients
            .filter(p => p.active === 'Sim')
            .filter(p => {
                if (!p.lastAdjustment) return false;
                return differenceInYears(currentDate, new Date(p.lastAdjustment)) >= 1;
            })
            .slice();

        list.sort((a, b) => {
            const da = a.lastAdjustment ? new Date(a.lastAdjustment).getTime() : 0;
            const db = b.lastAdjustment ? new Date(b.lastAdjustment).getTime() : 0;
            return da - db;
        });

        return list;
    }, [filteredPatients, currentDate]);

    const receivables = useMemo(() => {
        // Align "Estimado" with the same model used by payments in the calendar/tasks:
        // sum of payment events scheduled for the selected month.
        const list = (filteredAppointments || []).filter(e => (e.kind || 'session') === 'payment');
        const monthEnd = endOfMonth(currentDate);
        const daysInMonth = monthEnd.getDate();

        // Aggregate by patient (weekly may generate multiple payment events per month).
        const byPatient = new Map();

        list.forEach((p, idx) => {
            const patientId = String(p.patientId ?? p.id ?? idx);
            const existing = byPatient.get(patientId);

            const recurrence = p.payRecurrence || 'Mensal';
            let dueLabel = '-';
            if (recurrence === 'Mensal') {
                const day = Math.max(1, Math.min(parseInt(p.payDay, 10) || 1, daysInMonth));
                dueLabel = t('due_day', { day });
            } else {
                dueLabel = String(p.payDay || '').trim() || t('pay_recurrence_weekly');
            }

            const amount = parseMoney(p.rate);
            const sessionsCount = Number.isFinite(Number(p.sessionsCount)) ? Number(p.sessionsCount) : 0;

            if (!existing) {
                byPatient.set(patientId, {
                    id: patientId,
                    name: p.name,
                    recurrence,
                    dueLabel,
                    estMonthly: amount,
                    sessionsCount,
                    paymentsCount: 1,
                    mode: p.mode || 'Online'
                });
                return;
            }

            byPatient.set(patientId, {
                ...existing,
                estMonthly: existing.estMonthly + amount,
                sessionsCount: existing.sessionsCount + sessionsCount,
                paymentsCount: existing.paymentsCount + 1
            });
        });

        const items = Array.from(byPatient.values());

        items.sort((a, b) => {
            const aDay = a.recurrence === 'Mensal' ? (parseInt(a.dueLabel.replace(/\D/g, ''), 10) || 999) : 999;
            const bDay = b.recurrence === 'Mensal' ? (parseInt(b.dueLabel.replace(/\D/g, ''), 10) || 999) : 999;
            if (aDay !== bDay) return aDay - bDay;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        const totals = items.reduce(
            (acc, it) => {
                acc.total += it.estMonthly;
                if (it.recurrence === 'Mensal') acc.monthly += it.estMonthly;
                if (it.recurrence === 'Semanal') acc.weekly += it.estMonthly;
                return acc;
            },
            { total: 0, monthly: 0, weekly: 0 }
        );

        return { items, totals };
    }, [filteredAppointments, currentDate, t]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-slate-800 capitalize tracking-tight flex items-center gap-3">
                    {format(currentDate, 'MMMM yyyy', { locale: dateLocale })}
                    <div className="flex gap-2">
                        <button
                            onClick={() => onDateChange(d => new Date(d.setMonth(d.getMonth() - 1)))}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={() => onDateChange(d => new Date(d.setMonth(d.getMonth() + 1)))}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </h2>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-lg shadow-slate-200/50">
                <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('filter_frequency')}</label>
                            <select
                                value={filters.frequency}
                                onChange={(e) => setFilters(prev => ({ ...prev, frequency: e.target.value }))}
                                className="w-full p-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="ALL">{t('filter_all')}</option>
                                <option value="Semanal">{t('frequency_weekly')}</option>
                                <option value="Quinzenal (\u00cdmpar)">{t('frequency_biweekly_odd')}</option>
                                <option value="Quinzenal (Par)">{t('frequency_biweekly_even')}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('filter_payment')}</label>
                            <select
                                value={filters.payRecurrence}
                                onChange={(e) => setFilters(prev => ({ ...prev, payRecurrence: e.target.value }))}
                                className="w-full p-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="ALL">{t('filter_all')}</option>
                                <option value="Mensal">{t('pay_recurrence_monthly')}</option>
                                <option value="Semanal">{t('pay_recurrence_weekly')}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('filter_mode')}</label>
                            <select
                                value={filters.mode}
                                onChange={(e) => setFilters(prev => ({ ...prev, mode: e.target.value }))}
                                className="w-full p-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="ALL">{t('filter_all')}</option>
                                <option value="Online">{t('mode_online')}</option>
                                <option value="Presencial">{t('mode_in_person')}</option>
                            </select>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setFilters({ frequency: 'ALL', payRecurrence: 'ALL', mode: 'ALL' })}
                        className="px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                    >
                        {t('filter_clear')}
                    </button>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                    title={t('kpi_revenue')}
                    value={`R$ ${receivables.totals.total.toLocaleString(i18n.language)}`}
                    icon={DollarSign}
                    subtext={`${t('label_real')}: R$ ${revenue.real.toLocaleString(i18n.language)} • ${t('label_due_est')}: R$ ${Math.max(0, receivables.totals.total - revenue.real).toLocaleString(i18n.language)}`}
                    trend={receivables.totals.total > 0 ? `${Math.round((revenue.real / receivables.totals.total) * 100)}%` : null}
                />
                <StatsCard
                    title={t('kpi_active_patients')}
                    value={metrics.activeCount}
                    icon={Users}
                    subtext={t('kpi_active_patients_sub')}
                />

                <StatsCard
                    title={t('kpi_new_patients')}
                    value={metrics.newPatients}
                    icon={UserPlus}
                    subtext={t('kpi_entries_this_month')}
                />
                <StatsCard
                    title={t('kpi_exits')}
                    value={metrics.exitedPatients}
                    icon={UserMinus}
                    alert={metrics.exitedPatients > 0}
                    subtext={t('kpi_exits_this_month')}
                />
            </div>

            {/* Focused Dashboard Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl shadow-slate-200/50">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Wallet size={18} />
                                </span>
                                {t('payments_month_title')}
                            </h3>
                            <p className="text-sm text-slate-500">{t('payments_month_desc')}</p>
                        </div>
                        <div className="text-right pr-1">
                            <p className="text-xs text-slate-400">{t('label_estimated')}</p>
                            <p className="text-xl font-extrabold text-emerald-600">R$ {receivables.totals.total.toLocaleString(i18n.language)}</p>
                            <p className="text-xs text-slate-400 mt-1">{t('label_real')}</p>
                            <p className="text-lg font-extrabold text-slate-800">R$ {revenue.real.toLocaleString(i18n.language)}</p>
                        </div>
                    </div>

                    <div className="mb-5">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                            <span>{t('payments_paid_count', { count: revenue.paidCount })}</span>
                            <span>{receivables.totals.total > 0 ? `${Math.round((revenue.real / receivables.totals.total) * 100)}%` : '0%'} {t('of_estimated')}</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className="h-2 bg-emerald-500"
                                style={{ width: `${Math.min(100, receivables.totals.total > 0 ? (revenue.real / receivables.totals.total) * 100 : 0)}%` }}
                            />
                        </div>
                        {revenue.overdue > 0 ? (
                            <div className="text-xs text-rose-700 mt-2">{t('payments_overdue_open')}: R$ {revenue.overdue.toLocaleString(i18n.language)}</div>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('pay_recurrence_monthly')}</p>
                            <p className="text-lg font-bold text-slate-800">R$ {receivables.totals.monthly.toLocaleString(i18n.language)}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('pay_recurrence_weekly')}</p>
                            <p className="text-lg font-bold text-slate-800">R$ {receivables.totals.weekly.toLocaleString(i18n.language)}</p>
                        </div>
                    </div>

                    <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-2">
                        {receivables.items.length === 0 ? (
                            <div className="text-sm text-slate-500">{t('payments_none_configured')}</div>
                        ) : (
                            receivables.items.slice(0, 12).map(it => (
                                <div key={it.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors">
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 truncate" title={it.name}>{it.name}</p>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                                            <span className="bg-slate-100 px-2 py-0.5 rounded">{it.recurrence === 'Mensal' ? t('pay_recurrence_monthly') : (it.recurrence === 'Semanal' ? t('pay_recurrence_weekly') : it.recurrence)}</span>
                                            <span className="bg-slate-100 px-2 py-0.5 rounded">{it.dueLabel}</span>
                                            <span className="bg-slate-100 px-2 py-0.5 rounded">{it.mode === 'Online' ? t('mode_online') : (it.mode === 'Presencial' ? t('mode_in_person') : it.mode)}</span>
                                            <span className="bg-slate-100 px-2 py-0.5 rounded">{t('sessions_count', { count: it.sessionsCount })}</span>
                                            {it.recurrence === 'Semanal' && it.paymentsCount > 1 ? (
                                                <span className="bg-slate-100 px-2 py-0.5 rounded">{t('charges_count', { count: it.paymentsCount })}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 ml-3">
                                        <p className="text-sm font-extrabold text-emerald-600">R$ {it.estMonthly.toLocaleString(i18n.language)}</p>
                                        <p className="text-[10px] text-slate-400">{t('forecast_in_month')}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl shadow-slate-200/50">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                                    <AlertTriangle size={18} />
                                </span>
                                {t('adjustments_title')}
                            </h3>
                            <p className="text-sm text-slate-500">{t('adjustments_desc')}</p>
                        </div>
                        <div className="text-right pr-1">
                            <p className="text-xs text-slate-400">{t('label_total')}</p>
                            <p className="text-xl font-extrabold text-amber-700">{overduePatients.length}</p>
                        </div>
                    </div>

                    <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-2">
                        {overduePatients.length === 0 ? (
                            <div className="text-sm text-slate-500">{t('adjustments_none')}</div>
                        ) : (
                            overduePatients.slice(0, 12).map(p => (
                                <div key={p.id} className="flex items-center justify-between p-3 rounded-2xl border border-amber-200 bg-amber-50/40">
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900 truncate" title={p.name}>{p.name}</p>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
                                            <span className="bg-white/70 px-2 py-0.5 rounded border border-amber-200">{frequencyLabel(p.frequency)}</span>
                                            <span className="bg-white/70 px-2 py-0.5 rounded border border-amber-200">{(p.mode || 'Online') === 'Presencial' ? t('mode_in_person') : t('mode_online')}</span>
                                        </div>
                                        <p className="text-xs text-slate-600 mt-1">
                                            {t('label_last_adjustment_short')}: {p.lastAdjustment ? new Date(p.lastAdjustment).toLocaleDateString() : '-'}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0 ml-3">
                                        <p className="text-sm font-extrabold text-slate-900">R$ {(parseFloat(p.rate) || 0).toLocaleString(i18n.language)}</p>
                                        <p className="text-[10px] text-slate-500">{t('per_session')}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
