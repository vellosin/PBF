import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const LS_SELECTED_LEGACY = 'seicologia_selected_workspace';

const keyForUser = (userId) => {
  const uid = String(userId || '').trim();
  return uid ? `seicologia_selected_workspace:${uid}` : LS_SELECTED_LEGACY;
};

const isDebugSupabase = () => {
  try {
    return String(import.meta.env.VITE_DEBUG_SUPABASE || '0') === '1';
  } catch {
    return false;
  }
};

const formatSupabaseError = (err) => {
  if (!err) return 'Erro desconhecido';

  const parts = [];
  if (err.message) parts.push(err.message);
  if (err.details) parts.push(err.details);
  if (err.hint) parts.push(`Hint: ${err.hint}`);
  if (err.code) parts.push(`Code: ${err.code}`);

  const text = parts.filter(Boolean).join(' | ');
  return text || String(err);
};

export function useWorkspace(session) {
  const userId = session?.user?.id || null;

  const [loading, setLoading] = useState(Boolean(supabase && userId));
  const [workspaces, setWorkspaces] = useState([]); // {id,name,join_code,role}
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => {
    try {
      // Legacy global key (kept for migration). Without a userId yet, we can only read legacy.
      return localStorage.getItem(LS_SELECTED_LEGACY) || '';
    } catch {
      return '';
    }
  });

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [workspaces, selectedWorkspaceId]);

  useEffect(() => {
    if (!supabase || !userId) return;

    let mounted = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('workspace_members')
        .select('role, workspaces ( id, name, join_code, created_at )')
        .eq('user_id', userId);

      if (!mounted) return;

      if (error) {
        setWorkspaces([]);
        setLoading(false);
        return;
      }

      const rows = (data || [])
        .map((r) => {
          const ws = r.workspaces;
          if (!ws?.id) return null;
          return {
            id: ws.id,
            name: ws.name,
            join_code: ws.join_code,
            role: r.role,
            created_at: ws.created_at
          };
        })
        .filter(Boolean);

      // Deterministic ordering: prefer older workspaces first (more likely to contain existing data).
      rows.sort((a, b) => {
        const ta = a?.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
        const tb = b?.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
        if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
        if (Number.isFinite(ta)) return -1;
        if (Number.isFinite(tb)) return 1;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });

      setWorkspaces(rows);

      // Auto-select: read per-user key (migrate from legacy if needed) and validate it exists.
      const stored = (() => {
        try {
          const perUserKey = keyForUser(userId);
          const perUser = localStorage.getItem(perUserKey) || '';
          if (perUser) return perUser;

          const legacy = localStorage.getItem(LS_SELECTED_LEGACY) || '';
          if (legacy) {
            // migrate legacy -> per-user (prevents cross-account leakage)
            localStorage.setItem(perUserKey, legacy);
            localStorage.removeItem(LS_SELECTED_LEGACY);
            return legacy;
          }

          return '';
        } catch {
          return '';
        }
      })();

      const hasStored = stored && rows.some((w) => w.id === stored);

      // Optional override: allow ?ws=<workspaceId> to force selection (useful after domain migrations).
      // Only applies if the workspace exists in the user's memberships.
      const urlOverride = (() => {
        try {
          const url = new URL(window.location.href);
          const ws = url.searchParams.get('ws');
          if (!ws) return '';
          const candidate = String(ws).trim();
          if (!candidate) return '';
          const ok = rows.some((w) => w.id === candidate);
          if (!ok) return '';

          // Clean URL after consuming override
          url.searchParams.delete('ws');
          window.history.replaceState({}, document.title, url.toString());
          return candidate;
        } catch {
          return '';
        }
      })();

      const preferredPrincipal = rows.find((w) => String(w?.name || '').trim().toLowerCase() === 'principal');
      const nextId = urlOverride
        ? urlOverride
        : (hasStored ? stored : (preferredPrincipal?.id || rows[0]?.id || ''));

      setSelectedWorkspaceId(nextId);
      try {
        const perUserKey = keyForUser(userId);
        if (nextId) localStorage.setItem(perUserKey, nextId);
        else localStorage.removeItem(perUserKey);
      } catch {
        // ignore
      }

      setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const selectWorkspace = (id) => {
    setSelectedWorkspaceId(id);
    try {
      const k = keyForUser(userId);
      if (id) localStorage.setItem(k, id);
      else localStorage.removeItem(k);
      // keep legacy key cleared to avoid cross-account issues
      localStorage.removeItem(LS_SELECTED_LEGACY);
    } catch {
      // ignore
    }
  };

  const refresh = async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('workspace_members')
      .select('role, workspaces ( id, name, join_code, created_at )')
      .eq('user_id', userId);
    const rows = (data || [])
      .map((r) => {
        const ws = r.workspaces;
        if (!ws?.id) return null;
        return { id: ws.id, name: ws.name, join_code: ws.join_code, role: r.role, created_at: ws.created_at };
      })
      .filter(Boolean);

    rows.sort((a, b) => {
      const ta = a?.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
      const tb = b?.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      if (Number.isFinite(ta)) return -1;
      if (Number.isFinite(tb)) return 1;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });

    setWorkspaces(rows);
    setLoading(false);
  };

  const createWorkspace = async (name) => {
    if (!supabase) throw new Error('Supabase não configurado');
    if (!userId) throw new Error('Não autenticado');

    const wname = String(name || '').trim();
    if (!wname) throw new Error('Informe um nome');

    // Prefer RPC (atomic): avoids RLS issues with insert+select before membership exists.
    const { data, error } = await supabase.rpc('create_workspace', { p_name: wname });
    if (error) {
      if (isDebugSupabase()) console.error('[supabase.rpc:create_workspace] error', error);
      throw new Error(formatSupabaseError(error));
    }

    const row = Array.isArray(data) ? data[0] : data;

    await refresh();
    if (row?.workspace_id) selectWorkspace(row.workspace_id);
    return row;
  };

  const joinWorkspaceByCode = async (joinCode) => {
    if (!supabase) throw new Error('Supabase não configurado');
    if (!userId) throw new Error('Não autenticado');

    const code = String(joinCode || '').trim().toUpperCase();
    if (!code) throw new Error('Informe o código');

    // Prefer RPC (recommended) so we don't have to expose workspaces by join_code.
    const { data, error } = await supabase.rpc('join_workspace_by_code', { p_code: code });
    if (error) {
      if (isDebugSupabase()) console.error('[supabase.rpc:join_workspace_by_code] error', error);
      throw new Error(formatSupabaseError(error));
    }

    const row = Array.isArray(data) ? data[0] : data;

    await refresh();
    if (row?.workspace_id) selectWorkspace(row.workspace_id);
    return row;
  };

  return {
    loading,
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    selectWorkspace,
    refresh,
    createWorkspace,
    joinWorkspaceByCode
  };
}
