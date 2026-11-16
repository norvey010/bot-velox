import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://ozailviyimrjmebrilbp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YWlsdml5aW1yam1lYnJpbGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTA5MTEsImV4cCI6MjEwMDY4NjkxMX0.rkWEtTGV4uFB_w62sC-vygZoLbfEgx_KKTSd9oS-5CM'
);
const $ = id => document.getElementById(id);
const nombresCategoria = {
  suscripcion: 'Suscripción', railway: 'Railway', supabase: 'Supabase',
  claro: 'Claro', meta: 'Meta', otro: 'Otro'
};
const monedaCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const monedaUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const numero = new Intl.NumberFormat('es-CO');
let token = null;
let recoveryMode = false;
let autoRefresh = null;
let cargando = false;
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
function actualizarCategorias() {
  const tipo = $('mov-tipo').value;
  const categoria = $('mov-categoria');
  const opciones = tipo === 'ingreso'
    ? [['suscripcion', 'Suscripción'], ['otro', 'Otro ingreso']]
    : [['railway', 'Railway'], ['supabase', 'Supabase'], ['claro', 'Claro'], ['meta', 'Meta'], ['otro', 'Otro gasto']];
  categoria.replaceChildren(...opciones.map(([valor, texto]) => new Option(texto, valor)));
  $('mov-restaurante').required = tipo === 'ingreso';
  $('mov-restaurante').options[0].textContent = tipo === 'ingreso' ? 'Selecciona un restaurante' : 'Gasto compartido de Velox';
}
function renderizar(data) {
  datos = data;
  const r = data.resumen;
  $('ingresos-cop').textContent = mostrarMoneda(r.ingresos_cop, 'COP');
  $('ingresos-usd').textContent = mostrarMoneda(r.ingresos_usd, 'USD') + ' registrados en USD';
  $('gastos-cop').textContent = mostrarMoneda(r.gastos_registrados_cop, 'COP');
  $('gastos-usd').textContent = mostrarMoneda(r.gastos_usd, 'USD') + ' registrados en USD';
  $('openai-usd').textContent = r.operaciones_ia && r.ia_sin_tarifa === r.operaciones_ia
    ? 'Sin tarifa' : mostrarMoneda(r.ia_estimado_usd, 'USD');
  $('openai-nota').textContent = numero.format(r.operaciones_ia) + ' operaciones · ' +
    numero.format(r.ia_sin_tarifa) + ' sin tarifa configurada';
  if (r.utilidad_neta_cop == null) {
    $('neto-cop').textContent = 'Falta tasa USD';
    $('neto-nota').textContent = 'Guarda la tasa del período para convertir todos los valores.';
  } else {
    $('neto-cop').textContent = mostrarMoneda(r.utilidad_neta_cop, 'COP');
    $('neto-nota').textContent = r.utilidad_parcial
      ? 'Estimación parcial: hay operaciones de IA sin tarifa configurada.'
      : 'Incluye los movimientos registrados y el costo estimado de OpenAI.';
  }
  $('finance-note').textContent = data.nota +
    (r.compartidos_sin_asignar_cop > 0
      ? ' Hay gastos compartidos sin repartir porque ningún restaurante tiene suscripción registrada este mes.'
      : '');
  $('tasa-usd-cop').value = data.tasa_cop_por_usd || '';
  $('ai-period-note').textContent = 'Período ' + data.periodo +
    '. El costo depende de las tarifas configuradas; el consumo sin tarifa aparece separado.';
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
    celda(fila, numero.format(r.tokens_entrada || 0));
    celda(fila, numero.format(r.tokens_salida || 0));
    celda(fila, r.ia_sin_tarifa
      ? mostrarMoneda(r.ia_usd, 'USD') + ' · ' + numero.format(r.ia_sin_tarifa) + ' sin tarifa'
      : mostrarMoneda(r.ia_usd, 'USD'));
    fragmentoIa.append(fila);
  }
  ia.replaceChildren(fragmentoIa);
}
async function cargar() {
  if (!token || cargando) return;
  cargando = true;
  $('data-message').textContent = '';
  try {
    const periodo = $('periodo').value || periodoBogota();
    const data = await solicitar('/api/admin/finanzas?periodo=' + encodeURIComponent(periodo));
    renderizar(data);
  } catch (error) {
    $('data-message').textContent = error.message;
  } finally {
    cargando = false;
  }
}
function mostrarVista(session) {
  token = session && session.access_token ? session.access_token : null;
  const enRecuperacion = recoveryMode;
  $('login-card').classList.toggle('hidden', Boolean(session) || enRecuperacion);
  $('recovery-card').classList.add('hidden');
  $('password-card').classList.toggle('hidden', !enRecuperacion);
  $('dashboard').classList.toggle('hidden', !session || enRecuperacion);
  if (session && !enRecuperacion) {
    if (!$('periodo').value) $('periodo').value = periodoBogota();
    cargar();
    if (!autoRefresh) autoRefresh = setInterval(() => {
      if (document.visibilityState === 'visible') cargar();
    }, 15000);
  } else if (autoRefresh) {
    clearInterval(autoRefresh);
    autoRefresh = null;
  }
}
supabase.auth.getSession().then(({ data }) => mostrarVista(data.session));
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') recoveryMode = true;
  if (event === 'SIGNED_OUT') recoveryMode = false;
  mostrarVista(session);
});

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-message').textContent = '';
  $('login-btn').disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $('email').value.trim(), password: $('password').value
    });
    if (error) throw error;
  } catch (error) {
    $('login-message').textContent = 'No se pudo iniciar sesión. Revisa el correo y la contraseña.';
  } finally {
    $('login-btn').disabled = false;
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
  $('recovery-message').textContent = '';
  $('recovery-btn').disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail($('recovery-email').value.trim(), {
      redirectTo: window.location.origin + '/admin-costos'
    });
    if (error) throw error;
    mensaje('recovery-message', 'Si ese correo está autorizado, recibirás un enlace para cambiar la contraseña. Revisa también el correo no deseado.', false);
  } catch (error) {
    mensaje('recovery-message', 'No se pudo enviar el enlace ahora. Inténtalo de nuevo.', true);
  } finally {
    $('recovery-btn').disabled = false;
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

$('tab-resumen').addEventListener('click', () => {
  $('vista-resumen').classList.remove('hidden');
  $('vista-restaurantes').classList.add('hidden');
  $('tab-resumen').className = 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white';
  $('tab-restaurantes').className = 'rounded-lg px-4 py-2 text-sm font-semibold text-[#69544A]';
  $('tab-resumen').setAttribute('aria-selected', 'true');
  $('tab-restaurantes').setAttribute('aria-selected', 'false');
});
$('tab-restaurantes').addEventListener('click', () => {
  $('vista-restaurantes').classList.remove('hidden');
  $('vista-resumen').classList.add('hidden');
  $('tab-restaurantes').className = 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white';
  $('tab-resumen').className = 'rounded-lg px-4 py-2 text-sm font-semibold text-[#69544A]';
  $('tab-restaurantes').setAttribute('aria-selected', 'true');
  $('tab-resumen').setAttribute('aria-selected', 'false');
});
$('periodo').addEventListener('change', cargar);
$('refresh').addEventListener('click', cargar);
$('logout').addEventListener('click', () => supabase.auth.signOut());

$('mov-tipo').addEventListener('change', actualizarCategorias);
actualizarCategorias();
$('mov-fecha').value = hoyBogota();
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
    mensaje('mov-mensaje', 'Movimiento guardado. El resumen ya está actualizado.', false);
    await cargar();
  } catch (error) {
    mensaje('mov-mensaje', error.message, true);
  } finally {
    $('mov-guardar').disabled = false;
  }
});
$('tasa-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('tasa-guardar').disabled = true;
  try {
    await solicitar('/api/admin/finanzas/tasa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo: $('periodo').value, cop_por_usd: Number($('tasa-usd-cop').value) })
    });
    mensaje('tasa-mensaje', 'Tasa guardada para ' + $('periodo').value + '.', false);
    await cargar();
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
