const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sharp = require('sharp');
const {datosCompartirCarta,mensajeCartaWhatsApp,crearPortadaCarta} = require('../carta-compartida');

test('el mensaje del bot usa foto ampliable y botón, sin URL visible en el texto', () => {
 const mensaje = mensajeCartaWhatsApp('573001234567','Cangreburger','cangreburger-123');
 assert.equal(mensaje.interactive.body.text,'Carta digital de Cangreburger');
 assert.equal(mensaje.interactive.header.type,'image');
 assert.match(mensaje.interactive.header.image.link,/\/c\/cangreburger-123\/portada.jpg$/);
 assert.equal(mensaje.interactive.action.parameters.display_text,'Ver carta');
 assert.doesNotMatch(mensaje.interactive.body.text,/https?:/);
});

test('la portada siempre es JPG 1200x630, incluso con una foto dañada', async () => {
 for (const foto of [undefined,Buffer.from('imagen dañada'),await sharp({create:{width:300,height:500,channels:3,background:'#A53D24'}}).png().toBuffer()]) {
  const imagen = await crearPortadaCarta('Pizzas & Hamburguesas <Sol>',foto);
  const meta = await sharp(imagen).metadata();
  assert.equal(meta.format,'jpeg'); assert.equal(meta.width,1200); assert.equal(meta.height,630);
  assert(imagen.length < 300000);
 }
});

test('el envío convierte enlaces de la carta y reintenta sin imagen solo ante rechazo explícito', async () => {
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.js'),'utf8');
 const start=source.indexOf('async function enviarTextoWhatsApp(');
 const end=source.indexOf("app.post('/webhook'",start);
 const llamadas=[]; let fallo;
 const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{nombre_restaurante:'Sol'}})})};
 const ctx={process:{env:{WHATSAPP_TOKEN:'prueba'}},supabaseAdmin:db,supabase:db,mensajeCartaWhatsApp,axios:async req=>{llamadas.push(req.data);if(fallo){const e=fallo;fallo=null;throw e;}}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const url=datosCompartirCarta('Sol','sol').url;
 await ctx.enviarTextoWhatsApp('id','destino',`Aquí tienes tu carta: ${url}`);
 assert.equal(llamadas[0].type,'interactive');assert.equal(llamadas[0].interactive.body.text,'Carta digital de Sol');
 llamadas.length=0;fallo={response:{status:400}};
 await ctx.enviarTextoWhatsApp('id','destino',url);
 assert.equal(llamadas.length,2);assert.equal(llamadas[1].interactive.header,undefined);assert.equal(llamadas[1].interactive.action.parameters.url,url);
 llamadas.length=0;fallo=new Error('timeout');
 await assert.rejects(ctx.enviarTextoWhatsApp('id','destino',url));assert.equal(llamadas.length,1);
 llamadas.length=0;await ctx.enviarTextoWhatsApp('id','destino','Tu pedido fue recibido');assert.equal(llamadas[0].type,'text');
});
