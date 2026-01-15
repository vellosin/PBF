import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, AlertCircle, AlertTriangle } from 'lucide-react';

const normalizeText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
};

const coerceFrequency = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return v;

    if (normalizeText(v) === 'quinzenal') {
        // Never persist/display legacy plain "Quinzenal".
        return 'Quinzenal (Ímpar)';
    }

    return v;
};

const dayIndex = (dayOfWeekValue) => {
    const v = normalizeText(dayOfWeekValue);
    if (!v) return null;
    if (v.startsWith('domingo')) return 0;
    if (v.startsWith('segunda')) return 1;
    if (v.startsWith('terca') || v.startsWith('terça')) return 2;
    if (v.startsWith('quarta')) return 3;
    if (v.startsWith('quinta')) return 4;
    if (v.startsWith('sexta')) return 5;
    if (v.startsWith('sabado') || v.startsWith('sábado')) return 6;
    return null;
};

const toDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const startOfWeekMonday = (date) => {
    const d = new Date(date);
    const jsDay = d.getDay();
    const diff = jsDay === 0 ? -6 : 1 - jsDay; // move to Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getAnchorDate = (startDateValue, targetDayIdx) => {
    const start = toDate(startDateValue);
    if (!start || targetDayIdx === null || targetDayIdx === undefined) return null;
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
        if (d.getDay() === targetDayIdx) return d;
        d.setDate(d.getDate() + 1);
    }
    return null;
};

const isQuinzenal = (frequencyValue) => normalizeText(frequencyValue).includes('quinzenal');

const biweeklyRule = (frequencyValue) => {
    const f = normalizeText(frequencyValue);
    const isBiweekly = f.includes('quinzenal');
    if (!isBiweekly) return { type: 'weekly' };

    // Year-anchored: ISO week parity. Use boundary-ish checks to avoid matching "par" inside "impar".
    if (/(^|[^a-z0-9])impar([^a-z0-9]|$)/.test(f)) return { type: 'biweekly_year', parity: 1 };
    if (/(^|[^a-z0-9])par([^a-z0-9]|$)/.test(f)) return { type: 'biweekly_year', parity: 0 };

    return { type: 'biweekly_anchor' };
};

const parseMinutes = (timeValue) => {
    const [h, m] = String(timeValue || '0:0').split(':').map(n => parseInt(n, 10));
    const hh = Number.isFinite(h) ? h : 0;
    const mm = Number.isFinite(m) ? m : 0;
    return hh * 60 + mm;
};

const parseDuration = (durationValue) => {
    const d = parseInt(durationValue, 10);
    return Number.isFinite(d) && d > 0 ? d : 50;
};

const fmtTime = (mins) => {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m}`;
};

const weekParity = (startDateValue, dayOfWeekValue) => {
    const idx = dayIndex(dayOfWeekValue);
    const anchor = getAnchorDate(startDateValue, idx);
    if (!anchor) return null;
    const epoch = new Date(2020, 0, 6); // Monday
    const wk = startOfWeekMonday(anchor);
    const weekIndex = Math.floor((wk.getTime() - epoch.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const parity = ((weekIndex % 2) + 2) % 2;
    return parity;
};

const conflictsOverlap = (candidate, other) => {
    if (dayIndex(candidate.dayOfWeek) !== dayIndex(other.dayOfWeek)) return false;

    const candTime = String(candidate.time || '').trim();
    const otherTime = String(other.time || '').trim();
    if (!candTime || !otherTime) return false;

    const candStart = parseMinutes(candTime);
    const candEnd = candStart + parseDuration(candidate.duration);
    const otherStart = parseMinutes(otherTime);
    const otherEnd = otherStart + parseDuration(other.duration);

    // If there is no overlap, there is no conflict.
    if (!(candStart < otherEnd && otherStart < candEnd)) return false;

    // Both biweekly can share slot ONLY if they alternate weeks (different parity) *and* the rule type matches.
    const candQ = isQuinzenal(candidate.frequency);
    const otherQ = isQuinzenal(other.frequency);
    if (candQ && otherQ) {
        const r1 = biweeklyRule(candidate.frequency);
        const r2 = biweeklyRule(other.frequency);

        // If one is year-anchored (odd/even ISO week) and the other is legacy anchor-based,
        // we can't safely assume alternation => treat as conflict.
        if (r1.type !== r2.type) return true;

        const p1 = r1.type === 'biweekly_year' ? r1.parity : weekParity(candidate.startDate, candidate.dayOfWeek);
        const p2 = r2.type === 'biweekly_year' ? r2.parity : weekParity(other.startDate, other.dayOfWeek);
        if (p1 === null || p2 === null) return true; // conservative
        return p1 === p2; // same parity => conflict, different parity => ok
    }

    // Weekly vs anything, or quinzenal vs weekly => conflict
    return true;
};

const isSlotAvailable = (candidate, existingPatients, ignoreId) => {
    if (normalizeText(candidate.active) !== 'sim') return true;
    const candId = candidate?.id !== undefined && candidate?.id !== null ? String(candidate.id) : null;
    const ignore = ignoreId !== undefined && ignoreId !== null ? String(ignoreId) : null;

    return !existingPatients.some(p => {
        if (!p) return false;
        if (normalizeText(p.active) !== 'sim') return false;
        const pid = p.id !== undefined && p.id !== null ? String(p.id) : null;
        if (ignore && pid === ignore) return false;
        if (candId && pid === candId) return false;
        return conflictsOverlap(candidate, p);
    });
};

const buildSlotSuggestions = (candidate, existingPatients, ignoreId) => {
    const baseDay = candidate.dayOfWeek || 'segunda-feira';
    const baseTime = String(candidate.time || '09:00');

    const days = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
    const orderedDays = [baseDay, ...days.filter(d => d !== baseDay)];

    const baseMin = parseMinutes(baseTime);
    const times = [];
    for (let m = 7 * 60; m <= 21 * 60; m += 10) {
        times.push(m);
    }

    const candidates = [];
    for (const d of orderedDays) {
        for (const t of times) {
            const attempt = { ...candidate, dayOfWeek: d, time: fmtTime(t) };
            if (attempt.dayOfWeek === baseDay && attempt.time === baseTime) continue;
            if (isSlotAvailable(attempt, existingPatients, ignoreId)) {
                const dist = Math.abs(t - baseMin) + (d === baseDay ? 0 : 24 * 60); // prefer same day
                candidates.push({ dayOfWeek: d, time: attempt.time, score: dist });
            }
        }
        // If we already have enough options on the same day, stop early
        if (candidates.length >= 12 && d === baseDay) break;
    }

    candidates.sort((a, b) => a.score - b.score);
    const uniq = [];
    const seen = new Set();
    for (const c of candidates) {
        const key = `${c.dayOfWeek}|${c.time}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push({ dayOfWeek: c.dayOfWeek, time: c.time });
        if (uniq.length >= 3) break;
    }
    return uniq;
};

export function PatientForm({ onCancel, onSave, initialData, patients = [] }) {
    const { t } = useTranslation();
    const [errors, setErrors] = useState({});
    const [scheduleConflict, setScheduleConflict] = useState(null);

    // Default empty state matching parser structure
    const [formData, setFormData] = useState({
        name: '',
        rate: '',
        duration: '50',
        frequency: coerceFrequency(initialData?.frequency) || 'Semanal',
        dayOfWeek: 'segunda-feira',
        time: '09:00',
        startDate: new Date().toISOString().split('T')[0],
        lastAdjustment: new Date().toISOString().split('T')[0],
        active: 'Sim',
        payDay: '5',
        payRecurrence: 'Mensal',
        endDate: '',
        isSocial: 'Não',
        mode: 'Online',
        ...initialData
    });

    const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

    useEffect(() => {
        if (!scheduleConflict) return;

        // Play a short error beep (no external asset) to make the conflict evident.
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.2);
            oscillator.onended = () => ctx.close().catch(() => { });
        } catch {
            // ignore
        }
    }, [scheduleConflict]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        const nextValue = name === 'frequency' ? coerceFrequency(value) : value;

        // Auto-manage endDate based on active status
        if (name === 'active') {
            const nextActive = value;
            setFormData(prev => ({
                ...prev,
                active: nextActive,
                endDate: nextActive === 'Não' ? (prev.endDate || todayIso) : ''
            }));
        } else if (name === 'startDate' && !initialData) {
            // For new patients, keep lastAdjustment aligned to startDate
            setFormData(prev => ({ ...prev, startDate: value, lastAdjustment: value }));
        } else {
            setFormData(prev => ({ ...prev, [name]: nextValue }));
        }

        // Clear schedule conflict hint when user changes relevant fields
        if (scheduleConflict && ['dayOfWeek', 'time', 'frequency', 'startDate', 'active'].includes(name)) {
            setScheduleConflict(null);
        }

        // Clear error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        if (!formData.name.trim()) newErrors.name = t('err_name_required');
        if (!formData.rate) newErrors.rate = t('err_rate_required');
        if (formData.rate < 0) newErrors.rate = t('err_rate_negative');
        if (!formData.time) newErrors.time = t('err_time_required');
        if (!formData.duration || formData.duration <= 0) newErrors.duration = t('err_duration_invalid');

        // PayDay validation
        if (formData.payRecurrence === 'Mensal') {
            if (formData.payDay < 1 || formData.payDay > 31) {
                newErrors.payDay = t('err_pay_day_range');
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setScheduleConflict(null);

        if (!validateForm()) return;

        // Validate schedule conflicts for active patients
        if (normalizeText(formData.active) === 'sim') {
            const ignoreId = initialData?.id;
            const hasConflict = patients.some(p => {
                if (!p) return false;
                if (normalizeText(p.active) !== 'sim') return false;
                if (ignoreId !== undefined && ignoreId !== null && String(p.id) === String(ignoreId)) return false;
                return conflictsOverlap(formData, p);
            });

            if (hasConflict) {
                const conflictPatient = patients.find(p => {
                    if (!p) return false;
                    if (normalizeText(p.active) !== 'sim') return false;
                    if (ignoreId !== undefined && ignoreId !== null && String(p.id) === String(ignoreId)) return false;
                    return conflictsOverlap(formData, p);
                });

                const suggestions = buildSlotSuggestions(formData, patients, ignoreId);
                const cStart = parseMinutes(formData.time);
                const cEnd = cStart + parseDuration(formData.duration);
                setScheduleConflict({
                    patientName: conflictPatient?.name || t('patient_form_conflict_other_patient'),
                    window: `${fmtTime(cStart)}–${fmtTime(cEnd)}`,
                    suggestions
                });
                return;
            }
        }

        onSave(formData);
    };

    return (
        <div className="bg-white rounded-3xl shadow-xl w-full border border-slate-100 flex flex-col mb-8 animate-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">
                        {initialData ? t('patient_form_edit_title') : t('patient_form_new_title')}
                    </h2>
                    <p className="text-sm text-slate-500">{t('patient_form_subtitle')}</p>
                </div>
                <button onClick={onCancel} className="p-2 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-400 hover:text-red-500">
                    <X size={24} />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8">
                {/* Global Error Message */}
                {Object.keys(errors).length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 animate-in slide-in-from-top-2">
                        <AlertCircle size={20} />
                        <span className="font-medium">{t('patient_form_fix_errors')}</span>
                    </div>
                )}

                {/* Schedule Conflict Message */}
                {scheduleConflict && (
                    <div className="p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl animate-in slide-in-from-top-2 shadow-md">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
                                <AlertTriangle size={22} />
                            </div>
                            <div className="space-y-2">
                                <p className="font-extrabold text-red-600 uppercase tracking-wide">
                                    {t('patient_form_conflict_title')}
                                </p>
                                <p className="font-semibold text-slate-900">
                                    {t('patient_form_conflict_with', { name: scheduleConflict.patientName, window: scheduleConflict.window })}
                                </p>
                                <p className="text-sm text-slate-700">
                                    {t('patient_form_conflict_desc')}
                                </p>
                                {Array.isArray(scheduleConflict.suggestions) && scheduleConflict.suggestions.length > 0 && (
                                    <div className="pt-1">
                                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">{t('patient_form_conflict_suggestions')}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {scheduleConflict.suggestions.map((s) => (
                                                <button
                                                    key={`${s.dayOfWeek}-${s.time}`}
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData(prev => ({ ...prev, dayOfWeek: s.dayOfWeek, time: s.time }));
                                                        setScheduleConflict(null);
                                                    }}
                                                    className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-semibold"
                                                    title={t('patient_form_apply_suggestion')}
                                                >
                                                    {s.dayOfWeek} - {s.time}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Section: Identificação */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        {t('section_identification')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_full_name')}</label>
                            <input
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className={`w-full p-3.5 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none
                                    ${errors.name ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-indigo-500 focus:bg-white'}
                                `}
                                placeholder={t('placeholder_full_name')}
                            />
                            {errors.name && <p className="text-red-500 text-xs mt-1 font-medium">{errors.name}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_status')}</label>
                            <select
                                name="active"
                                value={formData.active}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                            >
                                <option value="Sim">{t('status_active')}</option>
                                <option value="Não">{t('status_inactive')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Section: Sessão */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        {t('section_session')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_weekday')}</label>
                            <select
                                name="dayOfWeek"
                                value={formData.dayOfWeek}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none capitalized"
                            >
                                {['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'].map(d => (
                                    <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_time')}</label>
                            <input
                                name="time"
                                type="time"
                                value={formData.time}
                                onChange={handleChange}
                                className={`w-full p-3.5 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none
                                    ${errors.time ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-indigo-500 focus:bg-white'}
                                `}
                            />
                            {errors.time && <p className="text-red-500 text-xs mt-1 font-medium">{errors.time}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_duration_min')}</label>
                            <input
                                name="duration"
                                type="number"
                                value={formData.duration}
                                onChange={handleChange}
                                className={`w-full p-3.5 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none
                                    ${errors.duration ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-indigo-500 focus:bg-white'}
                                `}
                            />
                            {errors.duration && <p className="text-red-500 text-xs mt-1 font-medium">{errors.duration}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_frequency')}</label>
                            <select
                                name="frequency"
                                value={formData.frequency}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                            >
                                <option value="Semanal">{t('frequency_weekly')}</option>
                                <option value="Quinzenal (\u00cdmpar)">{t('frequency_biweekly_odd')}</option>
                                <option value="Quinzenal (Par)">{t('frequency_biweekly_even')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_mode')}</label>
                            <select
                                name="mode"
                                value={formData.mode}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                            >
                                <option value="Online">{t('mode_online')}</option>
                                <option value="Presencial">{t('mode_in_person')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Section: Financeiro */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        {t('section_financial')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_session_rate')}</label>
                            <input
                                name="rate"
                                type="number"
                                value={formData.rate}
                                onChange={handleChange}
                                className={`w-full p-3.5 bg-white border rounded-xl focus:ring-2 transition-all outline-none
                                    ${errors.rate ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-indigo-500'}
                                `}
                                placeholder="0.00"
                            />
                            {errors.rate && <p className="text-red-500 text-xs mt-1 font-medium">{errors.rate}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_social_patient')}</label>
                            <select
                                name="isSocial"
                                value={formData.isSocial}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                            >
                                <option value="Não">{t('btn_no')}</option>
                                <option value="Sim">{t('btn_yes')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_pay_recurrence')}</label>
                            <select
                                name="payRecurrence"
                                value={formData.payRecurrence}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                            >
                                <option value="Mensal">{t('pay_recurrence_monthly')}</option>
                                <option value="Semanal">{t('pay_recurrence_weekly')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                {formData.payRecurrence === 'Mensal' ? t('label_pay_day_monthly') : t('label_pay_day_weekly')}
                            </label>
                            {formData.payRecurrence === 'Mensal' ? (
                                <>
                                    <input
                                        name="payDay"
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={formData.payDay}
                                        onChange={handleChange}
                                        className={`w-full p-3.5 bg-white border rounded-xl focus:ring-2 transition-all outline-none
                                            ${errors.payDay ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-indigo-500'}
                                        `}
                                    />
                                    {errors.payDay && <p className="text-red-500 text-xs mt-1 font-medium">{errors.payDay}</p>}
                                </>
                            ) : (
                                <select
                                    name="payDay"
                                    value={formData.payDay}
                                    onChange={handleChange}
                                    className="w-full p-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                                >
                                    {['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'].map(d => (
                                        <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                </div>

                {/* Section: Datas */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        {t('section_history')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_start_date')}</label>
                            <input
                                name="startDate"
                                type="date"
                                value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_last_adjustment')}</label>
                            <input
                                name="lastAdjustment"
                                type="date"
                                value={formData.lastAdjustment ? new Date(formData.lastAdjustment).toISOString().split('T')[0] : ''}
                                onChange={handleChange}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('label_end_date')}</label>
                            <input
                                name="endDate"
                                type="date"
                                value={formData.endDate ? new Date(formData.endDate).toISOString().split('T')[0] : ''}
                                onChange={handleChange}
                                disabled={formData.active === 'Não'}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex gap-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold transition-all"
                    >
                        {t('btn_cancel')}
                    </button>
                    <button
                        type="submit"
                        className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xl shadow-indigo-200/50 hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
                    >
                        <Save size={20} />
                        {initialData ? t('btn_save_changes') : t('btn_add')}
                    </button>
                </div>
            </form>
        </div>
    );
}
