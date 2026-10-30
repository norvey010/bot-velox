-- Reemplaza las políticas public.* con acceso limitado al propietario autenticado.
-- La carta pública se entrega mediante GET /api/menu/:slug usando campos permitidos.
-- Los pedidos se crean únicamente en el servidor (POST /api/pedidos / webhook).

begin;

-- Retira las políticas abiertas que se vieron en la consulta del proyecto.
drop policy if exists "Acceso total pedidos" on public.pedidos;
drop policy if exists "Permitir insertar pedidos" on public.pedidos;
drop policy if exists "Acceso total productos" on public.productos;
drop policy if exists "Acceso total restaurantes" on public.restaurantes;
drop policy if exists "Permitir lectura publica" on public.restaurantes;

alter table public.pedidos enable row level security;
alter table public.productos enable row level security;
alter table public.restaurantes enable row level security;

-- Los navegadores no consultan restaurantes/productos directamente para la carta.
-- El servidor usa service_role; el panel usa la sesión autenticada del dueño.
revoke all on table public.restaurantes from public, anon;
revoke all on table public.productos from public, anon;
revoke all on table public.pedidos from public, anon, authenticated;

grant select, insert, update on table public.restaurantes to authenticated;
grant select, insert, update, delete on table public.productos to authenticated;
grant select on table public.pedidos to authenticated;

drop policy if exists velox_restaurantes_select_own on public.restaurantes;
drop policy if exists velox_restaurantes_insert_own on public.restaurantes;
drop policy if exists velox_restaurantes_update_own on public.restaurantes;
create policy velox_restaurantes_select_own
    on public.restaurantes for select to authenticated
    using (id_usuario = (select auth.uid()));
create policy velox_restaurantes_insert_own
    on public.restaurantes for insert to authenticated
    with check (id_usuario = (select auth.uid()));
create policy velox_restaurantes_update_own
    on public.restaurantes for update to authenticated
    using (id_usuario = (select auth.uid()))
    with check (id_usuario = (select auth.uid()));

drop policy if exists velox_productos_select_own on public.productos;
drop policy if exists velox_productos_insert_own on public.productos;
drop policy if exists velox_productos_update_own on public.productos;
drop policy if exists velox_productos_delete_own on public.productos;
create policy velox_productos_select_own
    on public.productos for select to authenticated
    using (exists (
        select 1 from public.restaurantes r
        where r.id = productos.restaurante_id and r.id_usuario = (select auth.uid())
    ));
create policy velox_productos_insert_own
    on public.productos for insert to authenticated
    with check (exists (
        select 1 from public.restaurantes r
        where r.id = productos.restaurante_id and r.id_usuario = (select auth.uid())
    ));
create policy velox_productos_update_own
    on public.productos for update to authenticated
    using (exists (
        select 1 from public.restaurantes r
        where r.id = productos.restaurante_id and r.id_usuario = (select auth.uid())
    ))
    with check (exists (
        select 1 from public.restaurantes r
        where r.id = productos.restaurante_id and r.id_usuario = (select auth.uid())
    ));
create policy velox_productos_delete_own
    on public.productos for delete to authenticated
    using (exists (
        select 1 from public.restaurantes r
        where r.id = productos.restaurante_id and r.id_usuario = (select auth.uid())
    ));

drop policy if exists velox_pedidos_select_own on public.pedidos;
create policy velox_pedidos_select_own
    on public.pedidos for select to authenticated
    using (exists (
        select 1 from public.restaurantes r
        where r.id = pedidos.restaurante_id and r.id_usuario = (select auth.uid())
    ));

-- El panel sube imágenes a storage/productos/restaurante_<id>/<archivo>.
-- Esto permite insertar solo en la carpeta del restaurante del usuario autenticado.
drop policy if exists velox_productos_storage_insert_own on storage.objects;
create policy velox_productos_storage_insert_own
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'productos'
        and (storage.foldername(name))[1] = 'restaurante_' || (
            select r.id::text
            from public.restaurantes r
            where r.id_usuario = (select auth.uid())
            limit 1
        )
    );

commit;
