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
let cargando = false;
let cargandoAcumulado = false;
let acumuladoPendiente = false;
let cargaPendiente = false;
let rangoActual = 'MAX';
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
  const opciones = [new Option('Gasto compartido de Velox', '')];
  for (const r of restaurantes) opciones.push(new Option(r.restaurante, r.restaurante_id));
  select.replaceChildren(...opciones);
  if ([...select.options].some(o => o.value === elegido)) select.value = elegido;
}
function actualizarCategorias(reiniciarAtribucion = false) {
  const tipo = $('mov-tipo').value;
  const categoria = $('mov-categoria');
  const selector = $('mov-restaurante');
  const opciones = tipo === 'ingreso'
    ? [['suscripcion', 'Suscripción']]
    : [['railway', 'Railway'], ['supabase', 'Supabase'], ['claro', 'Claro'], ['meta', 'Meta'], ['otro', 'Otro gasto']];
  categoria.replaceChildren(...opciones.map(([valor, texto]) => new Option(texto, valor)));
  selector.required = tipo === 'ingreso';
  selector.options[0].textContent = tipo === 'ingreso'
    ? 'Selecciona el restaurante que pagó'
    : 'Gasto compartido de Velox · repartir entre restaurantes activos';
  $('mov-restaurante-label').textContent = tipo === 'ingreso'
    ? 'Restaurante que pagó'
    : '¿A quién atribuimos este gasto?';
  $('mov-restaurante-help').textContent = tipo === 'ingreso'
    ? 'El ingreso se asignará a este restaurante.'
    : 'Déjalo como gasto compartido para repartirlo entre restaurantes activos. Elige un restaurante solo si el gasto es exclusivo de ese negocio.';
  if (reiniciarAtribucion) selector.value = '';
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
  renderizarAlertaConsumoOpenAI(data.alerta_consumo_openai);
  const r = data.resumen;
  $('ingresos-cop').textContent = r.ingresos_cop == null ? 'Falta tasa USD' : mostrarMoneda(r.ingresos_cop, 'COP');
  $('ingresos-usd').textContent = mostrarMoneda(r.ingresos_usd, 'USD') + ' registrados en USD';
  $('gastos-cop').textContent = r.gastos_cop == null ? 'Falta tasa USD' : mostrarMoneda(r.gastos_cop, 'COP');
  $('gastos-usd').textContent = mostrarMoneda(r.gastos_usd, 'USD') + ' en USD, incluye OpenAI';
  const costoOpenAIUsd = r.ia_real_disponible ? r.ia_real_usd : r.ia_estimado_usd;
  $('openai-usd').textContent = mostrarMoneda(costoOpenAIUsd, 'USD');
  $('openai-cop').textContent = r.ia_costo_aplicado_cop == null
    ? 'Equivalente COP: falta tasa' : '≈ ' + mostrarMoneda(r.ia_costo_aplicado_cop, 'COP');
  $('openai-nota').textContent = r.ia_real_disponible
    ? 'Costo monetario reportado por OpenAI · ' + numero.format(r.operaciones_ia) + ' operaciones registradas en Velox'
    : 'Estimación local · ' + numero.format(r.operaciones_ia) + ' operaciones';
  if (r.utilidad_neta_cop == null) {
    $('neto-cop').textContent = 'Falta tasa USD';
    $('neto-nota').textContent = 'Guarda la tasa mensual que falta usando el selector de tasa de cambio.';
  } else {
    $('neto-cop').textContent = mostrarMoneda(r.utilidad_neta_cop, 'COP');
    $('neto-nota').textContent = r.ia_real_disponible
      ? 'Incluye el gasto reportado por OpenAI y los movimientos del libro.'
      : 'Incluye los movimientos del libro y el costo OpenAI estimado localmente.';
  }
  $('finance-note').textContent = data.nota + ' ' + (data.costos_openai?.mensaje || '') +
    (r.ia_real_sin_asignar_usd > 0 ? ' OpenAI sin atribuir a restaurante: ' + mostrarMoneda(r.ia_real_sin_asignar_usd, 'USD') + '.' : '') +
    (r.compartidos_sin_asignar_cop > 0
      ? ' Hay gastos compartidos sin repartir porque ningún restaurante tiene días activos en este mes.'
      : '');
  $('tasa-usd-cop').value = data.tasas_por_mes?.[$('tasa-periodo').value] || '';
  $('ai-period-note').textContent = data.costos_openai?.disponible
    ? 'Período ' + data.periodo + '. Costo monetario real de OpenAI; el reparto por restaurante es estimado según la telemetría de Velox.'
    : 'Período ' + data.periodo + '. Se muestra el costo OpenAI estimado localmente hasta conectar el reporte monetario del proveedor.';
  renderizarCategorias(data.gastos_por_categoria || {});
  renderizarMovimientos(data.movimientos || [], data.restaurantes || []);
  renderizarRestaurantes(data.restaurantes || []);
}
function renderizarCategorias(categorias) {
  const contenedor = $('gastos-categorias');
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
  const porId = new Map(restaurantes.map(r => [r.restaurante_id, r.restaurante]));
  if (!movimientos.length) return filaVacia(tbody, 6, 'Todavía no hay movimientos en este período.');
  const fragmento = document.createDocumentFragment();
  for (const mov of movimientos) {
    const fila = document.createElement('tr');
    fila.className = 'border-t border-[#E6D8C9]';
    celda(fila, mov.fecha);
    celda(fila, mov.tipo === 'ingreso' ? 'Ingreso' : nombresCategoria[mov.categoria] || 'Gasto');
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
  const tbody = $('restaurantes-finanzas-body');
  if (!restaurantes.length) filaVacia(tbody, 6, 'Aún no hay restaurantes registrados.');
  else {
    const fragmento = document.createDocumentFragment();
    for (const r of restaurantes) {
      const fila = document.createElement('tr');
      fila.className = 'border-t border-[#E6D8C9]';
      celda(fila, r.restaurante);
      celda(fila, mostrarMoneda(r.ingresos_cop, 'COP'));
      celda(fila, mostrarMoneda(r.gastos_directos_cop, 'COP'));
      celda(fila, mostrarMoneda(r.gastos_compartidos_cop, 'COP'));
      celda(fila, r.ia_cop == null ? mostrarMoneda(r.ia_usd, 'USD') + ' · falta tasa' : mostrarMoneda(r.ia_cop, 'COP'));
      celda(fila, r.neto_cop == null ? 'Parcial · falta tasa' : mostrarMoneda(r.neto_cop, 'COP'));
      fragmento.append(fila);
    }
    tbody.replaceChildren(fragmento);
  }
  const ia = $('ia-restaurantes-body');
  const fragmentoIa = document.createDocumentFragment();
  for (const r of restaurantes) {
    const fila = document.createElement('tr');
    fila.className = 'border-t border-[#E6D8C9]';
    celda(fila, r.restaurante);
    celda(fila, numero.format(r.operaciones_ia || 0));
    celda(fila, mostrarMoneda(r.ia_usd, 'USD'));
    celda(fila, r.ia_cop == null ? 'Falta tasa USD' : mostrarMoneda(r.ia_cop, 'COP'));
    fragmentoIa.append(fila);
  }
  ia.replaceChildren(fragmentoIa);
}
async function cargar() {
  if (!token) return;
  if (cargando) { cargaPendiente = true; return; }
  cargando = true;
  $('data-message').textContent = '';
  try {
    const data = await solicitar('/api/admin/finanzas/rango?rango=' + encodeURIComponent(rangoActual));
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
async function cargarFacturas(auto = true) {
  const status = await solicitarAdmin('/api/admin/integraciones/gmail/estado');
  $('connect-gmail').disabled = !status.configurado;
  $('sync-invoices').disabled = !status.conectado;
  if (!status.configurado) {
    estadoFacturas(`Para vincular ${status.correo}, el administrador debe configurar el cliente OAuth de Google en Railway. URI de retorno: ${status.redirect_uri || 'pendiente del dominio público'}.`);
  } else if (!status.conectado) {
    estadoFacturas(`Conecta ${status.correo} una vez. Velox buscará únicamente correos de facturación de las plataformas.`);
  } else {
    estadoFacturas(`Correo conectado: ${status.correo}${status.ultima_sync ? ` · Última sincronización ${new Date(status.ultima_sync).toLocaleString('es-CO')}` : ' · Aún no se sincroniza'}`, true);
    if (auto && (!status.ultima_sync || Date.now() - new Date(status.ultima_sync).getTime() > 6 * 60 * 60 * 1000)) {
      estadoFacturas('Buscando comprobantes y guardando los originales…', true);
      await solicitarAdmin('/api/admin/facturas/sync', { method: 'POST' });
      status.ultima_sync = new Date().toISOString();
      estadoFacturas(`Correo conectado: ${status.correo} · Comprobantes actualizados`, true);
    }
  }
  const { facturas = [], movimientos = [] } = await solicitarAdmin('/api/admin/facturas');
  const nombres = { railway: 'Railway', supabase: 'Supabase', openai: 'OpenAI', meta: 'Meta', claro: 'Claro', otro: 'Otro / Codex' };
  const registros = [
    ...facturas.map(invoice => ({ ...invoice, tipoRegistro: 'factura', fechaOrden: invoice.invoice_date || invoice.source_received_at || invoice.imported_at })),
    ...movimientos.map(movimiento => ({
      ...movimiento,
      provider: movimiento.categoria,
      status: movimiento.anulado_en ? 'void' : 'recorded',
      tipoRegistro: 'movimiento',
      fechaOrden: movimiento.fecha
    }))
  ];
  const anuladas = registros.filter(registro =>
    registro.tipoRegistro === 'movimiento'
      ? Boolean(registro.anulado_en)
      : ['void', 'refunded'].includes(registro.status)
  ).length;
  const activas = registros.length - anuladas;
  const proveedoresConocidos = ['railway', 'supabase', 'openai', 'meta', 'claro'];
  const filtroProveedor = $('invoice-provider-filter').value || 'all';
  const filtroFactura = $('invoice-filter').value || 'active';
  const coincideServicio = registro => filtroProveedor === 'all'
    || (filtroProveedor === 'otro'
      ? !proveedoresConocidos.includes(registro.provider)
      : registro.provider === filtroProveedor);
  const coincideEstado = registro => filtroFactura === 'all'
    || (filtroFactura === 'void'
      ? (registro.tipoRegistro === 'movimiento' ? Boolean(registro.anulado_en) : ['void', 'refunded'].includes(registro.status))
      : (registro.tipoRegistro === 'movimiento' ? !registro.anulado_en : !['void', 'refunded'].includes(registro.status)));
  const facturasFiltradas = registros
    .filter(registro => coincideServicio(registro) && coincideEstado(registro))
    .sort((a, b) => new Date(b.fechaOrden || 0) - new Date(a.fechaOrden || 0));
  const cantidadFactura = facturasFiltradas.filter(registro => registro.tipoRegistro === 'factura').length;
  const cantidadMovimiento = facturasFiltradas.length - cantidadFactura;
  $('invoice-filter').options[0].textContent = 'Activas (' + activas + ')';
  $('invoice-filter').options[1].textContent = 'Anuladas (' + anuladas + ')';
  $('invoice-filter').options[2].textContent = 'Todas (' + registros.length + ')';
  for (const option of $('invoice-provider-filter').options) {
    const cantidad = registros.filter(registro =>
      option.value === 'all' ? true
        : option.value === 'otro' ? !proveedoresConocidos.includes(registro.provider)
          : registro.provider === option.value
    ).length;
    const base = option.value === 'all' ? 'Todos'
      : option.value === 'otro' ? 'Otros'
        : nombres[option.value] || option.textContent.replace(/\s+\(\d+\)$/, '');
    option.textContent = base + ' (' + cantidad + ')';
  }
  $('invoice-summary').textContent = 'Historial completo · ' + activas + ' activos, ' + anuladas
    + ' anulados · mostrando ' + facturasFiltradas.length + ' registros: ' + cantidadFactura
    + ' facturas y ' + cantidadMovimiento + ' movimientos. Los gastos vinculados a una factura aparecen una sola vez con su comprobante.';
  const list = $('invoice-list'); list.replaceChildren();
  if (!facturasFiltradas.length) {
    const vacio = document.createElement('p'); vacio.className = 'text-sm text-[#69544A]';
    vacio.textContent = registros.length
      ? 'No hay facturas ni movimientos para este servicio y estado.'
      : 'Aún no hay facturas ni movimientos guardados.';
    list.append(vacio); return;
  }
  for (const registro of facturasFiltradas) {
    const fila = document.createElement('article'); fila.className = 'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E6D8C9] p-3';
    const info = document.createElement('div'); info.className = 'min-w-0';
    const titulo = document.createElement('p'); titulo.className = 'truncate text-sm font-medium text-[#241A15]';
    const detalle = document.createElement('p'); detalle.className = 'mt-1 text-xs text-[#69544A]';
    const acciones = document.createElement('div'); acciones.className = 'flex flex-wrap gap-2';
    if (registro.tipoRegistro === 'movimiento') {
      titulo.textContent = (nombres[registro.provider] || registro.provider || 'Otro') + ' · Movimiento de gasto';
      detalle.textContent = fechaFactura(registro.fecha) + ' · '
        + (registro.anulado_en ? 'Anulado' : 'Movimiento manual') + ' · '
        + dineroFactura(registro.monto, registro.moneda);
      info.append(titulo, detalle);
      const descripcion = [registro.descripcion, registro.referencia].filter(Boolean).join(' · ');
      fila.append(info, acciones);
      if (descripcion) {
        const nota = document.createElement('p'); nota.className = 'w-full text-xs text-[#69544A]'; nota.textContent = descripcion; fila.append(nota);
      }
      list.append(fila);
      continue;
    }
    titulo.textContent = (nombres[registro.provider] || registro.provider) + ' · '
      + (registro.invoice_number ? 'Factura ' + registro.invoice_number : registro.email_subject || 'Comprobante');
    const estado = registro.status === 'paid' ? 'Pagada'
      : registro.status === 'open' ? 'Pendiente de pago'
        : registro.status === 'void' ? 'Anulada'
          : registro.status === 'refunded' ? 'Reembolsada' : 'Importe por revisar';
    detalle.textContent = fechaFactura(registro.invoice_date || registro.source_received_at) + ' · '
      + estado + ' · ' + dineroFactura(registro.paid_amount ?? registro.amount, registro.currency);
    info.append(titulo, detalle);
    for (const [indice, archivo] of (Array.isArray(registro.files) ? registro.files : []).entries()) {
      const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'rounded-lg border border-[#D7C2AD] px-3 py-2 text-xs text-[#241A15]'; boton.textContent = 'Ver ' + (archivo.name || 'comprobante');
      boton.addEventListener('click', () => abrirComprobante(registro.id, indice).catch(error => { $('data-message').textContent = error.message; }));
      acciones.append(boton);
    }
    const editar = document.createElement('button');
    editar.type = 'button'; editar.className = 'rounded-lg border border-[#D7C2AD] px-3 py-2 text-xs text-[#241A15]'; editar.textContent = 'Corregir';
    editar.addEventListener('click', () => abrirEdicionFactura(registro));
    acciones.append(editar);
    if (registro.status !== 'void' && registro.status !== 'refunded') {
      const anular = document.createElement('button');
      anular.type = 'button'; anular.className = 'rounded-lg border border-red-200 px-3 py-2 text-xs text-red-800'; anular.textContent = 'Anular';
      anular.addEventListener('click', () => anularFactura(registro, anular).catch(error => { $('data-message').textContent = error.message; }));
      acciones.append(anular);
    }
    fila.append(info, acciones);
    if (registro.extraction_note) { const nota = document.createElement('p'); nota.className = 'w-full text-xs text-[#69544A]'; nota.textContent = registro.extraction_note; fila.append(nota); }
    list.append(fila);
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
    await Promise.allSettled([cargar(), cargarFacturas(false), cargarAcumulado()]);
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
    const nombresProveedor = { railway: 'Railway', supabase: 'Supabase', openai: 'OpenAI', meta: 'Meta', claro: 'Claro', otro: 'Otro / Codex' };
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
$('connect-gmail').addEventListener('click', async () => {
  $('connect-gmail').disabled = true;
  try { const result = await solicitarAdmin('/api/admin/integraciones/gmail/conectar', { method: 'POST' }); window.location.assign(result.url); }
  catch (error) { estadoFacturas(error.message); $('connect-gmail').disabled = false; }
});
$('sync-invoices').addEventListener('click', async () => {
  $('sync-invoices').disabled = true;
  try { estadoFacturas('Sincronizando comprobantes…', true); await solicitarAdmin('/api/admin/facturas/sync', { method: 'POST' }); await Promise.allSettled([cargarFacturas(false), cargarAcumulado()]); }
  catch (error) { estadoFacturas(error.message); }
  finally { $('sync-invoices').disabled = false; }
});

function activarRango(rango) {
  rangoActual = rango;
  const etiquetas = {
    '1D': 'Hoy', '1S': 'Últimos 7 días', '1M': 'Último mes', '6M': 'Últimos 6 meses',
    YTD: 'Desde enero de este año', '1A': 'Últimos 12 meses', '5A': 'Últimos 5 años', MAX: 'Todo el historial'
  };
  $('rango-selector').value = rango;
  $('rango-actual').textContent = etiquetas[rango] || rango;
}
function mostrarVista(session) {
  token = session && session.access_token ? session.access_token : null;
  const enRecuperacion = recoveryMode;
  $('login-card').classList.toggle('hidden', Boolean(session) || enRecuperacion);
  $('recovery-card').classList.add('hidden');
  $('password-card').classList.toggle('hidden', !enRecuperacion);
  $('dashboard').classList.toggle('hidden', !session || enRecuperacion);
  if (session && !enRecuperacion) {
    if (!rangoInicializado) { activarRango('MAX'); rangoInicializado = true; }
    const filtroGuardado = localStorage.getItem('velox-invoice-filter');
    if (filtroGuardado && ['active', 'void', 'all'].includes(filtroGuardado)) $('invoice-filter').value = filtroGuardado;
    const servicioGuardado = localStorage.getItem('velox-invoice-provider-filter');
    if (servicioGuardado && [...$('invoice-provider-filter').options].some(option => option.value === servicioGuardado)) $('invoice-provider-filter').value = servicioGuardado;
    cargarAcumulado();
    cargarFacturas(true).catch(error => estadoFacturas(error.message));
    if (!autoRefresh) autoRefresh = setInterval(() => {
      if (document.visibilityState === 'visible' && !$('vista-analisis').classList.contains('hidden')) cargar();
    }, 15000);
    if (!autoRefreshFacturas) autoRefreshFacturas = setInterval(() => {
      if (token && document.visibilityState === 'visible') cargarFacturas(false).catch(error => estadoFacturas(error.message));
    }, 10 * 60 * 1000);
  } else {
    if (autoRefresh) { clearInterval(autoRefresh); autoRefresh = null; }
    if (autoRefreshFacturas) { clearInterval(autoRefreshFacturas); autoRefreshFacturas = null; }
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
  const vistasSecundarias = ['restaurantes', 'acumulado'];
  const esVistaSecundaria = vistasSecundarias.includes(nombre);
  const principal = esVistaSecundaria ? 'analisis' : nombre;
  const vistasPrincipales = ['historial', 'analisis', 'facturas'];

  for (const id of vistasPrincipales) {
    const activa = id === principal && !(id === 'analisis' && esVistaSecundaria);
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

  if (nombre === 'analisis' || nombre === 'restaurantes') cargar();
  if (nombre === 'acumulado' || nombre === 'historial') cargarAcumulado();
  if (nombre === 'facturas') cargarFacturas(false).catch(error => estadoFacturas(error.message));
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
async function cargarAcumulado() {
  if (!token) return;
  if (cargandoAcumulado) { acumuladoPendiente = true; return; }
  cargandoAcumulado = true;
  $('acumulado-nota').textContent = 'Sumando los gastos guardados y consultando el costo histórico disponible…';
  try {
    const data = await solicitar('/api/admin/finanzas/acumulado');
    $('acumulado-cop').textContent = mostrarMoneda(data.monedas?.COP, 'COP');
    $('acumulado-usd').textContent = mostrarMoneda(data.monedas?.USD, 'USD');
    $('acumulado-equivalente').textContent = mostrarMoneda(data.monedas?.equivalente_cop, 'COP');
    const sinTasa = Number(data.monedas?.usd_sin_tasa) > 0
      ? mostrarMoneda(data.monedas.usd_sin_tasa, 'USD') + ' sin tasa mensual guardada'
      : 'No hay USD pendientes de conversión.';
    $('acumulado-sin-tasa').textContent = sinTasa;
    const periodoData = await solicitar('/api/admin/finanzas/rango?rango=' + encodeURIComponent(rangoActual));
    const resumen = periodoData.resumen || {};
    const faltaTasa = 'Completa las tasas mensuales para ver el total en COP.';
    $('vida-equivalente').textContent = resumen.gastos_cop == null ? 'Falta tasa de cambio' : mostrarMoneda(resumen.gastos_cop, 'COP');
    $('vida-sin-tasa').textContent = resumen.gastos_cop == null ? 'Hay costos en USD sin tasa guardada en Facturas.' : 'Incluye los costos registrados y los costos de IA disponibles.';
    $('vida-ingresos-brutos').textContent = resumen.ingresos_suscripcion_cop == null ? 'Falta tasa de cambio' : mostrarMoneda(resumen.ingresos_suscripcion_cop, 'COP');
    $('vida-ingresos-detalle').textContent = resumen.ingresos_suscripcion_cop == null ? faltaTasa : 'Solo suscripciones del período.';
    $('vida-ingreso-neto').textContent = resumen.utilidad_neta_cop == null ? 'Falta tasa de cambio' : mostrarMoneda(resumen.utilidad_neta_cop, 'COP');
    $('vida-neto-nota').textContent = resumen.utilidad_neta_cop == null ? faltaTasa : 'Suscripciones + otros ingresos − costos del período.';
    $('vida-nota').textContent = periodoData.periodo + ' · ' + numero.format(periodoData.movimientos?.length || 0) + ' movimientos activos.';
    $('acumulado-nota').textContent = data.nota + ' ' + data.nota_openai;
    $('acumulado-fecha').textContent = data.inicio
      ? 'Desde ' + fechaFactura(data.inicio) + ' · actualizado ' + new Date(data.actualizado_en).toLocaleString('es-CO') + ' · ' + numero.format(data.movimientos_contados || 0) + ' gastos registrados.'
      : 'Aún no hay gastos con fecha en el libro financiero.';
    const tbody = $('servicios-acumulado-body');
    if (!data.servicios?.length) return filaVacia(tbody, 4, 'Aún no hay gastos registrados.');
    const fragmento = document.createDocumentFragment();
    for (const servicio of data.servicios) {
      const fila = document.createElement('tr'); fila.className = 'border-t border-[#E6D8C9]';
      celda(fila, servicio.servicio);
      celda(fila, mostrarMoneda(servicio.COP, 'COP'));
      celda(fila, mostrarMoneda(servicio.USD, 'USD'));
      celda(fila, mostrarMoneda(servicio.equivalente_cop, 'COP'));
      fragmento.append(fila);
    }
    tbody.replaceChildren(fragmento);
  } catch (error) {
    $('acumulado-nota').textContent = error.message;
    $('vida-nota').textContent = error.message;
  } finally {
    cargandoAcumulado = false;
    if (acumuladoPendiente) { acumuladoPendiente = false; void cargarAcumulado(); }
  }
}
$('rango-selector').addEventListener('change', () => {
  activarRango($('rango-selector').value);
  Promise.allSettled([cargar(), cargarAcumulado()]);
});
$('refresh').addEventListener('click', () => Promise.allSettled([cargar(), cargarAcumulado()]));
$('actualizar-acumulado').addEventListener('click', cargarAcumulado);
$('refresh-lifetime-top').addEventListener('click', cargarAcumulado);
$('invoice-filter').addEventListener('change', () => {
  localStorage.setItem('velox-invoice-filter', $('invoice-filter').value);
  cargarFacturas(false);
});
$('invoice-provider-filter').addEventListener('change', () => {
  localStorage.setItem('velox-invoice-provider-filter', $('invoice-provider-filter').value);
  cargarFacturas(false);
});
document.querySelectorAll('[data-factura-shortcut]').forEach(button => {
  button.addEventListener('click', () => {
    const proveedor = button.dataset.facturaShortcut;
    $('invoice-provider-filter').value = proveedor;
    localStorage.setItem('velox-invoice-provider-filter', proveedor);
    activarPestana('facturas');
  });
});
$('logout').addEventListener('click', () => supabase.auth.signOut());

$('mov-tipo').addEventListener('change', () => actualizarCategorias(true));
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
    restaurante_id: $('mov-restaurante').value || null,
    monto: Number($('mov-monto').value),
    moneda: $('mov-moneda').value,
    fecha,
    referencia: $('mov-ref').value.trim(),
    descripcion: $('mov-descripcion').value.trim()
  };
  try {
    await solicitar('/api/admin/finanzas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    $('movimiento-form').reset();
    $('mov-fecha').value = hoyBogota();
    $('mov-tipo').value = 'ingreso';
    actualizarCategorias();
    mensaje('mov-mensaje', 'Movimiento guardado. El resumen del mes y el historial ya están actualizados.', false);
    await Promise.allSettled([cargar(), cargarAcumulado()]);
  } catch (error) {
    mensaje('mov-mensaje', error.message, true);
  } finally {
    $('mov-guardar').disabled = false;
  }
});
$('otro-ingreso-form').addEventListener('submit', async event => {
  event.preventDefault();
  const boton = $('otro-ingreso-guardar');
  boton.disabled = true;
  mensaje('otro-ingreso-mensaje', '', false);
  const fecha = $('otro-ingreso-fecha').value;
  const body = {
    tipo: 'ingreso', categoria: 'otro', restaurante_id: null,
    descripcion: $('otro-ingreso-descripcion').value.trim(),
    monto: Number($('otro-ingreso-monto').value), moneda: $('otro-ingreso-moneda').value,
    fecha, referencia: $('otro-ingreso-ref').value.trim()
  };
  try {
    await solicitar('/api/admin/finanzas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    $('otro-ingreso-form').reset();
    $('otro-ingreso-fecha').value = hoyBogota();
    mensaje('otro-ingreso-mensaje', 'Ingreso guardado y sumado al neto. No cuenta como suscripción.', false);
    await Promise.allSettled([cargar(), cargarAcumulado()]);
  } catch (error) {
    mensaje('otro-ingreso-mensaje', error.message, true);
  } finally {
    boton.disabled = false;
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
    await Promise.allSettled([cargar(), cargarAcumulado()]);
  } catch (error) {
    mensaje('tasa-mensaje', error.message, true);
  } finally {
    $('tasa-guardar').disabled = false;
  }
});
$('movimientos-body').addEventListener('click', async event => {
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
