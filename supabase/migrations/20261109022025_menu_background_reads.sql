create table public.velox_lecturas_menu (
  id uuid primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  estado text not null check (estado in ('procesando', 'listo', 'error')),
  resultado jsonb,
  mensaje text,
  vence_en timestamptz not null,
  unique (restaurante_id, usuario_id),
  check ((estado = 'listo') = (resultado is not null))
);

alter table public.velox_lecturas_menu enable row level security;
revoke all on table public.velox_lecturas_menu from public, anon, authenticated;
grant select, insert, update, delete on table public.velox_lecturas_menu to service_role;
