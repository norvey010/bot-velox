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
function servidor({incompleto=false}={}){
 const routes=new Map(),calls=[],rpcCalls=[];let writes=0;
 const user={from(){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'rest-1'}}),delete(){writes++;throw Error('No debe escribir')},insert(){writes++;throw Error('No debe escribir')}}},rpc:async(name,args)=>{rpcCalls.push({name,args});return{data:'a'.repeat(32)}}};
 const context={console:{info(){},error(){}},Buffer,process:{env:{}},prepararFuentesMenu,validarProductosMenu,errorMenu,upload:{array:()=>()=>{}},autenticarImportacionMenu(){},multer:{MulterError:class{}},app:{use(){},post:(route,...handlers)=>routes.set(route,handlers.at(-1))},openai:{chat:{completions:{create:async input=>{calls.push(input);return{choices:[{finish_reason:incompleto&&calls.length===2?'length':'stop',message:{content:JSON.stringify({productos:[{...producto('Producto '+calls.length,500),familia:'',es_combo:false,familia_combo:''}],variantes:[]})}}],usage:{},model:'modelo-prueba'}}}}}};
 vm.createContext(context);const source=read('index.js');vm.runInContext(source.slice(source.indexOf('const uploadMenuFiles ='),source.indexOf('function normalizarTextoImagen')),context);
 const response=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(data){this.data=data;return this}});
 return{routes,calls,rpcCalls,user,response,get writes(){return writes}};
}
test('lectura reúne lotes en borrador sin borrar ni insertar productos',async()=>{
 const s=servidor(),res=s.response();await s.routes.get('/api/importar-menu')({body:{restaurante_id:'rest-1'},files:Array.from({length:3},()=>({mimetype:'image/png',buffer:png,size:png.length})),supabaseUsuario:s.user,usuarioImportacion:{id:'user'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.data.borrador,true);assert.equal(res.data.productos.length,2);assert.equal(res.data.productos[0].precio,500);assert.equal(s.calls.length,2);assert.equal(s.writes,0);assert.equal(s.rpcCalls[0].name,'velox_menu_version');
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
 const elements=new Map(),requests=[];const el=id=>{if(!elements.has(id))elements.set(id,{files:[],value:'',hidden:true,classList:{toggle(){},add(){},remove(){}},addEventListener(){},scrollIntoView(){},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},reset(){this.files=[]}});return elements.get(id)};
 const context={console,RESTAURANTE_ID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'sesion-prueba'}}})}},document:{getElementById:el},window:{addEventListener(){}},Blob,setTimeout,clearTimeout,FormData:class{set(){}append(nombre,blob,archivo){this.archivos??=[];this.archivos.push({nombre,blob,archivo})}},escaparHtmlUI:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),formatearPrecioCOP:n=>String(n),mostrarAviso:(el,msg)=>el.textContent=msg,cargarProductos:async()=>{},fetch:async(url,req)=>{requests.push({url,req});return{ok:true,json:async()=>url==='/api/importar-menu'?{success:true,borrador:true,productos:[producto()],version:'a'.repeat(32),paginas:1}:{success:true,count:1}}}};
 context.document.querySelector=()=>({replaceWith:elemento=>elements.set(elemento.id,elemento)});
 context.document.createElement=tag=>({tag,setAttribute(k,v){this[k]=v}});
 el('revision-menu-lista').insertAdjacentHTML=()=>{};
 el('revision-anterior').remove=()=>{};
 context.coincideBusquedaProducto=(texto,busqueda)=>texto.includes(busqueda);
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
 const n=navegador();await n.context.enviarMenuConIA({preventDefault(){}});n.context.editarDatoBorrador(0,'precio','0');await n.context.publicarMenuRevisado({preventDefault(){}});assert.equal(n.requests.length,1);assert(n.el('importacion-menu-status').textContent.includes('precio'));
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
 n.el('menu-file-preview').open = true;
 n.context.actualizarResumenFotosMenu();
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
 assert.match(opciones,/abrirSelectorArchivosMenu\(true\)[^>]*>Elegir fotos/);
 assert.match(opciones,/abrirSelectorArchivosMenu\(false\)[^>]*>Buscar en archivos/);
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
 const progreso = n.el('velox-progreso-importacion');
 const peticion = n.context.fetch;
 n.context.fetch = (...args) => {
   if (args[0] === '/api/importar-menu') {
     assert.match(progreso.innerHTML, /data-estado="actual"[^>]*>\s*<span[^>]*>2<\/span>\s*<span>Leyendo con IA/);
   }
   return peticion(...args);
 };
 await n.context.enviarMenuConIA({ preventDefault() {} });
 assert.equal((progreso.innerHTML.match(/data-estado="listo"/g) || []).length, 3);
 assert.doesNotMatch(n.el('importacion-menu-status').textContent || '', /Carta publicada/);
 await n.context.publicarMenuRevisado({ preventDefault() {} });
 assert.match(n.el('importacion-menu-status').textContent, /Carta publicada/);
 assert.equal(progreso.hidden, true);
});

test('el borrador agrupa por categoría y abre un producto pendiente aunque esté fuera del filtro', async () => {
 const n = navegador();
 await n.context.enviarMenuConIA({ preventDefault() {} });
 n.run(`categoriaRevisionMenu = ''; borradorMenu.productos = [
   { nombre: 'Pizza', categoria: 'Pizzas', precio: 19000 },
   { nombre: 'Hamburguesa', categoria: 'Hamburguesas', precio: 0 }
 ]`);
 n.context.renderizarRevisionMenu();
 const lista = n.el('revision-menu-lista');
 assert.match(lista.innerHTML, /revision-producto-0/);
 assert.doesNotMatch(lista.innerHTML, /revision-producto-1/);
 n.el('buscar-revision-menu').value = 'Pizza';
 await n.context.publicarMenuRevisado({ preventDefault() {} });
 assert.equal(n.requests.length, 1);
 assert.match(lista.innerHTML, /id="revision-producto-1" name="producto-borrador" open/);
 assert.match(lista.innerHTML, /Precio pendiente/);
 assert.equal(n.el('buscar-revision-menu').value, '');
});
