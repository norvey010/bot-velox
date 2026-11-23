alter table public.velox_financial_entries
  drop constraint if exists velox_financial_income_has_restaurant;

create or replace function private.vincular_factura_con_gasto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date;
  v_categoria text;
  v_proveedor text;
begin
  if new.provider = 'openai' then
    update public.velox_financial_entries
       set anulado_en = coalesce(anulado_en, now()),
           motivo_anulacion = 'Factura archivada; OpenAI ya se incluye desde el reporte de costos para evitar duplicarlo.'
     where factura_id = new.id and anulado_en is null;
    return new;
  end if;
  if new.amount is null or new.amount <= 0 or new.status in ('void', 'refunded') then
    update public.velox_financial_entries
       set anulado_en = coalesce(anulado_en, now()),
           motivo_anulacion = case
             when new.status in ('void', 'refunded') then 'Factura anulada o reembolsada.'
             else 'La factura ya no tiene un importe registrable.'
           end
     where factura_id = new.id and anulado_en is null;
    return new;
  end if;
  v_fecha := coalesce(new.invoice_date, (new.source_received_at at time zone 'America/Bogota')::date, (now() at time zone 'America/Bogota')::date);
  v_categoria := case new.provider when 'railway' then 'railway' when 'supabase' then 'supabase' when 'meta' then 'meta' when 'claro' then 'claro' else 'otro' end;
  v_proveedor := case new.provider
    when 'railway' then 'Railway'
    when 'supabase' then 'Supabase'
    when 'meta' then 'Meta'
    when 'claro' then 'Claro'
    else coalesce(nullif(trim(new.provider_custom), ''), 'Otro proveedor')
  end;
  insert into public.velox_financial_entries (
    factura_id, tipo, categoria, restaurante_id, descripcion, monto, moneda, fecha, periodo, referencia, servicio_personalizado
  ) values (
    new.id, 'gasto', v_categoria, null, left('Factura de ' || v_proveedor, 240),
    new.amount, new.currency, v_fecha, date_trunc('month', v_fecha::timestamp)::date,
    left('Factura ' || coalesce(nullif(trim(new.invoice_number), ''), left(new.id::text, 8)) || ' · ' || v_proveedor, 240),
    case when new.provider = 'otro' then v_proveedor else null end
  )
  on conflict (factura_id) do update
    set tipo = excluded.tipo, categoria = excluded.categoria, restaurante_id = null,
        descripcion = excluded.descripcion, monto = excluded.monto, moneda = excluded.moneda,
        fecha = excluded.fecha, periodo = excluded.periodo, referencia = excluded.referencia,
        servicio_personalizado = excluded.servicio_personalizado, anulado_en = null,
        anulado_por = null, motivo_anulacion = null;
  return new;
end;
$$;
