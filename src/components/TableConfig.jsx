import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';

export function TableConfig({ columns, onClose, onToggle, onMove }) {
    const { t } = useTranslation();

    return (
        <div
            role="dialog"
            aria-label={t('table_config_title')}
            className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 p-5"
        >
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800">{t('table_config_title')}</h3>
                <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50" aria-label={t('btn_close')}>
                    <X size={18} />
                </button>
            </div>

            <div className="space-y-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-2">
                {columns.map((col, index) => (
                    <div key={col.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-3 min-w-0">
                            <button
                                onClick={() => onToggle(col.id)}
                                className={`p-1.5 rounded-lg transition-colors ${col.visible ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}
                                aria-pressed={col.visible}
                                title={col.visible ? t('btn_hide') : t('btn_show')}
                            >
                                {col.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                            <span className={`text-sm font-medium truncate ${col.visible ? 'text-slate-700' : 'text-slate-400'}`} title={t(col.labelKey)}>
                                {t(col.labelKey)}
                            </span>
                        </div>
                        <div className="flex gap-1">
                            <button
                                disabled={index === 0}
                                onClick={() => onMove(index, -1)}
                                className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                                title={t('move_up')}
                            >
                                <ArrowUp size={16} />
                            </button>
                            <button
                                disabled={index === columns.length - 1}
                                onClick={() => onMove(index, 1)}
                                className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                                title={t('move_down')}
                            >
                                <ArrowDown size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
