-- Per-user main psychologist preference
-- Adds a column to store each member's default psychologist filter.

alter table public.workspace_members
  add column if not exists main_psychologist text;

-- Allow users to update their own membership row (needed to persist main_psychologist).
drop policy if exists "members_update_self" on public.workspace_members;
create policy "members_update_self"
on public.workspace_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
