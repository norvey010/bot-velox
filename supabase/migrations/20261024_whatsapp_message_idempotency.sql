-- Usa el ID estable de WhatsApp para que los reintentos del mismo evento
-- no creen ni impriman una segunda comanda. Los mensajes históricos quedan NULL.
ALTER TABLE public.pedidos
    ADD COLUMN IF NOT EXISTS whatsapp_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_whatsapp_message_id_unique
    ON public.pedidos (whatsapp_message_id)
    WHERE whatsapp_message_id IS NOT NULL;
