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

const SYSTEM_PROMPT_BASE = `
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
   - Responde ÚNICAMENTE usando este enlace exacto: ${linkMenuDinamico} (no uses ningún otro link genérico).
   - Si insiste en pedir por texto, toma su orden con gusto.

FORMATO FINAL DE ORDER:
Al confirmar el pedido, incluye al final de tu mensaje este formato exacto:

[NUEVO_PEDIDO]
Items: {Detalle del pedido}
Total: $MontoTotal
Dirección: {Dirección}
Pago: {Método}
[/NUEVO_PEDIDO]
`;

// Ruta principal del servidor
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

// Funciones para soporte Multi-Restaurante
async function obtenerRestaurante(phoneNumberId) {
    // 1. Buscamos directamente por el phone_number_id oficial de Meta
    let { data: restaurante, error } = await supabase
        .from('restaurantes')
        .select('*')
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();

    // 2. Si por alguna razón no lo encuentra, podemos asignarlo al primer restaurante disponible (ideal para pruebas o primer registro)
    if (!restaurante) {
        const { data: primerRestaurante } = await supabase
            .from('restaurantes')
            .select('*')
            .is('phone_number_id', null)
            .limit(1)
            .maybeSingle();

        if (primerRestaurante) {
            // Guardamos el phone_number_id automáticamente en la base de datos para el futuro
            await supabase
                .from('restaurantes')
                .update({ phone_number_id: phoneNumberId })
                .eq('id', primerRestaurante.id);
            
            restaurante = { ...primerRestaurante, phone_number_id: phoneNumberId };
        }
    }

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
console.log("🔥 ID QUE LLEGA:", phoneNumberId);
const message = value?.messages?.[0];
            

            if (message) {
                const numeroRemitente = message.from;
                const textoUsuario = message.text?.body;

                if (!textoUsuario) {
                    console.log("⚠️ Mensaje no contiene texto. Se ignora.");
                    return;
                }
                console.log(`Mensaje recibido de ${numeroRemitente} (Phone ID: ${phoneNumberId}): ${textoUsuario}`);

                // Consultar a qué restaurante pertenece este WhatsApp usando el phone_number_id
                const restauranteData = await obtenerRestaurante(phoneNumberId);
                console.log("🍔 RESTAURANTE ENCONTRADO:", restauranteData);
                
                let linkMenuDinamico = "https://bot-velox-production.up.railway.app/menu.html";
                let restauranteIdActual = null;

                if (restauranteData) {
                    restauranteIdActual = restauranteData.id;
                    if (restauranteData.slug) {
                        linkMenuDinamico = `https://bot-velox-production.up.railway.app/menu.html?slug=${restauranteData.slug}`;
                    }
                }

                // Construir el System Prompt personalizado con el link exacto del restaurante
               const systemPromptDinamico = SYSTEM_PROMPT_BASE + `\nINSTRUCCIÓN CRÍTICA: Debes usar obligatoriamente este enlace exacto para el menú digital: ${linkMenuDinamico}. Está prohibido usar cualquier otro link genérico.`;

                if (!historiales[numeroRemitente]) {
                    historiales[numeroRemitente] = [];
                }
                historiales[numeroRemitente].push({ role: "user", content: textoUsuario });

                // Consultamos a OpenAI con el prompt personalizado
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPromptDinamico },
                        ...historiales[numeroRemitente]
                    ],
                });

                const aiResponse = completion.choices[0].message.content;
                console.log(`🤖 Respuesta IA: ${aiResponse}`);
                historiales[numeroRemitente].push({ role: "assistant", content: aiResponse });
                
                // Detectar y guardar el pedido en Supabase si se confirmó
                const matchPedido = aiResponse.match(/\[NUEVO_PEDIDO\]([\s\S]*?)\[\/NUEVO_PEDIDO\]/);

                if (matchPedido) {
                    try {
                        const contenidoBloque = matchPedido[1];

                        const clienteMatch = contenidoBloque.match(/Cliente:\s*(.+)/i);
                        const itemsMatch = contenidoBloque.match(/Items:\s*(.+)/i);
                        const totalMatch = contenidoBloque.match(/Total:\s*\$?([\d\.\,]+)/i);
                        const direccionMatch = contenidoBloque.match(/Dirección:\s*(.+)/i);
                        const pagoMatch = contenidoBloque.match(/Pago:\s*(.+)/i);

                        const clienteNombre = clienteMatch ? clienteMatch[1].trim() : 'Cliente WhatsApp';
                        const itemsDetalle = itemsMatch ? itemsMatch[1].trim() : 'Sin detalle';
                        const direccionCliente = direccionMatch ? direccionMatch[1].trim() : 'Sin dirección';
                        const metodoPago = pagoMatch ? pagoMatch[1].trim() : 'Efectivo';

                        let totalLimpio = 0;
                        if (totalMatch) {
                            const rawTotal = totalMatch[1].replace(/\./g, '').replace(',', '.');
                            totalLimpio = parseFloat(rawTotal) || 0;
                        }

                        // Insertar en Supabase asociando el restaurante_id correspondiente
                        const { error } = await supabase.from('pedidos').insert([
                            {
                                restaurante_id: restauranteIdActual,
                                cliente_telefono: numeroRemitente,
                                cliente_nombre: clienteNombre,
                                items: itemsDetalle,
                                total: totalLimpio,
                                direccion: direccionCliente,
                                metodo_pago: metodoPago,
                                estado: 'Pendiente'
                            }
                        ]);

                        if (error) {
                            console.error('❌ Error devuelto por Supabase:', error.message);
                        } else {
                            console.log('✅ Pedido guardado exitosamente en Supabase para el restaurante:', restauranteIdActual);
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
                    url: `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
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