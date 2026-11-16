-- Libro financiero privado de Velox: ingresos recibidos y gastos reales.
create table if not exists public.velox_financial_entries (
    id uuid primary key default gen_random_uuid(),
    tipo text not null check (tipo in ('ingreso', 'gasto')),
    categoria text not null check (categoria in ('suscripcion', 'railway', 'supabase', 'claro', 'meta', 'otro')),
    restaurante_id uuid references public.restaurantes(id) on delete set null,
    descripcion text not null check (char_length(trim(descripcion)) between 1 and 240),
    monto numeric(16,2) not null check (monto > 0),
    moneda text not null default 'COP' check (moneda in ('COP', 'USD')),
    fecha date not null default current_date,
    periodo date not null check (periodo = date_trunc('month', periodo::timestamp)::date),
    referencia text,
    creado_por uuid,
    creado_en timestamptz not null default now(),
    anulado_en timestamptz,
    anulado_por uuid,
    motivo_anulacion text,
    constraint velox_financial_income_has_restaurant check (tipo <> 'ingreso' or restaurante_id is not null)
);

create index if not exists velox_financial_period_idx
    on public.velox_financial_entries (periodo, anulado_en);
create index if not exists velox_financial_restaurant_period_idx
    on public.velox_financial_entries (restaurante_id, periodo, anulado_en);

create table if not exists public.velox_financial_fx (
    periodo date primary key check (periodo = date_trunc('month', periodo::timestamp)::date),
    cop_por_usd numeric(14,4) not null check (cop_por_usd > 0),
    actualizado_por uuid,
    actualizado_en timestamptz not null default now()
);

alter table public.velox_financial_entries enable row level security;
alter table public.velox_financial_fx enable row level security;
revoke all on table public.velox_financial_entries from public, anon, authenticated;
revoke all on table public.velox_financial_fx from public, anon, authenticated;
grant select, insert, update on table public.velox_financial_entries to service_role;
grant select, insert, update on table public.velox_financial_fx to service_role;
