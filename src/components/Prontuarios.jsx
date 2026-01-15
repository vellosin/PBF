import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Trash2, FileText, RefreshCcw, Pencil } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { ProntuarioModal } from './ProntuarioModal';

const toDateOnly = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isoDate = (v) => {
  const d = toDateOnly(v);
  if (!d) return '';
  return d.toISOString().split('T')[0];
};

export function Prontuarios({
  notes,
  patients,
  limit,
  loading,
  error,
  onRefresh,
  onUpsert,
  onDeleteAll,
  onDeleteOne
}) {
  const { t } = useTranslation();
  const [qName, setQName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const patientNameById = useMemo(() => {
    const map = new Map();
    for (const p of patients || []) {
      const id = String(p?.id ?? '').trim();
      if (!id) continue;
      map.set(id, String(p?.name || '').trim());
    }
    return map;
  }, [patients]);

  const enriched = useMemo(() => {
    const list = Array.isArray(notes) ? notes : [];
    return list.map((n) => {
      const pid = String(n?.patient_id ?? '').trim();
      const nameFallback = pid ? (patientNameById.get(pid) || '') : '';
      return {
        ...n,
        _patientName: String(n?.patient_name || nameFallback || '').trim(),
        _dateIso: String(n?.session_date || '').trim(),
        _time: String(n?.session_time || '').trim(),
        _content: String(n?.content || '')
      };
    });
  }, [notes, patientNameById]);

  const filtered = useMemo(() => {
    const q = String(qName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const fromIso = fromDate ? String(fromDate) : '';
    const toIso = toDate ? String(toDate) : '';

    return enriched.filter((n) => {
      if (q) {
        const name = String(n?._patientName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (fromIso && n?._dateIso && n._dateIso < fromIso) return false;
      if (toIso && n?._dateIso && n._dateIso > toIso) return false;
      return true;
    });
  }, [enriched, fromDate, qName, toDate]);

  const downloadAll = () => {
    const rows = enriched.map((n) => ({
      Paciente: n._patientName,
      Data: n._dateIso,
      Hora: n._time,
      Conteudo: n._content,
      AtualizadoEm: n.updated_at || n.created_at || ''
    }));

    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Prontuarios');
    writeFile(wb, `prontuarios_${isoDate(new Date()) || 'export'}.xlsx`);
  };

  const downloadOne = (n) => {
    const rows = [
      {
        Paciente: n._patientName,
        Data: n._dateIso,
        Hora: n._time,
        Conteudo: n._content,
        AtualizadoEm: n.updated_at || n.created_at || ''
      }
    ];

    const safeName = String(n._patientName || 'paciente')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .slice(0, 60) || 'paciente';

    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Prontuario');
    writeFile(wb, `prontuario_${safeName}_${n._dateIso || isoDate(new Date())}.xlsx`);
  };

  const confirmDeleteAll = async () => {
    const ok = window.confirm(t('prontuarios_delete_all_confirm'));
    if (!ok) return;
    try {
      await onDeleteAll?.();
    } catch (e) {
      const msg = e?.message ? String(e.message) : t('generic_error');
      alert(msg);
    }
  };

  const openEdit = (n) => {
    const d = n?._dateIso ? new Date(`${n._dateIso}T00:00:00`) : null;
    setEditing({
      appointmentKey: n?.appointment_key || '',
      patientId: n?.patient_id || '',
      patientName: n?._patientName || '',
      date: d,
      time: n?._time || '',
      initialContent: n?._content || ''
    });
    setSaveError('');
  };

  const confirmDeleteOne = async (n) => {
    if (!onDeleteOne) return;
    const ok = window.confirm(
      t('prontuarios_delete_one_confirm', {
        name: n?._patientName || t('prontuario_patient_unknown'),
        date: n?._dateIso || ''
      })
    );
    if (!ok) return;
    try {
      await onDeleteOne(String(n?.appointment_key || ''));
    } catch (e) {
      const msg = e?.message ? String(e.message) : t('generic_error');
      alert(msg);
    }
  };

  const saveEdit = async (content) => {
    if (!editing) return;
    setSaving(true);
    setSaveError('');
    try {
      await onUpsert?.({
        appointmentKey: editing.appointmentKey,
        patientId: editing.patientId,
        patientName: editing.patientName,
        sessionDate: editing.date ? isoDate(editing.date) : '',
        sessionTime: editing.time,
        content
      });
      setEditing(null);
    } catch (e) {
      const msg = e?.message ? String(e.message) : t('generic_error');
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{t('prontuarios_title')}</h2>
          <div className="text-sm text-slate-500 mt-1">
            {t('prontuarios_count', { count: (notes || []).length, limit: limit || 50 })}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('prontuarios_limit_hint')}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRefresh?.()}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-2"
            title={t('btn_refresh')}
          >
            <RefreshCcw size={16} />
            <span className="hidden sm:inline">{t('btn_refresh')}</span>
          </button>

          <button
            type="button"
            onClick={downloadAll}
            disabled={enriched.length === 0}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-extrabold flex items-center gap-2"
          >
            <Download size={16} /> {t('prontuarios_download_all')}
          </button>

          <button
            type="button"
            onClick={confirmDeleteAll}
            disabled={(notes || []).length === 0}
            className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-extrabold flex items-center gap-2"
          >
            <Trash2 size={16} /> {t('prontuarios_delete_all')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl shadow-slate-200/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={qName}
            onChange={(e) => setQName(e.target.value)}
            placeholder={t('prontuarios_filter_patient_placeholder')}
            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="mt-6 text-sm text-slate-500">{t('loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 text-sm text-slate-500">{t('prontuarios_none')}</div>
        ) : (
          <div className="mt-6 space-y-3">
            {filtered.map((n) => (
              <div
                key={String(n?.id || n?.appointment_key || Math.random())}
                className="w-full rounded-2xl border border-slate-200 p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-700 shrink-0">
                    <FileText size={18} />
                  </div>

                  <button
                    type="button"
                    onClick={() => openEdit(n)}
                    className="flex-1 min-w-0 text-left"
                    title={t('prontuario_edit')}
                  >
                    <div className="font-extrabold text-sm text-slate-800 truncate">{n._patientName || t('prontuario_patient_unknown')}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {n._dateIso}{n._time ? ` • ${n._time}` : ''}
                    </div>
                    <div className="text-xs text-slate-600 mt-2 whitespace-pre-wrap max-h-12 overflow-hidden">
                      {n._content || t('prontuario_empty')}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(n)}
                      className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-700"
                      title={t('prontuario_edit')}
                      aria-label={t('prontuario_edit')}
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadOne(n)}
                      className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-indigo-700"
                      title={t('prontuarios_download_one')}
                      aria-label={t('prontuarios_download_one')}
                    >
                      <Download size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={() => confirmDeleteOne(n)}
                      disabled={!onDeleteOne}
                      className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center text-rose-700"
                      title={t('prontuarios_delete_one')}
                      aria-label={t('prontuarios_delete_one')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <ProntuarioModal
          open={true}
          patientName={editing?.patientName}
          date={editing?.date}
          time={editing?.time}
          initialContent={editing?.initialContent}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          saving={saving}
          error={saveError}
        />
      ) : null}
    </div>
  );
}
