const sharp = require('sharp');
const ORIGEN_CARTA = 'https://bot-velox-production.up.railway.app';
const escapar = valor => String(valor).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function datosCompartirCarta(nombre, slug) {
  const titulo = `Carta digital de ${String(nombre || 'Restaurante').trim()}`;
  const url = `${ORIGEN_CARTA}/c/${encodeURIComponent(slug)}`;
  return { titulo, url, imagen: `${url}/portada.jpg` };
}

function mensajeCartaWhatsApp(destinatario, nombre, slug) {
  const carta = datosCompartirCarta(nombre, slug);
  return {
    messaging_product: 'whatsapp', to: destinatario, type: 'interactive',
    interactive: {
      type: 'cta_url',
      header: { type: 'image', image: { link: carta.imagen } },
      body: { text: carta.titulo },
      action: { name: 'cta_url', parameters: { display_text: 'Ver carta', url: carta.url } }
    }
  };
}

async function crearPortadaCarta(nombre, foto) {
  const palabras = String(nombre || 'Restaurante').trim().slice(0, 90).split(/\s+/);
  const lineas = [''];
  for (const palabra of palabras) {
    const i = lineas.length - 1;
    if (lineas[i] && (lineas[i] + ' ' + palabra).length > 19 && lineas.length < 3) lineas.push(palabra);
    else lineas[i] += (lineas[i] ? ' ' : '') + palabra;
  }
  const texto = lineas.map((l, i) => `<text x="70" y="${250 + i * 64}" font-size="${l.length > 22 ? 37 : 51}" font-weight="700" fill="#2B211B">${escapar(l.length > 24 ? l.slice(0, 23) + '…' : l)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#F6EFE5"/><rect x="26" y="26" width="1148" height="578" rx="28" fill="#FFFBF5" stroke="#D7C2AD"/><path d="M70 136H145" stroke="#A53D24" stroke-width="5"/><g font-family="sans-serif"><text x="70" y="181" font-size="20" letter-spacing="4" fill="#A53D24">CARTA DIGITAL</text>${texto}<text x="70" y="502" font-size="23" fill="#69544A">Descubre nuestro menú</text><text x="70" y="557" font-size="18" fill="#A53D24">Velox Bot</text></g><circle cx="884" cy="313" r="199" fill="#F0E3D5"/><circle cx="884" cy="313" r="150" fill="#FFFBF5" stroke="#D7C2AD" stroke-width="3"/><circle cx="884" cy="313" r="120" fill="none" stroke="#D7C2AD" stroke-width="2"/></svg>`;
  const capas = [];
  if (foto) {
    try {
      const imagen = await sharp(foto, {limitInputPixels: 25000000}).rotate().resize(480, 490, {fit:'contain', background:'#FFFBF5'}).jpeg({quality:85}).toBuffer();
      capas.push({input:imagen,left:650,top:70});
    } catch { /* Una foto dañada no impide compartir la carta. */ }
  }
  return sharp(Buffer.from(svg)).composite(capas).jpeg({quality:87,mozjpeg:true}).toBuffer();
}

module.exports = { ORIGEN_CARTA, datosCompartirCarta, mensajeCartaWhatsApp, crearPortadaCarta };
