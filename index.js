const axios = require('axios');
require('dotenv').config();
const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseKey = (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();
app.use(express.json());
app.use(express.static(__dirname));
const historiales = {};
const PORT = process.env.PORT || 3000;
const SYSTEM_PROMPT = `
Eres Velox, el asistente virtual inteligente encargado de atender pedidos y domicilios amablemente.

REGLAS DE ATENCIÓN (EN ORDEN DE PRIORIDAD):

1. ACLARACIONES (POST-PEDIDO): Si el cliente pide agregar un detalle (ej: "regálame hielo", "sin cebolla") JUSTO DESPUÉS de haber confirmado un pedido, NO lo trates como un cliente nuevo. Confirma amablemente que tomaste nota e incluye obligatoriamente este bloque al final:

[ACTUALIZAR_PEDIDO]
Notas: {Escribe aquí el detalle exacto pedido por el cliente}
[/ACTUALIZAR_PEDIDO]

2. SI EL MENSAJE CONTIENE [NUEVO_PEDIDO]:
   - Significa que el cliente ya hizo su pedido desde la carta digital web.
   - ACEPTA Y CONFIRMA el pedido inmediatamente. No cuestiones ni discutas.
   - Confirma con entusiasmo, dile el total y que su pedido ya fue enviado.

3. SI PREGUNTA POR EL MENÚ O QUIERE PEDIR ALGO NUEVO:
   - Salúdalo con amabilidad y dale nuestro link del Menú Digital interactivo:
     👉 https://bot-velox-production.up.railway.app/menu.html
   - Si insiste en pedir por texto, toma su orden con gusto.
FORMATO FINAL DE ORDEN:
Al confirmar el pedido, incluye al final de tu mensaje este formato exacto:

[NUEVO_PEDIDO]
Items: {Detalle del pedido}
Total: $MontoTotal
Dirección: {Dirección}
Pago: {Método}
[/NUEVO_PEDIDO]
`;


// Ruta principal del servidor

// Ruta para servir el Panel de Control
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});
app.get('/', (req, res) => {
    res.send('¡El bot de Velox está activo y funcionando!');
});

// Ruta de prueba de la IA
app.get('/probar-ia', async (req, res) => {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Di algo divertido sobre crear un bot de logística llamado Velox." }],
        });
        res.send(`<h1>Respuesta de la IA:</h1><p>${completion.choices[0].message.content}</p>`);
    } catch (error) {
        res.send(`Error: ${error.message}`);
    }
});

// 1. Ruta de verificación del Webhook para WhatsApp
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = "velox_token_seguro";

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFICADO');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// 2. Ruta para recibir los mensajes de WhatsApp
// Funciones para soporte Multi-Restaurante
async function obtenerRestaurante(phoneNumberId) {
    const { data: restaurante } = await supabase
        .from('restaurantes')
        .select('*')
        .eq('phone_number_id', phoneNumberId)
        .single();
    return restaurante;
}

async function obtenerMenu(restauranteId) {
    const { data: productos } = await supabase
        .from('productos')
        .select('nombre, descripcion, precio')
        .eq('restaurante_id', restauranteId)
        .eq('disponible', true);
    return productos || [];
}
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    try {
        const body = req.body;

        if (body.object) {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const phoneNumberId = value?.metadata?.phone_number_id;
            const message = value?.messages?.[0];

            if (message) {
                const numeroRemitente = message.from;
                const textoUsuario = message.text?.body;

                if (!textoUsuario) {
                    console.log("⚠️ Mensaje no contiene texto. Se ignora.");
                    return;
                }
                console.log(`Mensaje recibido de ${numeroRemitente}: ${textoUsuario}`);
                if (!historiales[numeroRemitente]) {
  historiales[numeroRemitente] = [];
}
historiales[numeroRemitente].push({ role: "user", content: textoUsuario });
                // Consultamos a OpenAI con el mensaje recibido
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...historiales[numeroRemitente]
        ],
    });

    const aiResponse = completion.choices[0].message.content;
    console.log(`🤖 Respuesta IA: ${aiResponse}`);
    historiales[numeroRemitente].push({ role: "assistant", content: aiResponse });
    
 // Detectar y guardar el pedido en Supabase si se confirmó
      const matchPedido = aiResponse.match(/\[NUEVO_PEDIDO\]([\s\S]*?)\[\/NUEVO_PEDIDO\]/);

      if (matchPedido) {
        try{
        const contenidoBloque = matchPedido[1];

        // Extraer cada campo de forma limpia
        const clienteMatch = contenidoBloque.match(/Cliente:\s*(.+)/i);
        const itemsMatch = contenidoBloque.match(/Items:\s*(.+)/i);
        const totalMatch = contenidoBloque.match(/Total:\s*\$?([\d\.\,]+)/i);
        const direccionMatch = contenidoBloque.match(/Dirección:\s*(.+)/i);

        // Variables organizadas
        const clienteNombre = clienteMatch ? clienteMatch[1].trim() : 'Cliente WhatsApp';
        const itemsDetalle = itemsMatch ? itemsMatch[1].trim() : 'Sin detalle';
        const direccionCliente = direccionMatch ? direccionMatch[1].trim() : 'Sin dirección';

        let totalLimpio = 0;
        if (totalMatch) {
          const rawTotal = totalMatch[1].replace(/\./g, '').replace(',', '.');
          totalLimpio = parseFloat(rawTotal) || 0;
        }

        // Insertar en Supabase con los campos separados
        const { data, error } = await supabase.from('pedidos').insert([
          {
            cliente_telefono: numeroRemitente,
            cliente_nombre: clienteNombre,
            items: itemsDetalle,
            total: totalLimpio,
            direccion: direccionCliente,
            estado: 'pendiente'
          }
        ]);

        if (error) {
          console.error('❌ Error devuelto por Supabase:', error.message);
        } else {
          console.log('✅ Pedido guardado exitosamente en Supabase');
        }
    } catch (errSupabase) {
      console.error('❌ Error al guardar en Supabase:', errSupabase);
    }
  }
  // Detectar y actualizar notas en Supabase si el cliente hizo una aclaración
const matchActualizar = aiResponse.match(/\[ACTUALIZAR_PEDIDO\]([\s\S]*?)\[\/ACTUALIZAR_PEDIDO\]/);

if (matchActualizar) {
  try {
    const contenidoNotas = matchActualizar[1];
    const matchNotas = contenidoNotas.match(/Notas:\s*(.*)/i);
    const nuevaNota = matchNotas ? matchNotas[1].trim() : contenidoNotas.trim();

    // 1. Buscar el último pedido de este número de teléfono
    const { data: ultimoPedido } = await supabase
      .from('pedidos')
      .select('id, notas')
      .eq('cliente_telefono', numeroRemitente)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimoPedido) {
      const notasActualizadas = ultimoPedido.notas 
        ? `${ultimoPedido.notas} | Nota extra: ${nuevaNota}` 
        : `Nota extra: ${nuevaNota}`;

      // 2. Actualizar en Supabase
      await supabase
        .from('pedidos')
        .update({ notas: notasActualizadas })
        .eq('id', ultimoPedido.id);

      console.log(`✅ Notas del pedido #${ultimoPedido.id} actualizadas: ${nuevaNota}`);
    }
  } catch (errorActualizar) {
    console.error("❌ Error al actualizar las notas:", errorActualizar);
  }
}
    // Enviar respuesta a WhatsApp
        await axios({
  method: 'POST',
  url: `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
  data: {
    messaging_product: 'whatsapp',
    to: numeroRemitente,
    type: 'text',
    text: { body: aiResponse }
  },
  headers: {
    'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json'
  }
});
            }

        
        }
        
    
    } catch (error) {
        console.error("Error en el webhook:", JSON.stringify(error.response?.data || error.message, null, 2));
    
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});