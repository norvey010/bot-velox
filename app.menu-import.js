let borradorMenu = null;
let leyendoMenu = false;
let subiendoArchivosMenu = false;
let consultandoLecturaMenu = false;
let consultaLecturaMenu;
let guardadoBorradorMenu;
let publicandoMenu = false;
function estadoImportacion(mensaje, tipo='info') {
  mostrarAviso(document.getElementById('importacion-menu-status'), mensaje, tipo);
  if (tipo === 'error' && document.getElementById('revision-carta-ampliada').open) {
    mostrarAviso(document.getElementById('revision-accion-status'), mensaje, tipo);
  }
}

function mostrarLecturaArchivosMenu(mensaje = 'Leyendo tu menú…', subiendo = false) {
  const estado = document.getElementById('importacion-menu-status');
  const fotos = mensaje.match(/(?:Preparando imágenes|Creando fotos)[,:]?\s*(\d+) de (\d+)/i);
  const titulo = fotos ? `Creando fotos: ${fotos[1]} de ${fotos[2]}`
    : /Leyendo (?:páginas|archivos)/i.test(mensaje) ? 'Leyendo tu menú…' : mensaje;
  estadoImportacion(titulo);
  estado.innerHTML = `
    <span class="velox-lectura-titulo">${escaparHtmlUI(titulo)}</span>
    <span class="velox-lectura-linea" aria-hidden="true"></span>
    <small class="velox-lectura-nota">${subiendo ? 'Mantén esta pantalla abierta hasta terminar el envío.' : 'Tu carta cambia solo al publicar.'}</small>`;
}
function prepararSelectorArchivosMenu() {
  const boton = document.querySelector('#form-importar-ia button[aria-controls="menuFile"]');
  const opciones = document.createElement('div');
  opciones.id = 'menu-file-options';
  opciones.className = 'grid grid-cols-2 gap-2';
  opciones.setAttribute('role', 'group');
  opciones.setAttribute('aria-label', 'Elegir fotos o PDF de la carta');
  opciones.innerHTML = `
    <button type="button" onclick="abrirSelectorArchivosMenu(true)" aria-controls="menuFile" class="min-h-11 rounded-lg border border-slate-600 bg-slate-700 px-2 py-2 text-sm font-semibold text-white hover:border-red-400">Subir fotos</button>
    <button type="button" onclick="abrirSelectorArchivosMenu(false)" aria-controls="menuFile" class="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-sm font-semibold text-white hover:border-red-400">Subir PDF o archivo</button>`;
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
const AVISO_CANTIDAD_ARCHIVOS_MENU = 'Selecciona entre 1 y 10 fotos o PDF.';
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

function actualizarResumenFotosMenu(abrirVistaPrevia = false) {
  const cantidad = archivosSeleccionadosMenu().length;
  const resumen = document.getElementById('menu-file-summary');
  const panel = document.getElementById('menu-file-preview');
  resumen.textContent = cantidad === 0 ? '' : cantidad === 1
    ? '1 archivo seleccionado'
    : `${cantidad} archivos seleccionados`;
  panel.hidden = cantidad === 0;
  if (panel.hidden) panel.open = false;

  const aviso = document.getElementById('importacion-menu-status');
  if (cantidad >= 1 && cantidad <= 10 && aviso.textContent === AVISO_CANTIDAD_ARCHIVOS_MENU) {
    aviso.classList.add('hidden');
    aviso.textContent = '';
  }

  if (abrirVistaPrevia && cantidad > 0 && !panel.open) {
    panel.open = true; // El evento toggle carga las miniaturas al abrir.
  } else {
    renderizarVistaPreviaArchivosMenu();
  }
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
async function conPlazoLecturaMenu(accion, plazo, mensaje) {
  const controlador = new AbortController();
  let temporizador;
  try {
    return await Promise.race([
      Promise.resolve().then(() => accion(controlador.signal)),
      new Promise((_, rechazar) => {
        temporizador = setTimeout(() => {
          controlador.abort();
          rechazar(new Error(mensaje));
        }, plazo);
      })
    ]);
  } finally {
    clearTimeout(temporizador);
  }
}

async function sesionImportacion() {
  try {
    const {data:{session},error}=await conPlazoLecturaMenu(() => supabaseClient.auth.getSession(), 15000, 'No pudimos validar tu sesión. Revisa tu conexión e inténtalo de nuevo.');
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
  boton.hidden = activa;
  boton.textContent = 'Generar carta con IA';
}

function guardarEdicionBorradorMenu() {
  clearTimeout(guardadoBorradorMenu);
  if (!borradorMenu?.lectura_id) return;
  try {
    localStorage.setItem(`velox-borrador-menu:${borradorMenu.restaurante_id}`, JSON.stringify(borradorMenu));
  } catch { /* La lectura original sigue disponible en el servidor. */ }
}

const RUTA_PREVIA_BORRADOR = '/menu.html?vista=borrador&v=carta-organizada';
const fotosBorradorMenu = new Map();
let generandoFotoBorradorMenu = false;
let completandoFotosMenu = false;
function liberarFotoBorradorMenu(producto) {
  const foto = fotosBorradorMenu.get(producto);
  if (!foto) return;
  URL.revokeObjectURL(foto.previa);
  fotosBorradorMenu.delete(producto);
}

function seleccionarFotoBorradorMenu(i, archivo) {
  const producto = borradorMenu?.productos[i];
  if (!producto || !archivo || publicandoMenu) return;
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(archivo.type) || !archivo.size) {
    estadoProductoBorrador('Elige una imagen válida, por ejemplo JPG, PNG o WebP.', 'error');
    return;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    estadoProductoBorrador('Elige una foto de hasta 5 MB.', 'error');
    return;
  }
  const previa = URL.createObjectURL(archivo);
  liberarFotoBorradorMenu(producto);
  fotosBorradorMenu.set(producto, { archivo, previa });
  const miniatura = document.getElementById('revision-foto-previa');
  miniatura.src = previa;
  document.getElementById('revision-foto-controles').hidden = false;
  actualizarEjemploBorrador(i);
  actualizarResumenRevision();
  document.getElementById('revision-producto-status').classList.add('hidden');
}

function quitarFotoBorradorMenu(i) {
  const producto = borradorMenu?.productos[i];
  if (!producto || publicandoMenu || generandoFotoBorradorMenu) return;
  liberarFotoBorradorMenu(producto);
  delete producto.imagen_url;
  actualizarResumenRevision();
  guardarEdicionBorradorMenu();
  document.getElementById('revision-foto-previa').removeAttribute('src');
  document.getElementById('revision-foto-controles').hidden = true;
  actualizarEjemploBorrador(i);
  const selector = document.getElementById('revision-foto-archivo');
  selector.value = '';
  selector.focus({ preventScroll: true });
}

function guiarDescripcionFotoBorrador(i, mensaje) {
  const aviso = document.getElementById(`revision-foto-aviso-${i}`);
  const descripcion = document.getElementById(`revision-descripcion-${i}`);
  if (aviso) mostrarAviso(aviso, mensaje, 'error', 5000);
  if (descripcion) {
    descripcion.classList.add('border-red-600', 'ring-2', 'ring-red-400');
    descripcion.scrollIntoView({ block: 'center', behavior: 'smooth' });
    descripcion.focus({ preventScroll: true });
    setTimeout(() => descripcion.classList.remove('border-red-600', 'ring-2', 'ring-red-400'), 5000);
  }
}

async function generarFotoBorradorMenu(i, boton) {
  const producto = borradorMenu?.productos[i];
  if (!producto || generandoFotoBorradorMenu || completandoFotosMenu || publicandoMenu) return;
  const nombre = producto.nombre.trim();
  if (!nombre) {
    guiarDescripcionFotoBorrador(i, 'Escribe el nombre del producto antes de crear la imagen.');
    document.getElementById(`revision-nombre-${i}`)?.focus();
    return;
  }
  const errorDatosFoto = revisarDatosFotoMenu(producto);
  if (errorDatosFoto) {
    guiarDescripcionFotoBorrador(i, errorDatosFoto.toLocaleLowerCase('es').includes('ingredientes')
      ? 'Añade los ingredientes en Descripción y vuelve a crear la imagen.'
      : errorDatosFoto);
    return;
  }
  if (!confirm('La IA creará una foto ilustrativa. Cada generación tiene un costo. ¿Continuar?')) return;
  generandoFotoBorradorMenu = true;
  actualizarAccionesBorrador();
  const selector = document.getElementById('revision-foto-archivo');
  const cambiar = document.getElementById('revision-foto-cambiar');
  const quitar = document.getElementById('revision-foto-quitar');
  selector.disabled = cambiar.disabled = quitar.disabled = boton.disabled = document.getElementById('revision-foto-subir').disabled = true;
  boton.textContent = 'Generando imagen…';
  document.getElementById('revision-producto-status').classList.add('hidden');
  try {
    const imagen = await solicitarFotoBorrador(producto);
    seleccionarFotoBorradorMenu(i, new File([imagen], 'foto-ia.webp', { type: 'image/webp' }));
    selector.value = '';
  } catch (error) {
    const mensaje = error.message || 'No se pudo crear la foto. Inténtalo de nuevo.';
    if (mensaje.toLocaleLowerCase('es').includes('añade ingredientes')) {
      guiarDescripcionFotoBorrador(i, 'Añade los ingredientes en Descripción y vuelve a crear la imagen.');
    } else {
      const aviso = document.getElementById(`revision-foto-aviso-${i}`);
      if (aviso) mostrarAviso(aviso, mensaje, 'error', 5000);
      else estadoProductoBorrador(mensaje, 'error');
    }
  } finally {
    generandoFotoBorradorMenu = false;
    actualizarAccionesBorrador();
    selector.disabled = cambiar.disabled = quitar.disabled = boton.disabled = document.getElementById('revision-foto-subir').disabled = false;
    boton.textContent = 'Crear con IA';
  }
}

async function solicitarFotoBorrador(producto) {
  return conPlazoLecturaMenu(async signal => {
    const token = await sesionImportacion();
    const respuesta = await fetch('/api/productos/generar-imagen-borrador', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurante_id: RESTAURANTE_ID, producto: {
        nombre: producto.nombre.trim(), categoria: producto.categoria.trim(),
        descripcion: (producto.descripcion || '').trim()
      } })
    });
    if (!respuesta.ok || !respuesta.headers.get('content-type')?.startsWith('image/webp')) {
      const resultado = await respuesta.json().catch(() => ({}));
      const error = new Error(resultado.error || 'No se pudo crear la foto. Inténtalo de nuevo.');
      error.status = respuesta.status;
      throw error;
    }
    const imagen = await respuesta.blob();
    if (!imagen.size || imagen.size > 5 * 1024 * 1024) throw new Error('La imagen devuelta no se puede guardar.');
    return imagen;
  }, 120000, 'La foto tardó demasiado. Inténtalo más tarde.');
}

async function completarFotosBorrador(automatico = false) {
  if (!borradorMenu || publicandoMenu || generandoFotoBorradorMenu || completandoFotosMenu) return;
  const pendientes = borradorMenu.productos.filter(producto =>
    !producto.imagen_url && !fotosBorradorMenu.has(producto));
  const lote = pendientes.filter(producto =>
    !revisarDatosFotoMenu(producto));
  const estado = document.getElementById('revision-accion-status');
  if (!lote.length) {
    if (automatico && !pendientes.length) return;
    mostrarAviso(estado, pendientes.length
      ? 'Completa el nombre, la categoría y los ingredientes de los platos pendientes.'
      : 'Todos los platos ya tienen foto.', 'info');
    return;
  }
  if (!automatico && !confirm(`Crear ${lote.length} fotos ilustrativas con IA tiene costo. ¿Continuar?`)) return;
  const boton = document.getElementById('btn-completar-fotos');
  completandoFotosMenu = true;
  actualizarAccionesBorrador();
  let listas = 0;
  let intentadas = 0;
  let fallidas = 0;
  try {
    for (const producto of lote) {
      const avance = `Preparando imágenes, ${++intentadas} de ${lote.length}…`;
      boton.textContent = avance;
      if (automatico) estadoImportacion(avance);
      if (!borradorMenu.productos.includes(producto) || producto.imagen_url || fotosBorradorMenu.has(producto)) continue;
      const datos = JSON.stringify([producto.nombre, producto.categoria, producto.descripcion]);
      let imagen;
      try {
        imagen = await solicitarFotoBorrador(producto);
      } catch (error) {
        if (error.status === 429 || error.status === 401 || error.status === 503) throw error;
        fallidas++;
        if (fallidas >= 3 && listas === 0) throw error;
        continue;
      }
      if (!borradorMenu.productos.includes(producto) || producto.imagen_url || fotosBorradorMenu.has(producto)
          || datos !== JSON.stringify([producto.nombre, producto.categoria, producto.descripcion])) continue;
      const archivo = new File([imagen], 'foto-ia.webp', { type: 'image/webp' });
      fotosBorradorMenu.set(producto, { archivo, previa: URL.createObjectURL(archivo) });
      listas++;
      enviarVistaClientesBorrador(document.getElementById('revision-carta-frame'));
    }
    mostrarAviso(estado, `${listas} fotos listas. ${pendientes.length - listas} pendientes de revisión.`, 'info');
  } catch (error) {
    const mensaje = `${listas} fotos listas. ${error.message}`;
    mostrarAviso(estado, mensaje, 'error');
    if (automatico) return mensaje;
  } finally {
    completandoFotosMenu = false;
    actualizarAccionesBorrador();
    boton.textContent = 'Completar fotos con IA';

  }
}

async function prepararFotosParaPublicarMenu() {
  const bucket = fotosBorradorMenu.size ? supabaseClient.storage.from('productos') : null;
  for (const producto of borradorMenu.productos) {
    const foto = fotosBorradorMenu.get(producto);
    if (!foto) continue;
    const extension = foto.archivo.type.split('/')[1];
    foto.ruta ??= `restaurante_${RESTAURANTE_ID}/borrador-${crypto.randomUUID()}.${extension}`;
    const { error } = await bucket.upload(foto.ruta, foto.archivo, { upsert: false });
    if (error && String(error.statusCode) !== '409') throw new Error(`No pudimos subir la foto de «${producto.nombre}». Inténtalo de nuevo.`);
    producto.imagen_url = bucket.getPublicUrl(foto.ruta).data.publicUrl;
    liberarFotoBorradorMenu(producto);
    guardarEdicionBorradorMenu();
  }
}


function enviarVistaClientesBorrador(marco) {
  if (!borradorMenu) return;
  marco.contentWindow?.postMessage({
    tipo: 'velox-borrador-carta',
    restaurante: document.getElementById('nombre-restaurante-header').innerText || 'Tu restaurante',
    productos: borradorMenu.productos.map(producto => {
      const foto = fotosBorradorMenu.get(producto);
      const imagen_url = foto?.previa || producto.imagen_url;
      const revisionFoto = imagen_url ? '' : 'Foto opcional';
      return { ...producto, imagen_url, revisionFoto };
    }),
    editable: marco.id === 'revision-carta-frame'
  }, window.location.origin);
}

function cargarVistaClientesBorrador(marco) {
  if (!marco.getAttribute('src')) marco.src = RUTA_PREVIA_BORRADOR;
  else enviarVistaClientesBorrador(marco);
}

function productoBloqueaPublicacion(p) {
  const precio = Number(p.precio);
  return p.revision_opciones || opcionesBorradorIncompletas(p)
    || !p.nombre.trim() || !p.categoria.trim()
    || !Number.isSafeInteger(precio) || precio <= 0 || precio > 100000000;
}

function pendientesRevisionBorrador() {
  return borradorMenu.productos.flatMap((producto, indice) => {
    const obligatorio = productoBloqueaPublicacion(producto);
    return obligatorio || (!producto.imagen_url && !fotosBorradorMenu.has(producto))
      ? [{ indice, obligatorio }] : [];
  });
}

function actualizarResumenRevision() {
  // La revisión ocurre al tocar “Publicar carta”; el pie queda despejado.
  document.getElementById('revision-resumen').hidden = true;
  document.getElementById('revision-resumen').textContent = '';
  document.getElementById('revision-bloqueos').hidden = true;
  document.getElementById('revision-bloqueos').textContent = '';
  document.getElementById('revision-siguiente').hidden = true;
  const fotos = document.getElementById('revision-fotos-opcionales');
  fotos.hidden = true;
  fotos.open = false;
  document.getElementById('revision-fotos-resumen').textContent = '';
}

let indiceRevisionActual = null;
function revisarSiguienteProducto(soloFotos = false) {
  if (!borradorMenu) return;
  const todos = pendientesRevisionBorrador();
  const correcciones = todos.filter(p => p.obligatorio);
  const pendientes = soloFotos
    ? borradorMenu.productos.flatMap((p,indice)=>!p.imagen_url && !fotosBorradorMenu.has(p) ? [{indice,obligatorio:false}] : [])
    : correcciones.length ? correcciones : todos;
  const actual = pendientes.findIndex(p => p.indice === indiceRevisionActual);
  const siguiente = pendientes[(actual + 1) % pendientes.length];
  if (!siguiente) return;
  abrirCartaBorrador(siguiente.indice);
  const p = borradorMenu.productos[siguiente.indice];
  const editor = document.getElementById(`revision-producto-${siguiente.indice}`);
  if (soloFotos) {
    document.getElementById('revision-foto-subir').focus();
  } else if (p.revision_opciones || opcionesBorradorIncompletas(p)) {
    const opciones = document.getElementById(`revision-opciones-${siguiente.indice}`);
    opciones.open = true;
    opciones.querySelector?.('input, summary')?.focus();
  } else if (siguiente.obligatorio) {
    const campo = !p.nombre.trim() ? 'nombre' : !p.categoria.trim() ? 'categoria' : 'precio';
    editor.querySelector?.(`[data-campo-revision="${campo}"]`)?.focus();
  } else document.getElementById('revision-foto-subir').focus();
}

function abrirCartaBorrador(indice = null) {
  if (!borradorMenu || publicandoMenu || generandoFotoBorradorMenu || (indice !== null && !borradorMenu.productos[indice])) return;
  const dialogo = document.getElementById('revision-carta-ampliada');
  const marco = document.getElementById('revision-carta-frame');
  indiceRevisionActual = indice;
  actualizarAccionesBorrador();
  const editar = indice !== null;
  marco.hidden = editar;
  document.getElementById('revision-edicion').hidden = !editar;
  document.getElementById('revision-carta-ayuda').hidden = editar;
  document.getElementById('revision-volver-carta').hidden = !editar;
  document.getElementById('revision-carta-ampliada-titulo').textContent = editar ? 'Editar producto' : 'Revisa tu carta';
  if (!dialogo.open) {
    document.getElementById('revision-accion-status').classList.add('hidden');
    dialogo.showModal();
    document.body.style.overflow = 'hidden';
  }
  if (editar) {
    document.getElementById('revision-producto-status').classList.add('hidden');
    renderizarRevisionMenu(indice);
    document.getElementById(`revision-producto-${indice}`)?.focus({ preventScroll: true });
    document.getElementById('revision-edicion').scrollTop = 0;
  } else {
    cargarVistaClientesBorrador(marco);
  }
}

function terminarEdicionBorrador() {
  if (!borradorMenu || publicandoMenu || generandoFotoBorradorMenu || completandoFotosMenu) return;
  guardarEdicionBorradorMenu();
  abrirCartaBorrador();
}

function estadoProductoBorrador(mensaje, tipo) {
  mostrarAviso(document.getElementById('revision-producto-status'), mensaje, tipo);
}

function actualizarAccesoBorradorCarta() {
  document.getElementById('carta-borrador-acceso').hidden = !borradorMenu;
}

function olvidarBorradorMenu() {
  clearTimeout(guardadoBorradorMenu);
  if (borradorMenu?.lectura_id) {
    try { localStorage.removeItem(`velox-borrador-menu:${borradorMenu.restaurante_id}`); } catch {}
  }
  for (const producto of fotosBorradorMenu.keys()) liberarFotoBorradorMenu(producto);
  borradorMenu = null;
  actualizarAccesoBorradorCarta();
  const dialogo = document.getElementById('revision-carta-ampliada');
  if (dialogo.open) dialogo.close();
  document.getElementById('cargar-carta-ayuda').textContent = '';
  document.getElementById('revision-menu').hidden = true;
  document.getElementById('revision-miniatura-frame').removeAttribute('src');
  document.getElementById('revision-carta-frame').removeAttribute('src');
}

function mostrarBorradorMenu(resultado, lecturaId) {
  borradorMenu = { restaurante_id: RESTAURANTE_ID, version: resultado.version, productos: resultado.productos };
  actualizarAccesoBorradorCarta();
  if (lecturaId) {
    borradorMenu.lectura_id = lecturaId;
    try {
      const guardado = JSON.parse(localStorage.getItem(`velox-borrador-menu:${RESTAURANTE_ID}`) || 'null');
      if (guardado?.lectura_id === lecturaId && guardado.version === resultado.version && Array.isArray(guardado.productos)) {
        borradorMenu.productos = guardado.productos;
      }
    } catch {}
  }
  document.getElementById('cargar-carta-ayuda').textContent = 'Revisar borrador';
  document.getElementById('revision-menu').hidden = false;
  actualizarAccionesBorrador();
  cargarVistaClientesBorrador(document.getElementById('revision-miniatura-frame'));

  estadoImportacion('Tu carta está lista', 'exito');
  if (!document.hidden && !document.getElementById('sec-menu-ia').classList.contains('hidden')
      && !document.getElementById('importar-menu-fotos').classList.contains('hidden')) {
    abrirCartaBorrador();
  }
}

function programarConsultaLecturaMenu() {
  clearTimeout(consultaLecturaMenu);
  if (!document.hidden) consultaLecturaMenu = setTimeout(recuperarLecturaMenu, 4000);
}

function aplicarEstadoLecturaMenu(lectura) {
  if (lectura.estado === 'procesando') {
    document.getElementById('cargar-carta-ayuda').textContent = 'Carta en proceso';
    indicarLecturaMenu(true);

    mostrarLecturaArchivosMenu(lectura.mensaje || 'Leyendo archivos…');
    programarConsultaLecturaMenu();
    return;
  }
  clearTimeout(consultaLecturaMenu);
  indicarLecturaMenu(false);
  if (lectura.estado === 'listo') {
    return mostrarBorradorMenu(lectura.resultado, lectura.id);
  } else {
    document.getElementById('cargar-carta-ayuda').textContent = 'Revisar lectura';

    estadoImportacion(lectura.mensaje || 'La lectura se interrumpió. Tu carta publicada sigue igual.', 'error');
  }
}

async function recuperarLecturaMenu() {
  if (!RESTAURANTE_ID || subiendoArchivosMenu || publicandoMenu || borradorMenu || consultandoLecturaMenu) return false;
  consultandoLecturaMenu = true;
  clearTimeout(consultaLecturaMenu);
  try {
    const { lectura } = await conPlazoLecturaMenu(async signal => {
      const token = await sesionImportacion();
      const respuesta = await fetch(`/api/lectura-menu/${encodeURIComponent(RESTAURANTE_ID)}`, {
        headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store'
      });
      if (!respuesta.ok) {
        const error = new Error('No se pudo consultar la lectura.');
        error.sesionVencida = respuesta.status === 401 || respuesta.status === 403;
        throw error;
      }
      return respuesta.json();
    }, 20000, 'No pudimos consultar el avance. Revisa tu conexión.');
    if (!lectura) {
      if (leyendoMenu) {
        indicarLecturaMenu(false);
        document.getElementById('cargar-carta-ayuda').textContent = '';

        estadoImportacion('Ya no hay una lectura activa. Puedes volver a subir los archivos.');
      }
      return false;
    }
    await aplicarEstadoLecturaMenu(lectura);
    return true;
  } catch (error) {
    if (error.sesionVencida) {
      indicarLecturaMenu(false);

      estadoImportacion('Tu sesión venció. Inicia sesión de nuevo para recuperar la lectura.', 'error');
    } else if (leyendoMenu) {
      estadoImportacion('No pudimos consultar el avance. Reintentando la conexión…');
      programarConsultaLecturaMenu();
    } else {
      estadoImportacion('No pudimos recuperar la lectura. Revisa tu conexión y vuelve a entrar.', 'error');
    }
    return false;
  } finally {
    consultandoLecturaMenu = false;
  }
}

async function enviarMenuConIA(event) {
  event.preventDefault();
  if (leyendoMenu || publicandoMenu || consultandoLecturaMenu) return;
  if (borradorMenu?.lectura_id) {
    estadoImportacion('Ya tienes un borrador. Ábrelo para publicarlo o descartarlo antes de leer otra carta.', 'info');
    const estado = document.getElementById('importacion-menu-status');
    const irAlBorrador = document.createElement('button');
    irAlBorrador.type = 'button';
    irAlBorrador.className = 'mt-2 min-h-11 rounded-lg border border-current px-3 py-2 text-sm font-semibold';
    irAlBorrador.textContent = 'Abrir borrador';
    irAlBorrador.addEventListener('click', () => abrirCartaBorrador());
    estado.appendChild(irAlBorrador);
    return;
  }
  const files=archivosSeleccionadosMenu();
  const tipos=['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
  if(!files.length || files.length>10) { estadoImportacion(AVISO_CANTIDAD_ARCHIVOS_MENU,'error');return; }
  if(files.some(f=>f.size>8*1024*1024 || !tipos.includes(f.type))) { estadoImportacion('Usa JPG, PNG, WEBP, GIF o PDF, de máximo 8 MB cada uno.','error');return; }
  if(files.reduce((n,f)=>n+f.size,0)>25*1024*1024) { estadoImportacion('Los archivos juntos deben pesar máximo 25 MB.','error');return; }
  if(!RESTAURANTE_ID) { estadoImportacion('Espera a que termine de cargar tu restaurante.','error');return; }
  subiendoArchivosMenu = true;
  indicarLecturaMenu(true);
  document.getElementById('btn-procesar-ia').textContent = 'Subiendo archivos…';

  mostrarLecturaArchivosMenu('Preparando archivos…', true);
  try {
    const archivos=await leerArchivosLocalesMenu(files);
    const token=await sesionImportacion();
    const formData=new FormData();
    for(const archivo of archivos) formData.append('menuFile',archivo.blob,archivo.nombre);
    formData.set('restaurante_id',RESTAURANTE_ID);
    formData.set('crear_fotos', '1');
    mostrarLecturaArchivosMenu('Subiendo archivos…', true);
    const referencia=typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
    const { respuesta, resultado } = await conPlazoLecturaMenu(async signal => {
      const respuesta = await fetch('/api/importar-menu', { method: 'POST', signal,
        headers: { Authorization: `Bearer ${token}`, 'X-Velox-Background': '1',
          ...(referencia ? { 'X-Velox-Request-Id': referencia } : {}) }, body: formData });
      if ([502, 503, 504].includes(respuesta.status)) throw new Error('No pudimos confirmar la recepción. Revisa la conexión.');
      return { respuesta, resultado: await respuesta.json().catch(() => ({})) };
    }, 120000, 'No pudimos confirmar la recepción de los archivos. Comprobaremos si empezó la lectura.');
    if (resultado.lectura && (respuesta.ok || respuesta.status === 409)) {
      await aplicarEstadoLecturaMenu(resultado.lectura);
      return;
    }
    if (!respuesta.ok || !resultado.success || !resultado.borrador || !Array.isArray(resultado.productos)) {
      throw new Error(resultado.error || 'No se pudo leer la carta. La carta publicada se conserva.');
    }
    // Permite que el panel anterior y el nuevo servidor convivan durante el despliegue.
    indicarLecturaMenu(false);
    mostrarBorradorMenu(resultado, null);
  } catch (error) {

    estadoImportacion(mensajeErrorImportacion(error), 'error');
    indicarLecturaMenu(false);
    // Una respuesta perdida puede ocultar una tarea aceptada. Consultar no genera otra lectura.
    programarConsultaLecturaMenu();
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

function renderizarRevisionMenu(i) {
  const p = borradorMenu?.productos[i];
  if (!p) return;
  const categoria = categoriaProductoBorrador(p);
  const foto = fotosBorradorMenu.get(p)?.previa || p.imagen_url;
    const campo=(key,label,valor,extra='')=>`<label class="block text-xs text-slate-300">${label}<input ${extra} value="${escaparHtmlUI(valor)}" oninput="editarDatoBorrador(${i}, '${key}', this.value)" data-campo-revision="${key}" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white"></label>`;
    const gruposOpciones = new Map();
    (p.opciones || []).forEach((opcion,j) => {
      if (opcion.grupo === '__velox_combo_family__') return;
      const clave = String(opcion.grupo || '').trim().toLocaleLowerCase('es');
      if (!gruposOpciones.has(clave)) gruposOpciones.set(clave,[]);
      gruposOpciones.get(clave).push({opcion,j});
    });
    const cantidadOpciones = [...gruposOpciones.values()].reduce((n,lista)=>n+lista.length,0);
    const categoriasDisponibles = [...new Set([...(borradorMenu?.productos || []).map(producto => String(producto.categoria || '').trim()), String(p.categoria || '').trim()].filter(Boolean))];
    const categoriasHtml = categoriasDisponibles.map(nombre => `<option value="${escaparHtmlUI(nombre)}"${nombre === String(p.categoria || '').trim() ? ' selected' : ''}>${escaparHtmlUI(nombre)}</option>`).join('');
    const gruposEjemploPersonalizacion = [...new Set((p.opciones || []).filter(o => o && o.grupo !== '__velox_combo_family__').map(o => String(o.grupo || '').trim()).filter(Boolean))];
    const textoBotonPersonalizacion = gruposEjemploPersonalizacion.length ? textoBotonVariantesCliente(gruposEjemploPersonalizacion) : 'Añadir opciones';
    const opciones = [...gruposOpciones.values()].map(lista => {
      const primero = lista[0];
      const grupo = String(primero.opcion.grupo || '').trim();
      return `<section class="mt-3 space-y-2" data-grupo-opciones>
        <h4 id="revision-grupo-titulo-${i}-${primero.j}" class="text-sm font-semibold">${escaparHtmlUI(grupo || 'Nuevo grupo')} (${lista.length})</h4>
        <details${grupo ? '' : ' open'}>
          <summary class="cursor-pointer py-2 text-xs text-slate-400">${grupo ? 'Cambiar nombre del grupo' : 'Ponle un nombre al grupo'}</summary>
          <label class="block text-xs">Nombre del grupo<input value="${escaparHtmlUI(grupo)}" list="revision-grupos-sugeridos" placeholder="Elige o escribe: Sabores, Proteína…" maxlength="120" oninput="editarNombreGrupoBorrador(${i},${primero.j},this.value)" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm"></label>
        </details>
        ${lista.map(({opcion:o,j})=>`<details class="velox-opcion-fila"${o.nombre?.trim() ? '' : ' open'}>
          <summary><span id="revision-opcion-nombre-${i}-${j}">${escaparHtmlUI(o.nombre || 'Nueva opción')}</span><svg class="velox-opcion-flecha" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary>
          <div class="grid gap-2 p-3">${['nombre','descripcion'].map(key=>`<label class="text-xs text-slate-300">${key==='nombre'?'Nombre':'Descripción'}<input value="${escaparHtmlUI(o[key]||'')}" oninput="editarDatoBorrador(${i}, '${key}', this.value, ${j})" maxlength="${key==='descripcion'?5000:200}" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white"></label>`).join('')}
            <details><summary class="cursor-pointer py-2 text-xs text-slate-400">Mover a otro grupo</summary>
              <label class="block text-xs">Grupo<input value="${escaparHtmlUI(o.grupo || '')}" maxlength="120" onchange="moverOpcionBorrador(${i},${j},this.value)" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm"></label>
            </details>
            <button type="button" onclick="cambiarOpcionesBorrador(${i},${j})" class="min-h-11 justify-self-start text-xs text-red-300">Eliminar opción</button>
          </div>
        </details>`).join('')}
        <button type="button" data-revision-agregar-opcion="${i}-${primero.j}" onclick="cambiarOpcionesBorrador(${i},undefined,${primero.j})" class="velox-volver min-h-11 px-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"${String(lista.at(-1)?.opcion?.nombre||'').trim() ? '' : ' disabled'}>+ Añadir opción</button>
        <p data-revision-ayuda-opcion="${i}-${primero.j}" class="text-xs text-slate-400"${String(lista.at(-1)?.opcion?.nombre||'').trim() ? ' hidden' : ''}>Completa la opción actual para habilitar otra.</p>
      </section>`;
    }).join('');
    document.getElementById('revision-menu-lista').innerHTML = `<article id="revision-producto-${i}" tabindex="-1" class="rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div class="min-w-0">
            <strong id="revision-nombre-${i}" class="block break-words text-sm font-bold text-white">${escaparHtmlUI(p.nombre || 'Producto sin nombre')}</strong>
            <span id="revision-precio-${i}" class="block text-sm font-bold text-slate-200">${escaparHtmlUI(precioProductoBorrador(p))}</span>
            ${p.revision_opciones ? '<span class="block text-xs font-semibold text-amber-300">Revisar opciones</span>' : ''}
            <span id="revision-categoria-${i}" class="block break-words text-xs text-slate-400">${escaparHtmlUI(categoria)}</span>
          </div>
        <div class="mt-3 space-y-2 border-t border-slate-700 pt-3">
          <div class="grid gap-3">${campo('nombre','Nombre del producto',p.nombre,'maxlength="200"')}${campo('precio','Precio en pesos (COP)',formatearPrecioCOP(p.precio),'inputmode="numeric"')}
            <label class="block text-xs text-slate-300">Descripción e ingredientes<textarea id="revision-descripcion-${i}" maxlength="5000" oninput="editarDatoBorrador(${i}, 'descripcion', this.value)" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white" rows="3">${escaparHtmlUI(p.descripcion||'')}</textarea></label>
            <label class="block text-xs text-slate-300">Categoría<select data-campo-revision="categoria" onchange="cambiarCategoriaBorrador(${i},this.value)" class="mt-1 w-full rounded-lg border border-slate-300 bg-[#FFFBF5] p-2 text-sm text-[#34251E]"><option value="" disabled${p.categoria ? '' : ' selected'}>Elige una categoría</option>${categoriasHtml}<option value="__nueva_categoria__">＋ Crear categoría…</option></select><input data-revision-categoria-nueva="${i}" maxlength="120" value="" placeholder="Nombre de la nueva categoría" oninput="editarDatoBorrador(${i}, 'categoria', this.value)" class="mt-2 w-full rounded-lg border border-slate-300 bg-[#FFFBF5] p-2 text-sm text-[#34251E]" hidden></label>
          </div>
          <div class="velox-foto-producto space-y-2" role="group" aria-labelledby="revision-foto-titulo">
            <span id="revision-foto-titulo" class="block font-semibold">Foto del producto · Opcional</span>
            <input id="revision-foto-archivo" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onchange="seleccionarFotoBorradorMenu(${i}, this.files[0]); this.value = ''">
            <div class="velox-foto-acciones">
              <button id="revision-foto-subir" type="button" onclick="document.getElementById('revision-foto-archivo').click()" aria-controls="revision-foto-archivo">Subir foto</button>
              <button type="button" onclick="generarFotoBorradorMenu(${i}, this)">Crear con IA</button>
            </div>
            <p id="revision-foto-aviso-${i}" class="hidden rounded-lg border px-3 py-2 text-xs" role="status" aria-live="polite"></p>
            <div id="revision-foto-controles"${foto ? '' : ' hidden'}>
              <button id="revision-foto-cambiar" type="button" aria-label="Cambiar foto" onclick="document.getElementById('revision-foto-archivo').click()" class="rounded-lg border border-slate-600 p-1">
                <img id="revision-foto-previa"${foto ? ` src="${escaparHtmlUI(foto)}"` : ''} alt="Vista previa de la foto" width="76" height="76" class="h-[76px] w-[76px] rounded object-contain">
              </button>
              <button id="revision-foto-quitar" type="button" aria-label="Quitar foto" onclick="quitarFotoBorradorMenu(${i})" class="min-h-11 min-w-11 rounded-lg text-2xl">×</button>
            </div>
          </div>
          <section class="velox-editor-personalizacion mt-4 rounded-xl border border-[#D7C2AD] bg-[#FFFBF5] p-3 text-[#34251E]" id="revision-opciones-${i}">
            <h3 class="text-base font-bold">Personalizar este producto</h3>
            <p class="mt-1 text-sm text-[#76695F]">Toca «Cambiar opciones» para editar sus opciones.</p>
            ${p.revision_opciones ? '<p class="mt-3 rounded-lg border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">Revisa que las opciones coincidan con la descripción del producto.</p>' : ''}
            ${gruposParecidosCliente(p.opciones).map(([a,b])=>`<p class="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">¿«${escaparHtmlUI(a)}» y «${escaparHtmlUI(b)}» son el mismo grupo? Revisa sus nombres.</p>`).join('')}
            ${p.revision_opciones ? `<button type="button" onclick="confirmarOpcionesBorrador(${i})" class="mt-2 min-h-11 px-2 text-xs text-emerald-300">Confirmar revisión</button>` : ''}
            <div id="revision-elecciones-previa-${i}" class="mt-3">${crearVistaProductoCliente({...p, imagen_url:foto},`borrador-${i}`)}</div>
          </section>
          <button type="button" onclick="quitarProductoBorrador(${i})" class="min-h-11 px-2 text-xs text-red-300">Eliminar del borrador</button>
        </div>
    </article>`;
}
function cambiarOpcionesBorrador(indice, opcion, indiceGrupo) {
  const producto = borradorMenu?.productos[indice];
  if (publicandoMenu || generandoFotoBorradorMenu || !producto) return;
  producto.opciones ??= [];
  const visibles=producto.opciones.filter(o=>o && o.grupo!=='__velox_combo_family__');
  if (opcion === undefined) {
    if (indiceGrupo !== undefined) {
      const grupo=producto.opciones[indiceGrupo]?.grupo;
      const opcionesGrupo=producto.opciones.filter(o=>o && String(o.grupo||'').trim().toLocaleLowerCase('es')===String(grupo||'').trim().toLocaleLowerCase('es'));
      if (opcionesGrupo.length && !String(opcionesGrupo[opcionesGrupo.length-1].nombre||'').trim()) return;
    } else {
      const grupos=[...new Set(visibles.map(o=>String(o.grupo||'').trim().toLocaleLowerCase('es')))];
      if (grupos.length && !grupos[grupos.length-1]) return;
    }
    producto.opciones.push({ grupo: producto.opciones[indiceGrupo]?.grupo || '', nombre: '', descripcion: '' });
  } else if (producto.opciones[opcion]?.grupo !== '__velox_combo_family__') producto.opciones.splice(opcion, 1);
  guardarEdicionBorradorMenu();
  renderizarRevisionMenu(indice);
  document.getElementById(`revision-opciones-${indice}`).open = true;
}

function moverOpcionBorrador(indice, indiceOpcion, nombre) {
  const opcion = borradorMenu?.productos[indice]?.opciones?.[indiceOpcion];
  if (publicandoMenu || generandoFotoBorradorMenu || !opcion || opcion.grupo === '__velox_combo_family__') return;
  const grupo = nombre.trim();
  if (!grupo || grupo.length > 120 || grupo.startsWith('__')) {
    estadoProductoBorrador('Escribe un nombre para el grupo, por ejemplo Sabor.', 'error');
    return;
  }
  opcion.grupo = grupo;
  guardarEdicionBorradorMenu();
  renderizarRevisionMenu(indice);
  document.getElementById(`revision-opciones-${indice}`).open = true;
}

function editarNombreGrupoBorrador(indice, indiceOpcion, nombre) {
  const producto=borradorMenu?.productos[indice];
  const original=producto?.opciones?.[indiceOpcion];
  if(publicandoMenu || generandoFotoBorradorMenu || !producto || !original || original.grupo==='__velox_combo_family__') return;
  const clave=String(original.grupo||'').trim().toLocaleLowerCase('es');
  producto.opciones.forEach(o=>{if(o && o.grupo!=='__velox_combo_family__' && String(o.grupo||'').trim().toLocaleLowerCase('es')===clave)o.grupo=nombre;});
  const encabezado=document.getElementById(`revision-grupo-titulo-${indice}-${indiceOpcion}`);
  if(encabezado) encabezado.textContent=`${nombre.trim()||'Nuevo grupo'} (${producto.opciones.filter(o=>o && o.grupo!=='__velox_combo_family__' && String(o.grupo||'').trim().toLocaleLowerCase('es')===String(nombre||'').trim().toLocaleLowerCase('es')).length})`;
  actualizarBotonesOpcionesBorrador(indice);
  actualizarEjemploBorrador(indice);
  if(borradorMenu.lectura_id){clearTimeout(guardadoBorradorMenu);guardadoBorradorMenu=setTimeout(guardarEdicionBorradorMenu,350);}
}

function renombrarGrupoBorrador(indice, indiceOpcion, nombre) {
  const producto = borradorMenu?.productos[indice];
  const original = producto?.opciones?.[indiceOpcion];
  if (publicandoMenu || generandoFotoBorradorMenu || !original || original.grupo === '__velox_combo_family__') return;
  const nuevo = nombre.trim();
  if (!nuevo || nuevo.length > 120 || nuevo.startsWith('__')) {
    estadoProductoBorrador('Escribe un nombre para el grupo, por ejemplo Sabor.', 'error');
    return;
  }
  const clave = String(original.grupo || '').trim().toLocaleLowerCase('es');
  producto.opciones.forEach(o=>{if(String(o.grupo || '').trim().toLocaleLowerCase('es') === clave) o.grupo=nuevo;});
  guardarEdicionBorradorMenu();
  renderizarRevisionMenu(indice);
  document.getElementById(`revision-opciones-${indice}`).open = true;
}

function opcionesBorradorIncompletas(producto) {
  return (producto.opciones || []).some(opcion => !opcion.grupo.trim() || !opcion.nombre.trim());
}

function confirmarOpcionesBorrador(indice) {
  const producto = borradorMenu?.productos[indice];
  if (publicandoMenu || generandoFotoBorradorMenu || !producto) return;
  if (opcionesBorradorIncompletas(producto)) {
    estadoProductoBorrador('Completa el grupo y el nombre de cada opción o quita la fila vacía.', 'error');
    return;
  }
  producto.revision_opciones = false;
  guardarEdicionBorradorMenu();
  renderizarRevisionMenu(indice);
  estadoProductoBorrador('Opciones revisadas.', 'exito');
}

window.addEventListener('velox-editar-opciones-producto', event => {
  const detalle = event.detail;
  const coincidencia = /^borrador-(\\d+)$/.exec(String(detalle?.contexto || ''));
  if (!coincidencia || !Array.isArray(detalle.opciones)) return;
  const indice = Number(coincidencia[1]);
  const producto = borradorMenu?.productos[indice];
  if (!producto || publicandoMenu || generandoFotoBorradorMenu) return;
  producto.opciones = detalle.opciones;
  actualizarBotonesOpcionesBorrador(indice);
  if (borradorMenu.lectura_id) {
    clearTimeout(guardadoBorradorMenu);
    guardadoBorradorMenu = setTimeout(guardarEdicionBorradorMenu, 350);
  }
});

function cambiarCategoriaBorrador(indice, valor) {
  const campoNuevo = document.querySelector(`[data-revision-categoria-nueva="${indice}"]`);
  if (valor === '__nueva_categoria__') {
    if (campoNuevo) { campoNuevo.hidden = false; campoNuevo.focus(); }
    return;
  }
  if (campoNuevo) { campoNuevo.hidden = true; campoNuevo.value = ''; }
  editarDatoBorrador(indice, 'categoria', valor);
}

function actualizarEjemploBorrador(i) {
  const p = borradorMenu?.productos[i];
  if (p) actualizarEjemploProductoCliente(document.getElementById(`revision-elecciones-previa-${i}`),
    {...p, imagen_url:fotosBorradorMenu.get(p)?.previa || p.imagen_url},`borrador-${i}`);
}

function editarDatoBorrador(i,key,value,opcion) {
  if(publicandoMenu || !borradorMenu?.productos[i]) return;
  if(opcion!==undefined) {
    if(['grupo','nombre','descripcion'].includes(key) && borradorMenu.productos[i].opciones[opcion]) borradorMenu.productos[i].opciones[opcion][key]=value;
    if (key === 'nombre') {
      const rotulo = document.getElementById(`revision-opcion-nombre-${i}-${opcion}`);
      if (rotulo) rotulo.textContent = value || 'Nueva opción';
    }
  } else if(['nombre','categoria','precio','descripcion'].includes(key)) {
    const producto = borradorMenu.productos[i];
    producto[key] = key === 'precio' ? Number(value.replace(/\D/g,'')) : value;
    const resumen = document.getElementById(`revision-${key}-${i}`);
    if (resumen) resumen.textContent = key === 'precio' ? precioProductoBorrador(producto)
      : key === 'categoria' ? categoriaProductoBorrador(producto) : value || 'Producto sin nombre';
  }
  actualizarBotonesOpcionesBorrador(i);
  actualizarEjemploBorrador(i);
  if (borradorMenu.lectura_id) {
    clearTimeout(guardadoBorradorMenu);
    guardadoBorradorMenu = setTimeout(guardarEdicionBorradorMenu, 350);
  }
}

function actualizarBotonesOpcionesBorrador(i) {
  const producto=borradorMenu?.productos[i];
  if(!producto) return;
  const visibles=(producto.opciones||[]).filter(o=>o && o.grupo!=='__velox_combo_family__');
  const botonGrupo=document.querySelector(`[data-revision-agregar-grupo="${i}"]`);
  const ayudaGrupo=document.querySelector(`[data-revision-ayuda-grupo="${i}"]`);
  const grupos=new Map();
  visibles.forEach(o=>{const clave=String(o.grupo||'').trim().toLocaleLowerCase('es');if(!grupos.has(clave))grupos.set(clave,[]);grupos.get(clave).push(o);});
  const grupoListo=!grupos.size || Boolean([...grupos.keys()].at(-1));
  if(botonGrupo) botonGrupo.disabled=!grupoListo;
  if(ayudaGrupo) ayudaGrupo.hidden=grupoListo;
  for(const [clave,lista] of grupos){
    const primera=(producto.opciones||[]).findIndex(o=>o && o.grupo!=='__velox_combo_family__' && String(o.grupo||'').trim().toLocaleLowerCase('es')===clave);
    const opcionLista=Boolean(lista.length && String(lista[lista.length-1].nombre||'').trim());
    const boton=document.querySelector(`[data-revision-agregar-opcion="${i}-${primera}"]`);
    const ayuda=document.querySelector(`[data-revision-ayuda-opcion="${i}-${primera}"]`);
    if(boton) boton.disabled=!opcionLista;
    if(ayuda) ayuda.hidden=opcionLista;
  }
}

function quitarProductoBorrador(i) {
  if (!borradorMenu || publicandoMenu || generandoFotoBorradorMenu) return;
  liberarFotoBorradorMenu(borradorMenu.productos[i]);
  borradorMenu.productos.splice(i, 1);
  guardarEdicionBorradorMenu();
  actualizarAccionesBorrador();
  abrirCartaBorrador();
}

function actualizarAccionesBorrador(accion) {
  if (borradorMenu) actualizarResumenRevision();
  const ocupado = publicandoMenu || generandoFotoBorradorMenu || completandoFotosMenu;
  const editando = indiceRevisionActual !== null;
  document.getElementById('form-revision-menu').hidden = editando;
  const listo = document.getElementById('btn-terminar-revision');
  listo.hidden = !editando;
  listo.disabled = ocupado;
  const publicar = document.getElementById('btn-publicar-menu');
  const descartar = document.getElementById('btn-descartar-menu');
  document.getElementById('btn-completar-fotos').disabled = ocupado || !borradorMenu?.productos.length;
  publicar.disabled = ocupado || !borradorMenu?.productos.length;
  descartar.disabled = ocupado || !borradorMenu;
  publicar.textContent = accion === 'publicar' ? 'Publicando…' : 'Publicar carta';
  descartar.textContent = accion === 'descartar' ? 'Descartando…' : 'Descartar';
  for (const id of ['revision-carta-frame', 'revision-edicion']) {
    const vista = document.getElementById(id);
    if (publicandoMenu) vista.setAttribute('inert', '');
    else vista.removeAttribute('inert');
  }
}

async function descartarRevisionMenu() {
  if (!borradorMenu || publicandoMenu || leyendoMenu || generandoFotoBorradorMenu || completandoFotosMenu) return;
  if (borradorMenu.lectura_id) {
    publicandoMenu = true;
    actualizarAccionesBorrador('descartar');
    document.getElementById('revision-accion-status').classList.add('hidden');
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
      actualizarAccionesBorrador();
      revision.removeAttribute('inert');
    }
  }
  olvidarBorradorMenu();

  estadoImportacion('Lectura descartada. Tu carta publicada sigue igual.');
}

async function publicarMenuRevisado(event) {
  event.preventDefault();
  if (!borradorMenu?.productos.length || publicandoMenu || leyendoMenu || generandoFotoBorradorMenu || completandoFotosMenu) return;
  document.getElementById('revision-accion-status').classList.add('hidden');
  const invalido = borradorMenu.productos.findIndex(productoBloqueaPublicacion);
  if (invalido >= 0) {
    const producto = borradorMenu.productos[invalido];
    abrirCartaBorrador(invalido);
    if (producto.revision_opciones || opcionesBorradorIncompletas(producto)) {
      document.getElementById(`revision-opciones-${invalido}`).open = true;
      estadoProductoBorrador(`Revisa las opciones de «${producto.nombre}» antes de publicar.`, 'error');
    } else {
      estadoProductoBorrador(`Revisa nombre, categoría y precio del producto ${invalido + 1}.`, 'error');
    }
    return;
  }
  const parecidos=borradorMenu.productos.flatMap(p=>gruposParecidosCliente(p.opciones).map(([a,b])=>`«${p.nombre}»: «${a}» y «${b}»`));
  if(parecidos.length && !confirm('Hay grupos con nombres parecidos:\n'+parecidos.slice(0,10).join('\n')+'\n¿Son grupos distintos? Aceptar: publicar separados. Cancelar: revisar.')) return;
  publicandoMenu=true;
  actualizarAccionesBorrador('publicar');
  document.getElementById('revision-menu').setAttribute('inert','');
  try {
    const token=await sesionImportacion();
    await prepararFotosParaPublicarMenu();
    const respuesta=await fetch('/api/publicar-menu',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(borradorMenu)});
    const resultado=await respuesta.json().catch(()=>({}));
    if(!respuesta.ok || !resultado.success)throw new Error(resultado.error || 'No se pudo publicar. Revisa tu carta publicada antes de reintentar.');
    olvidarBorradorMenu();
    document.getElementById('form-importar-ia').reset();actualizarResumenFotosMenu();

    if (typeof actualizarVistaPreviaCarta === 'function') actualizarVistaPreviaCarta();
    await cargarProductos();estadoImportacion(`Carta publicada: ${resultado.count} productos.`,'exito');
  } catch(error) {estadoImportacion(mensajeErrorImportacion(error,'publicacion'),'error');}
  finally {publicandoMenu=false;document.getElementById('revision-menu').removeAttribute('inert');actualizarAccionesBorrador();}
}
prepararSelectorArchivosMenu();
for (const id of ['revision-miniatura-frame', 'revision-carta-frame']) {
  document.getElementById(id).addEventListener('load', event => enviarVistaClientesBorrador(event.currentTarget));
}
document.getElementById('revision-carta-ampliada').addEventListener('cancel', event => {
  if (generandoFotoBorradorMenu || publicandoMenu) event.preventDefault();
});
document.getElementById('revision-carta-ampliada').addEventListener('close', () => {
  document.body.style.overflow = '';
  document.getElementById('revision-carta-frame').removeAttribute('src');
  if (!borradorMenu) return;
  cargarVistaClientesBorrador(document.getElementById('revision-miniatura-frame'));
  document.getElementById('revision-miniatura').focus({ preventScroll: true });
});
window.addEventListener('message', event => {
  const marco = document.getElementById('revision-carta-frame');
  if (event.origin !== window.location.origin || event.source !== marco.contentWindow
      || !document.getElementById('revision-carta-ampliada').open || marco.hidden
      || event.data?.tipo !== 'velox-editar-producto-borrador') return;
  const { indice } = event.data;
  if (Number.isSafeInteger(indice) && indice >= 0) abrirCartaBorrador(indice);
});
document.getElementById('menuFile').addEventListener('change', () => actualizarResumenFotosMenu(true));
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

  const controles = [
    ['#tab-menu', 'carta', '🍽️'], ['#tab-pedidos', 'pedido', '📦'],
    ['#tab-configuracion, #ajustes-inicio h2', 'ajustes', '⚙️'],
    ['#editar-menu-acceso-titulo', 'editar', '✏️'],
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
  for (const id of ['cargar-carta-titulo', 'btn-foto-ia-editor', 'pedidos-body', 'pedidos-cards', 'ajustes-opciones']) {
    iconosDinamicos.observe(document.getElementById(id), { childList: true });
  }
}

window.addEventListener('DOMContentLoaded', prepararCentroVelox, { once: true });
window.addEventListener('pagehide', guardarEdicionBorradorMenu);
window.addEventListener('beforeunload', event => {
  if (subiendoArchivosMenu || fotosBorradorMenu.size || generandoFotoBorradorMenu || completandoFotosMenu || (borradorMenu && !borradorMenu.lectura_id)) {
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
