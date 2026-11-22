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

function gruposParecidosCliente(opciones) {
    const nombres = [...new Set((opciones||[]).filter(o=>o && typeof o==='object' && !String(o.grupo||'').startsWith('__')).map(o=>String(o.grupo||'').trim()).filter(Boolean))];
    const distancia = (a,b) => { let fila=Array.from({length:b.length+1},(_,i)=>i); for(let i=1;i<=a.length;i++){const siguiente=[i];for(let j=1;j<=b.length;j++) siguiente[j]=Math.min(siguiente[j-1]+1,fila[j]+1,fila[j-1]+(a[i-1]===b[j-1]?0:1));fila=siguiente;} return fila[b.length]; };
    const pares=[];
    for(let i=0;i<nombres.length;i++) for(let j=i+1;j<nombres.length;j++) {
      const a=normalizarTexto(nombres[i]), b=normalizarTexto(nombres[j]);
      if(a===b || Math.min(a.length,b.length)>=5 && distancia(a,b)<=1) pares.push([nombres[i],nombres[j]]);
    }
    return pares;
}

function textoBotonVariantesCliente(grupos) {
    const nombres = [...new Set(grupos.map(g=>String(g||'').trim()).filter(Boolean))];
    if (nombres.length && nombres.every(g=>/^(sabor|sabores|especialidad|especialidades)$/.test(normalizarTexto(g)))) return 'Elegir sabores';
    if (nombres.length===1 && !/^(opcion|opciones|variante|variantes)$/.test(normalizarTexto(nombres[0]))) return 'Elegir '+nombres[0].toLocaleLowerCase('es');
    return 'Elegir opciones';
}

function datosEjemploProductoCliente(producto, prefijo) {
    const edicion=prefijo==='producto' || /^borrador-\d+$/.test(String(prefijo||''));
    const origen=Array.isArray(producto.opciones) ? producto.opciones : [];
    const validas=origen.filter(o=>o && typeof o==='object' && String(o.grupo||'').trim() && String(o.nombre||'').trim() && !String(o.grupo).startsWith('__'));
    const opciones=edicion
      ? origen.map(o=>typeof o==='string' ? {grupo:'Variante',nombre:o,descripcion:''} : o).filter(o=>o && typeof o==='object' && !String(o.grupo||'').startsWith('__'))
      : (validas.length ? validas : [{grupo:'Sabores',nombre:'Hawaiana',descripcion:'Piña, jamón y queso'},{grupo:'Sabores',nombre:'Pollo',descripcion:'Pollo y queso'}]);
    const muestra = !String(producto.nombre||'').trim() || !(Number(producto.precio)>0) || (!edicion && !validas.length);
    let foto=''; try {const url=new URL(producto.imagen_url);if(['https:','http:','blob:'].includes(url.protocol))foto=url.href;} catch {}
    return {muestra, producto:{...producto,
      nombre:String(producto.nombre||'').trim() || 'Pizza personal',
      precio:Number(producto.precio)>0 ? Number(producto.precio) : 19000,
      categoria:producto.categoria || 'Pizzas', disponible:true, imagen_url:foto,
      descripcion:edicion ? (producto.descripcion || '') : (producto.descripcion || (muestra ? 'Producto preparado al momento, con la opción que elijas.' : '')),
      opciones
    }};
}

let secuenciaEjemplosProductoCliente=0;
function crearVistaProductoCliente(producto, prefijo) {
    const datos=datosEjemploProductoCliente(producto,prefijo);
    const escapar = valor => String(valor ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const editor=prefijo==='producto' || /^borrador-\d+$/.test(String(prefijo||''));
    const id='velox-ejemplo-producto-'+(++secuenciaEjemplosProductoCliente);
    const src='/menu.html?vista=borrador&ejemplo=tarjeta'+(editor?'&editor=1':'')+'&v=personalizar-expandido';
    return `${datos.muestra && !editor ? '<p class="velox-ejemplo-aviso">Ejemplo ilustrativo. Los datos de muestra no se guardan.</p>' : ''}<iframe id="${id}" class="velox-ejemplo-carta-real" title="Ejemplo del producto en la carta real" src="${src}" data-editor-personalizacion="${editor ? 'true' : 'false'}" data-editor-context="${escapar(prefijo)}" data-ejemplo-producto="${escapar(JSON.stringify(datos.producto))}" onload="enviarEjemploCartaReal(this)"></iframe>`;
}

function enviarEjemploCartaReal(marco, abrir=false) {
    let producto;try {producto=JSON.parse(marco.dataset.ejemploProducto);}catch{return;}
    marco.contentWindow?.postMessage({tipo:'velox-borrador-carta',restaurante:'Ejemplo',productos:[producto],editable:false,ejemploProducto:true,abrirOpciones:abrir,editarPersonalizacion:marco.dataset.editorPersonalizacion==='true'},window.location.origin);
}

function actualizarEjemploProductoCliente(contenedor, producto, prefijo) {
    if(!contenedor) return;
    const marco=contenedor.querySelector?.('.velox-ejemplo-carta-real');
    if(!marco) {contenedor.innerHTML=crearVistaProductoCliente(producto,prefijo);return;}
    const datos=datosEjemploProductoCliente(producto,prefijo);
    marco.dataset.ejemploProducto=JSON.stringify(datos.producto);
    const aviso=contenedor.querySelector('.velox-ejemplo-aviso');
    if(aviso) aviso.hidden=!datos.muestra;
    enviarEjemploCartaReal(marco);
}

if(typeof window!=='undefined' && window.addEventListener) window.addEventListener('message',event=>{
    if(event.origin!==window.location.origin) return;
    const marco=[...document.querySelectorAll('.velox-ejemplo-carta-real')].find(f=>f.contentWindow===event.source);
    if(!marco)return;
    if(event.data?.tipo==='velox-ejemplo-altura' && !marco.closest('dialog[data-ejemplo-dialogo]')) {
      marco.style.height=Math.max(160,Math.min(900,Number(event.data.altura)||250))+'px';
    }
    if(event.data?.tipo==='velox-ejemplo-abrir') {
      const dialogo=document.createElement('dialog');dialogo.dataset.ejemploDialogo='';
      dialogo.className='velox-ejemplo-dialogo';
      if(!marco.id) marco.id='velox-ejemplo-producto-'+(++secuenciaEjemplosProductoCliente);
      const editor=marco.dataset.editorPersonalizacion==='true';
      const src='/menu.html?vista=borrador&ejemplo=opciones'+(editor?'&editor=1':'')+'&v=personalizar-expandido';
      dialogo.innerHTML='<iframe class="velox-ejemplo-carta-real" title="Editar grupos y opciones del producto" src="'+src+'"></iframe>';
      const panel=dialogo.querySelector('iframe');
      panel.dataset.ejemploProducto=marco.dataset.ejemploProducto;
      panel.dataset.editorPersonalizacion=editor?'true':'false';
      panel.dataset.editorContext=marco.dataset.editorContext || 'producto';
      panel.dataset.ejemploOrigen=marco.id;
      panel.onload=()=>enviarEjemploCartaReal(panel,true);
      dialogo.addEventListener('close',()=>{dialogo.remove();marco.focus();});
      document.body.appendChild(dialogo);dialogo.showModal();
    }
    if(event.data?.tipo==='velox-editar-opciones-producto' && marco.closest('dialog[data-ejemplo-dialogo]')) {
      const origen=document.getElementById(marco.dataset.ejemploOrigen);
      if(origen) {
        try {
          const producto=JSON.parse(origen.dataset.ejemploProducto);
          producto.opciones=Array.isArray(event.data.opciones)?event.data.opciones:[];
          origen.dataset.ejemploProducto=JSON.stringify(producto);
          enviarEjemploCartaReal(origen);
          window.dispatchEvent(new CustomEvent('velox-editar-opciones-producto',{detail:{opciones:producto.opciones,contexto:origen.dataset.editorContext || 'producto'}}));
        } catch {}
      }
    }
    if(event.data?.tipo==='velox-ejemplo-cerrar') marco.closest('dialog[data-ejemplo-dialogo]')?.close();
});

if (typeof module !== 'undefined') module.exports = { revisarDatosFotoMenu, crearVistaEleccionesCliente, crearVistaProductoCliente, textoBotonVariantesCliente, gruposParecidosCliente, datosEjemploProductoCliente };
