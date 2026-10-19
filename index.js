const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');
require('dotenv').config();
const path = require('path');
const express = require('express');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai'); // 👈 Migrado a OpenAI

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // 👈 Inicialización con tu API Key
const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseKey = (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();
app.use(express.json());
app.use(express.static(__dirname));
const historiales = {};
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT_BASE = `Eres Velox, asistente virtual de domicilios.

REGLAS:
1. ACLARACIONES (POST-PEDIDO): Si piden agregar detalles (ej: "hielo", "sin cebolla") justo después de confirmar, responde amablemente y pon al final:
[ACTUALIZAR_PEDIDO]
Notas: {detalle}
[/ACTUALIZAR_PEDIDO]

2. [NUEVO_PEDIDO]: Genera el bloque estructurado para guardar el pedido, incluyendo en Items exactamente el producto y la variante elegida. En el texto visible al cliente, confirma en una sola frase que el pedido fue recibido y enviado e informa el total. No repitas ni enumeres productos, ingredientes, descripciones o variantes en esa confirmación. Nunca elimines esos datos del bloque [NUEVO_PEDIDO].

3. MENÚ: Entrega siempre el enlace oficial proporcionado. Si insisten por texto, toma la orden.

FORMATO FIN DE ORDEN:
[NUEVO_PEDIDO]
Items: {detalle}
Total: {monto}
Dirección: {dir}
Pago: {metodo}
[/NUEVO_PEDIDO]`;

// Ruta principal del servidor
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/', (req, res) => {
    res.send('¡El bot de Velox está activo y funcionando con OpenAI!');
});

// Ruta de prueba de la IA con OpenAI
app.get('/probar-ia', async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Di algo divertido sobre crear un bot' }],
    });

    const respuestaIA = completion.choices[0].message.content;
    res.send(`<h1>Respuesta de OpenAI:</h1><p>${respuestaIA}</p>`);

  } catch (error) {
    console.error("❌ Error detallado al conectar con OpenAI:", error);
    res.status(500).send(`<h2>Error inesperado:</h2><p>${error.message}</p>`);
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
                
                // Agregamos el mensaje del usuario al historial
                historiales[numeroRemitente].push({ role: "user", content: textoUsuario });

                // Control estricto de historial (.slice(-6)) para evitar el efecto bola de nieve en tokens
                const historialRecortado = historiales[numeroRemitente].slice(-6);

                // Conversación inteligente con OpenAI (gpt-4o-mini)
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPromptDinamico },
                        ...historialRecortado
                    ],
                    temperature: 0.2
                });

                const aiResponse = completion.choices[0].message.content;
                console.log(`🤖 Respuesta IA: ${aiResponse}`);
                
                const matchPedido = aiResponse.match(/\[NUEVO_PEDIDO\]([\s\S]*?)\[\/NUEVO_PEDIDO\]/);
                const totalConfirmacionMatch = matchPedido?.[1].match(/Total:\s*(.+)/i);
                // La confirmación visible no repite ingredientes ni variantes; esos datos siguen en Items para cocina.
                const respuestaWhatsApp = matchPedido
                    ? `¡Listo! Recibimos tu pedido y ya fue enviado al restaurante.${totalConfirmacionMatch ? ` Total: ${totalConfirmacionMatch[1].trim()}.` : ''}`
                    : aiResponse;
                historiales[numeroRemitente].push({ role: "assistant", content: respuestaWhatsApp });

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
                        text: { body: respuestaWhatsApp }
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

// Ruta inteligente para importar menú múltiple optimizada y sin errores
// Sin límite de cantidad de imágenes durante las pruebas de lectura del menú.
const uploadMenuFiles = upload.array('menuFile');

app.post('/api/importar-menu', (req, res, next) => {
    // Devolver un error claro si Multer no puede recibir los archivos.
    uploadMenuFiles(req, res, (error) => {
        if (error) {
            if (error instanceof multer.MulterError && error.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({ error: "No se reconoció uno de los archivos enviados. Vuelve a seleccionar las imágenes del menú." });
            }
            return res.status(400).json({ error: "No se pudieron recibir los archivos del menú." });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { restaurante_id } = req.body;
        const files = req.files;

        if (!files || files.length === 0 || !restaurante_id) {
            return res.status(400).json({ error: "Faltan las imágenes del menú o el ID del restaurante." });
        }

        const bytesTotalesImagenes = files.reduce((total, file) => total + file.size, 0);
        console.info("Importación de menú recibida:", JSON.stringify({
            restaurante_id,
            cantidad_imagenes: files.length,
            megabytes_totales: Number((bytesTotalesImagenes / (1024 * 1024)).toFixed(2))
        }));

        const promptTexto = `Transcribe el menú de las imágenes como un OCR literal. La carta es la única fuente de verdad.

REGLAS OBLIGATORIAS:
- Conserva exactamente la ortografía, las palabras, el uso de mayúsculas/minúsculas y los nombres impresos. No corrijas, traduzcas, normalices ni reemplaces palabras por sinónimos o variantes regionales. Ejemplos: "tostacos" no es "tostones"; "tocineta" no es "tocino".
- Copia cada nombre y toda descripción/ingrediente legible completa, en el mismo orden. No omitas ingredientes aunque parezcan obvios (incluidos chorizo y tocineta); no acortes palabras ("plancha" no es "planch"), no resumas y no uses puntos suspensivos.
- Incluye todos los productos, tamaños, porciones, combos, ingredientes y precios visibles. No inventes datos ni deduzcas ingredientes. Si un dato no es legible, usa cadena vacía para texto o 0 para precio; nunca lo adivines.
- El precio debe ser el valor numérico impreso, sin símbolo de moneda ni separadores de miles. No conviertas ni multipliques el precio.
- Devuelve también "es_combo" y "familia_combo". Todos los combos deben quedar en la categoría de menú "Combos". "familia_combo" debe indicar SOLO el plato principal que da identidad al combo, no cualquier acompañamiento o ingrediente mencionado después. Respeta el orden de la descripción: por ejemplo, "arroz chino, 1/2 pollo, papa y gaseosa" pertenece a "Arroces"; "1/2 pollo, arroz chino y gaseosa" pertenece a "Pollo a la Broaster". Usa familias concretas como "Arroces", "Hamburguesas", "Perros", "Pollo a la Broaster", "Lasaña" o "Pizzas". Si el nombre identifica el plato principal, prioriza el nombre; si es genérico ("Promoción 1", "Combo 2"), identifica el primer plato principal de la descripción e ignora acompañamientos y bebidas. Si no se identifica con claridad, usa "Otros". No conviertas el combo en un producto normal ni inventes una familia.
- Cada tamaño/presentación con precio debe quedar como producto visible independiente, con ese precio. Asigna a cada tamaño un mismo "familia" únicamente cuando la carta confirme que pertenece al mismo producto base (por ejemplo, Personal, Mediana y Familiar bajo Pizzas usan familia "Pizzas"). Para una opción listada junto a un producto, inclúyela en sus "opciones". Si la carta pone el catálogo de sabores/variantes en otra parte, devuélvelo una sola vez en el arreglo raíz "variantes" con esa misma familia y el encabezado correspondiente en "categoria" (por ejemplo, cada sabor de pizza con familia y categoria "Pizzas"); no lo conviertas en productos vendibles ni repitas la lista por cada tamaño. No cruces familias distintas ni adivines asociaciones. Si la relación no es clara, deja familia vacía y no vincules.
- En "opciones" y "variantes" incluye solo elecciones explícitas que el cliente debe escoger: sabores, especialidades, tipos, ingredientes seleccionables o acompañamientos. Para cada una devuelve grupo (por ejemplo, "Sabor"), nombre y descripción literal completa; descripción vacía si no aparece. Excluye tamaños como Personal, Mediana y Familiar, precios base, encabezados y categorías. Si no hay variantes explícitas, usa [].
- Revisa visualmente cada imagen completa antes de responder. Devuelve únicamente el JSON solicitado, sin texto adicional.`;

        // Construimos el contenido con el texto y todas las imágenes juntas en una sola llamada
        let messagesContent = [
            {
                type: "text",
                text: promptTexto
            }
        ];

        for (const file of files) {
            const base64Image = file.buffer.toString("base64");
            messagesContent.push({
                type: "image_url",
                image_url: {
                    url: `data:${file.mimetype};base64,${base64Image}`,
                    // high conserva el detalle necesario para leer el texto y los precios.
                    detail: "high"
                }
            });
        }

        // Modelo de visión eficiente para importaciones de alto volumen.
        // Se puede cambiar desde Railway con OPENAI_MENU_MODEL si se necesita
        // volver temporalmente al modelo anterior durante una comparación.
        const modeloImportacionMenu = process.env.OPENAI_MENU_MODEL || "gpt-5.6-luna";
        const response = await openai.chat.completions.create({
            model: modeloImportacionMenu,
            reasoning_effort: "none",
            temperature: 0,
            messages: [{ role: "user", content: messagesContent }],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "menu_transcription",
                    strict: true,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            productos: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        categoria: { type: "string" },
                                        familia: { type: "string" },
                                        es_combo: { type: "boolean" },
                                        familia_combo: { type: "string" },
                                        nombre: { type: "string" },
                                        precio: { type: "number" },
                                        descripcion: { type: "string" },
                                        opciones: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                additionalProperties: false,
                                                properties: {
                                                    grupo: { type: "string" },
                                                    nombre: { type: "string" },
                                                    descripcion: { type: "string" }
                                                },
                                                required: ["grupo", "nombre", "descripcion"]
                                            }
                                        }
                                    },
                                    required: ["categoria", "familia", "es_combo", "familia_combo", "nombre", "precio", "descripcion", "opciones"]
                                }
                            },
                            variantes: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        categoria: { type: "string" },
                                        familia: { type: "string" },
                                        grupo: { type: "string" },
                                        nombre: { type: "string" },
                                        descripcion: { type: "string" }
                                    },
                                    required: ["categoria", "familia", "grupo", "nombre", "descripcion"]
                                }
                            }
                        },
                        required: ["productos", "variantes"]
                    }
                }
            },
            // Los menús completos pueden producir bastante JSON; 4096 truncaba la respuesta con cartas extensas.
            max_completion_tokens: 16000
        });

        const eleccion = response.choices?.[0];
        const uso = response.usage || {};
        console.info("Respuesta OpenAI importar-menu:", JSON.stringify({
            restaurante_id,
            model: response.model || modeloImportacionMenu,
            finish_reason: eleccion?.finish_reason || null,
            prompt_tokens: uso.prompt_tokens ?? null,
            completion_tokens: uso.completion_tokens ?? null,
            total_tokens: uso.total_tokens ?? null
        }));
        const contenidoRespuesta = eleccion?.message?.content;
        if (!contenidoRespuesta || eleccion.finish_reason === "length") {
            throw new Error("La respuesta de IA quedó vacía o incompleta; no se reemplazó el menú actual.");
        }
        const resultadoParcial = JSON.parse(contenidoRespuesta);
        if (!Array.isArray(resultadoParcial.productos) || resultadoParcial.productos.length === 0) {
            throw new Error("La IA no encontró productos legibles; se conserva el menú actual.");
        }
        if (resultadoParcial.productos.some(producto => !String(producto.nombre || "").trim())) {
            throw new Error("La extracción devolvió productos sin nombre; se conserva el menú actual.");
        }
        const todosLosProductos = resultadoParcial.productos;

        // Vincula listas de variantes separadas con cada presentación vendible
        // solo cuando la IA asignó explícitamente la misma familia.
        const normalizarFamilia = valor => String(valor || "").trim().toLocaleLowerCase("es")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ")
            .split(" ").map(palabra => palabra.endsWith("s") ? palabra.slice(0, -1) : palabra).join(" ");
        const variantesPorFamilia = new Map();
        const variantesPorCategoria = new Map();
        for (const variante of Array.isArray(resultadoParcial.variantes) ? resultadoParcial.variantes : []) {
            const familia = normalizarFamilia(variante.familia);
            const categoria = normalizarFamilia(variante.categoria);
            const nombre = String(variante.nombre || "").trim();
            if (!nombre) continue;
            const opcion = {
                grupo: String(variante.grupo || "Variante").trim(),
                nombre,
                descripcion: String(variante.descripcion || "").trim()
            };
            if (familia) {
                if (!variantesPorFamilia.has(familia)) variantesPorFamilia.set(familia, []);
                variantesPorFamilia.get(familia).push(opcion);
            }
            if (categoria) {
                if (!variantesPorCategoria.has(categoria)) variantesPorCategoria.set(categoria, []);
                variantesPorCategoria.get(categoria).push(opcion);
            }
        }

        const parecePresentacionPorTamano = nombre => /\b(?:personal|individual|pequeñ[ao]|chic[ao]|mediana?|grande|familiar|junior|mini|porción|porcion|media|entera|\d{2,3}\s*cm)\b/i.test(String(nombre || ""));
        const detectarFamiliaPrincipal = texto => {
            const normalizado = normalizarFamilia(texto);
            const familias = [
                [/\b(?:arroces|arroz(?:\s+(?:chino|paisa|mixto|especial|con pollo|tres delicias))?)\b/, "Arroces"],
                [/\b(?:perros?|hot\s?dog)\b/, "Perros"],
                [/\b(?:hamburguesas?|burgers?)\b/, "Hamburguesas"],
                [/\bpizzas?\b/, "Pizzas"],
                [/\b(?:lasagna|lasana)\b/, "Lasaña"],
                [/\barepas?\b/, "Arepas"],
                [/\bsalchipapas?\b/, "Salchipapas"],
                [/\b(?:sandwiches?|emparedados?)\b/, "Sándwiches"],
                [/\b(?:tacos?|burritos?)\b/, "Mexicanos"],
                [/\b(?:pollo|broaster|alita|nugget)\b/, "Pollo a la Broaster"],
                [/\b(?:pescado|marisco)\b/, "Pescados y mariscos"]
            ];
            return familias.find(([patron]) => patron.test(normalizado))?.[1] || "";
        };
        const inferirFamiliaCombo = producto => {
            const familiaPorNombre = detectarFamiliaPrincipal(producto.nombre);
            if (familiaPorNombre) return familiaPorNombre;
            const primerComponente = String(producto.descripcion || "").split(/[,;+]/, 1)[0];
            const familiaPorInicioDescripcion = detectarFamiliaPrincipal(primerComponente);
            if (familiaPorInicioDescripcion) return familiaPorInicioDescripcion;
            const familiaDeclarada = String(producto.familia_combo || "").trim();
            if (familiaDeclarada && normalizarFamilia(familiaDeclarada) !== "otro") return familiaDeclarada;
            return detectarFamiliaPrincipal(producto.descripcion) || "Otros";
        };
        const esProductoCombo = producto => producto.es_combo === true
            || /\bcombos?\b/i.test(String(producto.categoria || ""))
            || /\bcombo\b/i.test(String(producto.nombre || ""));

        const productosParaSupabase = todosLosProductos.map(p => {
            const opcionesDirectas = Array.isArray(p.opciones) ? p.opciones : [];
            const opcionesFamilia = variantesPorFamilia.get(normalizarFamilia(p.familia)) || [];
            const opcionesCategoria = opcionesFamilia.length === 0 && parecePresentacionPorTamano(p.nombre)
                ? (variantesPorCategoria.get(normalizarFamilia(p.categoria)) || [])
                : [];
            const combo = esProductoCombo(p);
            const familiaCombo = combo ? inferirFamiliaCombo(p) : "";
            const marcadorFamiliaCombo = combo ? [{ grupo: "__velox_combo_family__", nombre: familiaCombo, descripcion: "" }] : [];
            const opciones = [...opcionesDirectas, ...opcionesFamilia, ...opcionesCategoria, ...marcadorFamiliaCombo]
                .filter((opcion, indice, lista) => {
                    const llave = `${String(opcion.grupo || "").toLocaleLowerCase("es")}|${String(opcion.nombre || "").toLocaleLowerCase("es")}`;
                    return lista.findIndex(item => `${String(item.grupo || "").toLocaleLowerCase("es")}|${String(item.nombre || "").toLocaleLowerCase("es")}` === llave) === indice;
                });
            return {
            restaurante_id: restaurante_id,
            categoria: combo ? "Combos" : String(p.categoria || "General").trim(),
            nombre: p.nombre,
            precio: Number(p.precio) < 1000 ? Number(p.precio) * 1000 : Number(p.precio) || 0,
            descripcion: p.descripcion || "",
            // Sin foto real, no asignamos una imagen genérica repetida. El menú
            // mostrará un visual local según la categoría, sin llamadas pagas.
            ...(p.imagen_url && p.imagen_url.startsWith('http') ? { imagen_url: p.imagen_url } : {}),
            opciones
            };
        });

        // 1. Borramos el menú anterior de este restaurante
        const { error: deleteError } = await supabase
            .from('productos')
            .delete()
            .eq('restaurante_id', restaurante_id);

        if (deleteError) {
            console.error("Error al limpiar productos antiguos:", deleteError);
        }

        // 2. Insertamos los nuevos productos extraídos
        const { error: insertError } = await supabase
            .from('productos')
            .insert(productosParaSupabase);

        if (insertError) {
            throw insertError;
        }

        // 3. Consultamos el slug para retornar una respuesta limpia
        const { data: restData } = await supabase
            .from('restaurantes')
            .select('slug')
            .eq('id', restaurante_id)
            .single();

        return res.json({ 
            success: true, 
            count: productosParaSupabase.length,
            productosConVariantes: productosParaSupabase.filter(p => Array.isArray(p.opciones) && p.opciones.some(opcion => opcion.grupo !== "__velox_combo_family__")).length,
            variantesVinculadas: productosParaSupabase.reduce((total, producto) => total + producto.opciones.filter(opcion => opcion.grupo !== "__velox_combo_family__").length, 0),
            slug: restData ? restData.slug : null 
        });

    } catch (error) {
        const status = error.status || error.response?.status || null;
        const code = error.code || error.error?.code || null;
        const type = error.type || error.error?.type || null;
        const message = error.message || "Error desconocido";
        console.error("Error al procesar menú con IA:", JSON.stringify({
            status,
            code,
            type,
            message,
            details: error.response?.data || null
        }));

        let mensajeUsuario = "No se pudo completar la lectura del menú. Revisa los registros de Railway para ver el motivo exacto.";
        if (code === "context_length_exceeded" || /context length|maximum context|too many tokens/i.test(message)) {
            mensajeUsuario = "Las imágenes juntas exceden la capacidad de una sola lectura. Prueba dividir el menú en grupos de páginas.";
        } else if (/respuesta de IA quedó vacía o incompleta/i.test(message)) {
            mensajeUsuario = "La IA empezó a leer el menú, pero no alcanzó a devolver todo el resultado. Prueba dividir las páginas en varios grupos.";
        } else if (status === 413 || /payload too large|request too large|entity too large/i.test(message)) {
            mensajeUsuario = "El conjunto de imágenes pesa demasiado para una sola petición. Prueba subirlas en grupos más pequeños.";
        } else if (status === 429) {
            mensajeUsuario = "OpenAI rechazó temporalmente la lectura por límite de uso o saldo. Revisa Usage y Billing de tu cuenta.";
        } else if (status === 401) {
            mensajeUsuario = "OpenAI rechazó la clave API configurada en Railway. Revisa OPENAI_API_KEY.";
        }
        return res.status(500).json({ error: mensajeUsuario });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
