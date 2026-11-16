import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabase = createClient('https://ozailviyimrjmebrilbp.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YWlsdml5aW1yam1lYnJpbGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTA5MTEsImV4cCI6MjEwMDY4NjkxMX0.rkWEtTGV4uFB_w62sC-vygZoLbfEgx_KKTSd9oS-5CM');
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value || 0);
let token = null;
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
    const tr = document.createElement('tr'); tr.className = 'border-t border-slate-800';
    [r.restaurante, r.operaciones.toLocaleString('es-CO'), r.tokens_entrada.toLocaleString('es-CO'), r.tokens_salida.toLocaleString('es-CO'), r.operaciones_sin_tarifa ? `${money(r.costo_estimado_usd)} · ${r.operaciones_sin_tarifa} sin tarifa` : money(r.costo_estimado_usd)].forEach(value => { const td=document.createElement('td'); td.className='p-3'; td.textContent=value; tr.append(td); }); return tr;
  }));
}
async function mostrarSesion(session) {
  token = session?.access_token || null;
  $('login-card').classList.toggle('hidden', Boolean(session)); $('dashboard').classList.toggle('hidden', !session);
  if (session) try { await cargar(); } catch (e) { $('data-message').textContent=e.message; }
}
supabase.auth.getSession().then(({data}) => mostrarSesion(data.session));
supabase.auth.onAuthStateChange((_event, session) => mostrarSesion(session));
$('login-form').addEventListener('submit', async e => { e.preventDefault(); $('login-message').textContent=''; $('login-btn').disabled=true; try { const {error}=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error) throw error; } catch(err) { $('login-message').textContent=err.message; } finally { $('login-btn').disabled=false; } });
$('refresh').addEventListener('click', () => cargar().catch(e => $('data-message').textContent=e.message));
$('days').addEventListener('change', () => cargar().catch(e => $('data-message').textContent=e.message));
$('logout').addEventListener('click', async () => { await supabase.auth.signOut(); });

