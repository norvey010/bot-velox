create table public.velox_cache_carta (
  restaurante_id uuid primary key references public.restaurantes(id) on delete cascade,
  huella text not null,
  resultado jsonb not null
);
alter table public.velox_cache_carta enable row level security;
revoke all on public.velox_cache_carta from public, anon, authenticated;
grant select, insert, update on public.velox_cache_carta to service_role;
