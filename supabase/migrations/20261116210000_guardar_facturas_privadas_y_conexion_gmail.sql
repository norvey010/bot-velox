create table if not exists public.velox_platform_invoices (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('railway','supabase','openai','meta','claro','otro')),
  source_message_id text not null,
  source_external_id text,
  invoice_number text,
  invoice_date date,
  billing_period_start date,
  billing_period_end date,
  status text not null default 'pending_review'
    check (status in ('pending_review','paid','open','void','refunded')),
  amount numeric(16,2) check (amount is null or amount >= 0),
  paid_amount numeric(16,2) check (paid_amount is null or paid_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  description text,
  email_subject text,
  email_from text,
  source_received_at timestamptz,
  file_paths jsonb not null default '[]'::jsonb,
  extraction_note text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_message_id),
  unique (provider, source_external_id)
);

create index if not exists velox_platform_invoices_provider_date_idx
  on public.velox_platform_invoices(provider, invoice_date desc);

alter table public.velox_platform_invoices enable row level security;
revoke all on table public.velox_platform_invoices from public, anon, authenticated;
grant select, insert, update, delete on table public.velox_platform_invoices to service_role;

create table if not exists public.velox_admin_integrations (
  provider text primary key check (provider in ('gmail')),
  account_email text not null,
  credentials_ciphertext text not null,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.velox_admin_integrations enable row level security;
revoke all on table public.velox_admin_integrations from public, anon, authenticated;
grant select, insert, update, delete on table public.velox_admin_integrations to service_role;

