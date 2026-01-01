// js/registro.js

document.getElementById('formRegistro').addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Verificar conexión
    if (typeof db === 'undefined') {
        alert("Error crítico: No hay conexión con la base de datos (db undefined).");
        return;
    }

    // 2. Capturar datos del HTML nuevo
    const nombreNegocio = document.getElementById('regNegocio').value;
    const direccion = document.getElementById('regDireccion').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const nombreAdmin = document.getElementById('regNombreAdmin').value;
    const pinAdmin = document.getElementById('regPinAdmin').value;
    const btn = document.getElementById('btnRegistro');

    // Validación de PIN
    if (!/^\d{4}$/.test(pinAdmin)) {
        return alert("El PIN debe ser exactamente de 4 números.");
    }

    btn.disabled = true;
    btn.innerText = "Creando cuenta...";

    try {
        // PASO A: Crear usuario en Supabase Auth (Email/Pass)
        const { data: authData, error: authError } = await db.auth.signUp({
            email: email,
            password: password
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("No se pudo crear el usuario.");

        const userId = authData.user.id; // Este será nuestro ID Maestro (Regla de Oro)

        // PASO B: Crear el Restaurante en la base de datos
        // Usamos el mismo ID del usuario para el restaurante para mantener la relación 1 a 1
        const { error: dbError } = await db
            .from('restaurantes')
            .insert([{
                id: userId, // ID MAESTRO
                nombre: nombreNegocio,
                direccion: direccion,
                num_mesas: 10 // Valor por defecto
            }]);

        if (dbError) throw dbError;

        // PASO C: Crear el Perfil de Dueño (Con PIN)
        const { error: perfilError } = await db
            .from('perfiles')
            .insert([{
                restaurante_id: userId, // Vinculado al restaurante recién creado
                nombre: nombreAdmin,
                pin: pinAdmin,
                rol: 'dueño'
            }]);

        if (perfilError) throw perfilError;

        // ÉXITO
        alert("¡Cuenta creada con éxito! 🎉\nAhora inicia sesión con tu Usuario y PIN.");
        
        // Limpiamos datos viejos
        localStorage.clear();

        // REDIRECCIÓN CORRECTA (Al Login, no al Index)
        window.location.href = 'login.html';

    } catch (error) {
        console.error("Error:", error);
        alert("Error al registrar: " + error.message);
        btn.disabled = false;
        btn.innerText = "✨ Registrar y Comenzar";
    }
});