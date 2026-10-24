-- Los clientes solo pueden crear pedidos a través de POST /api/pedidos.
-- Esa ruta verifica productos y cantidades y calcula el total en el servidor.
-- El backend debe usar SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY si ya es service_role).
REVOKE INSERT ON TABLE public.pedidos FROM PUBLIC, anon, authenticated;
