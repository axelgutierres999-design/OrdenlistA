// js/registro.js - VERSIÓN FINAL INTEGRADA
document.getElementById('formRegistro').addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Verificar conexión inicial
    if (typeof db === 'undefined') {
        alert("❌ Error crítico: No hay conexión con la base de datos.");
        return;
    }

    // 2. Capturar y limpiar datos
    const nombreNegocio = document.getElementById('regNegocio').value.trim();
    const direccion = document.getElementById('regDireccion').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value;
    const nombreAdmin = document.getElementById('regNombreAdmin').value.trim();
    const pinAdmin = document.getElementById('regPinAdmin').value.trim();
    const btn = document.getElementById('btnRegistro');

    // Validación de PIN (solo 4 números)
    if (!/^\d{4}$/.test(pinAdmin)) {
        return alert("⚠️ El PIN debe ser exactamente de 4 números.");
    }

    // Bloquear botón para evitar múltiples clics
    btn.disabled = true;
    btn.innerText = "Procesando registro...";

    try {
        // PASO A: Crear usuario en Supabase Auth
        const { data: authData, error: authError } = await db.auth.signUp({
            email: email,
            password: password
        });

        if (authError) {
            if (authError.message.includes("already registered")) {
                throw new Error("Este correo ya está registrado. Intenta con otro o contacta a soporte.");
            }
            throw authError;
        }

        if (!authData.user) throw new Error("No se pudo crear el usuario de autenticación.");

        const userId = authData.user.id; 

        // PASO B: Crear el Restaurante
        // Incluimos correo_admin para que la lógica de login/vinculación funcione
        const { error: dbError } = await db
            .from('restaurantes')
            .insert([{
                id: userId, 
                nombre: nombreNegocio,
                correo_admin: email, // <-- Crucial para la vinculación
                direccion: direccion,
                num_mesas: 10 
            }]);

        if (dbError) {
            console.error("Error en Paso B (Tabla Restaurantes):", dbError);
            throw new Error("Error al guardar los datos del negocio.");
        }

        // PASO C: Crear el Perfil del Dueño
        // Usamos el userId como ID del perfil para asegurar que el login lo encuentre siempre
        const { error: perfilError } = await db
            .from('perfiles')
            .insert([{
                id: userId, 
                restaurante_id: userId,
                nombre: nombreAdmin,
                pin: pinAdmin,
                rol: 'dueño',
                foto: `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreAdmin)}&background=10ad93&color=fff`
            }]);

        if (perfilError) {
            console.error("Error en Paso C (Tabla Perfiles):", perfilError);
            throw new Error("Error al crear tu perfil de administrador.");
        }

        // --- TODO SALIÓ BIEN ---
        alert("¡Registro exitoso! 🎉\n\nTu restaurante '" + nombreNegocio + "' ha sido creado.\nAhora vincula esta terminal con tu correo administrador.");
        
        // Limpiar rastro de sesiones anteriores para evitar conflictos
        localStorage.clear();
        sessionStorage.clear();

        // Redirigir al login para el paso de vinculación
        window.location.href = 'login.html';

    } catch (error) {
        console.error("Error detallado del registro:", error);
        alert("❌ No se pudo completar el registro:\n" + error.message);
        
        // Reactivar botón si hubo error
        btn.disabled = false;
        btn.innerText = "✨ Registrar y Comenzar";
    }
});