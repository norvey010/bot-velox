// Configuración de conexión con Supabase (Variables públicas de tu proyecto)
const SUPABASE_URL = "https://ozailviyimrjmebrilbp.supabase.co"; // Reemplaza con tu URL de Supabase
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YWlsdml5aW1yam1lYnJpbGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTA5MTEsImV4cCI6MjEwMDY4NjkxMX0.rkWEtTGV4uFB_w62sC-vygZoLbfEgx_KKTSd9oS-5CM"; // Reemplaza con tu anon key de Supabase

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.getElementById('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const btn = document.getElementById('btnRegistrar');
  btn.disabled = true;
  btn.innerText = "Procesando registro...";

  // Capturar los valores del formulario
  const nombreRestaurante = document.getElementById('nombreRestaurante').value;
  const nombreEncargado = document.getElementById('nombreEncargado').value;
  const telefono = document.getElementById('telefono').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const plan = document.getElementById('plan').value;

  try {
    // 1. Crear el usuario en el módulo de Autenticación de Supabase (Paso 2 del manual)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password
    });

    if (authError) throw authError;

    // 2. Insertar el perfil del negocio en la tabla 'restaurantes'
    const { error: dbError } = await supabase
      .from('restaurantes')
      .insert([{
        id_usuario: authData.user?.id,
        nombre_restaurante: nombreRestaurante,
        nombre_encargado: nombreEncargado,
        telefono: telefono,
        email: email,
        plan_seleccionado: plan,
        estado_cuenta: plan === 'prueba' ? 'prueba_activa' : 'pendiente_pago'
      }]);

    if (dbError) throw dbError;

    alert("¡Cuenta registrada con éxito! Redirigiendo a tu panel de control...");
    window.location.href = "/dashboard.html";

  } catch (error) {
    console.error("Error en el registro:", error);
    alert("Ocurrió un error al registrar la cuenta: " + error.message);
    btn.disabled = false;
    btn.innerText = "Crear Cuenta y Continuar";
  }
});