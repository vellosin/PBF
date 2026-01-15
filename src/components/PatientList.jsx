import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Pencil, Settings, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { PatientForm } from './PatientForm';
import { TableConfig } from './TableConfig';

const INITIAL_COLUMNS = [
    { id: 'name', labelKey: 'patients_col_name', visible: true },
    { id: 'active', labelKey: 'patients_col_status', visible: true },
    { id: 'rate', labelKey: 'patients_col_rate', visible: true },
    { id: 'frequency', labelKey: 'patients_col_frequency', visible: true },
    { id: 'dayTime', labelKey: 'patients_col_day_time', visible: true },
    { id: 'startDate', labelKey: 'patients_col_start', visible: true },
    { id: 'lastAdjustment', labelKey: 'patients_col_last_adjustment', visible: false },
    { id: 'mode', labelKey: 'patients_col_mode', visible: false },
    { id: 'endDate', labelKey: 'patients_col_end', visible: false },
    { id: 'actions', labelKey: 'patients_col_actions', visible: true } // Special column
];

export function PatientList({ patients, onAddPatient, onUpdatePatient }) {
    const { t } = useTranslation();
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

    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPatient, setEditingPatient] = useState(null);

    // Advanced Table State
    const [columns, setColumns] = useState(INITIAL_COLUMNS);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    useEffect(() => {
        if (!isConfigOpen) return;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') setIsConfigOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isConfigOpen]);

    // Handle Column Config
    const handleToggleColumn = (id) => {
        setColumns(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
    };

    const handleMoveColumn = (index, direction) => {
        const newCols = [...columns];
        const [moved] = newCols.splice(index, 1);
        newCols.splice(index + direction, 0, moved);
        setColumns(newCols);
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Derived Data
    const processedData = useMemo(() => {
        if (!patients) return [];
        let data = [...patients];

        // 1. Filter (Global Search for now)
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            data = data.filter(p =>
                p.name.toLowerCase().includes(lower)
            );
        }

        // 2. Sort
        if (sortConfig.key) {
            data.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                // Special handling for computed columns or dates
                if (sortConfig.key === 'dayTime') {
                    // Primitive sort by day string
                    aVal = a.dayOfWeek || '';
                    bVal = b.dayOfWeek || '';
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return data;
    }, [patients, searchTerm, sortConfig]);

    const handleSave = async (patientData) => {
        try {
            if (editingPatient) {
                await onUpdatePatient({ ...editingPatient, ...patientData });
            } else {
                await onAddPatient(patientData);
            }
            setIsFormOpen(false);
            setEditingPatient(null);
        } catch (e) {
            console.error(e);
            const msg = typeof e?.message === 'string' && e.message.trim() ? e.message : t('patients_save_error');
            alert(msg);
        }
    };

    const handleEditClick = (patient) => {
        setIsConfigOpen(false);
        setEditingPatient(patient);
        setIsFormOpen(true);
    };

    const handleNewClick = () => {
        setIsConfigOpen(false);
        setEditingPatient(null);
        setIsFormOpen(true);
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingPatient(null);
    };

    const handleOpenConfig = () => {
        setIsFormOpen(false);
        setEditingPatient(null);
        setIsConfigOpen(true);
    };

    // Render Helpers
    const renderCell = (patient, colId) => {
        switch (colId) {
            case 'name':
                return <span className="font-medium text-slate-800">{patient.name}</span>;
            case 'active':
                return (
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                        ${patient.active === 'Sim' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}
                    `}>
                        {patient.active === 'Sim' ? t('status_active') : t('status_inactive')}
                    </span>
                );
            case 'rate': return `R$ ${patient.rate}`;
            case 'frequency': return frequencyLabel(patient.frequency);
            case 'dayTime': return `${patient.dayOfWeek ? patient.dayOfWeek.split('-')[0] : ''} - ${patient.time}`;
            case 'startDate': return patient.startDate ? new Date(patient.startDate).toLocaleDateString() : '-';
            case 'lastAdjustment': return patient.lastAdjustment ? new Date(patient.lastAdjustment).toLocaleDateString() : '-';
            case 'endDate': return patient.endDate ? new Date(patient.endDate).toLocaleDateString() : '-';
            case 'actions':
                return (
                    <button onClick={() => handleEditClick(patient)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Pencil size={18} />
                    </button>
                );
            default: return patient[colId] || '-';
        }
    };

    if (!patients) return <div className="p-8 text-center text-slate-400">{t('loading')}</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">{t('patients_title')}</h2>
                    <p className="text-slate-500 text-sm">{t('patients_subtitle')}</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="w-full md:w-72 md:flex-none">
                        <div className="ui-field">
                            <Search className="ui-field-icon" size={18} />
                            <input
                                type="text"
                                placeholder={t('patients_search_placeholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="ui-field-input"
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => (isConfigOpen ? setIsConfigOpen(false) : handleOpenConfig())}
                        className="h-10 w-10 flex items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                        title={t('table_config_title')}
                        aria-haspopup="dialog"
                        aria-expanded={isConfigOpen}
                    >
                        <Settings size={20} />
                    </button>

                    {!isFormOpen && (
                        <button
                            onClick={handleNewClick}
                            className="h-10 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center gap-2"
                        >
                            <Plus size={18} />
                            <span className="hidden sm:inline">{t('btn_new')}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Inline Form */}
            {isFormOpen && (
                <div className="border-b border-slate-100 pb-8 mb-8 animate-in slide-in-from-top-4">
                    <PatientForm
                        key={editingPatient?.id ?? 'new'}
                        onCancel={handleCancel}
                        onSave={handleSave}
                        initialData={editingPatient}
                        patients={patients}
                    />
                </div>
            )}

            {/* Inline Column Config (same area as the form) */}
            {isConfigOpen && (
                <div className="border-b border-slate-100 pb-6 mb-8 animate-in slide-in-from-top-4">
                    <TableConfig
                        columns={columns}
                        onClose={() => setIsConfigOpen(false)}
                        onToggle={handleToggleColumn}
                        onMove={handleMoveColumn}
                    />
                </div>
            )}

            {/* Table */}
            <div className={`bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/50 transition-all duration-300 ${(isFormOpen || isConfigOpen) ? 'opacity-50 pointer-events-none filter grayscale-[0.5]' : ''}`}>
                <div className="p-2">
                    <div className="overflow-x-auto overflow-y-hidden rounded-2xl p-1 sm:p-2">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase text-slate-500 font-semibold tracking-wider leading-tight">
                                {columns.filter(c => c.visible).map(col => (
                                    <th
                                        key={col.id}
                                        className={`p-4 ${col.id !== 'actions' ? 'group cursor-pointer hover:bg-slate-100 transition-colors select-none' : 'text-center'}`}
                                        onClick={() => col.id !== 'actions' && handleSort(col.id)}
                                    >
                                        <div className={`flex items-center gap-2 ${col.id === 'actions' ? 'justify-center' : ''}`}>
                                            {t(col.labelKey)}
                                            {col.id !== 'actions' && (
                                                sortConfig.key === col.id
                                                    ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-indigo-600" /> : <ArrowDown size={14} className="text-indigo-600" />)
                                                    : <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-30" />
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {processedData.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.filter(c => c.visible).length} className="p-8 text-center text-slate-400">
                                        {t('patients_none_found')}
                                    </td>
                                </tr>
                            ) : (
                                processedData.map((p, i) => (
                                    <tr key={String(p?.id ?? i)} className="hover:bg-indigo-50/30 transition-colors even:bg-slate-50/50">
                                        {columns.filter(c => c.visible).map(col => (
                                            <td key={`${String(p?.id ?? i)}-${col.id}`} className={`p-4 ${col.id === 'actions' ? 'text-center' : ''} text-sm text-slate-600`}>
                                                {renderCell(p, col.id)}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>

        </div>
    );
}
