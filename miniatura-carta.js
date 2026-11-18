const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const chromium = require('@sparticuz/chromium');
const {chromium: playwright} = require('playwright-core');
// CSS de captura: npx --package=tailwindcss@3.4.19 tailwindcss -i miniatura-tailwind.css -o miniatura-estilos.css --content menu.html,app.menu-categorias.js --minify
const ORIGEN_CAPTURA = 'https://miniatura.velox.invalid';
let pendientes = 0;
let cola = Promise.resolve();

// Un navegador a la vez y una cola pequeña para limitar memoria y CPU.
function crearMiniaturaCarta(datos, origenStorage) {
  if (pendientes >= 3) return Promise.reject(new Error('La vista previa está ocupada.'));
  pendientes++;
  const tarea = cola.catch(() => {}).then(() => capturarCarta(datos, origenStorage));
  cola = tarea;
  return tarea.finally(() => {pendientes--;});
}

async function capturarCarta(datos, origenStorage) {
  let browser;
  let vencido = false;
  const temporizador = setTimeout(() => {vencido = true; browser?.close().catch(() => {});}, 25000);
  try {
    const executablePath = await chromium.executablePath();
    if (vencido) throw new Error('Tiempo agotado al preparar vista previa.');
    browser = await playwright.launch({executablePath,args:chromium.args,headless:true,timeout:15000});
    if (vencido) throw new Error('Tiempo agotado al abrir vista previa.');
    const page = await browser.newPage({viewport:{width:430,height:460},deviceScaleFactor:2,reducedMotion:'reduce'});
    const archivos = {'/menu.html':'menu.html','/velox-theme.css':'velox-theme.css','/app.menu-categorias.js':'app.menu-categorias.js'};
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      try {
        if (request.method() !== 'GET') return route.abort();
        if (url.origin === ORIGEN_CAPTURA) {
          if (url.pathname === `/api/menu/${encodeURIComponent(datos.restaurante.slug)}`) {
            return route.fulfill({json:datos});
          }
          const archivo = archivos[url.pathname];
          if (!archivo) return route.abort();
          let body = await fs.readFile(path.join(__dirname,archivo),'utf8');
          if (archivo === 'menu.html') {
            const estilos = await fs.readFile(path.join(__dirname,'miniatura-estilos.css'),'utf8');
            body = body.replace('<script src="https://cdn.tailwindcss.com"></script>',`<style>${estilos}</style>`);
          }
          return route.fulfill({body,contentType:archivo.endsWith('.css')?'text/css':archivo.endsWith('.js')?'application/javascript':'text/html'});
        }
        if (url.origin === origenStorage && url.pathname.startsWith('/storage/v1/object/public/productos/') && request.resourceType() === 'image') {
          const respuesta = await axios.get(url.href,{responseType:'arraybuffer',timeout:6000,maxRedirects:0,maxContentLength:5*1024*1024});
          return route.fulfill({body:Buffer.from(respuesta.data),contentType:respuesta.headers['content-type'] || 'image/jpeg'});
        }
        return route.abort();
      } catch { return route.abort().catch(() => {}); }
    });
    await page.goto(`${ORIGEN_CAPTURA}/menu.html?slug=${encodeURIComponent(datos.restaurante.slug)}`,{waitUntil:'networkidle',timeout:18000});
    await page.waitForFunction(() => document.querySelector('#contenedor-menu .menu-product-reveal'),{},{timeout:4000});
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('#contenedor-menu img')].filter(img=>img.getBoundingClientRect().top < 460).map(img=>Promise.race([img.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))])));
      window.scrollTo(0,0);
    });
    return await page.screenshot({type:'jpeg',quality:85,fullPage:false,timeout:4000});
  } finally {
    clearTimeout(temporizador);
    await browser?.close().catch(() => {});
  }
}
module.exports = {crearMiniaturaCarta};
