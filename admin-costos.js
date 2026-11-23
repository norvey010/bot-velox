import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://ozailviyimrjmebrilbp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YWlsdml5aW1yam1lYnJpbGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTA5MTEsImV4cCI6MjEwMDY4NjkxMX0.rkWEtTGV4uFB_w62sC-vygZoLbfEgx_KKTSd9oS-5CM'
);
const $ = id => document.getElementById(id);
const nombresCategoria = {
  suscripcion: 'Suscripción', railway: 'Railway', supabase: 'Supabase',
  claro: 'Claro', meta: 'Meta', openai: 'OpenAI', otro: 'Otro'
};
const monedaCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const monedaUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const numero = new Intl.NumberFormat('es-CO');
let token = null;
let recoveryMode = false;
let autoRefresh = null;
let autoRefreshFacturas = null;
let autoRefreshVersion = null;
let cargando = false;
let cargandoAcumulado = false;
let acumuladoPendiente = false;
let cargaPendiente = false;
let rangoActual = 'MAX';
let rangoDesdePersonalizado = '';
let rangoHastaPersonalizado = '';
let rangoInicializado = false;
let datos = null;

function periodoBogota() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date());
  return partes.find(p => p.type === 'year').value + '-' + partes.find(p => p.type === 'month').value;
}
function hoyBogota() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  return partes.find(p => p.type === 'year').value + '-' +
    partes.find(p => p.type === 'month').value + '-' +
    partes.find(p => p.type === 'day').value;
}
function mostrarMoneda(valor, moneda) {
  return (moneda === 'USD' ? monedaUSD : monedaCOP).format(Number(valor) || 0);
}
function mensaje(id, texto, error) {
  const elemento = $(id);
  elemento.textContent = texto || '';
  elemento.className = 'mt-2 text-sm ' + (error ? 'text-red-700' : 'text-[#256444]');
}
async function solicitar(url, opciones) {
  const respuesta = await fetch(url, {
    ...opciones,
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(opciones && opciones.headers ? opciones.headers : {})
    }
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401) {
    await supabase.auth.signOut();
    throw new Error('La sesión venció. Inicia sesión de nuevo.');
  }
  if (respuesta.status === 403 || respuesta.status === 404) {
    throw new Error('Iniciaste sesión, pero esta cuenta no está autorizada para el panel privado. Confirma que estás usando el correo administrador.');
  }
  if (!respuesta.ok) throw new Error(cuerpo.error || 'No se pudo completar la solicitud.');
  return cuerpo;
}
function celda(fila, valor, clase) {
  const td = document.createElement('td');
  td.className = clase || 'p-3';
  td.textContent = valor == null || valor === '' ? '—' : String(valor);
  fila.append(td);
  return td;
}
function filaVacia(tbody, columnas, texto) {
  const fila = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = columnas;
  td.className = 'p-4 text-center text-sm text-[#69544A]';
  td.textContent = texto;
  fila.append(td);
  tbody.replaceChildren(fila);
}
function llenarSelectorRestaurantes(restaurantes) {
  const select = $('mov-restaurante');
  const elegido = select.value;
  const tipo = $('mov-tipo').value;
  const categoria = $('mov-categoria').value;
  const marcador = tipo === 'ingreso'
    ? (categoria === 'suscripcion' ? 'Selecciona el restaurante que pagó' : 'Ingreso general de Velox · sin restaurante')
    : 'Gasto compartido de Velox · repartir entre restaurantes activos';
  const opciones = [new Option(marcador, '')];
  for (const r of restaurantes) opciones.push(new Option(r.restaurante, r.restaurante_id));
  select.replaceChildren(...opciones);
  if ([...select.options].some(o => o.value === elegido)) select.value = elegido;
}
async function cargarServiciosPersonalizados() {
  try {
    const data = await solicitarAdmin('/api/admin/finanzas/servicios-personalizados');
    const datalist = $('finance-service-suggestions');
    datalist.replaceChildren(...(data.servicios || []).map(nombre => {
      const option = document.createElement('option');
      option.value = nombre;
      return option;
    }));
  } catch (error) {
    console.warn('No se pudieron cargar sugerencias de servicios:', error.message);
  }
}
function actualizarCategorias(reiniciarAtribucion = false) {
  const tipo = $('mov-tipo').value;
  const categoria = $('mov-categoria');
  const selector = $('mov-restaurante');
  const opciones = tipo === 'ingreso'
    ? [['suscripcion', 'Suscripción'], ['otro', 'Otro']]
    : [['railway', 'Railway'], ['supabase', 'Supabase'], ['claro', 'Claro'], ['meta', 'Meta'], ['otro', 'Otro']];
  const categoriaActual = categoria.value;
  categoria.replaceChildren(...opciones.map(([valor, texto]) => new Option(texto, valor)));
  if (!reiniciarAtribucion && opciones.some(([valor]) => valor === categoriaActual)) categoria.value = categoriaActual;
  const customWrap = $('mov-service-custom-wrap');
  const customInput = $('mov-service-custom');
  const requiereNombre = categoria.value === 'otro';
  customWrap.classList.toggle('hidden', !requiereNombre);
  customWrap.hidden = !requiereNombre;
  customInput.disabled = !requiereNombre;
  customInput.required = requiereNombre;
  customInput.placeholder = tipo === 'ingreso' ? 'Escribe el concepto del ingreso' : 'Escribe el nombre del servicio o proveedor';
  customWrap.firstChild.textContent = tipo === 'ingreso' ? 'Concepto del ingreso' : 'Nombre del servicio o proveedor';
  const esSuscripcion = tipo === 'ingreso' && categoria.value === 'suscripcion';
  const selectorRestaurante = $('mov-restaurante-wrap');
  const ocultarAtribucionGasto = tipo === 'gasto';
  selectorRestaurante.classList.toggle('hidden', ocultarAtribucionGasto);
  selectorRestaurante.hidden = ocultarAtribucionGasto;
  if (ocultarAtribucionGasto) selector.value = '';
  selector.required = esSuscripcion;
  selector.options[0].textContent = tipo === 'ingreso'
    ? (esSuscripcion ? 'Selecciona el restaurante que pagó' : 'Ingreso general de Velox · sin restaurante')
    : 'Gasto compartido de Velox · repartir entre restaurantes activos';
  $('mov-restaurante-label').textContent = tipo === 'ingreso'
    ? (esSuscripcion ? 'Restaurante que pagó' : 'Atribuir a restaurante (opcional)')
    : '¿A quién atribuimos este gasto?';
  $('mov-restaurante-help').textContent = tipo === 'ingreso'
    ? (esSuscripcion
      ? 'La suscripción queda vinculada al restaurante que selecciones.'
      : 'Puedes elegir un restaurante; si lo dejas vacío, el ingreso queda registrado para Velox.')
    : 'Déjalo como gasto compartido para repartirlo entre restaurantes activos. Elige un restaurante solo si el gasto es exclusivo de ese negocio.';
  if (reiniciarAtribucion) { selector.value = ''; customInput.value = ''; }
  const descripcion = $('mov-descripcion');
  descripcion.disabled = false;
  descripcion.readOnly = false;
  descripcion.placeholder = tipo === 'ingreso'
    ? (categoria.value === 'otro' ? 'Ej.: Ingreso por servicio adicional' : 'Ej.: Suscripción mensual Velox')
    : (categoria.value === 'otro' ? 'Ej.: Suscripción Codex/ChatGPT (OpenAI)' : 'Ej.: Factura del servicio');
}
function renderizarAlertaConsumoOpenAI(alerta) {
  const caja = $('openai-consumption-alert');
  caja.className = 'rounded-xl border px-4 py-3 text-sm';
  if (!alerta?.disponible) {
    caja.classList.add('hidden');
    return;
  }
  if (!alerta.limite_configurado) {
    caja.classList.add('border-[#D7C2AD]', 'bg-[#FFFBF5]', 'text-[#69544A]');
    caja.textContent = 'Consumo OpenAI conectado. Para calcular el porcentaje restante hace falta un límite mensual de gasto en OpenAI.';
    return;
  }
  const restante = Math.floor(alerta.restante_porcentaje);
  if (alerta.alerta) {
    caja.classList.add('border-red-300', 'bg-red-50', 'font-semibold', 'text-red-800');
    caja.textContent = alerta.excedido
      ? 'Alerta OpenAI: se superó el límite mensual de gasto. Revisa el consumo en OpenAI.'
      : 'Alerta OpenAI: queda ' + restante + '% o menos del límite mensual de gasto.';
  } else {
    caja.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-900');
    caja.textContent = 'OpenAI: queda ' + restante + '% del límite mensual de gasto.';
  }
}
function renderizar(data) {
  datos = data;
  const r = data.resumen;
  $('finance-note').textContent = data.nota + ' ' + (data.costos_openai?.mensaje || '') +
    (r.ia_real_sin_asignar_usd > 0 ? ' OpenAI sin atribuir a restaurante: ' + mostrarMoneda(r.ia_real_sin_asignar_usd, 'USD') + '.' : '') +
    (r.compartidos_sin_asignar_cop > 0
      ? ' Hay gastos compartidos sin repartir porque ningún restaurante tiene días activos en este mes.'
      : '');
  $('tasa-usd-cop').value = data.tasas_por_mes?.[$('tasa-periodo').value] || '';
  renderizarCategorias(data.gastos_por_categoria || {});
  renderizarMovimientos(data.movimientos || [], data.restaurantes || []);
  renderizarRestaurantes(data.restaurantes || []);
}
function renderizarCategorias(categorias) {
  const contenedor = $('gastos-categorias');
  if (!contenedor) return;
  const filas = Object.entries(categorias);
  if (!filas.length) {
    contenedor.textContent = 'Aún no hay gastos registrados en este período.';
    return;
  }
  const fragmento = document.createDocumentFragment();
  filas.sort((a, b) => (Number(b[1].COP) + Number(b[1].USD)) - (Number(a[1].COP) + Number(a[1].USD)));
  for (const [categoria, valores] of filas) {
    const div = document.createElement('div');
    div.className = 'flex flex-wrap justify-between gap-2 border-b border-[#E6D8C9] pb-2';
    const nombre = document.createElement('span');
    nombre.textContent = nombresCategoria[categoria] || categoria;
    const total = document.createElement('span');
    total.className = 'font-semibold text-[#2B211B]';
    total.textContent = mostrarMoneda(valores.COP, 'COP') +
      (Number(valores.USD) ? ' · ' + mostrarMoneda(valores.USD, 'USD') : '');
    div.append(nombre, total);
    fragmento.append(div);
  }
  contenedor.replaceChildren(fragmento);
}
function renderizarMovimientos(movimientos, restaurantes) {
  const tbody = $('movimientos-body');
  if (!tbody) return;
  const porId = new Map(restaurantes.map(r => [r.restaurante_id, r.restaurante]));
  if (!movimientos.length) return filaVacia(tbody, 6, 'Todavía no hay movimientos en este período.');
  const fragmento = document.createDocumentFragment();
  for (const mov of movimientos) {
    const fila = document.createElement('tr');
    fila.className = 'border-t border-[#E6D8C9]';
    celda(fila, mov.fecha);
    celda(fila, mov.tipo === 'ingreso' ? (mov.servicio_personalizado || 'Ingreso') : (mov.servicio_personalizado || nombresCategoria[mov.categoria] || 'Gasto'));
    const detalle = mov.descripcion + (mov.referencia ? ' · ' + mov.referencia : '');
    celda(fila, detalle);
    celda(fila, mov.restaurante_id ? (porId.get(mov.restaurante_id) || 'Restaurante') : 'Velox · compartido');
    celda(fila, mostrarMoneda(mov.monto, mov.moneda));
    const accion = celda(fila, '');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.dataset.anular = mov.id;
    boton.className = 'rounded-md border border-[#D7C2AD] px-2 py-1 text-xs hover:bg-[#F0E3D5]';
    boton.textContent = 'Anular';
    accion.append(boton);
    fragmento.append(fila);
  }
  tbody.replaceChildren(fragmento);
}
function renderizarRestaurantes(restaurantes) {
  llenarSelectorRestaurantes(restaurantes);
  const ordenUtilidad = [...restaurantes].sort((a, b) => a.neto_cop == null ? 1 : b.neto_cop == null ? -1 : a.neto_cop - b.neto_cop);
  const tbody = $('restaurantes-finanzas-body');
  if (!restaurantes.length) filaVacia(tbody, 6, 'Aún no hay restaurantes registrados.');
  else {
    const fragmento = document.createDocumentFragment();
    for (const r of ordenUtilidad) {
      const fila = document.createElement('tr');
      fila.className = 'border-t border-[#E6D8C9]';
      celda(fila, r.restaurante);
      celda(fila, mostrarMoneda(r.ingresos_cop, 'COP'));
      celda(fila, mostrarMoneda(r.gastos_directos_cop, 'COP'));
      celda(fila, mostrarMoneda(r.gastos_compartidos_cop, 'COP'));
      celda(fila, r.ia_cop == null ? 'No disponible en COP · falta tarifa o tasa' : mostrarMoneda(r.ia_cop, 'COP'));
      celda(fila, r.neto_cop == null ? 'Parcial · falta tasa' : mostrarMoneda(r.neto_cop, 'COP'));
      fragmento.append(fila);
    }
    tbody.replaceChildren(fragmento);
  }

}
async function cargar() {
  if (!token) return;
  if (cargando) { cargaPendiente = true; return; }
  cargando = true;
  $('data-message').textContent = '';
  try {
    const data = await solicitar(urlRangoFinanciero());
    renderizar(data);
    $('rango-actual').textContent = data.periodo;
  } catch (error) {
    $('data-message').textContent = error.message;
  } finally {
    cargando = false;
    if (cargaPendiente) { cargaPendiente = false; void cargar(); }
  }
}

async function solicitarAdmin(url, opciones = {}) {
  const response = await fetch(url, { ...opciones, headers: { Authorization: `Bearer ${token}`, ...(opciones.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
  return body;
}
function estadoFacturas(texto, conectado = false) {
  $('gmail-status').textContent = texto;
  $('gmail-status').className = `rounded-lg border border-[#D7C2AD] p-3 text-sm ${conectado ? 'bg-emerald-50 text-emerald-900' : 'bg-[#FFF8EF] text-[#69544A]'}`;
}
const fechaFactura = valor => valor ? new Date(valor).toLocaleDateString('es-CO') : 'Fecha no detectada';
const dineroFactura = (valor, moneda) => valor == null ? 'Por revisar' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda || 'USD', maximumFractionDigits: 2 }).format(Number(valor));
async function abrirComprobante(id, indice) {
  const ventana = window.open('about:blank', '_blank');
  if (!ventana) throw new Error('El navegador bloqueó la pestaña. Permite ventanas emergentes para ver el comprobante.');
  try {
    const response = await fetch(`/api/admin/facturas/${encodeURIComponent(id)}/archivo/${indice}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('No se pudo abrir el comprobante.');
    const url = URL.createObjectURL(await response.blob());
    ventana.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    ventana.close();
    throw error;
  }
}
let paginaFacturas = 1;
let temporizadorBusquedaFacturas = null;
let solicitudFacturasActual = 0;
async function cargarFacturas(auto = true) {
  const solicitudActual = ++solicitudFacturasActual;
  const status = await solicitarAdmin('/api/admin/integraciones/gmail/estado');
  if (!$('gmail-account-email').value) $('gmail-account-email').value = localStorage.getItem('velox-gmail-account-email') || status.correo || '';
  $('connect-gmail').disabled = !status.configurado;
  $('sync-invoices').disabled = !status.conectado;
  if (!status.configurado) {
    estadoFacturas('Para vincular ' + status.correo + ', el administrador debe configurar el cliente OAuth de Google en Railway. URI de retorno: ' + (status.redirect_uri || 'pendiente del dominio público') + '.');
  } else if (!status.conectado) {
    estadoFacturas('Conecta ' + status.correo + ' una vez. Velox buscará únicamente correos de facturación de las plataformas.');
  } else {
    estadoFacturas('Correo conectado: ' + status.correo + (status.ultima_sync ? ' · Última sincronización ' + new Date(status.ultima_sync).toLocaleString('es-CO') : ' · Aún no se sincroniza'), true);
    if (auto && (!status.ultima_sync || Date.now() - new Date(status.ultima_sync).getTime() > 6 * 60 * 60 * 1000)) {
      estadoFacturas('Buscando comprobantes y guardando los originales…', true);
      await solicitarAdmin('/api/admin/facturas/sync', { method: 'POST' });
      status.ultima_sync = new Date().toISOString();
      estadoFacturas('Correo conectado: ' + status.correo + ' · Comprobantes actualizados', true);
    }
  }
  const pageSize = Number($('invoice-page-size').value) || 25;
  const params = new URLSearchParams({
    page: String(paginaFacturas),
    limit: String(pageSize),
    provider: $('invoice-provider-filter').value || 'all',
    status: $('invoice-filter').value || 'active',
    q: $('invoice-search').value.trim(),
    from: $('invoice-from').value,
    to: $('invoice-to').value
  });
  const data = await solicitarAdmin('/api/admin/facturas?' + params.toString());
  if (solicitudActual !== solicitudFacturasActual) return;
  const facturas = data.facturas || [];
  const movimientos = data.movimientos || [];
  const total = Number(data.total) || 0;
  const paginas = Math.max(1, Number(data.paginas) || 1);
  if (paginaFacturas > paginas) {
    paginaFacturas = paginas;
    return cargarFacturas(false);
  }
  const nombres = { railway: 'Railway', supabase: 'Supabase', openai: 'OpenAI', meta: 'Meta', claro: 'Claro', otro: 'Otro' };
  const registros = [
    ...facturas.map(invoice => ({ ...invoice, tipoRegistro: 'factura', fechaOrden: invoice.invoice_date || invoice.source_received_at || invoice.imported_at })),
    ...movimientos.map(movimiento => ({
      ...movimiento,
      provider: movimiento.categoria,
      status: movimiento.anulado_en ? 'void' : 'recorded',
      tipoRegistro: 'movimiento',
      fechaOrden: movimiento.fecha
    }))
  ].sort((a, b) => new Date(b.fechaOrden || 0) - new Date(a.fechaOrden || 0));

  const primero = total ? (paginaFacturas - 1) * pageSize + 1 : 0;
  const ultimo = Math.min(paginaFacturas * pageSize, total);
  $('invoice-summary').textContent = total
    ? 'Resultados: ' + numero.format(total) + ' · ordenados del más reciente al más antiguo.'
    : 'No hay registros que coincidan con esos filtros.';
  $('invoice-page-summary').textContent = 'Página ' + paginaFacturas + ' de ' + paginas + (total ? ' · ' + numero.format(primero) + '–' + numero.format(ultimo) + ' de ' + numero.format(total) : '');
  $('invoice-prev').disabled = paginaFacturas <= 1;
  $('invoice-next').disabled = paginaFacturas >= paginas;

  const list = $('invoice-list');
  list.replaceChildren();
  if (!registros.length) {
    const vacio = document.createElement('p');
    vacio.className = 'py-4 text-sm text-[#69544A]';
    vacio.textContent = 'No hay facturas ni movimientos para esos filtros.';
    list.append(vacio);
    return;
  }
  for (const registro of registros) {
    const card = document.createElement('details');
    card.className = 'rounded-lg border border-[#E6D8C9] bg-white/50';
    const resumen = document.createElement('summary');
    resumen.className = 'flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5';
    const texto = document.createElement('div');
    texto.className = 'min-w-0 flex-1';
    const titulo = document.createElement('p');
    titulo.className = 'truncate text-sm font-semibold text-[#241A15]';
    const detalle = document.createElement('p');
    detalle.className = 'mt-0.5 text-xs text-[#69544A]';
    const valor = document.createElement('span');
    valor.className = 'shrink-0 text-sm font-semibold text-[#241A15]';
    if (registro.tipoRegistro === 'movimiento') {
      titulo.textContent = (registro.servicio_personalizado || nombres[registro.provider] || registro.provider || 'Otro') + ' · Movimiento de gasto';
      detalle.textContent = fechaFactura(registro.fecha) + ' · ' + (registro.anulado_en ? 'Anulado' : 'Movimiento manual');
      valor.textContent = dineroFactura(registro.monto, registro.moneda);
      texto.append(titulo, detalle);
      resumen.append(texto, valor);
      card.append(resumen);
      const descripcion = [registro.descripcion, registro.referencia].filter(Boolean).join(' · ');
      if (descripcion) {
        const nota = document.createElement('p');
        nota.className = 'border-t border-[#E6D8C9] px-3 py-2 text-xs text-[#69544A]';
        nota.textContent = descripcion;
        card.append(nota);
      }
      list.append(card);
      continue;
    }
    const proveedor = registro.provider_custom || nombres[registro.provider] || registro.provider || 'Otro';
    titulo.textContent = proveedor + ' · ' + (registro.invoice_number ? 'Factura ' + registro.invoice_number : registro.email_subject || 'Comprobante');
    const estado = registro.status === 'paid' ? 'Pagada'
      : registro.status === 'open' ? 'Pendiente'
        : registro.status === 'void' ? 'Anulada'
          : registro.status === 'refunded' ? 'Reembolsada' : 'Por revisar';
    detalle.textContent = fechaFactura(registro.invoice_date || registro.source_received_at || registro.imported_at) + ' · ' + estado;
    valor.textContent = dineroFactura(registro.paid_amount ?? registro.amount, registro.currency);
    texto.append(titulo, detalle);
    resumen.append(texto, valor);
    card.append(resumen);
    const contenido = document.createElement('div');
    contenido.className = 'flex flex-wrap items-center gap-2 border-t border-[#E6D8C9] p-3';
    for (const [indice, archivo] of (Array.isArray(registro.files) ? registro.files : []).entries()) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'rounded-lg border border-[#D7C2AD] px-3 py-2 text-xs text-[#241A15]';
      boton.textContent = registro.files.length === 1 ? 'Ver PDF' : 'Ver ' + (archivo.name || 'comprobante');
      boton.addEventListener('click', () => abrirComprobante(registro.id, indice).catch(error => { $('data-message').textContent = error.message; }));
      contenido.append(boton);
    }
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'rounded-lg border border-[#D7C2AD] px-3 py-2 text-xs text-[#241A15]';
    editar.textContent = 'Corregir';
    editar.addEventListener('click', () => abrirEdicionFactura(registro));
    contenido.append(editar);
    if (registro.status !== 'void' && registro.status !== 'refunded') {
      const anular = document.createElement('button');
      anular.type = 'button';
      anular.className = 'rounded-lg border border-red-200 px-3 py-2 text-xs text-red-800';
      anular.textContent = 'Anular';
      anular.addEventListener('click', () => anularFactura(registro, anular).catch(error => { $('data-message').textContent = error.message; }));
      contenido.append(anular);
    }
    const notaImportacion = String(registro.extraction_note || '');
    const notaRepetida = 'Importe, fecha y moneda revisados en el panel; comprobante original guardado. Sin uso de IA.';
    if (notaImportacion && notaImportacion !== notaRepetida) {
      const nota = document.createElement('p');
      nota.className = 'w-full text-xs text-[#69544A]';
      nota.textContent = notaImportacion;
      contenido.append(nota);
    }
    if (registro.description) {
      const descripcion = document.createElement('p');
      descripcion.className = 'w-full text-xs text-[#69544A]';
      descripcion.textContent = registro.description;
      contenido.append(descripcion);
    }
    card.append(contenido);
    list.append(card);
  }
}
const dialogoFactura = $('invoice-edit-dialog');
const formularioEdicionFactura = $('invoice-edit-form');
let facturaEnEdicion = null;
function abrirEdicionFactura(invoice) {
  facturaEnEdicion = invoice;
  formularioEdicionFactura.elements.amount.value = invoice.amount ?? '';
  formularioEdicionFactura.elements.invoice_date.value = invoice.invoice_date || '';
  formularioEdicionFactura.elements.currency.value = invoice.currency || '';
  formularioEdicionFactura.elements.invoice_number.value = invoice.invoice_number || '';
  formularioEdicionFactura.elements.status.value = ['paid', 'open', 'void', 'refunded'].includes(invoice.status) ? invoice.status : 'open';
  $('invoice-edit-message').textContent = '';
  dialogoFactura.showModal();
}
async function anularFactura(invoice, button) {
  if (!window.confirm('¿Anular este comprobante? Se conservará el PDF y dejará de contar como gasto.')) return;
  button.disabled = true;
  try {
    const result = await solicitarAdmin(`/api/admin/facturas/${encodeURIComponent(invoice.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: invoice.amount, invoice_date: invoice.invoice_date, currency: invoice.currency, invoice_number: invoice.invoice_number, status: 'void' })
    });
    $('data-message').textContent = result.message;
    await Promise.allSettled([cargar(), cargarFacturas(false), cargarAcumulado(), cargarServiciosPersonalizados()]);
  } catch (error) {
    $('data-message').textContent = error.message;
    button.disabled = false;
  }
}
formularioEdicionFactura.addEventListener('submit', async event => {
  event.preventDefault();
  if (!facturaEnEdicion) return;
  const button = $('invoice-edit-save');
  const message = $('invoice-edit-message');
  button.disabled = true;
  message.textContent = 'Guardando corrección…';
  try {
    const form = event.currentTarget;
    const result = await solicitarAdmin(`/api/admin/facturas/${encodeURIComponent(facturaEnEdicion.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: form.elements.amount.value,
        invoice_date: form.elements.invoice_date.value,
        currency: form.elements.currency.value,
        invoice_number: form.elements.invoice_number.value,
        status: form.elements.status.value
      })
    });
    dialogoFactura.close();
    facturaEnEdicion = null;
    $('data-message').textContent = result.message;
    await Promise.allSettled([cargar(), cargarFacturas(false), cargarAcumulado()]);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
const formularioFactura = $('manual-invoice-form');
const providerInvoiceSelect = formularioFactura.elements.provider;
const providerInvoiceCustom = formularioFactura.elements.provider_custom;
function actualizarProveedorPersonalizado() {
  const esOtro = providerInvoiceSelect.value === 'otro';
  $('invoice-provider-custom-wrap').classList.toggle('hidden', !esOtro);
  $('invoice-provider-custom-wrap').hidden = !esOtro;
  providerInvoiceCustom.disabled = !esOtro;
  providerInvoiceCustom.required = esOtro;
}
providerInvoiceSelect.addEventListener('change', actualizarProveedorPersonalizado);
actualizarProveedorPersonalizado();
formularioFactura.elements.comprobante.addEventListener('change', () => {
  for (const name of ['invoice_date', 'amount', 'currency', 'invoice_number']) formularioFactura.elements[name].value = '';
  $('manual-invoice-message').textContent = '';
});
$('read-invoice').addEventListener('click', async () => {
  const provider = formularioFactura.elements.provider.value;
  const file = formularioFactura.elements.comprobante.files[0];
  const message = $('manual-invoice-message');
  if (!provider || !file) {
    message.textContent = 'Selecciona el programa y el PDF primero.';
    message.className = 'text-sm text-red-700';
    return;
  }
  const button = $('read-invoice');
  button.disabled = true;
  button.textContent = 'Leyendo PDF…';
  message.textContent = 'Extrayendo texto localmente; no se usa IA…';
  message.className = 'text-sm text-[#69544A]';
  try {
    const data = new FormData();
    data.append('provider', provider);
    data.append('comprobante', file);
    const fields = await solicitarAdmin('/api/admin/facturas/leer', { method: 'POST', body: data });
    const parsed = [];
    if (fields.invoice_date) { formularioFactura.elements.invoice_date.value = fields.invoice_date; parsed.push('fecha'); }
    if (fields.amount != null) { formularioFactura.elements.amount.value = fields.amount; parsed.push('importe'); }
    if (fields.currency) { formularioFactura.elements.currency.value = fields.currency; parsed.push('moneda'); }
    if (fields.invoice_number) { formularioFactura.elements.invoice_number.value = fields.invoice_number; parsed.push('número'); }
    const nombresProveedor = { railway: 'Railway', supabase: 'Supabase', openai: 'OpenAI', meta: 'Meta', claro: 'Claro', otro: 'Otro' };
    if (fields.proveedor_detectado && nombresProveedor[fields.proveedor_detectado]) {
      formularioFactura.elements.provider.value = fields.proveedor_detectado;
      parsed.push('proveedor ' + nombresProveedor[fields.proveedor_detectado]);
    }
    message.textContent = parsed.length
      ? 'Detecté ' + parsed.join(', ') + '. Revisa los datos y guarda.'
      : (fields.texto_detectado ? 'Revisa el proveedor y los datos del PDF antes de guardar.' : 'PDF escaneado: escribe los datos manualmente.');
    message.className = 'text-sm ' + (parsed.length ? 'text-[#256444]' : 'text-[#69544A]');
  } catch (error) {
    message.textContent = error.message;
    message.className = 'text-sm text-red-700';
  } finally {
    button.disabled = false;
    button.textContent = 'Leer datos del PDF';
  }
});
$('manual-invoice-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('save-manual-invoice');
  button.disabled = true;
  button.textContent = 'Leyendo y guardando…';
  const message = $('manual-invoice-message');
  message.textContent = 'Guardando el comprobante privado y registrando el gasto…';
  message.className = 'text-sm text-[#69544A]';
  try {
    const result = await solicitarAdmin('/api/admin/facturas/manual', { method: 'POST', body: new FormData(form) });
    form.reset();
    actualizarProveedorPersonalizado();
    message.textContent = result.message + ' ' + dineroFactura(result.amount, result.currency) + ' · ' + fechaFactura(result.invoice_date) + '.';
    message.className = 'text-sm text-[#256444]';
    await Promise.allSettled([cargar(), cargarFacturas(false), cargarAcumulado()]);
  } catch (error) {
    message.textContent = error.message;
    message.className = 'text-sm text-red-700';
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar comprobante y gasto';
  }
});
$('gmail-connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = $('connect-gmail');
  button.disabled = true;
  button.textContent = 'Abriendo Google…';
  try {
    const email = $('gmail-account-email').value.trim().toLowerCase();
    const result = await solicitarAdmin('/api/admin/integraciones/gmail/conectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    localStorage.setItem('velox-gmail-account-email', email);
    window.location.assign(result.url);
  } catch (error) {
    estadoFacturas(error.message);
    button.disabled = false;
    button.textContent = 'Vincular con Google';
  }
});
$('sync-invoices').addEventListener('click', async () => {
  $('sync-invoices').disabled = true;
  try { estadoFacturas('Sincronizando comprobantes…', true); await solicitarAdmin('/api/admin/facturas/sync', { method: 'POST' }); await Promise.allSettled([cargarFacturas(false), cargarAcumulado()]); }
  catch (error) { estadoFacturas(error.message); }
  finally { $('sync-invoices').disabled = false; }
});

function urlRangoFinanciero() {
  const params = new URLSearchParams({ rango: rangoActual });
  if (rangoActual === 'CUSTOM') { params.set('desde', rangoDesdePersonalizado); params.set('hasta', rangoHastaPersonalizado); }
  return '/api/admin/finanzas/rango?' + params.toString();
}
function activarRango(rango) {
  rangoActual = rango;
  const etiquetas = {
    '1D': 'Hoy', '1S': 'Últimos 7 días', '1M': 'Último mes', '6M': 'Últimos 6 meses',
    YTD: 'Desde enero de este año', '1A': 'Últimos 12 meses', '5A': 'Últimos 5 años', MAX: 'Todo el historial'
  };
  $('rango-selector').value = rango;
  $('rango-personalizado').classList.toggle('hidden', rango !== 'CUSTOM');
  $('rango-actual').textContent = rango === 'CUSTOM'
    ? (rangoDesdePersonalizado + ' — ' + rangoHastaPersonalizado)
    : (etiquetas[rango] || rango);
}
function mostrarVista(session) {
  token = session && session.access_token ? session.access_token : null;
  const enRecuperacion = recoveryMode;
  $('login-card').classList.toggle('hidden', Boolean(session) || enRecuperacion);
  $('recovery-card').classList.add('hidden');
  $('password-card').classList.toggle('hidden', !enRecuperacion);
  $('dashboard').classList.toggle('hidden', !session || enRecuperacion);
  if (session && !enRecuperacion) {
    if (!rangoInicializado) {
      try { const guardado = JSON.parse(localStorage.getItem('velox-finanzas-rango-personalizado') || '{}'); rangoDesdePersonalizado = guardado.desde || ''; rangoHastaPersonalizado = guardado.hasta || ''; } catch {}
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      $('rango-desde').value = rangoDesdePersonalizado;
      $('rango-hasta').value = rangoHastaPersonalizado;
      $('rango-desde').max = hoy; $('rango-hasta').max = hoy;
      activarRango('MAX'); rangoInicializado = true;
    }
    const vistaGuardada = sessionStorage.getItem('velox-finanzas-vista');
    if (vistaGuardada && ['historial', 'analisis', 'facturas', 'restaurantes', 'acumulado', 'comprobantes', 'categorias', 'movimientos', 'movimiento', 'tasas', 'carga-factura'].includes(vistaGuardada)) {
      sessionStorage.removeItem('velox-finanzas-vista');
      activarPestana(vistaGuardada);
    }
    void cargarServiciosPersonalizados();
    const filtroGuardado = localStorage.getItem('velox-invoice-filter');
    if (filtroGuardado && ['active', 'void', 'all'].includes(filtroGuardado)) $('invoice-filter').value = filtroGuardado;
    const tamanoGuardado = localStorage.getItem('velox-invoice-page-size');
    if (tamanoGuardado && ['25', '50'].includes(tamanoGuardado)) $('invoice-page-size').value = tamanoGuardado;
    const servicioGuardado = localStorage.getItem('velox-invoice-provider-filter');
    if (servicioGuardado && [...$('invoice-provider-filter').options].some(option => option.value === servicioGuardado)) $('invoice-provider-filter').value = servicioGuardado;
    cargarAcumulado();
    cargarFacturas(true).catch(error => estadoFacturas(error.message));
    if (!autoRefresh) autoRefresh = setInterval(() => {
      if (document.visibilityState === 'visible' && (!$('vista-historial').classList.contains('hidden') || ['analisis', 'restaurantes', 'acumulado', 'categorias', 'movimientos', 'movimiento'].some(id => !$('vista-' + id).classList.contains('hidden')))) cargarAcumulado();
    }, 15000);
    if (!autoRefreshVersion) autoRefreshVersion = setInterval(() => {
      if (document.visibilityState === 'visible') void comprobarVersionPanel();
    }, 30000);
    if (!autoRefreshFacturas) autoRefreshFacturas = setInterval(() => {
      if (token && document.visibilityState === 'visible') cargarFacturas(false).catch(error => estadoFacturas(error.message));
    }, 10 * 60 * 1000);
  } else {
    if (autoRefresh) { clearInterval(autoRefresh); autoRefresh = null; }
    if (autoRefreshFacturas) { clearInterval(autoRefreshFacturas); autoRefreshFacturas = null; }
    if (autoRefreshVersion) { clearInterval(autoRefreshVersion); autoRefreshVersion = null; }
  }
}
supabase.auth.getSession().then(({ data }) => mostrarVista(data.session));
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') recoveryMode = true;
  if (event === 'SIGNED_OUT') { recoveryMode = false; rangoInicializado = false; }
  mostrarVista(session);
});

document.querySelectorAll('[data-toggle-password]').forEach(button => {
  button.addEventListener('click', () => {
    const input = $(button.dataset.togglePassword);
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    button.querySelector('[data-icon-show]')?.classList.toggle('hidden', mostrar);
    button.querySelector('[data-icon-hide]')?.classList.toggle('hidden', !mostrar);
    button.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
    button.setAttribute('aria-pressed', String(mostrar));
  });
});

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  mensaje('login-message', 'Verificando acceso…', false);
  $('login-btn').disabled = true;
  $('login-btn').textContent = 'Verificando…';
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $('email').value.trim(), password: $('password').value
    });
    if (error) throw error;
  } catch (error) {
    if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '')) {
      mensaje('login-message', 'El correo o la contraseña son incorrectos. Revísalos e inténtalo de nuevo.', true);
    } else if (error.code === 'email_not_confirmed') {
      mensaje('login-message', 'Ese correo todavía no está confirmado. Revisa tu bandeja de entrada.', true);
    } else if (error.status === 429) {
      mensaje('login-message', 'Hubo varios intentos seguidos. Espera un momento y vuelve a intentarlo.', true);
    } else {
      mensaje('login-message', 'No se pudo iniciar sesión. Revisa tu conexión e inténtalo de nuevo.', true);
    }
  } finally {
    $('login-btn').disabled = false;
    $('login-btn').textContent = 'Entrar';
  }
});
$('show-recovery').addEventListener('click', () => {
  $('login-card').classList.add('hidden');
  $('recovery-card').classList.remove('hidden');
  $('recovery-email').value = $('email').value.trim();
  $('recovery-message').textContent = '';
});
$('back-to-login').addEventListener('click', () => {
  $('recovery-card').classList.add('hidden');
  $('login-card').classList.remove('hidden');
});
$('recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  mensaje('recovery-message', 'Enviando solicitud a Supabase…', false);
  $('recovery-btn').disabled = true;
  $('recovery-btn').textContent = 'Enviando…';
  let timeoutId;
  try {
    const solicitud = supabase.auth.resetPasswordForEmail($('recovery-email').value.trim(), {
      redirectTo: window.location.origin + '/admin-costos'
    });
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timeout')), 20000);
    });
    const { error } = await Promise.race([solicitud, timeout]);
    if (error) throw error;
    mensaje('recovery-message', 'Si ese correo está autorizado, recibirás un enlace para cambiar la contraseña. Revisa también el correo no deseado.', false);
  } catch (error) {
    if (error.message === 'timeout') {
      mensaje('recovery-message', 'La solicitud está tardando. Revisa tu conexión; el botón ya quedará disponible para volver a intentar.', true);
    } else if (error.status === 429) {
      mensaje('recovery-message', 'Se solicitaron varios enlaces hace poco. Espera un momento antes de volver a intentarlo.', true);
    } else {
      mensaje('recovery-message', 'No se pudo enviar el enlace. Revisa tu conexión e inténtalo de nuevo.', true);
    }
  } finally {
    clearTimeout(timeoutId);
    $('recovery-btn').disabled = false;
    $('recovery-btn').textContent = 'Enviar enlace';
  }
});
$('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('new-password').value;
  if (password.length < 8) return mensaje('password-message', 'Usa al menos 8 caracteres.', true);
  if (password !== $('confirm-password').value) return mensaje('password-message', 'Las contraseñas no coinciden.', true);
  $('password-btn').disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    recoveryMode = false;
    await supabase.auth.signOut();
    $('password-form').reset();
    $('password-card').classList.add('hidden');
    $('login-card').classList.remove('hidden');
    mensaje('login-message', 'Contraseña actualizada. Ya puedes iniciar sesión.', false);
  } catch (error) {
    mensaje('password-message', 'No se pudo cambiar la contraseña. Solicita un enlace nuevo.', true);
  } finally {
    $('password-btn').disabled = false;
  }
});

function activarPestana(nombre) {
  const vistasSecundarias = ['restaurantes', 'acumulado', 'comprobantes', 'categorias', 'movimientos', 'movimiento', 'tasas', 'carga-factura'];
  const vistasDeAnalisis = ['restaurantes', 'acumulado', 'categorias', 'movimientos'];
  const esVistaSecundaria = vistasSecundarias.includes(nombre);
  const principal = esVistaSecundaria
    ? (vistasDeAnalisis.includes(nombre) ? 'analisis' : 'facturas')
    : nombre;
  const vistasPrincipales = ['historial', 'analisis', 'facturas'];

  for (const id of vistasPrincipales) {
    const activa = id === principal && !esVistaSecundaria;
    $(`vista-${id}`).classList.toggle('hidden', !activa);
    const boton = $(`tab-${id}`);
    boton.className = id === principal
      ? 'rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white'
      : 'rounded-lg px-3 py-2 text-sm font-semibold text-[#69544A]';
    boton.setAttribute('aria-selected', String(id === principal));
  }
  for (const id of vistasSecundarias) {
    $(`vista-${id}`).classList.toggle('hidden', nombre !== id);
  }

  if (['analisis', 'restaurantes', 'acumulado', 'categorias', 'movimientos', 'movimiento'].includes(nombre)) cargar();
  if (nombre === 'acumulado' || nombre === 'historial') cargarAcumulado();
  if (['comprobantes', 'carga-factura'].includes(nombre)) cargarFacturas(false).catch(error => estadoFacturas(error.message));
}
$('tab-historial').addEventListener('click', () => activarPestana('historial'));
$('tab-analisis').addEventListener('click', () => activarPestana('analisis'));
$('tab-facturas').addEventListener('click', () => activarPestana('facturas'));
document.querySelectorAll('[data-open-finance-view]').forEach(button => {
  button.addEventListener('click', () => activarPestana(button.dataset.openFinanceView));
});
document.querySelectorAll('[data-back-analysis]').forEach(button => {
  button.addEventListener('click', () => activarPestana('analisis'));
});
document.querySelectorAll('[data-back-ledger]').forEach(button => {
  button.addEventListener('click', () => activarPestana('facturas'));
});
document.querySelectorAll('[data-back-comprobantes]').forEach(button => {
  button.addEventListener('click', () => activarPestana('comprobantes'));
});

function vistaFinancieraVisible() {
  return ['historial', 'analisis', 'facturas', 'restaurantes', 'acumulado', 'comprobantes', 'categorias', 'movimientos', 'movimiento', 'tasas', 'carga-factura']
    .find(id => !$('vista-' + id).classList.contains('hidden')) || 'historial';
}
function hayCambiosFinancierosSinGuardar() {
  return Boolean(document.querySelector('#dashboard form[data-velox-dirty="true"]'));
}
function prepararRecargaPanel() {
  sessionStorage.setItem('velox-finanzas-vista', vistaFinancieraVisible());
}
async function comprobarVersionPanel() {
  const script = document.querySelector('script[src*="admin-costos.js"]');
  if (!script) return;
  const versionActual = new URL(script.src, location.origin).searchParams.get('v');
  try {
    const response = await fetch('/admin-costos?version-check=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) return;
    const html = await response.text();
    const versionNueva = html.match(/admin-costos.js.v=([^"'&]+)/i)?.[1];
    if (!versionNueva || versionNueva === versionActual) return;
    if (hayCambiosFinancierosSinGuardar()) {
      $('update-notice-text').textContent = 'Hay una actualización. Guarda lo que estás editando y el panel se actualizará solo.';
      $('update-notice').classList.remove('hidden');
      return;
    }
    prepararRecargaPanel();
    location.reload();
  } catch {
    // Si la conexión falla, se volverá a comprobar en el siguiente intervalo.
  }
}
function marcarFormularioFinanciero(event) {
  const formulario = event.target?.closest?.('#dashboard form');
  if (formulario) formulario.dataset.veloxDirty = 'true';
}
document.addEventListener('input', marcarFormularioFinanciero, true);
document.addEventListener('change', marcarFormularioFinanciero, true);
document.addEventListener('reset', event => {
  if (event.target instanceof HTMLFormElement) {
    setTimeout(() => delete event.target.dataset.veloxDirty, 0);
  }
}, true);
$('update-reload').addEventListener('click', () => {
  if (hayCambiosFinancierosSinGuardar() && !window.confirm('Hay datos sin guardar. Si recargas ahora, podrías perderlos. ¿Quieres continuar?')) return;
  prepararRecargaPanel();
  location.reload();
});
async function cargarAcumulado() {
  if (!token) return;
  if (cargandoAcumulado) { acumuladoPendiente = true; return; }
  cargandoAcumulado = true;
  $('data-message').textContent = '';
  $('vida-equivalente').textContent = 'Cargando…';
  $('vida-ingresos-brutos').textContent = 'Cargando…';
  $('vida-ingreso-neto').textContent = 'Cargando…';
  try {
    const periodoData = await solicitar(urlRangoFinanciero());
    renderizar(periodoData);
    $('rango-actual').textContent = periodoData.periodo;
    const resumen = periodoData.resumen || {};
    const faltaTasa = 'Falta tasa de cambio';
    $('vida-equivalente').textContent = resumen.gastos_cop == null ? faltaTasa : mostrarMoneda(resumen.gastos_cop, 'COP');
    $('vida-sin-tasa').textContent = resumen.gastos_cop == null
      ? 'Hay costos en USD sin tasa guardada para su fecha.'
      : 'Incluye costos registrados y costos de IA disponibles.';
    $('vida-ingresos-brutos').textContent = resumen.ingresos_suscripcion_cop == null
      ? faltaTasa : mostrarMoneda(resumen.ingresos_suscripcion_cop, 'COP');
    $('vida-ingresos-detalle').textContent = resumen.ingresos_suscripcion_cop == null
      ? faltaTasa : 'Solo suscripciones del período.';
    $('vida-ingreso-neto').textContent = resumen.utilidad_neta_cop == null
      ? faltaTasa : mostrarMoneda(resumen.utilidad_neta_cop, 'COP');
    $('vida-ingreso-neto').classList.toggle('text-red-700', resumen.utilidad_neta_cop != null && Number(resumen.utilidad_neta_cop) < 0);
    $('vida-ingreso-neto').classList.toggle('text-emerald-700', resumen.utilidad_neta_cop != null && Number(resumen.utilidad_neta_cop) >= 0);
    $('vida-neto-nota').textContent = resumen.utilidad_neta_cop == null
      ? faltaTasa : 'Suscripciones + otros ingresos − costos del período.';
    const movimientosGasto = (periodoData.movimientos || []).filter(m => m.tipo === 'gasto');
    const costosUsdProveedor = resumen.ia_real_disponible ? Number(resumen.ia_real_usd) || 0 : Number(resumen.ia_estimado_usd) || 0;
    $('acumulado-fecha').textContent = periodoData.periodo + ' · ' + numero.format(movimientosGasto.length) + ' gastos registrados.';
    const servicios = new Map();
    const sumar = (categoria, monto, moneda, equivalenteCop) => {
      const nombre = nombresCategoria[categoria] || 'Otros servicios';
      const item = servicios.get(nombre) || { totalCop: 0, sinTasa: false };
      if (equivalenteCop == null) item.sinTasa = true;
      else item.totalCop += Number(equivalenteCop) || 0;
      servicios.set(nombre, item);
    };
    for (const mov of movimientosGasto) {
      const moneda = mov.moneda === 'USD' ? 'USD' : 'COP';
      const tasa = periodoData.tasas_por_mes?.[String(mov.fecha || '').slice(0, 7)];
      const equivalente = moneda === 'COP' ? Number(mov.monto) || 0
        : Number.isFinite(Number(tasa)) && Number(tasa) > 0 ? Number(mov.monto) * Number(tasa) : null;
      sumar(mov.categoria || 'otro', mov.monto, moneda, equivalente);
    }
    if (costosUsdProveedor > 0) {
      sumar('openai', costosUsdProveedor, 'USD', resumen.ia_costo_aplicado_cop);
    }
    const filas = [...servicios.entries()].sort((a, b) => (b[1].totalCop || 0) - (a[1].totalCop || 0));
    const tbody = $('servicios-acumulado-body');
    if (!filas.length) return filaVacia(tbody, 2, 'No hay gastos en este período.');
    const fragmento = document.createDocumentFragment();
    for (const [nombre, servicio] of filas) {
      const fila = document.createElement('tr'); fila.className = 'border-t border-[#E6D8C9]';
      celda(fila, nombre);
      celda(fila, servicio.sinTasa ? 'Falta tasa para convertir a COP' : mostrarMoneda(servicio.totalCop, 'COP'));
      fragmento.append(fila);
    }
    tbody.replaceChildren(fragmento);
  } catch (error) {
    $('vida-equivalente').textContent = 'No disponible';
    $('vida-ingresos-brutos').textContent = 'No disponible';
    $('vida-ingreso-neto').textContent = 'No disponible';
    $('data-message').textContent = error.message;
  } finally {
    cargandoAcumulado = false;
    if (acumuladoPendiente) { acumuladoPendiente = false; void cargarAcumulado(); }
  }
}
$('rango-selector').addEventListener('change', () => {
  const elegido = $('rango-selector').value;
  if (elegido === 'CUSTOM') {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    $('rango-hasta').max = hoy;
    $('rango-desde').max = hoy;
    if (!$('rango-desde').value) $('rango-desde').value = hoy.slice(0, 7) + '-01';
    if (!$('rango-hasta').value) $('rango-hasta').value = hoy;
    $('rango-personalizado').classList.remove('hidden');
    $('rango-actual').textContent = 'Elige las fechas y pulsa Aplicar.';
    return;
  }
  $('rango-personalizado').classList.add('hidden');
  activarRango(elegido);
  void cargarAcumulado();
});
$('aplicar-rango-personalizado').addEventListener('click', () => {
  const desde = $('rango-desde').value;
  const hasta = $('rango-hasta').value;
  if (!desde || !hasta || desde > hasta) {
    $('rango-actual').textContent = 'Revisa las fechas: el inicio debe ser anterior o igual al final.';
    return;
  }
  rangoDesdePersonalizado = desde;
  rangoHastaPersonalizado = hasta;
  localStorage.setItem('velox-finanzas-rango-personalizado', JSON.stringify({ desde, hasta }));
  activarRango('CUSTOM');
  void cargarAcumulado();
});
$('refresh').addEventListener('click', () => cargarAcumulado());
$('actualizar-acumulado').addEventListener('click', cargarAcumulado);
const aplicarFiltrosFacturas = () => {
  paginaFacturas = 1;
  cargarFacturas(false).catch(error => estadoFacturas(error.message));
};
$('invoice-filter').addEventListener('change', () => {
  localStorage.setItem('velox-invoice-filter', $('invoice-filter').value);
  aplicarFiltrosFacturas();
});
$('invoice-provider-filter').addEventListener('change', () => {
  localStorage.setItem('velox-invoice-provider-filter', $('invoice-provider-filter').value);
  aplicarFiltrosFacturas();
});
for (const id of ['invoice-from', 'invoice-to']) $(id).addEventListener('change', aplicarFiltrosFacturas);
$('invoice-search').addEventListener('input', () => {
  clearTimeout(temporizadorBusquedaFacturas);
  temporizadorBusquedaFacturas = setTimeout(aplicarFiltrosFacturas, 300);
});
$('invoice-page-size').addEventListener('change', () => {
  localStorage.setItem('velox-invoice-page-size', $('invoice-page-size').value);
  aplicarFiltrosFacturas();
});
$('invoice-prev').addEventListener('click', () => {
  if (paginaFacturas > 1) {
    paginaFacturas--;
    cargarFacturas(false).catch(error => estadoFacturas(error.message));
  }
});
$('invoice-next').addEventListener('click', () => {
  paginaFacturas++;
  cargarFacturas(false).catch(error => estadoFacturas(error.message));
});
document.querySelectorAll('[data-factura-shortcut]').forEach(button => {
  button.addEventListener('click', () => {
    const proveedor = button.dataset.facturaShortcut;
    $('invoice-provider-filter').value = proveedor;
    localStorage.setItem('velox-invoice-provider-filter', proveedor);
    activarPestana('comprobantes');
  });
});
$('logout').addEventListener('click', () => supabase.auth.signOut());

$('mov-tipo').addEventListener('change', () => actualizarCategorias(true));
$('mov-categoria').addEventListener('change', () => actualizarCategorias());
actualizarCategorias();
$('mov-fecha').value = hoyBogota();
$('tasa-periodo').value = periodoBogota();
$('movimiento-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('mov-guardar').disabled = true;
  $('mov-mensaje').textContent = '';
  const fecha = $('mov-fecha').value;
  const body = {
    tipo: $('mov-tipo').value,
    categoria: $('mov-categoria').value,
    restaurante_id: $('mov-tipo').value === 'gasto' ? null : ($('mov-restaurante').value || null),
    monto: Number($('mov-monto').value),
    moneda: $('mov-moneda').value,
    fecha,
    referencia: $('mov-ref').value.trim(),
    descripcion: $('mov-descripcion').value.trim(),
    servicio_personalizado: $('mov-service-custom').value.trim() || null
  };
  try {
    await solicitar('/api/admin/finanzas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    $('movimiento-form').reset();
    $('mov-service-custom').value = '';
    $('mov-fecha').value = hoyBogota();
    $('mov-tipo').value = 'ingreso';
    actualizarCategorias();
    mensaje('mov-mensaje', 'Movimiento guardado. El resumen del mes y el historial ya están actualizados.', false);
    await void cargarAcumulado();
    await cargarServiciosPersonalizados();
  } catch (error) {
    mensaje('mov-mensaje', error.message, true);
  } finally {
    $('mov-guardar').disabled = false;
  }
});
$('tasa-periodo').addEventListener('change', () => {
  $('tasa-usd-cop').value = datos?.tasas_por_mes?.[$('tasa-periodo').value] || '';
});
$('tasa-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('tasa-guardar').disabled = true;
  try {
    await solicitar('/api/admin/finanzas/tasa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo: $('tasa-periodo').value, cop_por_usd: Number($('tasa-usd-cop').value) })
    });
    mensaje('tasa-mensaje', 'Tasa guardada para ' + $('tasa-periodo').value + '.', false);
    await void cargarAcumulado();
  } catch (error) {
    mensaje('tasa-mensaje', error.message, true);
  } finally {
    $('tasa-guardar').disabled = false;
  }
});
const movimientosBody = $('movimientos-body');
if (movimientosBody) movimientosBody.addEventListener('click', async event => {
  const boton = event.target.closest('[data-anular]');
  if (!boton) return;
  if (!window.confirm('¿Anular este movimiento? Se conservará en el historial, pero dejará de afectar los totales.')) return;
  boton.disabled = true;
  try {
    await solicitar('/api/admin/finanzas/' + encodeURIComponent(boton.dataset.anular) + '/anular', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Anulado desde el panel financiero' })
    });
    await cargar();
  } catch (error) {
    $('data-message').textContent = error.message;
    boton.disabled = false;
  }
});


const parametrosFactura = new URLSearchParams(window.location.search);
if (parametrosFactura.has('gmail') || parametrosFactura.has('gmail_error')) {
  const texto = parametrosFactura.get('gmail') === 'connected' ? 'Correo conectado. Importando comprobantes…' : parametrosFactura.get('gmail_error');
  if (texto) setTimeout(() => { if (token) { estadoFacturas(texto, parametrosFactura.get('gmail') === 'connected'); cargarFacturas(true).catch(error => estadoFacturas(error.message)); } }, 700);
  window.history.replaceState({}, document.title, window.location.pathname);
}
