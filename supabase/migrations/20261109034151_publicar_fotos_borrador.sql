-- Conservar las fotos del borrador en la misma transacción que publica la carta.
create or replace function public.velox_publicar_menu(p_restaurante uuid,p_productos jsonb,p_version text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare cantidad integer; producto jsonb;
begin
  perform r.id from public.restaurantes r where r.id=p_restaurante and r.id_usuario=(select auth.uid()) for update;
  if not found then raise exception 'Restaurante no autorizado' using errcode='42501'; end if;
  if public.velox_menu_version(p_restaurante) is distinct from p_version then raise exception 'CARTA_CAMBIO'; end if;
  if jsonb_typeof(p_productos) is distinct from 'array' then raise exception 'Productos no válidos'; end if;
  if jsonb_array_length(p_productos) not between 1 and 500 then raise exception 'La carta debe tener entre 1 y 500 productos'; end if;
  for producto in select value from jsonb_array_elements(p_productos) loop
    if length(trim(coalesce(producto->>'nombre',''))) not between 1 and 200
      or length(trim(coalesce(producto->>'categoria',''))) not between 1 and 120
      or coalesce((producto->>'precio')::numeric,0) not between 1 and 100000000
      or (producto->>'precio')::numeric <> trunc((producto->>'precio')::numeric)
      or jsonb_typeof(producto->'opciones') is distinct from 'array' then
      raise exception 'Revisa nombres, categorías, precios y opciones';
    end if;
  end loop;
  delete from public.productos where restaurante_id=p_restaurante;
  insert into public.productos(restaurante_id,categoria,nombre,precio,descripcion,opciones,disponible,imagen_url)
    select p_restaurante,trim(p->>'categoria'),trim(p->>'nombre'),(p->>'precio')::numeric,
      coalesce(p->>'descripcion',''),p->'opciones',true,nullif(p->>'imagen_url','') from jsonb_array_elements(p_productos) p;
  get diagnostics cantidad = row_count;
  return cantidad;
end;
$$;
