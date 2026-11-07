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
        if (objetivo?.closest('button, a, input, select, textarea, [role="dialog"]')) {
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
