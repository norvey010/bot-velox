import { supabaseClient } from './index.js';

window.iniciarSesion = async function() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const btn = document.getElementById('login-btn');

    if (!email || !password) {
        alert("Por favor completa todos los campos.");
        return;
    }

    try {
        btn.disabled = true;
        btn.innerText = "Entrando...";

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            throw error;
        }

        // Si el login es exitoso, directo al dashboard
        window.location.href = 'dashboard.html';

    } catch (err) {
        alert("Error al iniciar sesión: " + err.message);
        btn.disabled = false;
        btn.innerText = "Entrar a Velox";
    }
}