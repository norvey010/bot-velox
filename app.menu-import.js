let borradorMenu = null;
const LOTE_REVISION_MENU = 6;
let categoriaRevisionMenu = '';
let limiteRevisionMenu = LOTE_REVISION_MENU;
let leyendoMenu = false;
let subiendoArchivosMenu = false;
let consultandoLecturaMenu = false;
let consultaLecturaMenu;
let guardadoBorradorMenu;
let publicandoMenu = false;
const ETAPAS_IMPORTACION = ['Preparando archivos', 'Leyendo con IA', 'Lista para revisar'];

function mostrarProgresoImportacion(etapa, interrumpida = false) {
  const progreso = document.getElementById('velox-progreso-importacion');
  progreso.hidden = etapa < 0;
  progreso.innerHTML = etapa < 0 ? '' : ETAPAS_IMPORTACION.map((texto, indice) => {
    const estado = indice < etapa || (indice === etapa && etapa === 2 && !interrumpida)
      ? 'listo' : indice > etapa ? 'pendiente' : interrumpida ? 'error' : 'actual';
    return `<li data-estado="${estado}"${indice === etapa ? ' aria-current="step"' : ''}>
      <span class="velox-numero-etapa" aria-hidden="true">${estado === 'listo' ? '✓' : indice + 1}</span>
      <span>${texto}${estado === 'error' ? ' · interrumpida' : ''}</span>
    </li>`;
  }).join('');
}

function estadoImportacion(mensaje, tipo='info') {
  mostrarAviso(document.getElementById('importacion-menu-status'), mensaje, tipo);
}

function mostrarLecturaArchivosMenu() {
  const estado = document.getElementById('importacion-menu-status');
  estadoImportacion('Leyendo archivos…');
  estado.innerHTML = `
    <span class="velox-lectura-titulo">Leyendo archivos…</span>
    <span class="velox-lectura-linea" aria-hidden="true"></span>
    <small class="velox-lectura-nota">Archivos recibidos. Puedes salir y volver.<br>Los cambios se aplican al publicar.</small>`;
}
function prepararSelectorArchivosMenu() {
  const boton = document.querySelector('#form-importar-ia button[aria-controls="menuFile"]');
  const opciones = document.createElement('div');
  opciones.id = 'menu-file-options';
  opciones.className = 'grid grid-cols-2 gap-2';
  opciones.setAttribute('role', 'group');
  opciones.setAttribute('aria-label', 'Elegir fotos o PDF de la carta');
  opciones.innerHTML = `
    <button type="button" onclick="abrirSelectorArchivosMenu(true)" aria-controls="menuFile" class="min-h-11 rounded-lg border border-slate-600 bg-slate-700 px-2 py-2 text-sm font-semibold text-white hover:border-red-400">Elegir fotos</button>
    <button type="button" onclick="abrirSelectorArchivosMenu(false)" aria-controls="menuFile" class="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-sm font-semibold text-white hover:border-red-400">Buscar en archivos</button>`;
  boton.replaceWith(opciones);
}
function abrirSelectorArchivosMenu(soloFotos) {
  const input = document.getElementById('menuFile');
  if (soloFotos) input.accept = 'image/*';
  else input.removeAttribute('accept');

  input.click();
}
function archivosSeleccionadosMenu() {
  return Array.from(document.getElementById('menuFile').files || []);
}
const urlsVistaPreviaMenu = [];
function renderizarVistaPreviaArchivosMenu() {
  for (const url of urlsVistaPreviaMenu) URL.revokeObjectURL(url);
  urlsVistaPreviaMenu.length = 0;

  const panel = document.getElementById('menu-file-preview');
  const lista = document.getElementById('menu-file-preview-list');
  lista.innerHTML = '';
  if (!panel.open || panel.hidden) return;

  lista.innerHTML = archivosSeleccionadosMenu().map((archivo, indice) => {
    const nombre = escaparHtmlUI(archivo.name || `Archivo ${indice + 1}`);
    const esFoto = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(archivo.type);
    const esPDF = archivo.type === 'application/pdf';
    let detalle = '';
    if (indice < 10 && (esFoto || esPDF) && archivo.size <= 8 * 1024 * 1024) {
      const url = URL.createObjectURL(archivo);
      urlsVistaPreviaMenu.push(url);
      detalle = esFoto
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="shrink-0"><img src="${url}" width="56" height="56" loading="lazy" alt="Abrir foto ${indice + 1}" class="h-14 w-14 rounded-md object-cover"></a>`
        : `<a href="${url}" target="_blank" rel="noopener noreferrer" class="shrink-0 text-red-300 underline">Abrir PDF</a>`;
    }
    return `<li class="flex items-center gap-3 rounded-lg border border-slate-700 p-2 text-xs text-white">${detalle}<span class="min-w-0 flex-1 break-all">${nombre}</span>
      <button type="button" data-quitar-archivo-menu onclick="quitarArchivoMenu(${indice})" aria-label="Quitar archivo ${indice + 1}: ${nombre}" class="min-h-11 min-w-11 shrink-0 rounded-md text-lg font-semibold text-red-300 hover:bg-slate-700"><span aria-hidden="true">×</span></button></li>`;
  }).join('');
}

function quitarArchivoMenu(indice) {
  const archivos = archivosSeleccionadosMenu();
  if (!archivos[indice]) return;
  const input = document.getElementById('menuFile');
  if (archivos.length === 1) {
    input.value = '';
  } else {
    const seleccion = new DataTransfer();
    archivos.forEach((archivo, posicion) => {
      if (posicion !== indice) seleccion.items.add(archivo);
    });
    input.files = seleccion.files;
  }
  actualizarResumenFotosMenu();

  const restantes = document.querySelectorAll('#menu-file-preview-list [data-quitar-archivo-menu]');
  const siguiente = restantes[Math.min(indice, restantes.length - 1)]
    || document.querySelector('#menu-file-options button');
  siguiente?.focus({ preventScroll: true });
}

function actualizarResumenFotosMenu() {
  const cantidad = archivosSeleccionadosMenu().length;
  const resumen = document.getElementById('menu-file-summary');
  const panel = document.getElementById('menu-file-preview');
  resumen.textContent = cantidad === 0 ? '' : cantidad === 1
    ? '1 archivo seleccionado'
    : `${cantidad} archivos seleccionados`;
  panel.hidden = cantidad === 0;
  if (panel.hidden) panel.open = false;
  renderizarVistaPreviaArchivosMenu();
}
function mensajeErrorImportacion(error, accion='lectura') {
  const mensaje=String(error?.message || '');
  const falloRed=/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(mensaje);
  if(falloRed) {
    if(accion==='publicacion') return 'No pudimos confirmar la publicación. Revisa tu carta antes de reintentar.';
    if(accion==='sesion') return 'No pudimos validar tu sesión por un problema de conexión. Vuelve a intentarlo.';
    return 'Se interrumpió la conexión al leer el archivo. Tu carta actual no cambió.';
  }
  return mensaje || (accion==='publicacion' ? 'No se pudo confirmar la publicación. Revisa tu carta.' : 'No se pudo leer el archivo. Tu carta actual no cambió.');
}
async function sesionImportacion() {
  try {
    const {data:{session},error}=await supabaseClient.auth.getSession();
    if(error) throw error;
    if(!session?.access_token) throw new Error('Tu sesión venció. Inicia sesión de nuevo.');
    return session.access_token;
  } catch(error) { throw new Error(mensajeErrorImportacion(error,'sesion')); }
}
async function leerArchivosLocalesMenu(files) {
  const preparados=[];
  for(const [indice,file] of files.entries()) {
    let limite;
    try {
      const bytes=await Promise.race([
        file.arrayBuffer(),
        new Promise((_,rechazar)=>{limite=setTimeout(()=>rechazar(new Error('Lectura local agotada')),15000);})
      ]);
      if(bytes.byteLength!==file.size || bytes.byteLength>8*1024*1024) throw new Error('El archivo cambió');
      // El envío usa una copia estable: no depende del acceso temporal del selector del teléfono.
      preparados.push({blob:new Blob([bytes],{type:file.type}),nombre:file.name || `carta-${indice+1}${file.type==='application/pdf'?'.pdf':'.jpg'}`});
    } catch {
      throw new Error('No pudimos leer el archivo en tu dispositivo. Vuelve a seleccionarlo desde Archivos o Descargas.');
    } finally { clearTimeout(limite); }
  }
  return preparados;
}
function indicarLecturaMenu(activa) {
  leyendoMenu = activa;
  const boton = document.getElementById('btn-procesar-ia');
  boton.disabled = activa;
  boton.textContent = activa ? 'Leyendo archivos…' : 'Leer con IA';
}

function guardarEdicionBorradorMenu() {
  clearTimeout(guardadoBorradorMenu);
  if (!borradorMenu?.lectura_id) return;
  try {
    localStorage.setItem(`velox-borrador-menu:${borradorMenu.restaurante_id}`, JSON.stringify(borradorMenu));
  } catch { /* La lectura original sigue disponible en el servidor. */ }
}

function olvidarBorradorMenu() {
  clearTimeout(guardadoBorradorMenu);
  if (borradorMenu?.lectura_id) {
    try { localStorage.removeItem(`velox-borrador-menu:${borradorMenu.restaurante_id}`); } catch {}
  }
  borradorMenu = null;
  document.getElementById('cargar-carta-ayuda').textContent = 'Fotos o PDF';
  document.getElementById('revision-menu').hidden = true;
}

function mostrarBorradorMenu(resultado, lecturaId, desplazar = false) {
  borradorMenu = { restaurante_id: RESTAURANTE_ID, version: resultado.version, productos: resultado.productos };
  if (lecturaId) {
    borradorMenu.lectura_id = lecturaId;
    try {
      const guardado = JSON.parse(localStorage.getItem(`velox-borrador-menu:${RESTAURANTE_ID}`) || 'null');
      if (guardado?.lectura_id === lecturaId && guardado.version === resultado.version && Array.isArray(guardado.productos)) {
        borradorMenu.productos = guardado.productos;
      }
    } catch {}
  }
  categoriaRevisionMenu = '';
  limiteRevisionMenu = LOTE_REVISION_MENU;
  document.getElementById('buscar-revision-menu').value = '';
  document.getElementById('cargar-carta-ayuda').textContent = 'Borrador listo para revisar';
  document.getElementById('revision-menu').hidden = false;
  renderizarRevisionMenu();
  mostrarProgresoImportacion(2);
  estadoImportacion(`${borradorMenu.productos.length} productos en el borrador. Revisa y publica.`, 'exito');
  if (desplazar) document.getElementById('revision-menu').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function programarConsultaLecturaMenu() {
  clearTimeout(consultaLecturaMenu);
  if (!document.hidden) consultaLecturaMenu = setTimeout(recuperarLecturaMenu, 4000);
}

function aplicarEstadoLecturaMenu(lectura) {
  if (lectura.estado === 'procesando') {
    document.getElementById('cargar-carta-ayuda').textContent = 'Lectura en curso';
    indicarLecturaMenu(true);
    mostrarProgresoImportacion(1);
    mostrarLecturaArchivosMenu();
    programarConsultaLecturaMenu();
    return;
  }
  indicarLecturaMenu(false);
  if (lectura.estado === 'listo') {
    mostrarBorradorMenu(lectura.resultado, lectura.id);
  } else {
    document.getElementById('cargar-carta-ayuda').textContent = 'Revisar lectura';
    mostrarProgresoImportacion(1, true);
    estadoImportacion(lectura.mensaje || 'La lectura se interrumpió. Tu carta publicada sigue igual.', 'error');
  }
}

async function recuperarLecturaMenu() {
  if (!RESTAURANTE_ID || subiendoArchivosMenu || publicandoMenu || borradorMenu || consultandoLecturaMenu) return false;
  consultandoLecturaMenu = true;
  clearTimeout(consultaLecturaMenu);
  try {
    const token = await sesionImportacion();
    const respuesta = await fetch(`/api/lectura-menu/${encodeURIComponent(RESTAURANTE_ID)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!respuesta.ok) throw new Error('No se pudo consultar la lectura.');
    const { lectura } = await respuesta.json();
    if (!lectura) {
      if (leyendoMenu) {
        indicarLecturaMenu(false);
        document.getElementById('cargar-carta-ayuda').textContent = 'Fotos o PDF';
        mostrarProgresoImportacion(-1);
        estadoImportacion('Ya no hay una lectura activa. Puedes volver a subir los archivos.');
      }
      return false;
    }
    aplicarEstadoLecturaMenu(lectura);
    return true;
  } catch {
    if (leyendoMenu) programarConsultaLecturaMenu();
    return false;
  } finally {
    consultandoLecturaMenu = false;
  }
}

async function enviarMenuConIA(event) {
  event.preventDefault();
  if (leyendoMenu || publicandoMenu || consultandoLecturaMenu) return;
  if (borradorMenu?.lectura_id) {
    estadoImportacion('Publica o descarta el borrador antes de leer otra carta.', 'info');
    return;
  }
  const files=archivosSeleccionadosMenu();
  const tipos=['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
  if(!files.length || files.length>10) { estadoImportacion('Selecciona entre 1 y 10 fotos o PDF.','error');return; }
  if(files.some(f=>f.size>8*1024*1024 || !tipos.includes(f.type))) { estadoImportacion('Usa JPG, PNG, WEBP, GIF o PDF, de máximo 8 MB cada uno.','error');return; }
  if(files.reduce((n,f)=>n+f.size,0)>25*1024*1024) { estadoImportacion('Los archivos juntos deben pesar máximo 25 MB.','error');return; }
  if(!RESTAURANTE_ID) { estadoImportacion('Espera a que termine de cargar tu restaurante.','error');return; }
  subiendoArchivosMenu = true;
  indicarLecturaMenu(true);
  document.getElementById('btn-procesar-ia').textContent = 'Subiendo archivos…';
  mostrarProgresoImportacion(0);
  estadoImportacion('Preparando archivos…');
  try {
    const archivos=await leerArchivosLocalesMenu(files);
    const token=await sesionImportacion();
    const formData=new FormData();
    for(const archivo of archivos) formData.append('menuFile',archivo.blob,archivo.nombre);
    formData.set('restaurante_id',RESTAURANTE_ID);
    estadoImportacion('Subiendo archivos… Mantén el panel abierto hasta confirmar la recepción.');
    const referencia=typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
    const respuesta=await fetch('/api/importar-menu',{method:'POST',headers:{Authorization:`Bearer ${token}`, 'X-Velox-Background': '1', ...(referencia ? {'X-Velox-Request-Id':referencia} : {})},body:formData});
    if ([502, 503, 504].includes(respuesta.status)) throw new Error('No pudimos confirmar la recepción. Tu carta publicada sigue igual.');
    const resultado = await respuesta.json().catch(() => ({}));
    if (resultado.lectura && (respuesta.ok || respuesta.status === 409)) {
      aplicarEstadoLecturaMenu(resultado.lectura);
      return;
    }
    if (!respuesta.ok || !resultado.success || !resultado.borrador || !Array.isArray(resultado.productos)) {
      throw new Error(resultado.error || 'No se pudo leer la carta. La carta publicada se conserva.');
    }
    // Permite que el panel anterior y el nuevo servidor convivan durante el despliegue.
    indicarLecturaMenu(false);
    mostrarBorradorMenu(resultado, null, true);
  } catch (error) {
    mostrarProgresoImportacion(0, true);
    estadoImportacion(mensajeErrorImportacion(error), 'error');
    indicarLecturaMenu(false);
  } finally {
    subiendoArchivosMenu = false;
  }
}
function categoriaProductoBorrador(producto) {
  return producto.categoria.trim() ? resolverCategoriaCombo(producto) : 'Sin categoría';
}

function precioProductoBorrador(producto) {
  return Number(producto.precio) > 0 ? '$' + formatearPrecioCOP(producto.precio) : 'Precio pendiente';
}

function renderizarRevisionMenu(indiceAbierto = -1) {
  if(!borradorMenu) return;
  const productos=borradorMenu.productos;
  const filas = productos.map((producto, i) => ({producto, i, categoria: categoriaProductoBorrador(producto)}));
  const categorias = [...new Set(filas.map(fila => fila.categoria))];
  if (!categorias.includes(categoriaRevisionMenu)) categoriaRevisionMenu = categorias[0] || '';
  const barra = document.getElementById('revision-menu-categorias');
  const busqueda = normalizarTexto(document.getElementById('buscar-revision-menu').value.trim());
  const visibles = filas.filter(({producto, categoria}) => busqueda
    ? coincideBusquedaProducto(normalizarTexto(`${producto.nombre} ${producto.categoria} ${categoria}`), busqueda)
    : categoria === categoriaRevisionMenu
  ).sort((a, b) => compararPreciosMenu(a.producto, b.producto));
  limiteRevisionMenu = Math.max(limiteRevisionMenu, visibles.findIndex(({i}) => i === indiceAbierto) + 1);
  const posicion = barra.scrollLeft;
  barra.innerHTML = categorias.map(categoria => `<button type="button" data-categoria-revision="${escaparHtmlUI(categoria)}" aria-pressed="${!busqueda && categoria === categoriaRevisionMenu}" class="min-h-11 shrink-0 rounded-xl border px-3.5 py-2 text-sm font-semibold text-slate-200">${escaparHtmlUI(categoria)}</button>`).join('');
  barra.scrollLeft = posicion;
  barra.hidden = !categorias.length;
  const pendientes = productos.filter(producto => producto.revision_opciones).length;
  document.getElementById('revision-menu-resumen').textContent = `${productos.length} productos en el borrador · Mostrando ${Math.min(limiteRevisionMenu, visibles.length)} de ${visibles.length}${pendientes ? ` · ${pendientes} con opciones por revisar` : ''}`;
  document.getElementById('revision-siguiente').hidden = limiteRevisionMenu >= visibles.length;
  document.getElementById('btn-publicar-menu').disabled=!productos.length || publicandoMenu;
  document.getElementById('revision-menu-lista').innerHTML=visibles.slice(0, limiteRevisionMenu).map(({producto: p, i, categoria})=>{
    const campo=(key,label,valor,extra='')=>`<label class="block text-xs text-slate-300">${label}<input ${extra} value="${escaparHtmlUI(valor)}" oninput="editarDatoBorrador(${i}, '${key}', this.value)" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white"></label>`;
    const opciones=(p.opciones||[]).map((o,j)=>o.grupo==='__velox_combo_family__'?'':`<div class="grid gap-2 rounded-lg border border-slate-700 p-2">${['grupo','nombre','descripcion'].map(key=>`<label class="text-xs text-slate-300">${({grupo:'Grupo',nombre:'Opción',descripcion:'Descripción'})[key]}<input value="${escaparHtmlUI(o[key]||'')}" oninput="editarDatoBorrador(${i}, '${key}', this.value, ${j})" maxlength="${key==='descripcion'?5000:key==='grupo'?120:200}" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white"></label>`).join('')}<button type="button" onclick="cambiarOpcionesBorrador(${i}, ${j})" class="min-h-11 justify-self-start text-xs text-red-300">Quitar opción</button></div>`).join('');
    return `<article class="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <details id="revision-producto-${i}" name="producto-borrador"${i === indiceAbierto ? ' open' : ''}>
        <summary class="flex min-h-11 cursor-pointer items-center justify-between gap-3">
          <span class="min-w-0">
            <strong id="revision-nombre-${i}" class="block break-words text-sm font-bold text-white">${escaparHtmlUI(p.nombre || 'Producto sin nombre')}</strong>
            <span id="revision-precio-${i}" class="block text-sm font-bold text-slate-200">${escaparHtmlUI(precioProductoBorrador(p))}</span>
            ${p.revision_opciones ? '<span class="block text-xs font-semibold text-amber-300">Revisar opciones</span>' : ''}
            <span id="revision-categoria-${i}" class="block break-words text-xs text-slate-400">${escaparHtmlUI(categoria)}</span>
          </span>
          <span class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white">${iconoVelox('editar')} Editar</span>
        </summary>
        <div class="mt-3 space-y-2 border-t border-slate-700 pt-3">
          <div class="grid gap-3 sm:grid-cols-2">${campo('nombre','Nombre',p.nombre,'maxlength="200"')}${campo('categoria','Categoría',p.categoria,'maxlength="120"')}${campo('precio','Precio en pesos (COP)',formatearPrecioCOP(p.precio),'inputmode="numeric"')}
            <label class="block text-xs text-slate-300">Descripción e ingredientes<textarea maxlength="5000" oninput="editarDatoBorrador(${i}, 'descripcion', this.value)" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white" rows="3">${escaparHtmlUI(p.descripcion||'')}</textarea></label>
          </div>
          <details id="revision-opciones-${i}"${p.revision_opciones ? ' open' : ''}>
            <summary class="cursor-pointer py-2 text-sm text-slate-200">Opciones del pedido</summary>
            ${p.revision_opciones ? '<p class="mb-2 text-xs text-amber-300">Compara con la descripción. Agrega las opciones de precio fijo que se eligen de una en una. Si hay precios distintos, revisa si deben ser productos separados.</p>' : ''}
            <div class="space-y-2">${opciones}</div>
            <button type="button" onclick="cambiarOpcionesBorrador(${i})" class="min-h-11 px-2 text-xs text-white">+ Agregar opción</button>
            ${p.revision_opciones ? `<button type="button" onclick="confirmarOpcionesBorrador(${i})" class="min-h-11 px-2 text-xs text-emerald-300">Confirmar revisión</button>` : ''}
          </details>
          <button type="button" onclick="quitarProductoBorrador(${i})" class="min-h-11 px-2 text-xs text-red-300">Quitar de esta carga</button>
        </div>
      </details>
    </article>`;
  }).join('') || (productos.length
    ? '<p class="text-sm text-slate-300">No encontramos ese producto.</p>'
    : '<p class="text-sm text-slate-300">Quitaste todos los productos. Puedes descartar la lectura o subir otros archivos.</p>');
}
function cambiarOpcionesBorrador(indice, opcion) {
  const producto = borradorMenu?.productos[indice];
  if (publicandoMenu || !producto) return;
  producto.opciones ??= [];
  if (opcion === undefined) producto.opciones.push({ grupo: '', nombre: '', descripcion: '' });
  else if (producto.opciones[opcion]?.grupo !== '__velox_combo_family__') producto.opciones.splice(opcion, 1);
  guardarEdicionBorradorMenu();
  renderizarRevisionMenu(indice);
  document.getElementById(`revision-opciones-${indice}`).open = true;
}

function opcionesBorradorIncompletas(producto) {
  return (producto.opciones || []).some(opcion => !opcion.grupo.trim() || !opcion.nombre.trim());
}

function confirmarOpcionesBorrador(indice) {
  const producto = borradorMenu?.productos[indice];
  if (publicandoMenu || !producto) return;
  if (opcionesBorradorIncompletas(producto)) {
    estadoImportacion('Completa el grupo y el nombre de cada opción o quita la fila vacía.', 'error');
    return;
  }
  producto.revision_opciones = false;
  guardarEdicionBorradorMenu();
  renderizarRevisionMenu(indice);
  estadoImportacion('Opciones revisadas.', 'exito');
}

function editarDatoBorrador(i,key,value,opcion) {
  if(publicandoMenu || !borradorMenu?.productos[i]) return;
  if(opcion!==undefined) {
    if(['grupo','nombre','descripcion'].includes(key) && borradorMenu.productos[i].opciones[opcion]) borradorMenu.productos[i].opciones[opcion][key]=value;
  } else if(['nombre','categoria','precio','descripcion'].includes(key)) {
    const producto = borradorMenu.productos[i];
    producto[key] = key === 'precio' ? Number(value.replace(/\D/g,'')) : value;
    const resumen = document.getElementById(`revision-${key}-${i}`);
    if (resumen) resumen.textContent = key === 'precio' ? precioProductoBorrador(producto)
      : key === 'categoria' ? categoriaProductoBorrador(producto) : value || 'Producto sin nombre';
  }
  if (borradorMenu.lectura_id) {
    clearTimeout(guardadoBorradorMenu);
    guardadoBorradorMenu = setTimeout(guardarEdicionBorradorMenu, 350);
  }
}

function prepararNavegacionRevisionMenu() {
  const lista = document.getElementById('revision-menu-lista');
  lista.className = 'grid items-start grid-cols-1 gap-2 lg:grid-cols-2';
  lista.insertAdjacentHTML('beforebegin', `
    <nav id="revision-menu-categorias" aria-label="Categorías del borrador" class="flex w-full gap-2 overflow-x-auto whitespace-nowrap p-1"></nav>
    <label for="buscar-revision-menu" class="sr-only">Buscar en el borrador</label>
    <input id="buscar-revision-menu" type="search" placeholder="Buscar producto en el borrador" class="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white">`);
  const buscar = document.getElementById('buscar-revision-menu');
  const barra = document.getElementById('revision-menu-categorias');
  buscar.addEventListener('input', () => {
    limiteRevisionMenu = LOTE_REVISION_MENU;
    renderizarRevisionMenu();
  });
  barra.addEventListener('click', event => {
    const boton = event.target.closest('[data-categoria-revision]');
    if (!boton) return;
    categoriaRevisionMenu = boton.dataset.categoriaRevision;
    buscar.value = '';
    limiteRevisionMenu = LOTE_REVISION_MENU;
    renderizarRevisionMenu();
    barra.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
  });
  document.getElementById('revision-anterior').remove();
  const mas = document.getElementById('revision-siguiente');
  mas.textContent = 'Mostrar más';
  mas.removeAttribute('onclick');
  mas.addEventListener('click', () => {
    const abierto = lista.querySelector('details[name="producto-borrador"][open]');
    limiteRevisionMenu += LOTE_REVISION_MENU;
    renderizarRevisionMenu(abierto ? Number(abierto.id.replace('revision-producto-', '')) : -1);
  });
}
function quitarProductoBorrador(i) {
  if (!borradorMenu || publicandoMenu) return;
  borradorMenu.productos.splice(i, 1);
  guardarEdicionBorradorMenu();
  renderizarRevisionMenu();
}

async function descartarRevisionMenu() {
  if (!borradorMenu || publicandoMenu || leyendoMenu) return;
  if (borradorMenu.lectura_id) {
    publicandoMenu = true;
    const revision = document.getElementById('revision-menu');
    revision.setAttribute('inert', '');
    try {
      const token = await sesionImportacion();
      const respuesta = await fetch(`/api/lectura-menu/${encodeURIComponent(RESTAURANTE_ID)}/${encodeURIComponent(borradorMenu.lectura_id)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error('No se pudo descartar el borrador.');
    } catch {
      estadoImportacion('No se pudo descartar el borrador. Intenta de nuevo.', 'error');
      return;
    } finally {
      publicandoMenu = false;
      revision.removeAttribute('inert');
    }
  }
  olvidarBorradorMenu();
  mostrarProgresoImportacion(-1);
  estadoImportacion('Lectura descartada. Tu carta publicada sigue igual.');
}

async function publicarMenuRevisado(event) {
  event.preventDefault();
  if(!borradorMenu || publicandoMenu || leyendoMenu)return;
  const invalido = borradorMenu.productos.findIndex(p => p.revision_opciones || opcionesBorradorIncompletas(p)
    || !p.nombre.trim() || !p.categoria.trim() || !Number.isSafeInteger(Number(p.precio)) || Number(p.precio) <= 0 || Number(p.precio) > 100000000);
  if (invalido >= 0) {
    const producto = borradorMenu.productos[invalido];
    categoriaRevisionMenu = categoriaProductoBorrador(borradorMenu.productos[invalido]);
    document.getElementById('buscar-revision-menu').value = '';
    limiteRevisionMenu = LOTE_REVISION_MENU;
    renderizarRevisionMenu(invalido);
    document.getElementById(`revision-producto-${invalido}`)?.scrollIntoView({block:'center'});
    if (producto.revision_opciones || opcionesBorradorIncompletas(producto)) {
      document.getElementById(`revision-opciones-${invalido}`).open = true;
      estadoImportacion(`Revisa las opciones de «${producto.nombre}» antes de publicar.`, 'error');
    } else {
      estadoImportacion(`Revisa nombre, categoría y precio del producto ${invalido + 1}.`, 'error');
    }
    return;
  }
  publicandoMenu=true;
  const boton=document.getElementById('btn-publicar-menu');boton.disabled=true;boton.textContent='Publicando…';
  document.getElementById('revision-menu').setAttribute('inert','');
  try {
    const token=await sesionImportacion();
    const respuesta=await fetch('/api/publicar-menu',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(borradorMenu)});
    const resultado=await respuesta.json().catch(()=>({}));
    if(!respuesta.ok || !resultado.success)throw new Error(resultado.error || 'No se pudo publicar. Revisa tu carta publicada antes de reintentar.');
    olvidarBorradorMenu();
    document.getElementById('form-importar-ia').reset();actualizarResumenFotosMenu();
    mostrarProgresoImportacion(-1);
    await cargarProductos();estadoImportacion(`Carta publicada: ${resultado.count} productos.`,'exito');
  } catch(error) {estadoImportacion(mensajeErrorImportacion(error,'publicacion'),'error');}
  finally {publicandoMenu=false;document.getElementById('revision-menu').removeAttribute('inert');boton.disabled=false;boton.textContent='Publicar carta';}
}
prepararSelectorArchivosMenu();
prepararNavegacionRevisionMenu();
document.getElementById('menuFile').addEventListener('change',actualizarResumenFotosMenu);
document.getElementById('menu-file-preview').addEventListener('toggle',renderizarVistaPreviaArchivosMenu);

const editorMenu = document.getElementById('editar-menu');
const barraCategoriasEditor = document.getElementById('productos-editor-categorias');
const etiquetaBuscadorEditor = editorMenu.querySelector('label[for="buscar-producto"]');
const botonAgregarProducto = editorMenu.querySelector('button[onclick="nuevoProducto()"]');
barraCategoriasEditor.after(etiquetaBuscadorEditor, document.getElementById('buscar-producto'));
document.getElementById('productos-editor-mas').after(botonAgregarProducto.parentElement);

const ICONOS_VELOX = {
  carta: 'M5 3h11l3 3v15H5z M8 9h8m-8 4h8m-8 4h5',
  pedido: 'M12 3l9 5v8l-9 5-9-5V8z M3 8l9 5 9-5m-9 5v8M7.5 5.5l9 5',
  ajustes: 'M4 6h6m4 0h6M4 12h11m4 0h1M4 18h2m4 0h10M10 4h4v4h-4z M15 10h4v4h-4z M6 16h4v4H6z',
  editar: 'M4 16 16 4l4 4L8 20H4z m10-10 4 4M12 20h8',
  escanear: 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M3 12h18m-12-3 3-3 3 3m-6 6 3 3 3-3',
  negocio: 'M3 9l3-5h12l3 5v3H3z M5 12v8h14v-8m-9 8v-5h4v5',
  imprimir: 'M7 8V4h10v4M6 17H3V9h18v8h-3M7 14h10v6H7z m10-2h1',
  telefono: 'M7 3h8l2 2v16H7z m4 15h2',
  reloj: 'M12 3l7 3 2 6-2 6-7 3-7-3-2-6 2-6z m0 4v5l3 2',
  agregar: 'M12 5v14M5 12h14'
};

function iconoVelox(nombre) {
  return `<svg class="velox-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="square" stroke-linejoin="bevel" aria-hidden="true" focusable="false"><path d="${ICONOS_VELOX[nombre]}"/></svg>`;
}

function aplicarIconosVelox(raiz, controles) {
  for (const [selector, nombre, simbolo] of controles) {
    for (const elemento of raiz.querySelectorAll(selector)) {
      if (elemento.firstElementChild?.classList.contains('velox-icono')) continue;
      const texto = [...elemento.childNodes].find(nodo => nodo.nodeType === 3 && nodo.nodeValue.trimStart().startsWith(simbolo));
      if (!texto) continue;
      texto.nodeValue = texto.nodeValue.trimStart().slice(simbolo.length).trimStart();
      elemento.insertAdjacentHTML('afterbegin', iconoVelox(nombre) + ' ');
      elemento.classList.add('velox-con-icono');
    }
  }
}

function prepararCentroVelox() {
  document.getElementById('nombre-restaurante-header').previousSibling.nodeValue = 'Velox Bot ';
  document.querySelector('header nav').setAttribute('aria-label', 'Secciones de Velox Bot');
  document.querySelector('#ajustes-inicio h2 + p').textContent = 'Administra tu negocio y la operación de Velox Bot.';
  document.querySelector('#printer-width-preview > div:first-child').textContent = 'Velox Bot · Comanda';

  const progreso = document.createElement('ol');
  progreso.id = 'velox-progreso-importacion';
  progreso.setAttribute('aria-label', 'Progreso de carga de la carta');
  progreso.hidden = true;
  document.getElementById('importacion-menu-status').before(progreso);

  const controles = [
    ['#tab-menu', 'carta', '🍽️'], ['#tab-pedidos', 'pedido', '📦'],
    ['#tab-configuracion, #ajustes-inicio h2', 'ajustes', '⚙️'],
    ['#editar-menu-acceso-titulo, #productos-body button[onclick^="prepararEdicionProducto"]', 'editar', '✏️'],
    ['#cargar-carta-titulo, #btn-foto-ia-editor', 'escanear', '✨'],
    ['#ajustes-inicio button > span:first-child, #ajustes-opciones button > span:first-child', 'negocio', '🏪'],
    ['#ajustes-opciones button > span:first-child', 'telefono', '📲'],
    ['#ajustes-opciones button > span:first-child', 'reloj', '🕒'],
    ['#ajustes-inicio button > span:first-child, #ajustes-opciones button > span:first-child', 'imprimir', '🧾'],
    ['[data-print-order]', 'imprimir', '🖨️'],
    ['#editar-menu button[onclick="nuevoProducto()"] > span', 'agregar', '＋']
  ];
  aplicarIconosVelox(document, controles);
  const iconosDinamicos = new MutationObserver(() => aplicarIconosVelox(document, controles));
  for (const id of ['cargar-carta-titulo', 'btn-foto-ia-editor', 'productos-body', 'pedidos-body', 'pedidos-cards', 'ajustes-opciones']) {
    iconosDinamicos.observe(document.getElementById(id), { childList: true });
  }
}

window.addEventListener('DOMContentLoaded', prepararCentroVelox, { once: true });
window.addEventListener('pagehide', guardarEdicionBorradorMenu);
window.addEventListener('beforeunload', event => {
  if (subiendoArchivosMenu || (borradorMenu && !borradorMenu.lectura_id)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !document.getElementById('sec-menu-ia').classList.contains('hidden')) recuperarLecturaMenu();
});
window.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('sec-menu-ia').classList.contains('hidden')) recuperarLecturaMenu();
}, { once: true });
