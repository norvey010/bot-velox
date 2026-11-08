let borradorMenu = null;
let paginaRevisionMenu = 0;
let leyendoMenu = false;
let publicandoMenu = false;
const REVISION_POR_PAGINA = 6;
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

function estadoImportacion(mensaje, tipo='info') { mostrarAviso(document.getElementById('importacion-menu-status'), mensaje, tipo); }
function prepararSelectorArchivosMenu() {
  const boton = document.querySelector('#form-importar-ia button[aria-controls="menuFile"]');
  const opciones = document.createElement('details');
  opciones.id = 'menu-file-options';
  opciones.className = 'group';
  opciones.innerHTML = `
    <summary id="menu-file-trigger" class="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-sm font-semibold text-white hover:border-red-400">
      <span>Seleccionar archivos <span class="font-normal text-slate-300">(fotos o PDF)</span></span>
      <span aria-hidden="true" class="group-open:rotate-180">⌄</span>
    </summary>
    <div class="mt-2 grid gap-2 sm:grid-cols-2">
      <button type="button" onclick="abrirSelectorArchivosMenu(true)" aria-controls="menuFile" class="min-h-11 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-left text-sm font-semibold text-white hover:border-red-400">Elegir fotos</button>
      <button type="button" onclick="abrirSelectorArchivosMenu(false)" aria-controls="menuFile" class="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-left text-sm font-semibold text-white hover:border-red-400">Buscar en Archivos <span class="font-normal text-slate-300">(PDF o fotos)</span></button>
    </div>`;
  boton.replaceWith(opciones);
}
function abrirSelectorArchivosMenu(soloFotos) {
  const input = document.getElementById('menuFile');
  if (soloFotos) input.accept = 'image/*';
  else input.removeAttribute('accept');

  document.getElementById('menu-file-options').open = false;
  document.getElementById('menu-file-trigger').focus();
  input.click();
}
function archivosSeleccionadosMenu() {
  return Array.from(document.getElementById('menuFile').files || []);
}
function actualizarResumenFotosMenu() {
  const files=archivosSeleccionadosMenu();
  const resumen=document.getElementById('menu-file-summary');
  const pdf=files.filter(f=>f.type==='application/pdf').length;
  const fotos=files.length-pdf;
  resumen.textContent=files.length===1 ? (files[0].name || '1 archivo seleccionado') : [fotos ? `${fotos} ${fotos===1?'foto':'fotos'}` : '',pdf ? `${pdf} PDF` : ''].filter(Boolean).join(' · ');
  resumen.classList.toggle('hidden',files.length===0);
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
async function enviarMenuConIA(event) {
  event.preventDefault();
  if(leyendoMenu || publicandoMenu) return;
  const files=archivosSeleccionadosMenu();
  const tipos=['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
  if(!files.length || files.length>10) { estadoImportacion('Selecciona entre 1 y 10 fotos o PDF.','error');return; }
  if(files.some(f=>f.size>8*1024*1024 || !tipos.includes(f.type))) { estadoImportacion('Usa JPG, PNG, WEBP, GIF o PDF, de máximo 8 MB cada uno.','error');return; }
  if(files.reduce((n,f)=>n+f.size,0)>25*1024*1024) { estadoImportacion('Los archivos juntos deben pesar máximo 25 MB.','error');return; }
  if(!RESTAURANTE_ID) { estadoImportacion('Espera a que termine de cargar tu restaurante.','error');return; }
  leyendoMenu=true;
  const boton=document.getElementById('btn-procesar-ia');boton.disabled=true;boton.textContent='Leyendo archivos…';
  let etapa = 0;
  mostrarProgresoImportacion(etapa);
  estadoImportacion('Preparando archivos…');
  try {
    const archivos=await leerArchivosLocalesMenu(files);
    const token=await sesionImportacion();
    const formData=new FormData();
    for(const archivo of archivos) formData.append('menuFile',archivo.blob,archivo.nombre);
    formData.set('restaurante_id',RESTAURANTE_ID);
    etapa = 1;
    mostrarProgresoImportacion(etapa);
    estadoImportacion('Leyendo archivos… Tu carta actual no cambia.');
    const referencia=typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
    const respuesta=await fetch('/api/importar-menu',{method:'POST',headers:{Authorization:`Bearer ${token}`, ...(referencia ? {'X-Velox-Request-Id':referencia} : {})},body:formData});
    if([502,503,504].includes(respuesta.status)) throw new Error('El servidor no pudo completar la lectura. Tu carta actual no cambió.');
    const resultado=await respuesta.json().catch(()=>({}));
    if(!respuesta.ok || !resultado.success || !resultado.borrador || !Array.isArray(resultado.productos)) throw new Error(resultado.error || 'No se pudo leer la carta. La carta publicada se conserva.');
    borradorMenu={restaurante_id:RESTAURANTE_ID,version:resultado.version,productos:resultado.productos};paginaRevisionMenu=0;
    document.getElementById('revision-menu').hidden=false;renderizarRevisionMenu();
    mostrarProgresoImportacion(2);
    estadoImportacion(`${resultado.productos.length} productos detectados. Revisa y publica.`,'exito');
    document.getElementById('revision-menu').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) {
    mostrarProgresoImportacion(etapa, true);
    estadoImportacion(mensajeErrorImportacion(error),'error');
  }
  finally { leyendoMenu=false;boton.disabled=false;boton.textContent='Leer con IA'; }
}
function renderizarRevisionMenu() {
  if(!borradorMenu) return;
  const productos=borradorMenu.productos;
  const paginas=Math.ceil(productos.length/REVISION_POR_PAGINA);
  paginaRevisionMenu=Math.max(0,Math.min(paginaRevisionMenu,paginas-1));
  const inicio=paginaRevisionMenu*REVISION_POR_PAGINA;
  document.getElementById('revision-menu-resumen').textContent=`${productos.length} productos por revisar · Página ${paginaRevisionMenu+1} de ${paginas||1}`;
  document.getElementById('revision-anterior').disabled=paginaRevisionMenu===0;
  document.getElementById('revision-siguiente').disabled=paginaRevisionMenu>=paginas-1;
  document.getElementById('btn-publicar-menu').disabled=!productos.length || publicandoMenu;
  document.getElementById('revision-menu-lista').innerHTML=productos.slice(inicio,inicio+REVISION_POR_PAGINA).map((p,offset)=>{
    const i=inicio+offset;
    const campo=(key,label,valor,extra='')=>`<label class="block text-xs text-slate-300">${label}<input ${extra} value="${escaparHtmlUI(valor)}" oninput="editarDatoBorrador(${i}, '${key}', this.value)" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white"></label>`;
    const opciones=(p.opciones||[]).map((o,j)=>o.grupo==='__velox_combo_family__'?'':`<div class="grid gap-2 rounded-lg border border-slate-700 p-2">${['grupo','nombre','descripcion'].map(key=>`<label class="text-xs text-slate-300">${({grupo:'Grupo',nombre:'Opción',descripcion:'Descripción'})[key]}<input value="${escaparHtmlUI(o[key]||'')}" oninput="editarDatoBorrador(${i}, '${key}', this.value, ${j})" maxlength="${key==='descripcion'?5000:key==='grupo'?120:200}" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white"></label>`).join('')}</div>`).join('');
    return `<article class="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div class="flex items-center justify-between gap-2"><h4 class="text-sm font-semibold text-white">Producto ${i+1}</h4><button type="button" onclick="quitarProductoBorrador(${i})" class="min-h-11 px-2 text-xs text-red-300">Quitar de esta carga</button></div><div class="grid gap-3 sm:grid-cols-2">${campo('nombre','Nombre',p.nombre,'required maxlength="200"')}${campo('categoria','Categoría',p.categoria,'required maxlength="120"')}${campo('precio','Precio en pesos (COP)',formatearPrecioCOP(p.precio),'required inputmode="numeric"')}<label class="block text-xs text-slate-300">Descripción e ingredientes<textarea maxlength="5000" oninput="editarDatoBorrador(${i}, 'descripcion', this.value)" class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white" rows="3">${escaparHtmlUI(p.descripcion||'')}</textarea></label></div>${opciones?`<details><summary class="cursor-pointer py-2 text-sm text-slate-200">Revisar opciones y sabores</summary><div class="space-y-2">${opciones}</div></details>`:''}</article>`;
  }).join('') || '<p class="text-sm text-slate-300">Quitaste todos los productos. Puedes descartar la lectura o subir otros archivos.</p>';
}
function editarDatoBorrador(i,key,value,opcion) {
  if(publicandoMenu || !borradorMenu?.productos[i]) return;
  if(opcion!==undefined) {
    if(['grupo','nombre','descripcion'].includes(key) && borradorMenu.productos[i].opciones[opcion]) borradorMenu.productos[i].opciones[opcion][key]=value;
  } else if(['nombre','categoria','precio','descripcion'].includes(key)) borradorMenu.productos[i][key]=key==='precio'?Number(value.replace(/\D/g,'')):value;
}
function cambiarPaginaRevision(delta) { paginaRevisionMenu+=delta;renderizarRevisionMenu();document.getElementById('revision-menu-resumen').scrollIntoView({behavior:'smooth',block:'center'}); }
function quitarProductoBorrador(i) { if(!borradorMenu || publicandoMenu)return;borradorMenu.productos.splice(i,1);renderizarRevisionMenu(); }
function descartarRevisionMenu() {
  if(publicandoMenu || leyendoMenu)return;
  borradorMenu=null;document.getElementById('revision-menu').hidden=true;
  mostrarProgresoImportacion(-1);
  estadoImportacion('Lectura descartada. Tu carta publicada sigue igual.');
}
async function publicarMenuRevisado(event) {
  event.preventDefault();
  if(!borradorMenu || publicandoMenu || leyendoMenu)return;
  const invalido=borradorMenu.productos.findIndex(p=>!p.nombre.trim() || !p.categoria.trim() || !Number.isSafeInteger(Number(p.precio)) || Number(p.precio)<=0 || Number(p.precio)>100000000);
  if(invalido>=0){paginaRevisionMenu=Math.floor(invalido/REVISION_POR_PAGINA);renderizarRevisionMenu();estadoImportacion(`Revisa nombre, categoría y precio del producto ${invalido+1}.`,'error');return;}
  publicandoMenu=true;
  const boton=document.getElementById('btn-publicar-menu');boton.disabled=true;boton.textContent='Publicando…';
  document.getElementById('revision-menu').setAttribute('inert','');
  try {
    const token=await sesionImportacion();
    const respuesta=await fetch('/api/publicar-menu',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(borradorMenu)});
    const resultado=await respuesta.json().catch(()=>({}));
    if(!respuesta.ok || !resultado.success)throw new Error(resultado.error || 'No se pudo publicar. Revisa tu carta publicada antes de reintentar.');
    borradorMenu=null;document.getElementById('revision-menu').hidden=true;document.getElementById('form-importar-ia').reset();actualizarResumenFotosMenu();
    mostrarProgresoImportacion(-1);
    const publicadoEn = Date.now();
    registrarActividadVelox('carta:' + publicadoEn, 'Carta publicada', publicadoEn);
    await cargarProductos();estadoImportacion(`Carta publicada: ${resultado.count} productos.`,'exito');
  } catch(error) {estadoImportacion(mensajeErrorImportacion(error,'publicacion'),'error');}
  finally {publicandoMenu=false;document.getElementById('revision-menu').removeAttribute('inert');boton.disabled=false;boton.textContent='Publicar carta';}
}
prepararSelectorArchivosMenu();
document.getElementById('menuFile').addEventListener('change',actualizarResumenFotosMenu);

const editorMenu = document.getElementById('editar-menu');
const barraCategoriasEditor = document.getElementById('productos-editor-categorias');
const etiquetaBuscadorEditor = editorMenu.querySelector('label[for="buscar-producto"]');
const botonAgregarProducto = editorMenu.querySelector('button[onclick="nuevoProducto()"]');
barraCategoriasEditor.after(etiquetaBuscadorEditor, document.getElementById('buscar-producto'));
document.getElementById('productos-editor-mas').after(botonAgregarProducto.parentElement);
editorMenu.addEventListener('toggle',event=>{if(event.currentTarget.open)cargarProductos();});

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
  agregar: 'M12 5v14M5 12h14',
  actividad: 'M2 12h5l3-7 4 14 3-7h5'
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

const historialActividadVelox = [];
const formatoActividadVelox = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Bogota'
});

function registrarActividadVelox(clave, texto, fecha) {
  const lista = document.getElementById('velox-actividad-lista');
  if (!lista || !Number.isFinite(fecha) || historialActividadVelox.some(registro => registro.clave === clave)) return;
  historialActividadVelox.push({ clave, texto, fecha });
  historialActividadVelox.sort((a, b) => b.fecha - a.fecha);
  if (historialActividadVelox.length > 3 && historialActividadVelox.pop().clave === clave) return;
  const [ultimo] = historialActividadVelox;
  const resumen = document.getElementById('velox-actividad-resumen');
  const resumenNuevo = `${ultimo.texto} · ${formatoActividadVelox.format(ultimo.fecha)}`;
  if (resumen.textContent !== resumenNuevo) resumen.textContent = resumenNuevo;
  lista.innerHTML = historialActividadVelox.map(registro =>
    `<li data-tipo="${registro.clave.startsWith('pedido:') ? 'pedido' : 'carta'}"><span>${escaparHtmlUI(registro.texto)}</span><time datetime="${new Date(registro.fecha).toISOString()}">${formatoActividadVelox.format(registro.fecha)}</time></li>`
  ).join('');
}

function registrarPedidoVelox(pedido) {
  if (!pedido?.id || !pedido.created_at) return;
  registrarActividadVelox('pedido:' + pedido.id, 'Pedido recibido', Date.parse(pedido.created_at));
}

function prepararCentroVelox() {
  document.getElementById('nombre-restaurante-header').previousSibling.nodeValue = 'Velox Bot ';
  document.querySelector('header nav').setAttribute('aria-label', 'Secciones de Velox Bot');
  document.querySelector('#ajustes-inicio h2 + p').textContent = 'Administra tu negocio y la operación de Velox Bot.';
  document.querySelector('#printer-width-preview > div:first-child').textContent = 'Velox Bot · Comanda';

  const actividad = document.createElement('details');
  actividad.className = 'velox-actividad';
  actividad.innerHTML = `
    <summary>
      <span class="velox-actividad-senal">${iconoVelox('actividad')}</span>
      <span class="velox-actividad-texto">
        <strong>Actividad reciente</strong>
        <span id="velox-actividad-resumen" role="status">Aquí verás pedidos y cartas publicadas.</span>
      </span>
      <span class="velox-actividad-flecha" aria-hidden="true">⌄</span>
    </summary>
    <ol id="velox-actividad-lista" aria-label="Eventos recientes del restaurante">
      <li>Aún no hay actividad registrada en esta sesión.</li>
    </ol>`;
  document.querySelector('main').prepend(actividad);

  const progreso = document.createElement('ol');
  progreso.id = 'velox-progreso-importacion';
  progreso.setAttribute('aria-label', 'Progreso de carga de la carta');
  progreso.hidden = true;
  document.getElementById('importacion-menu-status').before(progreso);

  const controles = [
    ['#tab-menu', 'carta', '🍽️'], ['#tab-pedidos', 'pedido', '📦'],
    ['#tab-configuracion, #ajustes-inicio h2', 'ajustes', '⚙️'],
    ['#editar-menu > summary strong, #productos-body button[onclick^="prepararEdicionProducto"]', 'editar', '✏️'],
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

  // Comparte el resultado del registro y la entrega de pedidos nuevos del canal existente.
  const renderizarRegistro = renderTablaPedidos;
  renderTablaPedidos = function (pedidos) {
    renderizarRegistro(pedidos);
    registrarPedidoVelox(pedidos?.[0]);
  };
  const entregarComanda = imprimirTicketAutomatico;
  imprimirTicketAutomatico = function (pedido, opciones) {
    entregarComanda(pedido, opciones);
    if (!opciones?.permitirReimpresion) registrarPedidoVelox(pedido);
  };
  registrarPedidoVelox(pedidosRenderizados.values().next().value);
}

window.addEventListener('DOMContentLoaded', prepararCentroVelox, { once: true });
window.addEventListener('beforeunload',event=>{if(borradorMenu){event.preventDefault();event.returnValue='';}});
