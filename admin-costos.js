import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabase = createClient('https://ozailviyimrjmebrilbp.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YWlsdml5aW1yam1lYnJpbGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTA5MTEsImV4cCI6MjEwMDY4NjkxMX0.rkWEtTGV4uFB_w62sC-vygZoLbfEgx_KKTSd9oS-5CM');
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value || 0);
let token = null;
let recoveryMode = false;

async function cargar() {
  $('data-message').textContent = '';
  const response = await fetch(`/api/admin/costos?dias=${$('days').value}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No se pudo consultar el panel.');
  $('count').textContent = body.restaurantes.length;
  $('operations').textContent = body.total_operaciones;
  const total = body.restaurantes.reduce((sum, r) => sum + Number(r.costo_estimado_usd || 0), 0);
  $('total').textContent = body.operaciones_sin_tarifa ? `${money(total)} · parcial` : money(total);
  $('average').textContent = money(body.restaurantes.length ? total / body.restaurantes.length : 0);
  $('note').textContent = body.nota + (body.operaciones_sin_tarifa ? ` Hay ${body.operaciones_sin_tarifa} operaciones sin tarifa; el total mostrado es parcial.` : '');
  $('rows').replaceChildren(...body.restaurantes.map(r => {
    const tr = document.createElement('tr'); tr.className = 'border-t border-[#D7C2AD]';
    [r.restaurante, r.operaciones.toLocaleString('es-CO'), r.tokens_entrada.toLocaleString('es-CO'), r.tokens_salida.toLocaleString('es-CO'), r.operaciones_sin_tarifa ? `${money(r.costo_estimado_usd)} · ${r.operaciones_sin_tarifa} sin tarifa` : money(r.costo_estimado_usd)].forEach(value => { const td=document.createElement('td'); td.className='p-3'; td.textContent=value; tr.append(td); }); return tr;
  }));
}
function mostrarVista(session) {
  token = session?.access_token || null;
  const enRecuperacion = recoveryMode;
  $('login-card').classList.toggle('hidden', Boolean(session) || enRecuperacion);
  $('recovery-card').classList.add('hidden');
  $('password-card').classList.toggle('hidden', !enRecuperacion);
  $('dashboard').classList.toggle('hidden', !session || enRecuperacion);
  if (session && !enRecuperacion) cargar().catch(e => $('data-message').textContent=e.message);
}
supabase.auth.getSession().then(({data}) => mostrarVista(data.session));
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true;
    mostrarVista(session);
    return;
  }
  if (event === 'SIGNED_OUT') recoveryMode = false;
  mostrarVista(session);
});

$('login-form').addEventListener('submit', async e => {
  e.preventDefault(); $('login-message').textContent=''; $('login-btn').disabled=true;
  try {
    const {error}=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error) throw error;
  } catch(err) {
    $('login-message').textContent='No se pudo iniciar sesión. Revisa el correo y la contraseña.';
  } finally { $('login-btn').disabled=false; }
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
$('recovery-form').addEventListener('submit', async e => {
  e.preventDefault(); $('recovery-message').textContent=''; $('recovery-btn').disabled=true;
  try {
    const {error}=await supabase.auth.resetPasswordForEmail($('recovery-email').value.trim(), {
      redirectTo: `${window.location.origin}/admin-costos`
    });
    if(error) throw error;
    $('recovery-message').className='mt-3 text-sm text-[#256444]';
    $('recovery-message').textContent='Si ese correo está autorizado, recibirás un enlace para cambiar la contraseña. Revisa también el correo no deseado.';
  } catch(err) {
    $('recovery-message').className='mt-3 text-sm text-red-700';
    $('recovery-message').textContent='No se pudo enviar el enlace ahora. Espera un momento e inténtalo de nuevo.';
  } finally { $('recovery-btn').disabled=false; }
});
$('password-form').addEventListener('submit', async e => {
  e.preventDefault(); $('password-message').textContent='';
  const password = $('new-password').value;
  if(password.length < 8) { $('password-message').textContent='Usa al menos 8 caracteres.'; return; }
  if(password !== $('confirm-password').value) { $('password-message').textContent='Las contraseñas no coinciden.'; return; }
  $('password-btn').disabled=true;
  try {
    const {error}=await supabase.auth.updateUser({password});
    if(error) throw error;
    recoveryMode=false;
    await supabase.auth.signOut();
    $('password-form').reset();
    $('login-message').className='mt-3 text-sm text-[#256444]';
    $('login-message').textContent='Contraseña actualizada. Ya puedes entrar con la nueva contraseña.';
    $('password-message').textContent='';
    $('password-card').classList.add('hidden');
    $('login-card').classList.remove('hidden');
  } catch(err) {
    $('password-message').className='mt-3 text-sm text-red-700';
    $('password-message').textContent='No se pudo cambiar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.';
  } finally { $('password-btn').disabled=false; }
});
$('refresh').addEventListener('click', () => cargar().catch(e => $('data-message').textContent=e.message));
$('days').addEventListener('change', () => cargar().catch(e => $('data-message').textContent=e.message));
$('logout').addEventListener('click', async () => { await supabase.auth.signOut(); });
