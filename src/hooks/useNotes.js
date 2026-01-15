import { useCallback, useEffect, useMemo, useState } from 'react';
import { scopedKey } from '../utils/storageKeys';

const safeJsonParse = (raw, fallback) => {
  try {
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const normalizeNoteRow = (row) => {
  if (!row) return null;
  return {
    id: row.id ?? null,
    workspace_id: row.workspace_id ?? null,
    patient_id: row.patient_id ?? null,
    patient_name: row.patient_name ?? null,
    session_date: row.session_date ?? null,
    session_time: row.session_time ?? null,
    appointment_key: row.appointment_key ?? null,
    content: row.content ?? '',
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
};

export function useNotes(opts) {
  const workspaceId = String(opts?.workspaceId || '').trim();
  const useSupabase = Boolean(opts?.useSupabase);
  const supabase = opts?.supabase || null;
  const limit = Number.isFinite(opts?.limit) ? opts.limit : 50;

  const [schemaCompatible, setSchemaCompatible] = useState(true);

  const storageKey = useMemo(() => scopedKey('seicologia_notes', workspaceId), [workspaceId]);

  const [notes, setNotes] = useState(() => {
    const parsed = safeJsonParse(localStorage.getItem(storageKey), []);
    return Array.isArray(parsed) ? parsed.map(normalizeNoteRow).filter(Boolean) : [];
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reload local cache when workspace changes.
  useEffect(() => {
    const parsed = safeJsonParse(localStorage.getItem(storageKey), []);
    setNotes(Array.isArray(parsed) ? parsed.map(normalizeNoteRow).filter(Boolean) : []);
  }, [storageKey]);

  // Persist local cache.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch {
      // ignore
    }
  }, [notes, storageKey]);

  const refresh = useCallback(async () => {
    setError('');
    if (!useSupabase || !supabase || !workspaceId) return;
    if (!schemaCompatible) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('id, workspace_id, patient_id, patient_name, session_date, session_time, appointment_key, content, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes((data || []).map(normalizeNoteRow).filter(Boolean));
    } catch (e) {
      const msg = e?.message ? String(e.message) : 'Erro ao carregar prontuários.';
      // Common when the frontend is deployed before the DB migration: PostgREST schema cache
      // doesn't know about the new columns yet.
      if (msg.toLowerCase().includes('appointment_key') && msg.toLowerCase().includes('schema cache')) {
        setSchemaCompatible(false);
        setError(
          'Seu Supabase ainda não foi atualizado para prontuários. Rode a migração do schema (alter table notes add column appointment_key/patient_name/session_time + índice) e depois recarregue o schema cache do PostgREST. Enquanto isso, os prontuários serão guardados apenas neste navegador (cache local).'
        );
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [useSupabase, supabase, workspaceId, schemaCompatible]);

  // Initial supabase fetch for this workspace.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const notesByKey = useMemo(() => {
    const map = new Map();
    for (const n of notes || []) {
      const k = String(n?.appointment_key || '').trim();
      if (k) map.set(k, n);
    }
    return map;
  }, [notes]);

  const upsertNote = useCallback(
    async ({ appointmentKey, patientId, patientName, sessionDate, sessionTime, content }) => {
      setError('');

      const key = String(appointmentKey || '').trim();
      if (!workspaceId) throw new Error('Workspace não selecionado.');
      if (!key) throw new Error('Chave do prontuário inválida.');

      const existing = notesByKey.get(key);
      const isCreate = !existing;
      if (isCreate && (notes?.length || 0) >= limit) {
        throw new Error(`Limite de ${limit} prontuários atingido. Baixe e apague regularmente para liberar espaço.`);
      }

      const row = {
        workspace_id: workspaceId,
        appointment_key: key,
        patient_id: String(patientId || '').trim() || null,
        patient_name: String(patientName || '').trim() || null,
        session_date: sessionDate || null,
        session_time: String(sessionTime || '').trim() || null,
        content: String(content || '')
      };

      // Optimistic update for snappy UX
      setNotes((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        const idx = next.findIndex((n) => String(n?.appointment_key) === key);
        const merged = {
          ...(idx >= 0 ? next[idx] : {}),
          ...row,
          appointment_key: key
        };
        if (idx >= 0) next[idx] = merged;
        else next.unshift(merged);
        return next;
      });

      if (!useSupabase || !supabase || !schemaCompatible) return;

      const { data, error } = await supabase
        .from('notes')
        .upsert(row, { onConflict: 'workspace_id,appointment_key' })
        .select('id, workspace_id, patient_id, patient_name, session_date, session_time, appointment_key, content, created_at, updated_at');

      if (error) {
        // Rollback by refetching from server
        await refresh();
        throw error;
      }

      const inserted = Array.isArray(data) ? data[0] : data;
      const normalized = normalizeNoteRow(inserted);
      if (normalized) {
        setNotes((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [];
          const idx = next.findIndex((n) => String(n?.appointment_key) === key);
          if (idx >= 0) next[idx] = { ...next[idx], ...normalized };
          else next.unshift(normalized);
          return next;
        });
      }
    },
    [limit, notes?.length, notesByKey, refresh, supabase, useSupabase, workspaceId, schemaCompatible]
  );

  const deleteAllNotes = useCallback(async () => {
    setError('');
    if (!workspaceId) throw new Error('Workspace não selecionado.');

    setNotes([]);

    if (!useSupabase || !supabase || !schemaCompatible) return;

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('workspace_id', workspaceId);

    if (error) {
      await refresh();
      throw error;
    }
  }, [refresh, supabase, useSupabase, workspaceId, schemaCompatible]);

  const deleteNoteByKey = useCallback(
    async (appointmentKey) => {
      setError('');
      const key = String(appointmentKey || '').trim();
      if (!key) return;

      const existing = notesByKey.get(key);
      setNotes((prev) => (Array.isArray(prev) ? prev.filter((n) => String(n?.appointment_key) !== key) : []));

      if (!useSupabase || !supabase || !workspaceId) return;
      if (!schemaCompatible) return;
      if (!existing?.id) {
        // No id means we can't target a single row reliably; refetch.
        await refresh();
        return;
      }

      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('id', existing.id);

      if (error) {
        await refresh();
        throw error;
      }
    },
    [notesByKey, refresh, supabase, useSupabase, workspaceId, schemaCompatible]
  );

  return {
    notes,
    notesByKey,
    loading,
    error,
    limit,
    refresh,
    upsertNote,
    deleteAllNotes,
    deleteNoteByKey
  };
}
