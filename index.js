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
const historiales = {};
const PORT = process.env.PORT || 3000;
const SYSTEM_PROMPT = `
Eres Velox, el asistente virtual inteligente de Veloxing. 
Tu objetivo es tomar pedidos de domicilios de forma rápida, amable y precisa.

MENÚ Y PRECIOS:
- Pizza Hawaiana (Familiar: $45.000 / Personal: $20.000)
- Pizza Peperoni (Familiar: $48.000 / Personal: $22.000)
- Hamburguesa Clásica: $22.000
- Adicionales: Papas $6.000, Gaseosa 1.5L $8.000

REGLAS DE ATENCIÓN:
1. Saluda amablemente y ofrece el menú.
2. Pide detalles específicos del pedido (tamaño, adicionales).
3. Pide la dirección de entrega y el método de pago (Nequi, Daviplata, Efectivo).
4. Cuando el cliente confirme todo, entrega un resumen claro con el Total a pagar.
5. MODISMOS LOCALES: Entiende expresiones como "me regalas", "me das" o "deme" como una intención clara de COMPRA o PEDIDO, jamás como algo gratis. Si piden "regalar 1 hamburguesa", tómalo como que quieren incluir 1 Hamburguesa Clásica en el pedido.

FORMATO FINAL DE ORDEN:
Al confirmar el pedido, incluye al final de tu mensaje este formato exacto:

[NUEVO_PEDIDO]
Cliente: {Teléfono/Nombre}
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
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    try {
        const body = req.body;

        if (body.object) {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
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