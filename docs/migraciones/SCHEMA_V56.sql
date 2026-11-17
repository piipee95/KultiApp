-- KultiApp 5.6: la cuota por pagar se guarda en la base para que la vea todo el equipo.
-- Cambio aditivo (no borra ni modifica datos). La app funciona igual sin él: la cuota queda en el dispositivo.
alter table public.workspace_settings
  add column if not exists cuota jsonb;
-- Reversión (opcional): alter table public.workspace_settings drop column if exists cuota;
