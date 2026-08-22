// Importamos Supabase directamente desde el CDN oficial para el navegador
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Configura aquí tus credenciales públicas de Supabase (las mismas que usa tu app de registro)
const SUPABASE_URL = 'https://ozailviyimrjmebrilbp.supabase.co'; // <--- Pon tu URL de Supabase aquí
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YWlsdml5aW1yam1lYnJpbGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTA5MTEsImV4cCI6MjEwMDY4NjkxMX0.rkWEtTGV4uFB_w62sC-vygZoLbfEgx_KKTSd9oS-5CM'; // <--- Pon tu llave anónima aquí

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
            alert("Error al iniciar sesión: " + err.message);
            btn.disabled = false;
            btn.innerText = "Entrar a Velox";
        }
    });
});



export function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const eyeOpenIcon = document.getElementById('icon-eye-open');
    const eyeClosedIcon = document.getElementById('icon-eye-closed');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeOpenIcon.style.display = 'none';
        eyeClosedIcon.style.display = 'block';
    } else {
        passwordInput.type = 'password';
        eyeOpenIcon.style.display = 'block';
        eyeClosedIcon.style.display = 'none';
    }
}
window.togglePasswordVisibility = togglePasswordVisibility;