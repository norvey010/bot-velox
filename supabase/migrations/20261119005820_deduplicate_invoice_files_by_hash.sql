alter table public.velox_platform_invoices
  add column if not exists file_sha256 text;

create unique index if not exists velox_platform_invoices_file_sha256_key
  on public.velox_platform_invoices (file_sha256)
  where file_sha256 is not null;
