-- Un reintento de la carta digital reutiliza su solicitud; los pedidos históricos
-- y los clientes anteriores pueden conservar NULL. No cambia permisos ni RLS.
begin;
alter table public.pedidos
    add column if not exists solicitud_id uuid,
    add column if not exists solicitud_hash text;
create unique index if not exists pedidos_restaurante_solicitud_unique
    on public.pedidos (restaurante_id, solicitud_id)
    where solicitud_id is not null;
commit;
