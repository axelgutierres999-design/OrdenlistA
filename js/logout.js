/**
 * js/logout.js
 * Maneja el cierre de sesión seguro tanto en el cliente como en el servidor.
 */

async function cerrarSesion() {
    console.log("Iniciando cierre de sesión seguro...");

    try {
        // 1. Identificar el cliente de Supabase disponible (db o supabase)
        const supabaseClient = window.db || window.supabase;
        
        // 2. Avisar al servidor de Supabase que la sesión terminó
        if (supabaseClient && supabaseClient.auth) {
            await supabaseClient.auth.signOut();
        }
    } catch (error) {
        console.warn("Error al notificar salida al servidor:", error.message);
    } finally {
        // 3. LIMPIEZA TOTAL: Regla de Oro para evitar fugas de datos
        
        // Borramos la sesión personalizada que creamos
        localStorage.removeItem('sesion_activa');
        
        // Borramos manualmente cualquier token de Supabase por seguridad extra
        Object.keys(localStorage).forEach(key => {
            if (key.includes('supabase.auth.token') || key.startsWith('sb-')) {
                localStorage.removeItem(key);
            }
        });

        // Limpieza final de todo el almacenamiento
        localStorage.clear();
        sessionStorage.clear();

        console.log("Sesión eliminada. Redirigiendo...");

        // 4. Salida inmediata al index
        window.location.replace('index.html'); 
    }
}

// Hacerlo disponible para los botones con onclick="cerrarSesion()"
window.cerrarSesion = cerrarSesion;