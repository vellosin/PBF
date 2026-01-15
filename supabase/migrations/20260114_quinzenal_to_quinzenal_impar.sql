-- Migration: legacy Quinzenal -> Quinzenal (Ímpar)
-- Run in Supabase SQL editor.
-- This updates existing patients that were previously stored as "Quinzenal".

begin;

update public.patients
set frequency = 'Quinzenal (Ímpar)'
where frequency = 'Quinzenal';

commit;
