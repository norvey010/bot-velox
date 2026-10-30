-- Guarda el ancho del rollo elegido por cada restaurante para sus comandas.
alter table public.restaurantes
    add column if not exists printer_paper_width smallint not null default 80;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'restaurantes_printer_paper_width_check'
          and conrelid = 'public.restaurantes'::regclass
    ) then
        alter table public.restaurantes
            add constraint restaurantes_printer_paper_width_check
            check (printer_paper_width in (58, 80));
    end if;
end;
$$;
