const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const sharp=require('sharp');
const {crearMiniaturaCarta}=require('../miniatura-carta');

test('la captura usa el menú real y produce solo un fragmento vertical',async()=>{
 const datos={restaurante:{id:'r1',slug:'prueba',nombre_restaurante:'Carta Prueba',menu_disponible:true},productos:Array.from({length:12},(_,i)=>({id:String(i),nombre:'Producto '+i,precio:12500,categoria:'Pizzas',disponible:true,descripcion:'Tomate y queso',opciones:[]}))};
 const imagen=await crearMiniaturaCarta(datos,'https://storage.invalid');
 const meta=await sharp(imagen).metadata();
 assert.equal(meta.width,860);assert.equal(meta.height,920);assert.equal(meta.format,'jpeg');
 assert(imagen.length>15000 && imagen.length<500000);
});

test('reutiliza capturas concurrentes y las invalida al cambiar los productos',async()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.js'),'utf8');
 const inicio=source.indexOf('const cachePortadasCarta = new Map();');
 const fin=source.indexOf('// Enlaces compartidos cortos;',inicio);
 let precio=10000,fallar=false,llamadas=0;
 const db={from(tabla){const q={select(){return this},eq(){return this},order(){return this},maybeSingle:async()=>({data:{id:'r',slug:'prueba',nombre_restaurante:'Prueba',menu_activo:true}}),then(resolve,reject){return Promise.resolve({data:[{id:'p',nombre:'Producto',precio,disponible:true}]}).then(resolve,reject)}};return q}};
 const ctx={app:{get(){}},supabaseAdmin:db,supabase:db,supabaseUrl:'https://storage.invalid',evaluarDisponibilidadMenu:()=>({disponible:true}),crypto,URL,console,crearMiniaturaCarta:async()=>{llamadas++;await new Promise(r=>setImmediate(r));if(fallar)throw new Error('captura fallida');return Buffer.from('captura');}};
 vm.createContext(ctx);vm.runInContext(source.slice(inicio,fin),ctx);
 await Promise.all([ctx.obtenerMiniaturaCarta('prueba'),ctx.obtenerMiniaturaCarta('prueba')]);assert.equal(llamadas,1);
 await ctx.obtenerMiniaturaCarta('prueba');assert.equal(llamadas,1);
 precio=15000;await ctx.obtenerMiniaturaCarta('prueba');assert.equal(llamadas,2);
 precio=20000;fallar=true;await assert.rejects(ctx.obtenerMiniaturaCarta('prueba'));
 fallar=false;await ctx.obtenerMiniaturaCarta('prueba');assert.equal(llamadas,4);
});
