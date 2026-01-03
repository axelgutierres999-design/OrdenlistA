// js/registro.js - CORREGIDO PARA GUARDAR CORREO DE VINCULACIÓN
document.getElementById('formRegistro').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (typeof db === 'undefined') {
        alert("❌ Error: No hay conexión con la base de datos.");
        return;
    }

    const nombreNegocio = document.getElementById('regNegocio').value.trim();
    const direccion = document.getElementById('regDireccion').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value;
    const nombreAdmin = document.getElementById('regNombreAdmin').value.trim();
    const pinAdmin = document.getElementById('regPinAdmin').value.trim();
    const btn = document.getElementById('btnRegistro');

    if (!/^\d{4}$/.test(pinAdmin)) {
        return alert("⚠️ El PIN debe ser de 4 números.");
    }

    btn.disabled = true;
    btn.innerText = "Creando restaurante...";

    try {
        // PASO A: Crear usuario en Supabase Auth
        const { data: authData, error: authError } = await db.auth.signUp({
            email: email,
            password: password
        });

        if (authError) throw authError;
        const userId = authData.user.id; 

        // PASO B: Crear el Restaurante con correo_admin (SOLUCIÓN AL ERROR)
        const { error: dbError } = await db
            .from('restaurantes')
            .insert([{
                id: userId, 
                nombre: nombreNegocio,
                correo_admin: email, // <-- IMPORTANTE: Esto permite la vinculación posterior
                direccion: direccion,
                num_mesas: 10 
            }]);

        if (dbError) throw new Error("Error al guardar datos del negocio.");

        // PASO C: Crear el Perfil del Dueño
        const { error: perfilError } = await db
            .from('perfiles')
            .insert([{
                restaurante_id: userId,
                nombre: nombreAdmin,
                pin: pinAdmin,
                rol: 'dueño'
            }]);

        if (perfilError) throw new Error("Error al crear perfil de administrador.");

        alert("¡Registro exitoso! 🎉 Ahora vincula esta terminal con tu correo.");
        localStorage.clear();
        window.location.href = 'login.html';

    } catch (error) {
        alert("❌ Error: " + error.message);
        btn.disabled = false;
        btn.innerText = "Registrar y Comenzar";
    }
});