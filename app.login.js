// Importamos Supabase directamente desde el CDN oficial para el navegador
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Configura aquí tus credenciales públicas de Supabase
const SUPABASE_URL = 'https://ozailviyimrjmebrilbp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YWlsdml5aW1yam1lYnJpbGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTA5MTEsImV4cCI6MjEwMDY4NjkxMX0.rkWEtTGV4uFB_w62sC-vygZoLbfEgx_KKTSd9oS-5CM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') {
        document.getElementById('nueva-clave').hidden = false;
        document.getElementById('clave-recuperada').focus();
    }
});

document.getElementById('recuperar-acceso').addEventListener('click', async () => {
    const campo = document.getElementById('email');
    const estado = document.getElementById('estado-acceso');
    if (!campo.value.trim() || !campo.validity.valid) {
        estado.textContent = 'Escribe tu correo para recuperar el acceso.';
        campo.focus();
        return;
    }
    const boton = document.getElementById('recuperar-acceso');
    boton.disabled = true;
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(campo.value.trim(), {
            redirectTo: new URL('/login.html', window.location.origin).href
        });
        if (error) throw error;
        estado.textContent = 'Si el correo está registrado, recibirás un enlace para cambiar tu contraseña.';
    } catch {
        estado.textContent = 'No pudimos enviar el enlace. Inténtalo en unos minutos.';
    } finally {
        boton.disabled = false;
    }
});

document.getElementById('nueva-clave').addEventListener('submit', async event => {
    event.preventDefault();
    const boton = event.submitter;
    boton.disabled = true;
    try {
        const { error } = await supabase.auth.updateUser({ password: document.getElementById('clave-recuperada').value });
        if (error) throw error;
        window.location.href = '/dashboard.html';
    } catch {
        document.getElementById('estado-acceso').textContent = 'No pudimos guardar la contraseña. Revisa el enlace o solicita uno nuevo.';
    } finally {
        boton.disabled = false;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('login-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!email || !password) {
            alert("Por favor completa todos los campos.");
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = "Entrando...";

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) throw error;

            window.location.href = 'dashboard.html';

        } catch (err) {
            alert(err.code === "email_not_confirmed" ? "Abre el enlace de confirmación que enviamos a tu correo." : "No pudimos iniciar sesión. Revisa tu correo y contraseña.");
            btn.disabled = false;
            btn.innerText = "Entrar a mi panel →";
        }
    });
});
