import React, { useState } from 'react';
import { X, Calendar as CalIcon, Clock, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function NewSessionModal({ patients, onClose, onSave }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        patientId: '',
        date: '',
        time: '',
        rate: ''
    });

    const activePatients = patients.filter(p => p.active === 'Sim');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Auto-fill rate if patient selected
        if (name === 'patientId') {
            const p = patients.find(pat => pat.id === value);
            if (p) {
                setFormData(prev => ({ ...prev, rate: p.rate || '', patientId: value }));
            }
        }
    };

    const handleSubmit = () => {
        if (!formData.patientId || !formData.date || !formData.time) return;

        const patient = patients.find(p => p.id === formData.patientId);
        if (!patient) return;

        const newSession = {
            ...patient, // Inherit patient props (name, rate, etc)
            date: new Date(formData.date), // normalized
            originalDate: new Date(formData.date), // required for matching logic if we wanted to edit it later, though ID will be bespoke
            time: formData.time,
            rate: parseFloat(formData.rate) || patient.rate,
            isExtra: true
        };

        onSave(newSession);
        onClose();
    };

    return (
        <div className="ui-modal-overlay">
            <div className="ui-modal-card max-w-md animate-in zoom-in-95 duration-200">
                <div className="ui-modal-header">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <CalIcon size={18} />
                        </div>
                        {t('new_session_title')}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="ui-modal-body">
                    <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('new_session_patient')}</label>
                        <div className="ui-field">
                            <User className="ui-field-icon" size={18} />
                            <select
                                name="patientId"
                                value={formData.patientId}
                                onChange={handleChange}
                                className="ui-field-input appearance-none"
                            >
                                <option value="">{t('new_session_select_patient')}</option>
                                {activePatients.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">{t('new_session_date')}</label>
                            <input
                                type="date"
                                name="date"
                                value={formData.date}
                                onChange={handleChange}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">{t('new_session_time')}</label>
                            <div className="ui-field">
                                <Clock className="ui-field-icon" size={18} />
                                <input
                                    type="time"
                                    name="time"
                                    value={formData.time}
                                    onChange={handleChange}
                                    className="ui-field-input"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t('new_session_rate')}</label>
                        <input
                            type="number"
                            name="rate"
                            value={formData.rate}
                            onChange={handleChange}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={!formData.patientId || !formData.date || !formData.time}
                        className="w-full py-3 bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4"
                    >
                        {t('new_session_schedule')}
                    </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
