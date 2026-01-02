/**
 * js/init-check.js 
 * Este script debe cargarse al principio de cada página protegida
 * para garantizar que nadie entre sin haberse identificado.
 */

(async function() {
    console.log("Validando acceso a la terminal...");

    // 1. Verificar primero si existe la sesión personalizada (La Regla de Oro)
    const sesionLocal = JSON.parse(localStorage.getItem('sesion_activa'));
    
    // 2. Verificar la configuración de la terminal (El restaurante vinculado)
    const restConfig = JSON.parse(localStorage.getItem('config_restaurante'));

    // Lógica de redirección
    if (!restConfig) {
        // Si la terminal no sabe a qué restaurante pertenece, va al login paso 1
        console.warn("Terminal no vinculada a ningún restaurante.");
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
        return;
    }

    if (!sesionLocal) {
        // Si hay restaurante pero no hay empleado logueado, va al login paso 2
        console.warn("No hay sesión de empleado activa.");
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
        return;
    }

    // 3. Validación técnica con Supabase (Opcional pero recomendada para Dueños)
    // Solo el dueño suele tener una sesión de 'auth' real de Supabase
    if (window.db && window.db.auth) {
        const { data: { session } } = await window.db.auth.getSession();
        
        // Si es el dueño y su sesión de Supabase expiró, lo mandamos a re-autenticar
        if (sesionLocal.rol === 'dueño' && !session) {
            console.error("Sesión de administrador expirada.");
            localStorage.removeItem('sesion_activa');
            window.location.href = 'login.html';
            return;
        }

        // Guardamos el ID del negocio globalmente como respaldo
        window.NEGOCIO_ID = sesionLocal.restaurante_id;
        console.log("✅ Acceso autorizado para:", sesionLocal.nombre, "| Negocio:", window.NEGOCIO_ID);
    }

})();