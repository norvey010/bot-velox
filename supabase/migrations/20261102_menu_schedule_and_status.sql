-- Estado público de la carta y horario semanal de cada restaurante.
ALTER TABLE public.restaurantes
    ADD COLUMN IF NOT EXISTS menu_activo boolean NOT NULL DEFAULT true;

ALTER TABLE public.restaurantes
    ADD COLUMN IF NOT EXISTS horario_atencion jsonb NOT NULL
    DEFAULT '{"usar_horario": false, "dias": {}}'::jsonb;
