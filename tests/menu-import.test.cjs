const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const {PDFDocument,StandardFonts}=require('pdf-lib');
const {prepararFuentesMenu,validarProductosMenu,errorMenu}=require('../menu-import');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/T8AAAAASUVORK5CYII=','base64');
const producto=(nombre='Hamburguesa',precio=15000)=>({nombre,precio,categoria:'Hamburguesas',descripcion:'Carne y queso',opciones:[]});
async function pdf(texto=false,paginas=1){const d=await PDFDocument.create();const font=await d.embedFont(StandardFonts.Helvetica);for(let i=0;i<paginas;i++){const p=d.addPage();if(texto)p.drawText('MENU HAMBURGUESAS Hamburguesa clasica 15000 Carne, pan y queso. Hamburguesa doble 22000 Carne doble, pan y queso.',{font,size:10,x:20,y:700});else p.drawRectangle({x:10,y:10,width:100,height:100});}return Buffer.from(await d.save({useObjectStreams:false}));}
test('PDF con texto usa texto y PDF sin texto usa una página PDF visual',async()=>{
 const a=await prepararFuentesMenu([{mimetype:'application/pdf',buffer:await pdf(true)}]);assert.equal(a[0].type,'text');assert(a[0].text.includes('Hamburguesa clasica'));
 const b=await prepararFuentesMenu([{mimetype:'application/pdf',buffer:await pdf(false)}]);assert.equal(b[0].type,'file');assert(b[0].file.file_data.startsWith('data:application/pdf;base64,'));
});
test('rechaza archivos falsos, PDF dañado y más de 20 páginas antes de llamar IA',async()=>{
 await assert.rejects(prepararFuentesMenu([{mimetype:'application/pdf',buffer:png}]),/no coincide/);
 await assert.rejects(prepararFuentesMenu([{mimetype:'application/pdf',buffer:Buffer.from('%PDF-invalido')}]),/No pudimos abrir/);
 await assert.rejects(prepararFuentesMenu([{mimetype:'application/pdf',buffer:await pdf(false,21)}]),/20 páginas/);
});
test('validación permite precio pendiente solo en borrador y nunca multiplica los precios',()=>{
 assert.equal(validarProductosMenu([producto('Agua',500)])[0].precio,500);
 assert.equal(validarProductosMenu([producto('Falta precio',0)],{permitirCero:true})[0].precio,0);
 assert.throws(()=>validarProductosMenu([producto('Falta precio',0)]),/precio/);
 assert.throws(()=>validarProductosMenu(Array.from({length:501},()=>producto())),/500/);
});
function servidor({incompleto=false,transcripcion,esperarModelo,supabaseAdmin}={}){
 const routes=new Map(),calls=[],rpcCalls=[];let writes=0;
 const user={from(){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'rest-1'}}),delete(){writes++;throw Error('No debe escribir')},insert(){writes++;throw Error('No debe escribir')}}},rpc:async(name,args)=>{rpcCalls.push({name,args});return{data:'a'.repeat(32)}}};
 const context={registrarUsoIA:async()=>{},console:{info(){},error(){}},Buffer,crypto:require('node:crypto'),supabaseAdmin,AbortController,setTimeout,clearTimeout,supabaseUrl:"https://proyecto.supabase.co",process:{env:{}},prepararFuentesMenu,validarProductosMenu,errorMenu,upload:{array:()=>()=>{}},autenticarImportacionMenu(){},multer:{MulterError:class{}},app:{use(){},post:(route,...handlers)=>routes.set(route,handlers.at(-1)),get:(route,...handlers)=>routes.set('GET '+route,handlers.at(-1)),delete:(route,...handlers)=>routes.set('DELETE '+route,handlers.at(-1))},openai:{chat:{completions:{create:async input=>{calls.push(input);if(esperarModelo) await esperarModelo;return{choices:[{finish_reason:incompleto&&calls.length===2?'length':'stop',message:{content:JSON.stringify(transcripcion || {productos:[{...producto('Producto '+calls.length,500),familia:'',es_combo:false,familia_combo:''}],variantes:[]})}}],usage:{},model:'modelo-prueba'}}}}}};
 vm.createContext(context);const source=read('index.js');vm.runInContext(source.slice(source.indexOf('const uploadMenuFiles ='),source.indexOf("const { revisarDatosFotoMenu } = require")),context);
 const response=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(data){this.data=data;return this}});
 return{context,routes,calls,rpcCalls,user,response,get writes(){return writes}};
}
test('lectura reúne lotes en borrador sin borrar ni insertar productos',async()=>{
 const s=servidor(),res=s.response();await s.routes.get('/api/importar-menu')({body:{restaurante_id:'rest-1'},files:Array.from({length:3},()=>({mimetype:'image/png',buffer:png,size:png.length})),supabaseUsuario:s.user,usuarioImportacion:{id:'user'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.data.borrador,true);assert.equal(res.data.productos.length,2);assert.equal(res.data.productos[0].precio,500);assert.equal(s.calls.length,2);assert.equal(s.writes,0);assert.equal(s.rpcCalls[0].name,'velox_menu_version');
});
test('la importación conserva alternativas y señala solo las elecciones sin resolver', async () => {
 const descripcion = '¼ de pollo ó costilla churrasco ó mojarra + 2 gaseosas 250ml';
 const opciones = ['¼ de pollo', 'costilla churrasco', 'mojarra'].map(nombre => ({ grupo: 'Proteína', nombre, descripcion: '' }));
 const s = servidor({ transcripcion: { productos: [
   { ...producto('Arroz para 2', 35000), descripcion, opciones },
   { ...producto('Arroz familiar', 49000), descripcion: '2 pierna perniles frito ó costilla + arroz' },
   { ...producto('Arroz sencillo', 17000), descripcion: 'Arroz + gaseosa' }
 ], variantes: [] } });
 const res = s.response();
 await s.routes.get('/api/importar-menu')({ body:{restaurante_id:'rest-1'}, files:[{mimetype:'image/png',buffer:png,size:png.length}],supabaseUsuario:s.user,usuarioImportacion:{id:'user'} },res);
 assert.equal(res.statusCode, 200);
 const [claro, pendiente, fijo] = res.data.productos;
 assert.equal(claro.descripcion, descripcion);
 assert.deepEqual(JSON.parse(JSON.stringify(claro.opciones)), opciones);
 assert.equal(claro.revision_opciones, false);
 assert.equal(pendiente.revision_opciones, true);
 assert.equal(fijo.revision_opciones, false);
 assert.throws(() => validarProductosMenu([pendiente]), /Revisa las opciones/);
});

test('una carga confirmada sigue sin conexión y otro intento recupera la misma lectura', async () => {
 let lectura;
 const admin = { from(tabla) { if (tabla === 'velox_cache_carta') return {select(){return this},eq(){return this},maybeSingle(){return {}},upsert(){return {}}}; return {
   delete() { return this; }, eq() { return this; }, gt() { return this; },
   or() { return {}; },
   insert(fila) {
     if (lectura) return { error: { code: '23505' } };
     lectura = fila;
     return {};
   },
   select() { return this; }, maybeSingle() { return { data: lectura }; },
   update(valores) { Object.assign(lectura, valores); return this; }
 }; } };
 let terminar;
 let liberar;
 const modelo = new Promise(resolve => { terminar = resolve; });
 const liberada = new Promise(resolve => { liberar = resolve; });
 const s = servidor({ esperarModelo: modelo, supabaseAdmin: admin });
 const procesar = s.routes.get('/api/importar-menu');
 const consultar = s.routes.get('GET /api/lectura-menu/:restaurante');
 const solicitud = () => ({
   body: { restaurante_id: 'rest-1', crear_fotos: '0' }, params: { restaurante: 'rest-1' },
   files: [{ mimetype: 'image/png', buffer: png }],
   supabaseUsuario: s.user, usuarioImportacion: { id: 'user' },
   liberarCupoLectura: liberar
 });
 const salida = () => Object.assign(s.response(), { set() { return this; } });
 const recibida = salida();
 await procesar(solicitud(), recibida);
 assert.equal(recibida.statusCode, 202);
 assert.equal(recibida.data.lectura.estado, 'procesando');
 recibida.destroyed = true;
 const otra = salida();
 await procesar({ ...solicitud(), liberarCupoLectura() {} }, otra);
 assert.equal(otra.statusCode, 409);
 assert.equal(otra.data.lectura.id, recibida.data.lectura.id);
 terminar();
 await liberada;
 const recuperada = salida();
 await consultar(solicitud(), recuperada);
 assert.equal(recuperada.data.lectura.estado, 'listo');
 assert.equal(recuperada.data.lectura.resultado.productos[0].nombre, 'Producto 1');
 assert.equal(s.calls.length, 1);
 assert.equal(s.writes, 0);
});

test('lote incompleto no publica resultados parciales',async()=>{
 const s=servidor({incompleto:true}),res=s.response();await s.routes.get('/api/importar-menu')({body:{restaurante_id:'rest-1'},files:Array.from({length:3},()=>({mimetype:'image/png',buffer:png,size:png.length})),supabaseUsuario:s.user,usuarioImportacion:{id:'user'}},res);assert.equal(res.statusCode,500);assert.equal(s.writes,0);assert(!res.data.productos);
});
test('publicación usa RPC autenticado y detecta carta cambiada',async()=>{
 const s=servidor(),res=s.response();s.user.rpc=async(name,args)=>{assert.equal(name,'velox_publicar_menu');assert.equal(args.p_productos[0].precio,15000);return{data:1}};
 await s.routes.get('/api/publicar-menu')({body:{restaurante_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:'a'.repeat(32),productos:[producto()]},supabaseUsuario:s.user},res);assert.equal(res.data.success,true);
 s.user.rpc=async()=>({error:{message:'CARTA_CAMBIO'}});const conflicto=s.response();await s.routes.get('/api/publicar-menu')({body:{restaurante_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:'a'.repeat(32),productos:[producto()]},supabaseUsuario:s.user},conflicto);assert.equal(conflicto.statusCode,409);
});
function navegador(){
 const elements=new Map(),requests=[];const el=id=>{if(!elements.has(id))elements.set(id,{id,files:[],value:'',hidden:true,classList:{toggle(){},add(){},remove(){},contains(){return false;}},addEventListener(){},scrollIntoView(){},focus(){},showModal(){this.open=true},close(){this.open=false},setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]},removeAttribute(k){delete this[k]},reset(){this.files=[]}});return elements.get(id)};
 const context={console,AbortController,RESTAURANTE_ID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'sesion-prueba'}}})}},document:{getElementById:el,addEventListener(){},body:{style:{}}},window:{addEventListener(){},location:{origin:'https://velox.example'}},Blob,setTimeout,clearTimeout,FormData:class{set(){}append(nombre,blob,archivo){this.archivos??=[];this.archivos.push({nombre,blob,archivo})}},escaparHtmlUI:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),formatearPrecioCOP:n=>String(n),mostrarAviso:(el,msg)=>el.textContent=msg,cargarProductos:async()=>{},fetch:async(url,req)=>{requests.push({url,req});return{ok:true,json:async()=>url==='/api/importar-menu'?{success:true,borrador:true,productos:[producto()],version:'a'.repeat(32),paginas:1}:{success:true,count:1}}}};
 context.document.querySelector=()=>({replaceWith:elemento=>elements.set(elemento.id,elemento)});
 context.document.createElement=tag=>({tag,setAttribute(k,v){this[k]=v}});
 const colocaciones = [];
 el('editar-menu').querySelector = selector => ({
   'label[for="buscar-producto"]': el('etiqueta-buscador'),
   'button[onclick="nuevoProducto()"]': { parentElement: el('accion-agregar') }
 })[selector];
 for (const id of ['productos-editor-categorias','productos-editor-mas']) {
   el(id).after = (...nodos) => colocaciones.push([id, ...nodos]);
 }
 vm.createContext(context);vm.runInContext(read('app.menu-categorias.js'),context);vm.runInContext(read('app.menu-import.js'),context);el('menuFile').files=[{name:'carta.pdf',type:'application/pdf',size:100,arrayBuffer:async()=>new ArrayBuffer(100)}];return{context,el,requests,colocaciones,run:s=>vm.runInContext(s,context)};
}
test('revisión en navegador: leer no publica; corregir y publicar envía el precio revisado',async()=>{
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});assert.equal(n.requests.length,1);assert.equal(n.requests[0].url,'/api/importar-menu');assert.equal(n.el('revision-menu').hidden,false);
 n.context.editarDatoBorrador(0,'precio','22.000');await n.context.publicarMenuRevisado({preventDefault(){}});assert.equal(n.requests[1].url,'/api/publicar-menu');assert.equal(JSON.parse(n.requests[1].req.body).productos[0].precio,22000);assert.equal(n.el('revision-menu').hidden,true);
});
test('descartar no publica y una publicación fallida conserva el borrador',async()=>{
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});n.context.descartarRevisionMenu();assert.equal(n.requests.length,1);assert.equal(n.el('revision-menu').hidden,true);
 await n.context.enviarMenuConIA({preventDefault(){}});n.context.fetch=async()=>({ok:false,json:async()=>({error:'Fallo de prueba'})});await n.context.publicarMenuRevisado({preventDefault(){}});assert.equal(n.el('revision-menu').hidden,false);assert(n.run('borradorMenu.productos.length')===1);assert(n.el('importacion-menu-status').textContent.includes('Fallo de prueba'));
});
test('precio pendiente debe corregirse antes de publicar',async()=>{
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});n.context.editarDatoBorrador(0,'precio','0');await n.context.publicarMenuRevisado({preventDefault(){}});assert.equal(n.requests.length,1);assert(n.el('revision-producto-status').textContent.includes('precio'));
});

test('un corte al leer se explica en español y no dispara lecturas automáticas',async()=>{
 const n=navegador();let intentos=0;n.context.fetch=async()=>{intentos++;throw new TypeError('Failed to fetch')};await n.context.enviarMenuConIA({preventDefault(){}});assert.equal(intentos,1);assert(n.el('importacion-menu-status').textContent.includes('Se interrumpió la conexión'));assert(n.el('importacion-menu-status').textContent.includes('Tu carta actual no cambió'));assert(!n.el('importacion-menu-status').textContent.includes('Failed to fetch'));assert.equal(n.el('btn-procesar-ia').disabled,false);
});
test('fallo de conexión al validar sesión se distingue de una lectura de PDF',async()=>{
 const n=navegador();n.context.supabaseClient.auth.getSession=async()=>{throw new TypeError('Failed to fetch')};await n.context.enviarMenuConIA({preventDefault(){}});assert.equal(n.requests.length,0);assert(n.el('importacion-menu-status').textContent.includes('validar tu sesión'));
});
test('respuesta perdida al publicar conserva revisión y pide comprobar la carta',async()=>{
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});n.context.fetch=async()=>{throw new TypeError('Failed to fetch')};await n.context.publicarMenuRevisado({preventDefault(){}});assert(n.el('importacion-menu-status').textContent.includes('confirmar la publicación'));assert(n.el('importacion-menu-status').textContent.includes('Revisa tu carta'));assert.equal(n.el('revision-menu').hidden,false);
});

test('un archivo inaccesible en el teléfono se detecta antes de enviar o llamar IA',async()=>{
 const n=navegador();n.el('menuFile').files=[{type:'application/pdf',size:100,arrayBuffer:async()=>{throw new Error('NotReadableError')}}];await n.context.enviarMenuConIA({preventDefault(){}});assert.equal(n.requests.length,0);assert(n.el('importacion-menu-status').textContent.includes('leer el archivo en tu dispositivo'));assert.equal(n.el('btn-procesar-ia').disabled,false);
});
test('la subida contiene una copia Blob estable con el nombre del PDF',async()=>{
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});const archivo=n.requests[0].req.body.archivos[0];assert.equal(archivo.nombre,'menuFile');assert.equal(archivo.archivo,'carta.pdf');assert.equal(archivo.blob.type,'application/pdf');assert.equal(archivo.blob.size,100);assert.equal((await archivo.blob.arrayBuffer()).byteLength,100);
});
test('un selector de archivos bloqueado termina sin quedarse leyendo ni enviar una carga parcial',async()=>{
 const n=navegador();n.context.setTimeout=(fn)=>{fn();return 1};n.context.clearTimeout=()=>{};n.el('menuFile').files=[{type:'application/pdf',size:100,arrayBuffer:()=>new Promise(()=>{})}];await n.context.enviarMenuConIA({preventDefault(){}});assert.equal(n.requests.length,0);assert(n.el('importacion-menu-status').textContent.includes('Vuelve a seleccionarlo'));assert.equal(n.el('btn-procesar-ia').disabled,false);
});

test('fotos y PDF se seleccionan juntos en el selector general',async()=>{
 const n=navegador();n.el('menuFile').files=[{name:'foto.jpg',type:'image/jpeg',size:50,arrayBuffer:async()=>new ArrayBuffer(50)},{name:'carta.pdf',type:'application/pdf',size:100,arrayBuffer:async()=>new ArrayBuffer(100)}];n.context.actualizarResumenFotosMenu();assert.equal(n.el('menu-file-summary').textContent,'2 archivos seleccionados');await n.context.enviarMenuConIA({preventDefault(){}});const archivos=n.requests[0].req.body.archivos;assert.equal(archivos.length,2);assert.equal(archivos[0].archivo,'foto.jpg');assert.equal(archivos[1].archivo,'carta.pdf');assert(archivos.every(x=>x.nombre==='menuFile'));
});
test('la vista previa permite quitar una foto y enviar solo el PDF restante', async () => {
 const n = navegador();
 const foto = Object.assign(new Blob(['foto'], { type: 'image/jpeg' }), { name: 'foto.jpg' });
 const pdf = Object.assign(new Blob(['PDF'], { type: 'application/pdf' }), { name: 'carta.pdf' });
 n.el('menuFile').files = [foto, pdf];
 n.context.URL = URL;
 n.context.DataTransfer = class {
   files = [];
   items = { add: archivo => this.files.push(archivo) };
 };
 n.context.document.querySelectorAll = () => [{ focus() {} }];
 n.el('importacion-menu-status').textContent = 'Selecciona entre 1 y 10 fotos o PDF.';
 n.context.actualizarResumenFotosMenu(true);
 assert.equal(n.el('menu-file-preview').open, true);
 assert.equal(n.el('importacion-menu-status').textContent, '');
 n.context.renderizarVistaPreviaArchivosMenu(); // Simula el evento toggle del navegador.
 const lista = n.el('menu-file-preview-list');
 assert.match(lista.innerHTML, /<img src="blob:/);
 assert.match(lista.innerHTML, /Abrir PDF/);
 n.context.quitarArchivoMenu(0);
 assert.equal(n.el('menu-file-summary').textContent, '1 archivo seleccionado');
 assert.doesNotMatch(lista.innerHTML, /foto.jpg/);
 await n.context.enviarMenuConIA({ preventDefault() {} });
 assert.deepEqual(n.requests[0].req.body.archivos.map(a => a.archivo), ['carta.pdf']);
 n.el('menu-file-preview').open = false;
 n.context.renderizarVistaPreviaArchivosMenu();
});

test('el límite de 10 archivos se aplica a fotos y PDF combinados',async()=>{
 const n=navegador();n.el('menuFile').files=[...Array.from({length:6},()=>({type:'image/jpeg',size:50})),...Array.from({length:5},()=>({type:'application/pdf',size:50}))];await n.context.enviarMenuConIA({preventDefault(){}});assert.equal(n.requests.length,0);assert(n.el('importacion-menu-status').textContent.includes('10 fotos o PDF'));
});
test('el panel muestra los dos accesos a archivos sin un selector intermedio',()=>{
 const html=read('dashboard.html');
 assert.match(html,/<button[^>]*aria-controls="menuFile"[^>]*>Seleccionar archivos/);
 const selector=navegador().el('menu-file-options');
 assert.equal(selector.tag,'div');
 assert.equal(selector.role,'group');
 const opciones=selector.innerHTML;
 const input=html.match(/<input[^>]*id="menuFile"[^>]*>/)[0];
 assert.doesNotMatch(opciones,/<summary|Seleccionar archivos/);
 assert.match(opciones,/abrirSelectorArchivosMenu\(true\)[^>]*>Subir fotos/);
 assert.match(opciones,/abrirSelectorArchivosMenu\(false\)[^>]*>Subir PDF o archivo/);
 assert.match(input,/\bmultiple\b/);
 assert.doesNotMatch(input,/\b(?:accept|capture)=/);
});

test('el selector aplica el filtro de fotos y lo quita al volver a Archivos',()=>{
 const n=navegador();
 const input=n.el('menuFile');
 const archivos=input.files;
 const filtros=[];
 input.click=()=>filtros.push(input.accept);
 n.context.abrirSelectorArchivosMenu(true);
 n.context.abrirSelectorArchivosMenu(false);

 assert.deepEqual(filtros,['image/*',undefined]);
 assert.equal(input.files,archivos);
});

test('el editor coloca la búsqueda bajo las categorías y Agregar producto al final',()=>{
 const n = navegador();
 assert.deepEqual(n.colocaciones, [
   ['productos-editor-categorias', n.el('etiqueta-buscador'), n.el('buscar-producto')],
   ['productos-editor-mas', n.el('accion-agregar')]
 ]);
});

test('la carga muestra la etapa real y confirma la publicación', async () => {
 const n = navegador();
 const peticion = n.context.fetch;
 n.context.fetch = (...args) => {
   if (args[0] === '/api/importar-menu') {
     assert.match(n.el('importacion-menu-status').innerHTML, /Subiendo archivos/);
   }
   return peticion(...args);
 };
 await n.context.enviarMenuConIA({ preventDefault() {} });
 assert.match(n.el('importacion-menu-status').textContent, /Tu carta está lista/);
 assert.equal(n.el('btn-procesar-ia').hidden, false);
 assert.doesNotMatch(n.el('importacion-menu-status').textContent || '', /Carta publicada/);
 await n.context.publicarMenuRevisado({ preventDefault() {} });
 assert.match(n.el('importacion-menu-status').textContent, /Carta publicada/);
});

test('un panel recién abierto recupera un borrador listo sin reenviar archivos', async () => {
 const n = navegador();
 n.context.fetch = async (url, req) => {
   n.requests.push({url, req});
   return {ok:true,json:async()=>({lectura:{id:'lectura-1',estado:'listo',resultado:{
     productos:[producto('Pizza recuperada')],version:'a'.repeat(32)
   }}})};
 };
 assert.equal(await n.context.recuperarLecturaMenu(), true);
 assert.equal(n.el('revision-menu').hidden, false);
 assert.equal(n.el('revision-carta-ampliada').open, true);
 assert.match(n.el('revision-carta-frame').src, /vista=borrador/);
 assert.equal(n.run('borradorMenu.productos[0].nombre'), 'Pizza recuperada');
 assert.match(n.requests[0].url, /^\/api\/lectura-menu\//);
 assert.equal(n.requests.length, 1);
});

test('la vista del borrador usa la carta pública y bloquea el envío de pedidos', async () => {
 const origen = 'https://velox.example';
 const mensajes = [];
 const padre = { postMessage: (mensaje, destino) => mensajes.push({ mensaje, destino }) };
 const eventos = {};
 const eventosDocumento = {};
 class Elemento {
   closest(selector) {
     if (selector === '#contenedor-menu [data-editar-borrador]') return { dataset: { editarBorrador: 'borrador-0' } };
     return null;
   }
 }
 const elementos = new Map();
 const boton = {};
 const el = id => {
   if (!elementos.has(id)) elementos.set(id, {
     value: '', classList: { add() {}, remove() {} }, querySelector: () => boton,
     querySelectorAll: () => [], addEventListener() {}, toggleAttribute() {}
   });
   return elementos.get(id);
 };
 let solicitudes = 0;
 const ventana = {
   parent: padre, location: { search: '?vista=borrador', origin: origen },
   addEventListener: (tipo, listener) => { eventos[tipo] = listener; }
 };
 const contexto = vm.createContext({
   window: ventana, Element: Elemento, document: { getElementById: el, querySelectorAll: () => [], addEventListener: (tipo, listener) => { eventosDocumento[tipo] = listener; } },
   URLSearchParams, fetch: async () => { solicitudes++; throw Error('Una vista previa no debe consultar pedidos ni el menú publicado'); }
 });
 vm.runInContext(read('app.menu-categorias.js'), contexto);
 const scripts = [...read('menu.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
 vm.runInContext(scripts, contexto);
 await contexto.cargarMenu();
 const datos = { tipo: 'velox-borrador-carta', restaurante: 'Negocio de prueba', productos: [producto('Pizza del borrador')] };
 eventos.message({ source: padre, origin: 'https://otro.example', data: datos });
 assert.equal(el('contenedor-menu').innerHTML, undefined);
 eventos.message({ source: padre, origin: origen, data: datos });
 assert.match(el('contenedor-menu').innerHTML, /Pizza del borrador/);
 assert.doesNotMatch(el('contenedor-menu').innerHTML, /data-editar-borrador/);
 eventos.message({ source: padre, origin: origen, data: { ...datos, editable: true } });
 assert.match(el('contenedor-menu').innerHTML, /data-editar-borrador="borrador-0" class="tarjeta-borrador-editar" aria-label="Editar Pizza del borrador"/);
 assert.doesNotMatch(el('contenedor-menu').innerHTML, /data-action="personalizar"/);
 eventosDocumento.click({ target: new Elemento() });
 assert.equal(mensajes.length, 1);
 assert.equal(mensajes[0].mensaje.tipo, 'velox-editar-producto-borrador');
 assert.equal(mensajes[0].mensaje.indice, 0);
 assert.equal(mensajes[0].destino, origen);
 assert.equal(el('nombre-restaurante').innerText, 'Negocio de prueba');
 assert.equal(boton.disabled, true);
 await contexto.confirmarYEnviarPedido({ preventDefault() {} });
 assert.equal(solicitudes, 0);
});

test('el borrador abre solo el producto elegido y muestra la corrección al volver a la carta', async () => {
 const n = navegador();
 await n.context.enviarMenuConIA({ preventDefault() {} });
 n.run(`borradorMenu.productos = [
   { nombre: 'Pizza', categoria: 'Pizzas', precio: 19000 },
   { nombre: 'Hamburguesa', categoria: 'Hamburguesas', precio: 0 }
 ]`);
 n.context.abrirCartaBorrador();
 assert.equal(n.el('revision-carta-ampliada').open, true);
 const marco = n.el('revision-carta-frame');
 assert.equal(marco.hidden, false);
 await n.context.publicarMenuRevisado({ preventDefault() {} });
 assert.equal(n.requests.length, 1);
 assert.equal(marco.hidden, true);
 const lista = n.el('revision-menu-lista');
 assert.doesNotMatch(lista.innerHTML, /revision-producto-0/);
 assert.match(lista.innerHTML, /id="revision-producto-1"/);
 assert.match(lista.innerHTML, /Precio pendiente/);
 n.context.editarDatoBorrador(1, 'precio', '18000');
 let mensaje;
 marco.contentWindow = { postMessage(datos) { mensaje = datos; } };
 n.context.abrirCartaBorrador();
 assert.equal(marco.hidden, false);
 assert.equal(mensaje.productos[1].precio, 18000);
});

test('el borrador muestra la foto elegida y la sube una sola vez al publicar', async () => {
 const n = navegador();
 const foto = new Blob([png], { type: 'image/png' });
 n.context.URL = URL;
 n.context.crypto = require('node:crypto');
 const subidas = [];
 const urlPublica = ruta => 'https://proyecto.supabase.co/storage/v1/object/public/productos/' + ruta;
 n.context.supabaseClient.storage = { from: () => ({
   upload: async (ruta, archivo) => { subidas.push(ruta); assert.equal(archivo, foto); return {}; },
   getPublicUrl: ruta => ({ data: { publicUrl: urlPublica(ruta) } })
 }) };
 await n.context.enviarMenuConIA({preventDefault(){}});
 n.context.abrirCartaBorrador(0);
 n.context.seleccionarFotoBorradorMenu(0, foto);
 assert.match(n.el('revision-foto-previa').src, /^blob:/);
 assert.equal(n.el('revision-foto-controles').hidden, false);
 assert.equal(subidas.length, 0);
 const publicaciones = [];
 n.context.fetch = async (_url, req) => {
   publicaciones.push(JSON.parse(req.body));
   return publicaciones.length === 1
     ? { ok: false, json: async () => ({ error: 'Fallo temporal' }) }
     : { ok: true, json: async () => ({ success: true, count: 1 }) };
 };
 for (let i = 0; i < 2; i++) await n.context.publicarMenuRevisado({preventDefault(){}});
 assert.equal(subidas.length, 1);
 assert.equal(publicaciones[0].productos[0].imagen_url, urlPublica(subidas[0]));
 assert.deepEqual(publicaciones[1], publicaciones[0]);
});

test('publicar acepta fotos del restaurante y rechaza una ruta de otro', async () => {
 const s = servidor();
 const restaurante = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const url = `https://proyecto.supabase.co/storage/v1/object/public/productos/restaurante_${restaurante}/borrador-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
 const publicar = s.routes.get('/api/publicar-menu');
 const solicitud = imagen_url => ({ body: { restaurante_id: restaurante, version: 'a'.repeat(32), productos: [{ ...producto(), imagen_url }] }, supabaseUsuario: s.user });
 const correcta = s.response();
 await publicar(solicitud(url), correcta);
 assert.equal(correcta.data.success, true);
 assert.equal(s.rpcCalls.at(-1).args.p_productos[0].imagen_url, url);
 const incorrecta = s.response();
 await publicar(solicitud(url.replace(restaurante, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), incorrecta);
 assert.equal(incorrecta.statusCode, 400);
 assert.equal(s.rpcCalls.length, 1);
});

test('crear foto con IA usa el generador existente y la muestra en el borrador', async () => {
 const n = navegador();
 n.context.URL = URL;
 n.context.File = require('node:buffer').File;
 n.context.confirm = () => true;
 await n.context.enviarMenuConIA({preventDefault(){}});
 n.context.abrirCartaBorrador(0);
 n.context.fetch = async (url, req) => {
   assert.equal(url, '/api/productos/generar-imagen-borrador');
   assert.equal(JSON.parse(req.body).producto.nombre, producto().nombre);
   return { ok: true, headers: { get: () => 'image/webp' }, blob: async () => new Blob(['foto']) };
 };
 const boton = {};
 await n.context.generarFotoBorradorMenu(0, boton);
 assert.match(n.el('revision-foto-previa').src, /^blob:/);
 assert.equal(boton.disabled, false);
 const frame = n.el('revision-carta-frame');
 frame.contentWindow = { postMessage: datos => assert.match(datos.productos[0].imagen_url, /^blob:/) };
 n.context.enviarVistaClientesBorrador(frame);
 n.context.descartarRevisionMenu();
});


test('quitar la foto antes de publicar limpia la vista previa y omite la subida', async () => {
 const n = navegador();
 n.context.URL = URL;
 await n.context.enviarMenuConIA({preventDefault(){}});
 n.context.abrirCartaBorrador(0);
 n.context.seleccionarFotoBorradorMenu(0, new Blob([png], { type: 'image/png' }));
 const urlTemporal = n.el('revision-foto-previa').src;
 n.context.quitarFotoBorradorMenu(0);
 assert.equal(n.el('revision-foto-controles').hidden, true);
 assert.equal(n.el('revision-foto-previa').src, undefined);
 await assert.rejects(fetch(urlTemporal));
 await n.context.publicarMenuRevisado({preventDefault(){}});
 assert.equal(n.requests[1].url, '/api/publicar-menu');
 assert.equal(JSON.parse(n.requests[1].req.body).productos[0].imagen_url, undefined);
});


test('una lectura sin respuesta vence, aborta el trabajo y libera el cupo sin generar borrador', async () => {
 let lectura;
 const admin = { from(tabla) { if (tabla === 'velox_cache_carta') return {select(){return this},eq(){return this},maybeSingle(){return {}},upsert(){return {}}}; return {
   delete() { return this; }, eq() { return this; }, gt() { return this; },
   or() { return {}; },
   insert(fila) { lectura = fila; return {}; },
   select() { return this; }, maybeSingle() { return { data: lectura }; },
   update(valores) { Object.assign(lectura, valores); return this; },
   then(resolver) { return Promise.resolve({ data: lectura }).then(resolver); }
 }; } };
 let terminarModelo;
 const modelo = new Promise(resolve => { terminarModelo = resolve; });
 const s = servidor({ esperarModelo: modelo, supabaseAdmin: admin });
 const temporizadores = new Map();
 let secuencia = 0;
 s.context.setTimeout = (fn, ms) => { const id = ++secuencia; temporizadores.set(id, { fn, ms }); return id; };
 s.context.clearTimeout = id => temporizadores.delete(id);
 let liberar;
 const liberada = new Promise(resolve => { liberar = resolve; });
 const respuesta = s.response();
 await s.routes.get('/api/importar-menu')({
   body: { restaurante_id: 'rest-1', crear_fotos: '0' },
   files: [{ mimetype: 'image/png', buffer: png }],
   supabaseUsuario: s.user, usuarioImportacion: { id: 'user' }, liberarCupoLectura: liberar
 }, respuesta);
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(respuesta.statusCode, 202);
 assert.match(lectura.mensaje, /páginas 1–1 de 1/);
 assert(Date.parse(lectura.vence_en) - Date.now() <= 120000);
 const plazo = [...temporizadores.values()].find(t => t.ms === 120000);
 assert(plazo);
 plazo.fn();
 await liberada;
 assert.equal(lectura.estado, 'error');
 assert.match(lectura.mensaje, /interrumpió/);
 assert.equal(lectura.resultado, undefined);
 terminarModelo();
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(lectura.estado, 'error');
 assert.equal(s.writes, 0);
 assert.equal(temporizadores.size, 0);
});

test('una consulta del panel colgada libera su estado y programa la reconexión', async () => {
 const n = navegador();
 const temporizadores = new Map();
 let secuencia = 0;
 n.context.setTimeout = (fn, ms) => { const id = ++secuencia; temporizadores.set(id, { fn, ms }); return id; };
 n.context.clearTimeout = id => temporizadores.delete(id);
 n.context.aplicarEstadoLecturaMenu({ id: 'lectura-1', estado: 'procesando', mensaje: 'Leyendo páginas 3–4 de 6…' });
 assert.match(n.el('importacion-menu-status').innerHTML, /Leyendo tu menú/);
 assert.equal(n.el('btn-procesar-ia').hidden, true);
 n.context.aplicarEstadoLecturaMenu({ id: 'lectura-1', estado: 'procesando', mensaje: 'Preparando imágenes, 23 de 35…' });
 assert.match(n.el('importacion-menu-status').innerHTML, /Creando fotos: 23 de 35/);
 assert.match(n.el('importacion-menu-status').innerHTML, /Tu carta cambia solo al publicar/);
 let signal;
 n.context.fetch = async (_url, req) => { signal = req.signal; return new Promise(() => {}); };
 const consulta = n.context.recuperarLecturaMenu();
 await new Promise(resolve => setImmediate(resolve));
 const plazo = [...temporizadores.values()].find(t => t.ms === 20000);
 assert(plazo);
 plazo.fn();
 assert.equal(await consulta, false);
 assert.equal(signal.aborted, true);
 assert.equal(n.run('consultandoLecturaMenu'), false);
 assert.match(n.el('importacion-menu-status').textContent, /Reintentando/);
 assert([...temporizadores.values()].some(t => t.ms === 4000));
 n.context.fetch = async () => ({ok:true,json:async()=>({lectura:{id:'lectura-1',estado:'listo',resultado:{productos:[producto()],version:'a'.repeat(32)}}})});
 assert.equal(await n.context.recuperarLecturaMenu(), true);
 assert.equal(n.el('revision-menu').hidden, false);
});

test('un servidor que vuelve después del vencimiento devuelve un error recuperable', async () => {
 const admin = { from: () => ({
   select() { return this; }, eq() { return this; },
   maybeSingle: async () => ({data:{id:'lectura-vencida',estado:'procesando',vence_en:new Date(Date.now()-1000).toISOString()}})
 }) };
 const s = servidor({supabaseAdmin:admin});
 const respuesta = Object.assign(s.response(),{set(){}});
 await s.routes.get('GET /api/lectura-menu/:restaurante')({
   params:{restaurante:'rest-1'},supabaseUsuario:s.user,usuarioImportacion:{id:'user'}
 },respuesta);
 assert.equal(respuesta.data.lectura.estado,'error');
 assert.match(respuesta.data.lectura.mensaje,/Vuelve a seleccionar/);
 assert.equal(s.calls.length,0);
});

test('reutiliza solo fotos propias para la misma receta aunque cambie el precio', () => {
 const s = servidor();
 const foto = 'https://proyecto.supabase.co/clasica.webp';
 const repetida = 'https://proyecto.supabase.co/pizza.webp';
 const clasica = { ...producto(), imagen_url: foto };
 s.context.clasica = clasica;
 s.context.actuales = [clasica, { ...producto('Pizza personal'), imagen_url: repetida },
   { ...producto('Pizza familiar'), imagen_url: repetida }];
 vm.runInContext('globalThis.fotos = fotosReutilizablesMenu(actuales)', s.context);
 assert.equal(s.context.fotos.size, 1);
 assert.equal(vm.runInContext('fotos.get(claveFotoMenu({...clasica, precio:20000}))', s.context), foto);
 assert.equal(vm.runInContext('fotos.get(claveFotoMenu({...clasica, descripcion:"Nueva receta"}))', s.context), undefined);
});

test('completar fotos omite platos con foto o sin datos suficientes', async () => {
 const n = navegador();
 n.context.URL = URL;
 n.context.File = require('node:buffer').File;
 n.context.confirm = mensaje => /Crear 4 fotos/.test(mensaje);
 await n.context.enviarMenuConIA({preventDefault() {}});
 n.run(`borradorMenu.productos = [
   { nombre:'Con foto', categoria:'Pizzas', descripcion:'Queso', imagen_url:'https://velox.test/pizza.webp' },
   { nombre:'Especial', categoria:'Pizzas', descripcion:'' },
   ...Array.from({length:4}, (_, i) => ({nombre:'Plato ' + i, categoria:'Pizzas', descripcion:'Queso'}))
 ];`);
 const pedidos = [];
 n.context.fetch = async (url, req) => {
   assert.equal(url, '/api/productos/generar-imagen-borrador');
   pedidos.push(JSON.parse(req.body).producto.nombre);
   return { ok:true, headers:{get:()=> 'image/webp'}, blob:async()=> new Blob(['foto']) };
 };
 await n.context.completarFotosBorrador();
 assert.deepEqual(pedidos, ['Plato 0', 'Plato 1', 'Plato 2', 'Plato 3']);
 assert.equal(n.run('fotosBorradorMenu.size'), 4);
 await n.context.descartarRevisionMenu();
});

test('la carga pide fotos automáticas sin mostrar la casilla', async () => {
 const n = navegador();
 assert.doesNotMatch(read('dashboard.html'), /menu-fotos-automaticas/);
 n.context.FormData = class {
   append() {}
   set(clave, valor) { this[clave] = valor; }
 };
 await n.context.enviarMenuConIA({preventDefault() {}});
 assert.equal(n.requests[0].req.body.crear_fotos, '1');
 assert.equal(n.requests.length, 1);
});

test('un PDF de dos columnas conserva la disposición visual para vincular precios', async () => {
 const d = await PDFDocument.create();
 const font = await d.embedFont(StandardFonts.Helvetica);
 const pagina = d.addPage();
 pagina.drawText('PIZZAS TRADICIONALES: Hawaiana, Pepperoni, Champinones', {x:20,y:700,font,size:10});
 pagina.drawText('PIZZAS ESPECIALES: Cuatro quesos, Vegetariana, Pollo', {x:330,y:700,font,size:10});
 pagina.drawText('Personal 15000 / Familiar 35000', {x:20,y:680,font,size:10});
 pagina.drawText('Personal 22000 / Familiar 48000', {x:330,y:680,font,size:10});
 const fuentes = await prepararFuentesMenu([{mimetype:'application/pdf',buffer:Buffer.from(await d.save())}]);
 assert.equal(fuentes[0].type, 'file');
});

test('una opción válida no oculta una bebida a elección sin lista', async () => {
 const opciones = ['Papa', 'Yuca'].map(nombre => ({grupo:'Acompañamiento', nombre, descripcion:''}));
 const productos = [
   {...producto('Combo 1'), descripcion:'Hamburguesa + papa o yuca + gaseosa 250 ml a elección', opciones},
   {...producto('Combo 2'), descripcion:'Hamburguesa + papa o yuca + gaseosa 250 ml', opciones},
   {...producto('Combo 3'), descripcion:'Hamburguesa + gaseosa a elección',
     opciones:[{grupo:'Bebida',nombre:'Colombiana',descripcion:''},{grupo:'Bebida',nombre:'Manzana',descripcion:''}]}
 ];
 const s = servidor({transcripcion:{productos,variantes:[]}});
 const res = s.response();
 await s.routes.get('/api/importar-menu')({body:{restaurante_id:'rest-1'},files:[{mimetype:'image/png',buffer:png}],supabaseUsuario:s.user,usuarioImportacion:{id:'user'}},res);
 assert.equal(res.statusCode, 200);
 assert.deepEqual(Array.from(res.data.productos, p => p.revision_opciones), [true,false,false]);
 assert.equal(res.data.productos[0].opciones.filter(o => o.grupo === 'Acompañamiento').length, 2);
});

test('un plato sin descripción ni foto cuenta como listo si se puede vender', async () => {
 const n = navegador();
 await n.context.enviarMenuConIA({preventDefault() {}});
 n.run(`borradorMenu.productos = [
   {nombre:'Porción francesa',categoria:'Papas',precio:6000,descripcion:'',opciones:[]},
   {nombre:'Especial',categoria:'Otros',precio:0,descripcion:'',opciones:[]}
 ]; actualizarResumenRevision();`);
 assert.equal(n.el('revision-resumen').textContent, '1 producto por corregir');
 assert.equal(n.el('revision-bloqueos').textContent, '1 precio pendiente');
 assert.equal(n.el('revision-fotos-resumen').textContent, '2 productos sin foto · Añadir fotos (opcional)');
 assert.equal(n.el('revision-siguiente').textContent, 'Revisar correcciones');
 const {revisarDatosFotoMenu} = require('../app.menu-categorias');
 assert.equal(revisarDatosFotoMenu({nombre:'Porción francesa',categoria:'Papas'}),'');
 assert.ok(revisarDatosFotoMenu({nombre:'Porción francesa',categoria:'Otros'}));
});

test('la búsqueda de la carta recorre categorías y vuelve a la categoría activa al limpiarla', () => {
 const html = read('menu.html');
 const inicio = html.indexOf('function mostrarProductosCarta()');
 const fin = html.indexOf('function actualizarDesbordeCategorias()', inicio);
 const campo = {value:'pollo limon'};
 const estado = {textContent:''};
 const pizza = {...producto('Pizza'),categoria:'Pizzas'};
 const combo = {...producto('Combo de pollo'),categoria:'Combos',descripcion:'Con jugo de limón'};
 const vistas = [];
 const contexto = {
   todosLosProductos:[pizza,combo],
   categoriasMenu:['Pizzas','Combos'],
   indiceCategoriaActiva:0,
   document:{getElementById:id=>id==='buscar-plato-carta'?campo:estado},
   renderizarProductos:(productos,mensaje)=>vistas.push({productos,mensaje})
 };
 vm.createContext(contexto);
 vm.runInContext(read('app.menu-categorias.js'), contexto);
 vm.runInContext(html.slice(inicio,fin), contexto);
 contexto.mostrarProductosCarta();
 assert.equal(vistas.at(-1).productos[0], combo);
 campo.value = 'sin coincidencias';
 contexto.mostrarProductosCarta();
 assert.equal(vistas.at(-1).productos.length, 0);
 assert.match(vistas.at(-1).mensaje,/No encontramos platos/);
 campo.value = '';
 contexto.mostrarProductosCarta();
 assert.equal(vistas.at(-1).productos[0], pizza);
});

test('al recuperar desde Mi carta anuncia el borrador sin sacar al usuario del inicio', async () => {
 const n = navegador();
 n.el('importar-menu-fotos').classList.contains = clase => clase === 'hidden';
 n.context.fetch = async () => ({ok:true,json:async()=>({lectura:{id:'lectura-inicio',estado:'listo',resultado:{productos:[producto()],version:'a'.repeat(32)}}})});
 assert.equal(await n.context.recuperarLecturaMenu(), true);
 assert.equal(n.el('cargar-carta-ayuda').textContent, 'Revisar borrador');
 assert.notEqual(n.el('revision-carta-ampliada').open, true);
 const html = read('dashboard.html');
 assert.match(html, /id="sec-menu-ia" class="order-1 space-y-4"/);
 assert.match(html, /id="sec-pedidos" class="hidden space-y-4"/);
 assert.match(html, /if \(borradorMenu\) abrirCartaBorrador\(\)/);
 assert.match(html, /<details class="text-xs text-slate-400"><summary[^>]*>Formatos y límites/);
});

test('las fotos opcionales no bloquean publicar ni llenan el resumen de advertencias', async () => {
 const n=navegador();
 await n.context.enviarMenuConIA({preventDefault(){}});
 n.run(`borradorMenu.productos=[{nombre:'Porción',categoria:'Pizzas',precio:8500,descripcion:'',opciones:[]}]; indiceRevisionActual=null; actualizarAccionesBorrador();`);
 assert.equal(n.el('revision-resumen').hidden,true);
 assert.equal(n.el('revision-bloqueos').hidden,true);
 assert.equal(n.el('revision-siguiente').hidden,true);
 assert.equal(n.el('btn-publicar-menu').disabled,false);
 assert.equal(n.el('revision-fotos-opcionales').hidden,false);
 assert.match(n.el('revision-fotos-resumen').textContent,/1 producto sin foto/);
 n.run(`borradorMenu.productos[0].precio=0; actualizarAccionesBorrador();`);
 assert.equal(n.el('revision-resumen').hidden,false);
 assert.equal(n.el('revision-siguiente').hidden,false);
 assert.equal(n.el('btn-publicar-menu').disabled,true);
 n.run(`borradorMenu.productos[0].precio=8500; borradorMenu.productos[0].imagen_url='https://velox.test/foto.webp'; actualizarAccionesBorrador();`);
 assert.equal(n.el('revision-fotos-opcionales').hidden,true);
 assert.equal(n.el('btn-publicar-menu').disabled,false);
});

test('Listo vuelve a la carta y conserva la edición sin publicar el borrador', async () => {
 const n=navegador();
 await n.context.enviarMenuConIA({preventDefault(){}});
 const peticiones=n.requests.length;
 n.context.abrirCartaBorrador(0);
 assert.equal(n.el('form-revision-menu').hidden,true);
 assert.equal(n.el('btn-terminar-revision').hidden,false);
 assert.match(n.el('revision-menu-lista').innerHTML,/Personalizar este producto/);
 assert.match(n.el('revision-menu-lista').innerHTML,/Ver ejemplo en mi carta/);
 assert.match(n.el('revision-menu-lista').innerHTML,/Eliminar del borrador/);
 assert.doesNotMatch(n.el('revision-menu-lista').innerHTML,/Quitar de esta carga/);
 n.context.editarDatoBorrador(0,'descripcion','Tomate y queso');
 n.context.terminarEdicionBorrador();
 assert.equal(n.run('borradorMenu.productos[0].descripcion'),'Tomate y queso');
 assert.equal(n.run('indiceRevisionActual'),null);
 assert.equal(n.el('form-revision-menu').hidden,false);
 assert.equal(n.el('btn-terminar-revision').hidden,true);
 assert.equal(n.el('revision-carta-frame').hidden,false);
 assert.equal(n.requests.length,peticiones);
});

test('las opciones se agrupan sin repetir sus formularios y conservan los índices originales',async()=>{
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});
 n.run(`borradorMenu.productos[0].opciones=[
 {grupo:'Sabores',nombre:'Hawaiana',descripcion:'Piña'},
 {grupo:'__velox_combo_family__',nombre:'Pizzas',descripcion:''},
 {grupo:' SABORES ',nombre:'Criolla',descripcion:'Maíz'},
 {grupo:'Proteína',nombre:'Pollo',descripcion:''}
 ]; renderizarRevisionMenu(0);`);
 const html=n.el('revision-menu-lista').innerHTML;
 assert.equal((html.match(/data-grupo-opciones/g)||[]).length,2);
 assert.match(html,/Sabores \(2\)/);
 assert.match(html,/velox-opciones-panel/);
 assert.match(html,/renombrarGrupoBorrador\(0,0,this.value\)/);
 assert.doesNotMatch(html,/__velox_combo_family__/);
 assert.match(html,/editarDatoBorrador\(0, 'nombre', this.value, 2\)/);
 n.context.editarDatoBorrador(0,'nombre','Criolla especial',2);
 assert.equal(n.run('borradorMenu.productos[0].opciones[2].nombre'),'Criolla especial');
 n.context.renombrarGrupoBorrador(0,0,'Sabor');
 assert.equal(n.run('borradorMenu.productos[0].opciones[0].grupo'),'Sabor');
 assert.equal(n.run('borradorMenu.productos[0].opciones[2].grupo'),'Sabor');
 assert.equal(n.run('borradorMenu.productos[0].opciones[1].grupo'),'__velox_combo_family__');
 n.context.cambiarOpcionesBorrador(0,undefined,0);
 assert.equal(n.run('borradorMenu.productos[0].opciones[4].grupo'),'Sabor');
 n.context.cambiarOpcionesBorrador(0,2);
 assert.equal(n.run('borradorMenu.productos[0].opciones[1].grupo'),'__velox_combo_family__');
 assert.equal(n.run('borradorMenu.productos[0].opciones[2].nombre'),'Pollo');
});

test('la vista de elecciones muestra datos reales, escapa texto y se actualiza al editar',async()=>{
 const {crearVistaEleccionesCliente}=require('../app.menu-categorias');
 const html=crearVistaEleccionesCliente([{grupo:'Sabor',nombre:'Hawaiana <especial>',descripcion:'Piña & queso'},{grupo:'__velox_combo_family__',nombre:'Oculto'},{grupo:'Sabor',nombre:''}],'prueba');
 assert.match(html,/Elige un sabor/);
 assert.match(html,/type="radio"/);
 assert.match(html,/Hawaiana &lt;especial&gt;/);
 assert.match(html,/Piña &amp; queso/);
 assert.doesNotMatch(html,/Oculto|<especial>/);
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});
 n.run(`borradorMenu.productos[0].opciones=[{grupo:'Sabor',nombre:'Hawaiana',descripcion:'Piña'}]; renderizarRevisionMenu(0);`);
 assert.match(n.el('revision-menu-lista').innerHTML,/Ver ejemplo en mi carta/);
 n.context.editarDatoBorrador(0,'nombre','Criolla',0);
 assert.match(n.el('revision-elecciones-previa-0').innerHTML,/Criolla/);
 assert.doesNotMatch(n.el('revision-elecciones-previa-0').innerHTML,/Hawaiana/);
});

test('el acceso al borrador desaparece al publicar y solo vuelve con otro borrador',async()=>{
 const n=navegador();
 assert.match(read('dashboard.html'),/id="carta-borrador-acceso"[^>]* hidden/);
 await n.context.enviarMenuConIA({preventDefault(){}});
 assert.equal(n.el('carta-borrador-acceso').hidden,false);
 await n.context.publicarMenuRevisado({preventDefault(){}});
 assert.equal(n.run('borradorMenu'),null);
 assert.equal(n.el('carta-borrador-acceso').hidden,true);
 n.context.mostrarBorradorMenu({version:'a'.repeat(32),productos:[producto()]},'otro-borrador');
 assert.equal(n.el('carta-borrador-acceso').hidden,false);
 n.context.olvidarBorradorMenu();
 assert.equal(n.el('carta-borrador-acceso').hidden,true);
});

test('el ejemplo vivo muestra el producto completo y actualiza datos sin guardar',async()=>{
 const {crearVistaProductoCliente}=require('../app.menu-categorias');
 const p={nombre:'Pizza <especial>',descripcion:'Piña & queso',precio:19000,imagen_url:'https://fotos.example/pizza.webp',opciones:[{grupo:'Sabor',nombre:'Hawaiana',descripcion:'Piña'}]};
 const html=crearVistaProductoCliente(p,'producto');
 assert.match(html,/Pizza &lt;especial&gt;/);
 assert.match(html,/Piña &amp; queso/);
 assert.match(html,/19\.000/);
 assert.match(html,/src="https:\/\/fotos.example\/pizza.webp"/);
 assert.match(html,/Elegir sabores/);
 assert.match(html,/data-ejemplo-opciones/);
 assert.match(html,/type="radio"/);
 assert.doesNotMatch(crearVistaProductoCliente({...p,imagen_url:'javascript:alert(1)'},'x'),/src="javascript/);
 assert.match(crearVistaProductoCliente({...p,opciones:[]},'x'),/Ejemplo ilustrativo/);
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});
 n.run("borradorMenu.productos[0].opciones=[{grupo:'Sabor',nombre:'Hawaiana'}]; renderizarRevisionMenu(0);");
 n.context.editarDatoBorrador(0,'nombre','Pizza nueva');
 n.context.editarDatoBorrador(0,'descripcion','Carne y queso');
 n.context.editarDatoBorrador(0,'precio','25.000');
 const vista=n.el('revision-elecciones-previa-0').innerHTML;
 assert.match(vista,/Pizza nueva/);assert.match(vista,/Carne y queso/);assert.match(vista,/25\.000/);assert.match(vista,/Elegir sabores/);
});

 test('un producto vacío siempre tiene ejemplo interactivo sin guardar los datos de muestra',()=>{
 const {crearVistaProductoCliente}=require('../app.menu-categorias');
 const p={nombre:'',precio:0,descripcion:'',opciones:[]};
 const original=JSON.stringify(p);const html=crearVistaProductoCliente(p,'muestra');
 for(const texto of ['Ejemplo ilustrativo','Pizza personal','19.000','Elegir sabores','Hawaiana','Pollo','Tu foto aquí']) assert.ok(html.includes(texto),texto);
 assert.doesNotMatch(html,/Precio pendiente|Nombre del producto|Sin foto/);
 assert.equal(JSON.stringify(p),original);
 });

test('el ejemplo siempre abre variantes con el mismo botón que la carta',()=>{
 const {crearVistaProductoCliente,textoBotonVariantesCliente}=require('../app.menu-categorias');
 for (const [grupo,boton] of [['Sabor','Elegir sabores'],['Gaseosas','Elegir gaseosas'],['Acompañamiento','Elegir acompañamiento'],['Salsas','Elegir salsas']]) {
  assert.equal(textoBotonVariantesCliente([grupo]),boton);
  const html=crearVistaProductoCliente({nombre:'Combo',precio:20000,opciones:[{grupo,nombre:'Opción A'},{grupo,nombre:'Opción B'}]},'prueba');
  assert.ok(html.includes(boton));assert.match(html,/data-ejemplo-opciones/);assert.match(html,/type="radio"/);assert.match(html,/Opción A/);assert.match(html,/Opción B/);assert.doesNotMatch(html,/\+ Agregar/);
 }
 assert.match(crearVistaProductoCliente({},'demo'),/Elegir sabores/);
 assert.doesNotMatch(crearVistaProductoCliente({},'demo'),/\+ Agregar/);
});
