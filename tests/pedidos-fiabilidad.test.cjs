const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const read = name => fs.readFileSync(require('node:path').join(__dirname, '..', name), 'utf8');

function endpoint() {
  const source = read('index.js');
  const start = source.indexOf("app.post('/api/pedidos'");
  const end = source.indexOf('// Verifica la sesión', start);
  const orders = []; let handler; const consulted = [];
  const restaurant = { id: 'rest-1', telefono: '3001234567', nombre_restaurante: 'Prueba', menu_activo: true };
  let products = [{ id: 'prod-1', nombre: 'Hamburguesa', precio: 15000, disponible: true }];
  const database = { from(table) {
    const filters = []; let inserted;
    const execute = () => {
      consulted.push({table, filters});
      if (table === 'restaurantes') return { data: restaurant, error: null };
      if (table === 'productos') return { data: products.filter(p => p.disponible), error: null };
      if (inserted) {
        if (inserted.solicitud_id && orders.some(p => p.solicitud_id === inserted.solicitud_id && p.restaurante_id === inserted.restaurante_id)) return { data: null, error: { code: '23505' } };
        const order = { ...inserted, id: `pedido-${orders.length+1}` }; orders.push(order);
        return {data: {id:order.id}, error:null};
      }
      return { data: orders.find(p => filters.every(([key,value]) => p[key] === value)) || null, error:null };
    };
    const query = { select(){return this}, eq(k,v){filters.push([k,v]);return this}, in(){return this}, insert(rows){inserted=rows[0];return this}, maybeSingle(){return Promise.resolve(execute())}, then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)} };
    return query;
  }};
  vm.runInNewContext(source.slice(start,end), {app:{post(path,fn){handler=fn}},supabaseAdmin:database,crypto,limitarAccion:()=>true,evaluarDisponibilidadMenu:r=>({disponible:r.menu_activo}),limpiarDescripcionDeVariantes:s=>s,console});
  const body = () => ({ restaurante_id:'rest-1', direccion:'Calle de prueba', metodo_pago:'Efectivo', notas:'', solicitud_id:crypto.randomUUID(), total:1, items:[{id:'prod-1',nombre:'Hamburguesa',cantidad:2,precio:1}] });
  const send = async data => { const res={statusCode:200,status(n){this.statusCode=n;return this},json(data){this.data=data;return this}}; await handler({body:data},res); return res; };
  return {orders,restaurant,consulted,body,send,setProducts:p=>products=p};
}

test('pedido completo usa precios oficiales y devuelve la referencia para WhatsApp',async()=>{
  const api=endpoint(); const res=await api.send(api.body());
  assert.equal(res.statusCode,201);assert.equal(res.data.total,30000);assert.equal(res.data.detalle,'2 x Hamburguesa');assert.equal(api.orders.length,1);assert.equal(res.data.pedido_id,api.orders[0].id);
  assert(api.consulted.some(q=>q.table==='productos'&&q.filters.some(([k,v])=>k==='restaurante_id'&&v==='rest-1')));
});
test('reintento secuencial o simultáneo conserva una sola comanda',async()=>{
  for(const concurrent of [false,true]){ const api=endpoint(), body=api.body();
    const responses=concurrent?await Promise.all([api.send(body),api.send(body)]):[await api.send(body),await api.send(body)];
    assert.equal(api.orders.length,1); assert.equal(responses[0].data.pedido_id,responses[1].data.pedido_id);assert(responses.every(r=>[200,201].includes(r.statusCode)));
  }
});
test('un identificador no permite cambiar un pedido ya creado',async()=>{
  const api=endpoint(),body=api.body();await api.send(body);const res=await api.send({...body,direccion:'Otra dirección'});assert.equal(res.statusCode,409);assert.equal(api.orders.length,1);
});
test('rechaza producto agotado, cantidades inválidas y restaurante cerrado',async()=>{
  const api=endpoint();api.setProducts([]);assert.equal((await api.send(api.body())).statusCode,400);assert.equal(api.orders.length,0);
  api.setProducts([{id:'prod-1',nombre:'Hamburguesa',precio:15000,disponible:true}]);const body=api.body();body.items[0].cantidad=-1;assert.equal((await api.send(body)).statusCode,400);api.restaurant.menu_activo=false;assert.equal((await api.send(api.body())).statusCode,409);assert.equal(api.orders.length,0);
});

function dashboard() {
  const html=read('dashboard.html');
  const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n').replace(/    inicializarDashboard\(\);/,'');
  const els=new Map(),timers=new Map(),channels=[]; let timerId=0; const events={}; const queries=[];
  function el(id){ if(!els.has(id))els.set(id,{value:'',style:{},classList:{contains:()=>false,add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return null},querySelectorAll(){return []},textContent:'',setAttribute(name,value){this[name]=value;},scrollIntoView(){},focus(){},reset(){}});return els.get(id); }
  const client={auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})},realtime:{setAuth:async token=>events.token=token},removeChannel:async c=>events.removed=c,channel(name){const c={name,handlers:[],on(type,filter,fn){this.handlers.push({filter,fn});return this},subscribe(fn){this.notify=fn;return this}};channels.push(c);return c}};
  const context={console,URL,URLSearchParams,Map,Set,WeakMap,Date,navigator:{onLine:true},supabase:{createClient:()=>client},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),window:{location:{origin:'https://velox.test'},addEventListener:(n,fn)=>events[n]=fn},document:{hidden:false,addEventListener:(n,fn)=>events[n]=fn,getElementById:el}};
  vm.createContext(context);vm.runInContext(read('app.menu-categorias.js'),context);vm.runInContext(script,context);vm.runInContext('cargarPedidos = async () => { consultasPrueba.push(1); return true; }; imprimirTicketAutomatico = p => impresionesPrueba.push(p.id);',Object.assign(context,{consultasPrueba:queries,impresionesPrueba:[]}));
  return {context,els,el,timers,channels,events,queries,run:s=>vm.runInContext(s,context)};
}

test('Realtime espera restaurante y sesión, y filtra eventos por propietario',async()=>{
  const d=dashboard();assert.equal(d.channels.length,0);await d.context.iniciarConexionPedidos();assert.equal(d.channels.length,0);
  d.run('RESTAURANTE_ID="rest-1"');await d.context.iniciarConexionPedidos();assert.equal(d.events.token,'test-session');assert.equal(d.channels.length,1);assert(d.channels[0].handlers.every(h=>h.filter.filter==='restaurante_id=eq.rest-1'));
  d.channels[0].handlers[0].fn({new:{id:'ajeno',restaurante_id:'rest-2'}});assert.equal(d.context.impresionesPrueba.length,0);
  d.channels[0].handlers[0].fn({new:{id:'propio',restaurante_id:'rest-1'}});assert.equal(d.context.impresionesPrueba[0],'propio');
});
test('canal fallido mantiene respaldo, recupera al volver y limpia temporizadores',async()=>{
  const d=dashboard();d.run('RESTAURANTE_ID="rest-1"');await d.context.iniciarConexionPedidos();d.channels[0].notify('CHANNEL_ERROR');assert(d.el('connection-status').textContent.includes('15 s'));assert([...d.timers.values()].some(t=>t.ms===15000));
  await d.context.recuperarPedidos();assert.equal(d.queries.length,1);assert(d.el('connection-status').textContent.includes('actualizados'));
  d.context.document.hidden=true;await d.context.recuperarPedidos();assert.equal(d.queries.length,1);
  d.context.document.hidden=false;d.context.navigator.onLine=false;await d.context.recuperarPedidos();assert(d.el('connection-status').textContent.includes('Sin internet'));
  d.context.detenerConexionPedidos();assert.equal(d.timers.size,0);
});
test('la carta reutiliza el intento fallido y cambia de ID al cambiar el pedido',()=>{
  const html=read('menu.html'),start=html.indexOf('    let enviandoPedido = false;'),end=html.indexOf('    async function confirmarYEnviarPedido',start);const saved=new Map();const context={crypto,sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}};vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  const first=context.prepararIntentoPedido({items:[1]});assert.equal(context.prepararIntentoPedido({items:[1]}),first);assert.notEqual(context.prepararIntentoPedido({items:[2]}),first);
});

test('sesión vencida no abre canales y un error de consulta no se presenta como conexión sana',async()=>{
  const d=dashboard();d.run('RESTAURANTE_ID="rest-1"');d.context.supabase.createClient().auth.getSession=async()=>({data:{session:null}});await d.context.iniciarConexionPedidos();assert.equal(d.channels.length,0);assert.equal(d.timers.size,0);assert(d.el('connection-status').textContent.includes('Sesión vencida'));
  const e=dashboard();e.run('RESTAURANTE_ID="rest-1";cargarPedidos=async()=>false');await e.context.iniciarConexionPedidos();await e.context.recuperarPedidos();assert(e.el('connection-status').textContent.includes('No se pudieron'));
});

test('recorrido integrado: carta → servidor → pedido → panel y enlace WhatsApp',async()=>{
  const api=endpoint();const d=dashboard();d.run('RESTAURANTE_ID="rest-1"');await d.context.iniciarConexionPedidos();const html=read('menu.html');
  const start=html.indexOf('    let enviandoPedido = false;'),end=html.indexOf('        window.cargarMenu',start);
  const fields={'input-direccion':{value:'Calle de prueba'},'select-pago':{value:'Efectivo'},'input-notas':{value:''}};
  const storage=new Map();let outbound;
  const context={console,crypto,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},cart:[{id:'prod-1',nombre:'Hamburguesa',cantidad:2}],document:{getElementById:id=>fields[id],querySelector:()=>({disabled:false,textContent:''})},window:{MENU_DISPONIBLE:true,RESTAURANTE_ACTUAL:api.restaurant,location:{href:''}},actualizarBarraCarrito(){},cerrarModalPedido(){},alert:message=>{throw Error(message)},fetch:async(url,request)=>{outbound=JSON.parse(request.body);const result=await api.send(outbound);if(result.statusCode===201)d.channels[0].handlers[0].fn({new:api.orders[0]});return {ok:result.statusCode<400,json:async()=>result.data}}};
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);await context.confirmarYEnviarPedido({preventDefault(){}});
  assert(outbound.solicitud_id);assert.equal(api.orders.length,1);assert.equal(api.orders[0].total,30000);assert.equal(d.context.impresionesPrueba[0],api.orders[0].id);assert.equal(context.cart.length,0);
  const whatsapp=new URL(context.window.location.href);assert.equal(whatsapp.hostname,'wa.me');assert(whatsapp.searchParams.get('text').includes('Referencia Velox:* pedido-1'));assert(whatsapp.searchParams.get('text').includes('30.000'));
});

test('el editor conserva el orden de la carta y permite recorrer una categoría larga',()=>{
  const d=dashboard();
  d.run(`productosEditor=[
    {id:'1',nombre:'Pizza grande',categoria:'Pizza',precio:25000},
    {id:'2',nombre:'Limonada',categoria:'Bebidas',precio:5000},
    {id:'3',nombre:'Combo pizza',categoria:'Combos',precio:18000,disponible:false},
    ...Array.from({length:100},(_,i)=>({id:String(i+4),nombre:'Producto '+i,categoria:'Pizza',precio:30000+i}))
  ];actualizarCategoriasProductos();renderizarProductos();`);
  const barra=d.el('productos-editor-categorias').innerHTML;
  assert(barra.indexOf('Pizzas') < barra.indexOf('Bebidas'));
  const lista=d.el('productos-body');
  assert(lista.innerHTML.indexOf('Combo pizza') < lista.innerHTML.indexOf('Pizza grande'));
  assert(lista.innerHTML.includes('Agotado · Activar'));
  assert(!lista.innerHTML.includes('Limonada'));
  assert.equal((lista.innerHTML.match(/<article /g)||[]).length,6);
  d.context.mostrarMasProductos();
  assert.equal((lista.innerHTML.match(/<article /g)||[]).length,12);
  d.context.seleccionarCategoriaProducto('Bebidas');
  assert(lista.innerHTML.includes('Limonada'));
  assert(d.el('productos-editor-mas').hidden);
});

test('la búsqueda sigue cubriendo todas las categorías y vuelve a la selección al limpiarla',()=>{
  const d=dashboard();
  d.run(`productosEditor=[
    {id:'1',nombre:'Limonada',categoria:'Bebidas',precio:5000},
    {id:'2',nombre:'Clásica',categoria:'Hamburguesas',precio:10000},
    {id:'3',nombre:'Doble',categoria:'Hamburguesas',precio:15000}
  ];actualizarCategoriasProductos();renderizarProductos();`);
  const lista=d.el('productos-body');
  assert(lista.innerHTML.includes('Limonada'));
  d.el('buscar-producto').value='hamburquega';
  d.context.buscarProductoMenu();
  assert(lista.innerHTML.includes('Clásica'));
  assert(lista.innerHTML.includes('Doble'));
  assert(!lista.innerHTML.includes('Limonada'));
  d.el('buscar-producto').value='';
  d.context.buscarProductoMenu();
  assert(lista.innerHTML.includes('Limonada'));
});

test('si desaparece la categoría seleccionada, muestra la primera que queda',()=>{
  const d=dashboard();
  d.run(`productosEditor=[
    {id:'1',nombre:'Limonada',categoria:'Bebidas',precio:5000},
    {id:'2',nombre:'Clásica',categoria:'Hamburguesas',precio:10000}
  ];actualizarCategoriasProductos();seleccionarCategoriaProducto('Hamburguesas');
  productosEditor.pop();actualizarCategoriasProductos();renderizarProductos();`);
  assert(d.el('productos-body').innerHTML.includes('Limonada'));
  d.run('productosEditor=[];actualizarCategoriasProductos();renderizarProductos();');
  assert(d.el('productos-body').innerHTML.includes('Tu menú está vacío'));
  assert(d.el('productos-editor-categorias').hidden);
});

function consultaProductos(d, resolver) {
  d.context.supabase.createClient().from=()=>({select(){return this},eq(){return this},order:resolver});
  d.run('RESTAURANTE_ID="rest-1"');
}

test('carga de productos muestra lista, error o vacío sin dejar el indicador pegado',async()=>{
  const d=dashboard();consultaProductos(d,async()=>({data:[{id:'1',nombre:'Hamburguesa',precio:10000}],error:null}));
  assert.equal(await d.context.cargarProductos(),true);assert(d.el('productos-body').innerHTML.includes('Hamburguesa'));assert(!d.el('productos-body').innerHTML.includes('Cargando'));assert.equal(d.el('productos-body')['aria-busy'],'false');
  consultaProductos(d,async()=>({data:null,error:{message:'Sin permisos'}}));assert.equal(await d.context.cargarProductos(),false);assert.equal(d.el('reintentar-productos').hidden,false);assert(d.el('productos-body').innerHTML.includes('Hamburguesa'));
  consultaProductos(d,async()=>({data:[],error:null}));assert.equal(await d.context.cargarProductos(),true);assert(d.el('productos-body').innerHTML.includes('Tu menú está vacío'));assert(d.el('reintentar-productos').hidden);
});
test('timeout de carga termina en Reintentar y una respuesta tardía no pisa el siguiente intento',async()=>{
  const d=dashboard();let resolverAnterior;consultaProductos(d,()=>new Promise(resolve=>resolverAnterior=resolve));const anterior=d.context.cargarProductos();
  const timeout=[...d.timers.values()].find(t=>t.ms===15000);assert(timeout);timeout.fn();assert.equal(await anterior,false);assert(!d.el('productos-body').innerHTML.includes('Cargando'));assert(!d.el('reintentar-productos').hidden);
  consultaProductos(d,async()=>({data:[{id:'nuevo',nombre:'Producto nuevo',precio:5000}],error:null}));await d.context.cargarProductos();resolverAnterior({data:[{id:'viejo',nombre:'Resultado viejo',precio:1000}],error:null});await Promise.resolve();assert(d.el('productos-body').innerHTML.includes('Producto nuevo'));assert(!d.el('productos-body').innerHTML.includes('Resultado viejo'));
});
test('dos aperturas durante la misma carga comparten una sola consulta',async()=>{
  const d=dashboard();let consultas=0,resolver;consultaProductos(d,()=>{consultas++;return new Promise(resolve=>resolver=resolve)});const primera=d.context.cargarProductos(),segunda=d.context.cargarProductos();assert.equal(consultas,1);resolver({data:[],error:null});await Promise.all([primera,segunda]);
});
test('formulario se abre en una ventana y conserva una sola acción Agregar producto',()=>{
  const html=read('dashboard.html');assert.equal((html.match(/onclick="nuevoProducto\(\)"/g)||[]).length,1);assert(!html.includes('id="details-producto-form"'));assert(html.includes('<dialog id="editor-producto"'));assert(html.includes('id="producto-form-summary-text" class="text-lg font-bold text-white">Agregar producto</h2>'));assert(html.includes("if (!document.getElementById('sec-menu-ia').classList.contains('hidden')) cargarProductos();"));
});
