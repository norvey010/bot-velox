function normalizarTexto(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizarCategoriaMenu(categoria) {
    const etiqueta = String(categoria || '').trim() || 'General';
    const clave = normalizarTexto(etiqueta).replace(/\s+/g, ' ');
    const categoriasCanonicas = {
        'hamburguesa': 'Hamburguesas',
        'hamburguesas': 'Hamburguesas',
        'pizza': 'Pizzas',
        'pizzas': 'Pizzas',
        'arepa': 'Arepas',
        'arepas': 'Arepas',
        'perro': 'Perros',
        'perros': 'Perros',
        'perro caliente': 'Perros',
        'perros calientes': 'Perros',
        'pollo broaster': 'Pollo a la Broaster',
        'pollo a la broaster': 'Pollo a la Broaster',
        'sandwich': 'Sándwiches',
        'sandwiches': 'Sándwiches'
    };
    return categoriasCanonicas[clave] || etiqueta;
}

function resolverCategoriaCombo(producto) {
    const categoriaOriginal = normalizarCategoriaMenu(producto._categoriaOriginal || producto.categoria);
    return esProductoCombo(producto) ? normalizarCategoriaMenu(resolverFamiliaCombo(producto)) : categoriaOriginal;
}

function esProductoCombo(producto) {
    const categoria = normalizarTexto(producto._categoriaOriginal || producto.categoria || '');
    const nombre = normalizarTexto(producto.nombre || '');
    const descripcion = normalizarTexto(producto.descripcion || '');
    const tieneMarcador = obtenerMetadataFamiliaCombo(producto) !== '';
    if (tieneMarcador || /\bcombos?\b/.test(categoria) || /\bcombo\b/.test(nombre) || /\bcombo\b/.test(descripcion)) return true;

    // Compatibilidad con combos que versiones anteriores guardaron dentro de
    // su categoría normal; las señales deben aparecer juntas para evitar mover
    // hamburguesas o platos individuales por error.
    const incluyeBebida = /\b(?:gaseosa|bebida|refresco)\b/.test(descripcion);
    const incluyeAcompanamiento = /\b(?:papas?|papa francesa|yuca|patacon|arepa|ensalada)\b/.test(descripcion);
    return incluyeBebida && incluyeAcompanamiento && /\b(?:hamburguesa|perro|pollo|broaster|lasana|pizza|combo)\b/.test(nombre);
}

function obtenerMetadataFamiliaCombo(producto) {
    const opciones = Array.isArray(producto.opciones) ? producto.opciones : (() => {
        try { return JSON.parse(producto.opciones || '[]'); } catch (error) { return []; }
    })();
    const marcador = (Array.isArray(opciones) ? opciones : []).find(opcion => opcion && opcion.grupo === '__velox_combo_family__');
    return String(marcador?.nombre || producto.familia_combo || '').trim();
}

function resolverFamiliaCombo(producto) {
    const familiaGuardada = obtenerMetadataFamiliaCombo(producto);
    const detectarFamiliaPrincipal = texto => {
        const textoNormalizado = normalizarTexto(texto);
        const arrozEspecifico = textoNormalizado.match(/\barroz\s+((?:(?:con|de)\s+)?[a-z]+(?:\s+(?!con\b|de\b|y\b)[a-z]+)?)/);
        if (arrozEspecifico) return `Arroz ${arrozEspecifico[1].trim()}`;

        const normalizado = textoNormalizado;
        const familias = [
            { patron: /\barroces?\b/, nombre: 'Arroces' },
            { patron: /\b(?:perros?|hot\s?dog)\b/, nombre: 'Perros' },
            { patron: /\b(?:hamburguesas?|burgers?)\b/, nombre: 'Hamburguesas' },
            { patron: /\bpizzas?\b/, nombre: 'Pizzas' },
            { patron: /\b(?:lasagna|lasana)\b/, nombre: 'Lasaña' },
            { patron: /\barepas?\b/, nombre: 'Arepas' },
            { patron: /\bsalchipapas?\b/, nombre: 'Salchipapas' },
            { patron: /\b(?:sandwiches?|emparedados?)\b/, nombre: 'Sándwiches' },
            { patron: /\b(?:tacos?|burritos?)\b/, nombre: 'Mexicanos' },
            { patron: /\b(?:pollo|broaster|alitas?|nuggets?)\b/, nombre: 'Pollo a la Broaster' },
            { patron: /\b(?:pescado|marisco)\b/, nombre: 'Pescados y mariscos' }
        ];
        return familias
            .map((familia, prioridad) => {
                const coincidencia = familia.patron.exec(normalizado);
                return coincidencia ? { nombre: familia.nombre, indice: coincidencia.index, prioridad } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.indice - b.indice || a.prioridad - b.prioridad)[0]?.nombre || '';
    };

    // Si el título identifica el plato principal, tiene prioridad sobre la descripción.
    const familiaPorNombre = detectarFamiliaPrincipal(producto.nombre);
    if (familiaPorNombre) return familiaPorNombre;

    // En títulos genéricos (Combo 1/Promoción 4), agrupa por el primer plato de la descripción.
    const primerComponente = String(producto.descripcion || '').split(/[,;+]/, 1)[0];
    const familiaPorInicioDescripcion = detectarFamiliaPrincipal(primerComponente);
    if (familiaPorInicioDescripcion) return familiaPorInicioDescripcion;

    if (familiaGuardada && normalizarTexto(familiaGuardada) !== 'otros') return familiaGuardada;
    return detectarFamiliaPrincipal(producto.descripcion) || 'Otros';
}

function compararPreciosMenu(a, b) {
    return (Number(a.precio) || 0) - (Number(b.precio) || 0);
}

// Solo interpreta gestos laterales iniciados sobre el catálogo. El scroll vertical
// y los botones de producto siguen funcionando con su comportamiento habitual.
function habilitarDeslizamientoCategorias(contenedor, cambiarCategoria) {
    if (!contenedor) return;
    let inicioGesto = null;
    contenedor.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) {
            inicioGesto = null;
            return;
        }
        const objetivo = event.target instanceof Element ? event.target : null;
        if (objetivo?.closest('button:not([data-editar-tarjeta]), a, input, select, textarea, [role="dialog"]')) {
            inicioGesto = null;
            return;
        }
        inicioGesto = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }, { passive: true });

    contenedor.addEventListener('touchend', event => {
        if (!inicioGesto || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - inicioGesto.x;
        const dy = event.changedTouches[0].clientY - inicioGesto.y;
        inicioGesto = null;
        if (Math.abs(dx) < 65 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
        cambiarCategoria(dx < 0 ? 1 : -1);
    }, { passive: true });

    contenedor.addEventListener('touchcancel', () => { inicioGesto = null; }, { passive: true });
}

function revisarDatosFotoMenu(producto) {
    const nombre = normalizarTexto(producto.nombre).trim();
    const categoria = normalizarTexto(producto.categoria).trim();
    const tipo = texto => /\bhamburguesas?\b/.test(texto) ? 'hamburguesa'
        : /\bpizzas?\b/.test(texto) ? 'pizza' : '';
    if (!nombre || !categoria) return 'Completa el nombre y la categoría.';
    if (tipo(nombre) && tipo(categoria) && tipo(nombre) !== tipo(categoria)) {
        return 'Revisa si el nombre coincide con la categoría.';
    }
    if (String(producto.descripcion || '').trim()) return '';
    if (/\b(limonadas?|jugos?|cervezas?|gaseosas?|avenas?|granizados?|cafes?|agua)\b/.test(nombre)
        || /\b(cervezas|gaseosas)\b/.test(categoria) && !/\b(especial|casa|varios)\b/.test(nombre)) return '';
    const nombreSimple = nombre.replace(/^(?:una? |1 )?porcion (?:de )?/, '');
    if (/^(?:papas? (?:a la )?francesas?|arroz blanco|yuca(?: frita| cocida)?|patacon(?:es)?|arepas?(?: asadas?)?)$/.test(nombreSimple)
        || /^francesas?$/.test(nombreSimple) && /^(?:papas?|papas fritas|papas francesas)$/.test(categoria)) return '';
    return 'Añade ingredientes para preparar una foto fiel al plato.';
}

function crearVistaEleccionesCliente(opciones, prefijo) {
    const escapar = valor => String(valor ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const grupos = new Map();
    for (const o of Array.isArray(opciones) ? opciones : []) {
        if (!o || typeof o !== 'object' || String(o.grupo || '').startsWith('__') || !String(o.nombre || '').trim() || !String(o.grupo || '').trim()) continue;
        const grupo = o.grupo.trim();
        if (!grupos.has(grupo)) grupos.set(grupo,[]);
        grupos.get(grupo).push(o);
    }
    if (!grupos.size) return '<p class="text-xs text-slate-400">Añade opciones abajo para ver cómo las elegirá tu cliente.</p>';
    return `<div class="velox-elecciones-vista">${[...grupos].map(([grupo,lista],g)=>`<fieldset class="mb-3 last:mb-0"><legend class="mb-2 text-sm font-semibold">${/^(sabor|sabores|especialidad|especialidades)$/.test(normalizarTexto(grupo)) ? 'Elige un sabor' : 'Elige '+escapar(grupo.toLowerCase())}</legend>${lista.map((o,j)=>`<label class="mb-2 flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm"><input type="radio" name="${escapar(prefijo)}-grupo-${g}" value="${j}" class="mt-1 shrink-0 accent-red-600"><span class="min-w-0 break-words"><strong class="block">${escapar(o.nombre)}</strong>${o.descripcion ? `<small class="block text-xs text-slate-400">${escapar(o.descripcion)}</small>` : ''}</span></label>`).join('')}</fieldset>`).join('')}</div>`;
}

function crearVistaProductoCliente(producto, prefijo) {
    const validas = (Array.isArray(producto.opciones) ? producto.opciones : []).filter(o=>o && typeof o==='object' && String(o.grupo||'').trim() && String(o.nombre||'').trim() && !String(o.grupo).startsWith('__'));
    const muestra = !String(producto.nombre||'').trim() || !(Number(producto.precio)>0) || !validas.length;
    // Los valores de demostración se usan solo para renderizar; nunca modifican el producto.
    producto = {...producto,
      nombre: String(producto.nombre||'').trim() || 'Pizza personal',
      precio: Number(producto.precio)>0 ? producto.precio : 19000,
      descripcion: producto.descripcion || (muestra ? 'Pizza con queso y el sabor que elijas.' : ''),
      opciones: validas.length ? validas : [{grupo:'Sabor',nombre:'Hawaiana',descripcion:'Piña, jamón y queso'},{grupo:'Sabor',nombre:'Pollo',descripcion:'Pollo y queso'}]
    };
    const escapar = valor => String(valor ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const opciones = (Array.isArray(producto.opciones) ? producto.opciones : []).filter(o=>o && typeof o==='object' && o.grupo && o.nombre && !String(o.grupo).startsWith('__'));
    const grupos = [...new Set(opciones.map(o=>String(o.grupo).trim()))];
    const boton = grupos.length && grupos.every(g=>/^(sabor|sabores|especialidad|especialidades)$/.test(normalizarTexto(g))) ? 'Elegir sabores'
      : grupos.length===1 && /^(proteina|acompanamiento|bebida)$/.test(normalizarTexto(grupos[0])) ? 'Elegir '+grupos[0].toLowerCase() : 'Elegir opciones';
    let foto = '';
    try { const url = new URL(producto.imagen_url); if (['https:','http:','blob:'].includes(url.protocol)) foto=url.href; } catch {}
    const precio = Number(producto.precio);
    return `${muestra ? '<p class="velox-ejemplo-aviso">Ejemplo ilustrativo. Los datos de muestra no se guardan.</p>' : ''}<article class="velox-producto-ejemplo" aria-label="Ejemplo del producto en tu carta">
      <div class="velox-producto-ejemplo-foto">${foto ? `<img src="${escapar(foto)}" alt="${escapar(producto.nombre)}">` : '<span class="velox-ejemplo-foto-guia"><span aria-hidden="true">🍽️</span><small>Tu foto aquí</small></span>'}</div>
      <div class="velox-producto-ejemplo-datos"><h3>${escapar(producto.nombre || 'Nombre del producto')}</h3>
      ${producto.descripcion ? `<p>${escapar(producto.descripcion)}</p>` : ''}
      <strong class="velox-producto-ejemplo-precio">${Number.isFinite(precio) && precio>0 ? '$'+precio.toLocaleString('es-CO') : 'Precio pendiente'}</strong>
      ${producto.disponible===false ? '<span>Agotado</span>' : opciones.length ? `<details data-ejemplo-opciones><summary>${escapar(boton)}</summary><div class="velox-producto-ejemplo-opciones">${crearVistaEleccionesCliente(opciones,prefijo)}</div></details>` : '<button type="button" onclick="this.nextElementSibling.hidden=false">+ Agregar</button><small hidden role="status">Es una prueba. No se creó ningún pedido.</small>'}
      </div></article>`;
}

function actualizarEjemploProductoCliente(contenedor, producto, prefijo) {
    if (!contenedor) return;
    const abierto = contenedor.querySelector?.('[data-ejemplo-opciones]')?.open;
    contenedor.innerHTML = crearVistaProductoCliente(producto,prefijo);
    const opciones = contenedor.querySelector?.('[data-ejemplo-opciones]');
    if (opciones && abierto) opciones.open = true;
}

if (typeof module !== 'undefined') module.exports = { revisarDatosFotoMenu, crearVistaEleccionesCliente, crearVistaProductoCliente };
