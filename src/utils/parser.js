import { read, utils } from 'xlsx';
import {
    addDays,
    addWeeks,
    parse,
    startOfMonth,
    endOfMonth,
    isSameMonth,
    getDay,
    getISOWeek,
    isBefore,
    isAfter,
    isValid,
    startOfDay,
    differenceInCalendarDays
} from 'date-fns';

// Expected Headers Mapping
const HEADERS_MAP = {
    'Pacientes': 'name',
    'Receita Sessão(R$)': 'rate',
    'Tempo de Sessão(m)': 'duration',
    'Semanal/Quinzenal': 'frequency',
    'Dia da Semana': 'dayOfWeek',
    'Horario': 'time',
    'Data de ingresso': 'startDate',
    'Paciente Ativo': 'active',
    'Dia de pagamento': 'payDay',
    'Recorrencia de pagamento': 'payRecurrence',
    'Data de Saida': 'endDate',
    'Paciente Social': 'isSocial',
    'Data Ultimo Reajuste': 'lastAdjustment',
    'Presencial/Online': 'mode'
};

const WEEKDAY_MAP = {
    'domingo': 0,
    'segunda': 1, 'segunda-feira': 1,
    'terça': 2, 'terça-feira': 2, 'terca': 2, 'terca-feira': 2,
    'quarta': 3, 'quarta-feira': 3,
    'quinta': 4, 'quinta-feira': 4,
    'sexta': 5, 'sexta-feira': 5,
    'sábado': 6, 'sabado': 6
};

const normalizeText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
};

const classifyFrequency = (frequencyValue) => {
    const f = normalizeText(frequencyValue);

    const isBiweekly = f.includes('quinzenal') || f.includes('quincenal') || f.includes('biweekly');
    if (!isBiweekly) return { type: 'weekly' };

    // Year-anchored: odd/even ISO week number.
    // Use word-ish boundaries to avoid matching "par" inside "impar".
    const isOdd = /(^|[^a-z0-9])(impar|odd)([^a-z0-9]|$)/.test(f);
    if (isOdd) return { type: 'biweekly_year', parity: 1 };

    const isEven = /(^|[^a-z0-9])(par|even)([^a-z0-9]|$)/.test(f);
    if (isEven) return { type: 'biweekly_year', parity: 0 };

    // Back-compat: old "Quinzenal" means every 2 weeks from the patient anchor/start.
    return { type: 'biweekly_anchor' };
};

// Helper: Convert Excel fractional time (e.g. 0.625) or decimal numbers to HH:mm
const formatExcelTime = (val) => {
    if (!val) return '';

    // If it's already a clean string like "14:00"
    if (typeof val === 'string' && val.includes(':')) return val;

    let totalDays = parseFloat(val);
    if (isNaN(totalDays)) return val;

    // Excel Time part is the fractional part
    // e.g. 3.666 -> 0.666 days
    let fractionalDay = totalDays % 1;

    // Handle edge case of effectively integer (e.g. "4") which might mean something else, 
    // but assuming standard Excel behavior: 4.0 = midnight of Jan 4 1900.
    // If fractional is 0, maybe it's 00:00.

    // Convert to hours
    let totalHours = fractionalDay * 24;
    let hours = Math.floor(totalHours);
    let minutes = Math.round((totalHours - hours) * 60);

    // Handle rounding overflow (e.g. 13:60 -> 14:00)
    if (minutes === 60) {
        hours++;
        minutes = 0;
    }

    // Pad with zeros
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${hh}:${mm}`;
};

export const parseExcel = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rawData = utils.sheet_to_json(sheet);

    const patients = rawData.map((row, index) => {
        const patient = { id: index };
        for (const [key, value] of Object.entries(row)) {
            const normalizedKey = HEADERS_MAP[key.trim()];
            if (normalizedKey) {
                patient[normalizedKey] = value;
            }
        }

        // Normalize data types
        if (patient.startDate) patient.startDate = parseDate(patient.startDate);
        if (patient.endDate) patient.endDate = parseDate(patient.endDate);
        if (patient.createdAt) patient.createdAt = parseDate(patient.createdAt);
        if (patient.lastAdjustment) patient.lastAdjustment = parseDate(patient.lastAdjustment);

        // Normalize Rate
        patient.rate = parseFloat(patient.rate) || 0;

        // Normalize Time (Fix for float values like 3.666)
        if (patient.time) {
            patient.time = formatExcelTime(patient.time);
        }

        // Normalize Weekday and create Index
        // Renaming 'weekday' -> 'dayOfWeek' in map affected this, so we use 'dayOfWeek'
        if (typeof patient.dayOfWeek === 'string') {
            const w = patient.dayOfWeek.toLowerCase().trim();
            patient.weekdayIdx = WEEKDAY_MAP[w] !== undefined ? WEEKDAY_MAP[w] : -1;
        } else if (typeof patient.dayOfWeek === 'number') {
            // If Excel provided a number for day? (e.g. 1 = Sunday) - unlikely but possible
            // Just leaving it as is for display, but weekdayIdx is crucial for calendar
            // For now, assume string input for weekday mapping.
            patient.weekdayIdx = -1;
        }

        return patient;
    });

    return patients;
};

// Helper to parse DD/MM/YYYY
const parseDate = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'number') {
        // Excel serial date (approximate)
        return new Date(Math.round((dateVal - 25569) * 864e5));
    }
    if (typeof dateVal === 'string') {
        // Try DD/MM/YYYY
        const parsed = parse(dateVal, 'dd/MM/yyyy', new Date());
        if (isValid(parsed)) return parsed;
    }
    return null;
};

// Generate Appointments for a specific month
export const generateAppointments = (patients, targetDate = new Date()) => {
    const monthStart = startOfMonth(targetDate);
    const monthEnd = endOfMonth(targetDate);
    const appointments = [];

    patients.forEach(patient => {
        if (patient.active !== 'Sim') return;

        // Normalize Dates (Handle Form String vs Excel Date Object)
        const startDate = patient.startDate ? new Date(patient.startDate) : null;
        const endDate = patient.endDate ? new Date(patient.endDate) : null;

        if (!startDate || !isValid(startDate)) return;

        // Note: legacy variable removed; scheduling uses iterDate below.
        // Advance to month start if started before
        // This simple logic needs refinement for strict recurrences (e.g. biweekly from start)
        // For now, we find the first occurrence in the month matching the weekday

        // Naïve approach for Weekly: Find all matching weekdays in month
        // For Bi-weekly: Needs reference to startDate to align parity

        const freqRule = classifyFrequency(patient.frequency || 'Semanal');
        const intervalWeeks = freqRule.type === 'biweekly_anchor' ? 2 : 1;

        // Find first valid appointment date >= startDate
        let iterDate = startOfDay(new Date(startDate));
        // Align to weekday if necessary (assuming startDate IS the first session or close to it)
        // If startDate weekday differs from 'weekday' column, priority? usually 'weekday' column rules recurrences.

        // Initialize weekdayIdx dynamically if missing (e.g. from new manual entry)
        let wIdx = patient.weekdayIdx;
        if (wIdx === undefined || wIdx === -1) {
            const w = (patient.dayOfWeek || '').toLowerCase().trim();
            wIdx = WEEKDAY_MAP[w];
        }

        // Let's assume startDate is correct OR we align to the next 'patient.weekdayIdx'
        if (wIdx !== undefined && wIdx !== -1) {
            while (getDay(iterDate) !== wIdx) {
                iterDate = addDays(iterDate, 1);
            }
        }

        // Fast-forward: if the schedule started long ago, jump close to the target month.
        const monthStartDay = startOfDay(monthStart);
        if (isBefore(iterDate, monthStartDay)) {
            const weeksBetween = Math.floor(differenceInCalendarDays(monthStartDay, iterDate) / 7);
            if (weeksBetween > 0) {
                if (freqRule.type === 'biweekly_anchor') {
                    iterDate = addWeeks(iterDate, 2 * Math.floor(weeksBetween / 2));
                } else {
                    iterDate = addWeeks(iterDate, weeksBetween);
                }
            }

            // Ensure we are >= monthStart.
            while (isBefore(iterDate, monthStartDay)) {
                iterDate = addWeeks(iterDate, intervalWeeks);
            }

            // For year-parity biweekly, snap to the correct parity week.
            if (freqRule.type === 'biweekly_year') {
                const guardMax = 3;
                let guard = 0;
                while ((getISOWeek(iterDate) % 2) !== freqRule.parity && guard < guardMax) {
                    iterDate = addWeeks(iterDate, 1);
                    guard += 1;
                }
            }
        }

        // Now iterate by frequency until we pass monthEnd
        while (isBefore(iterDate, monthEnd) || isSameMonth(iterDate, monthEnd)) { // logic fix: isBefore(iterDate, addDays(monthEnd,1))
            // Check if date is valid:
            // 1. >= startDate
            // 2. <= endDate (if exists)
            // 3. Within target month (we want to collect these)

            const isAfterStart = isAfter(iterDate, startDate) || iterDate.getTime() === startDate.getTime();
            const isBeforeEnd = !endDate || isBefore(iterDate, endDate);
            const inMonth = isSameMonth(iterDate, monthStart);

            const matchesYearParity = freqRule.type !== 'biweekly_year'
                ? true
                : ((getISOWeek(iterDate) % 2) === freqRule.parity);

            if (isAfterStart && isBeforeEnd && inMonth && matchesYearParity) {
                appointments.push({
                    ...patient,
                    date: new Date(iterDate),
                    originalDate: iterDate // For keying
                });
            }

            iterDate = addWeeks(iterDate, intervalWeeks);
            if (iterDate > monthEnd && !inMonth) break; // Safety break
        }
    });

    return appointments.sort((a, b) => a.date - b.date);
};
