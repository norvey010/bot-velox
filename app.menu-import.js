let borradorMenu = null;
let paginaRevisionMenu = 0;
let leyendoMenu = false;
let publicandoMenu = false;
const REVISION_POR_PAGINA = 6;
function estadoImportacion(mensaje, tipo='info') { mostrarAviso(document.getElementById('importacion-menu-status'), mensaje, tipo); }
function actualizarResumenFotosMenu() {
  const files=Array.from(document.getElementById('menuFile').files || []);
  const resumen=document.getElementById('menu-file-summary');
  resumen.textContent=files.length ? `${files.length} archivo${files.length===1?'':'s'} seleccionado${files.length===1?'':'s'}.` : '';
  resumen.classList.toggle('hidden',files.length===0);
}
async function sesionImportacion() {
  const {data:{session},error}=await supabaseClient.auth.getSession();
  if(error || !session?.access_token) throw new Error('Tu sesión venció. Inicia sesión de nuevo.');
  return session.access_token;
}
async function enviarMenuConIA(event) {
  event.preventDefault();
  if(leyendoMenu || publicandoMenu) return;
  const files=Array.from(document.getElementById('menuFile').files || []);
  const tipos=['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
  if(!files.length || files.length>10) { estadoImportacion('Selecciona entre 1 y 10 fotos o PDF.','error');return; }
  if(files.some(f=>f.size>8*1024*1024 || !tipos.includes(f.type))) { estadoImportacion('Usa JPG, PNG, WEBP, GIF o PDF, de máximo 8 MB cada uno.','error');return; }
  if(files.reduce((n,f)=>n+f.size,0)>25*1024*1024) { estadoImportacion('Los archivos juntos deben pesar máximo 25 MB.','error');return; }
  if(!RESTAURANTE_ID) { estadoImportacion('Espera a que termine de cargar tu restaurante.','error');return; }
  leyendoMenu=true;
  const boton=document.getElementById('btn-procesar-ia');boton.disabled=true;boton.textContent='Leyendo archivos…';
  estadoImportacion('Leyendo tu carta. Los archivos grandes pueden tardar unos minutos. Tu carta publicada no cambia.');
  try {
    const token=await sesionImportacion();
    const formData=new FormData(document.getElementById('form-importar-ia'));formData.set('restaurante_id',RESTAURANTE_ID);
    const respuesta=await fetch('/api/importar-menu',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:formData});
    const resultado=await respuesta.json().catch(()=>({}));
    if(!respuesta.ok || !resultado.success || !resultado.borrador || !Array.isArray(resultado.productos)) throw new Error(resultado.error || 'No se pudo leer la carta. La carta publicada se conserva.');
    borradorMenu={restaurante_id:RESTAURANTE_ID,version:resultado.version,productos:resultado.productos};paginaRevisionMenu=0;
    document.getElementById('revision-menu').hidden=false;renderizarRevisionMenu();
    estadoImportacion(`Se detectaron ${resultado.productos.length} productos en ${resultado.paginas} páginas. Revisa nombres, ingredientes, opciones y precios antes de publicar.`,'exito');
    document.getElementById('revision-menu').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) { estadoImportacion(error.message || 'La lectura falló. Tu carta publicada se conserva.','error'); }
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
    await cargarProductos();estadoImportacion(`Carta publicada: ${resultado.count} productos.`,'exito');
  } catch(error) {estadoImportacion(error.message || 'No se pudo confirmar la publicación. Revisa tu carta antes de reintentar.','error');}
  finally {publicandoMenu=false;document.getElementById('revision-menu').removeAttribute('inert');boton.disabled=false;boton.textContent='Publicar carta';}
}
document.getElementById('menuFile').addEventListener('change',actualizarResumenFotosMenu);
document.getElementById('editar-menu').addEventListener('toggle',event=>{if(event.currentTarget.open)cargarProductos();});
window.addEventListener('beforeunload',event=>{if(borradorMenu){event.preventDefault();event.returnValue='';}});
