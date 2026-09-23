const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');
require('dotenv').config();
const path = require('path');
const express = require('express');
const pdfParse = require('pdf-parse');
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
    - Responde amablemente y entrega el enlace del menú oficial que se te proporcionará.
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
    let { data: restaurante, error } = await supabase
        .from('restaurantes')
        .select('*')
        .eq('phone_number_id', String(phoneNumberId).trim())
        .maybeSingle();

    if (error) {
        console.error("❌ Error de Supabase:", error.message);
    }

    if (!restaurante) {
        console.log("⚠️ No hizo match exacto. Consultando toda la tabla de restaurantes...");
        const { data: todos } = await supabase.from('restaurantes').select('*');
        console.log("📋 Contenido actual de Supabase:", JSON.stringify(todos, null, 2));
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

                const systemPromptDinamico = SYSTEM_PROMPT_BASE + `\nINSTRUCCIÓN CRÍTICA: Debes usar obligatoriamente este enlace exacto para el menú digital: ${linkMenuDinamico}. Está prohibido usar cualquier otro link genérico.`;

                if (!historiales[numeroRemitente]) {
                    historiales[numeroRemitente] = [];
                }
                historiales[numeroRemitente].push({ role: "user", content: textoUsuario });

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

// Ruta inteligente para importar menú múltiple (Soporta varias imágenes de un menú grande)
app.post('/api/importar-menu', upload.array('menuFile', 10), async (req, res) => {
    try {
        const { restaurante_id } = req.body;
        const files = req.files;

        if (!files || files.length === 0 || !restaurante_id) {
            return res.status(400).json({ error: "Faltan las imágenes del menú o el ID del restaurante." });
        }

      let contenidoMensaje = [
    { type: "text", text: "Analiza esta imagen de menú y extrae los productos en formato JSON estricto. SIGUE ESTAS REGLAS DE ORO:\n1. NOMBRES DE CATEGORÍA PERMITIDOS: Las únicas categorías válidas son las secciones principales del restaurante (ej: 'Pollo Broaster', 'Pollo Frito', 'Arroz Paisa'). ESTÁ TOTALMENTE PROHIBIDO usar palabras como 'Combos', 'Promociones', 'Combo #1', 'Combo #2' como categorías. Si un plato es un combo, guárdalo dentro de su categoría principal correspondiente (ej: si es un combo de pollo broaster, su categoría DEBE ser 'Pollo Broaster').\n2. GASEOSAS Y PRECIOS: Nunca dejes una gaseosa suelta como producto independiente. Si hay un plato solo y una opción con gaseosa, crea dos ítems independientes dentro de la misma categoría con nombres claros (ej: 'Personal' a $19.000 y 'Personal + 1 Gaseosa 250ML' a $20.000).\nDevuélvelo estrictamente como un JSON: {\"productos\": [{\"categoria\": \"Nombre Categoria Principal\", \"nombre\": \"Nombre del Plato o Combo Completo\", \"precio\": 20000, \"descripcion\": \"Detalles\"}]}." }
];
        for (const file of files) {
            if (!file.mimetype.startsWith('image/')) {
                return res.status(400).json({ error: "Todos los archivos deben ser imágenes (JPG, PNG)." });
            }
            const base64Data = file.buffer.toString('base64');
            contenidoMensaje.push({
                type: "image_url",
                image_url: { url: `data:${file.mimetype};base64,${base64Data}` }
            });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Eres un experto analista gastronómico. Extraes platos y precios de múltiples imágenes de menús y devuelves un único JSON estructurado: { \"productos\": [ { \"categoria\": \"Nombre Categoría\", \"nombre\": \"Nombre Plato\", \"precio\": 15000, \"descripcion\": \"Detalle opcional\" } ] }."
                },
                {
                    role: "user",
                    content: contenidoMensaje
                }
            ],
            response_format: { type: "json_object" },
            max_tokens: 4096
        });

        const resultadoIA = JSON.parse(response.choices[0].message.content);
        const listaProductos = resultadoIA.productos || Object.values(resultadoIA)[0];

        if (!Array.isArray(listaProductos) || listaProductos.length === 0) {
            return res.status(400).json({ error: "No se pudieron detectar productos claros en las imágenes." });
        }

const productosParaSupabase = listaProductos.map(p => ({
    restaurante_id: restaurante_id,
    categoria: p.categoria || "General",
    nombre: p.nombre,
    precio: Number(p.precio) < 1000 ? Number(p.precio) * 1000 : Number(p.precio) || 0,
    descripcion: p.descripcion || "",
    // Si la IA mandó una URL válida la usa, de lo contrario le encasqueta esta foto profesional de plato gourmet y se acabó el problema:
    imagen_url: (p.imagen_url && p.imagen_url.startsWith('http')) ? p.imagen_url : 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500'
}));

        // 1. Borramos el menú anterior de este restaurante para evitar unificación
    const { error: deleteError } = await supabase
        .from('productos')
        .delete()
        .eq('restaurante_id', restaurante_id);

    if (deleteError) {
        console.error("Error al limpiar productos antiguos:", deleteError);
    }

    // 2. Insertamos el nuevo menú procesado por la IA
    const { error: insertError } = await supabase
        .from('productos')
        .insert(productosParaSupabase);

    if (insertError) throw insertError;

        const { data: restData } = await supabase
            .from('restaurantes')
            .select('slug')
            .eq('id', restaurante_id)
            .single();

        res.json({ 
            success: true, 
            slug: restData ? restData.slug : null 
        });

    } catch (err) {
        console.error("Error procesando el menú múltiple con IA:", err);
        res.status(500).json({ error: "Hubo un error al procesar las imágenes con Inteligencia Artificial." });
    }
});
function obtenerImagenDinamicaInteligente(nombreProducto) {
    // Foto estandarizada de alta calidad: un plato de restaurante gourmet apetitoso que nunca falla
    return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500';
}
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});