// js/config-negocio.js - CARGA Y GUARDADO DE CONFIGURACIÓN

async function cargarConfiguracion() {
    try {
        // 1. Obtener el usuario actual
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            console.warn("Usuario no autenticado.");
            return;
        }

        // 2. Consultar la tabla 'restaurantes' (que actúa como configuración)
        const { data: config, error: dbError } = await supabase
            .from('restaurantes')
            .select('*')
            .eq('id', user.id) // El ID del restaurante coincide con el ID del usuario
            .maybeSingle();

        if (dbError) throw dbError;

        // 3. Rellenar la interfaz
        if (config) {
            const inputMesas = document.getElementById('numMesasInput');
            const inputNombre = document.getElementById('regNegocio'); // Por si quieres editar el nombre

            if (inputMesas) inputMesas.value = config.num_mesas;
            if (inputNombre) inputNombre.value = config.nombre;
            
            // Actualizar memoria local
            localStorage.setItem('total_mesas', config.num_mesas);
            localStorage.setItem('nombre_negocio', config.nombre);
            
            console.log("Configuración cargada:", config.nombre);
        }

    } catch (err) {
        console.error("Error al cargar configuración:", err.message);
    }
}

/**
 * Función para guardar cambios desde el panel de ajustes
 * @param {number} nuevoTotal - Número de mesas
 * @param {string} nuevoNombre - (Opcional) Nuevo nombre del local
 */
async function guardarCambiosNegocio(nuevoTotal, nuevoNombre = null) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const actualizaciones = { num_mesas: parseInt(nuevoTotal) };
        if (nuevoNombre) actualizaciones.nombre = nuevoNombre;

        const { error } = await supabase
            .from('restaurantes')
            .update(actualizaciones)
            .eq('id', user.id);

        if (error) throw error;

        alert("✅ Cambios guardados correctamente.");
        localStorage.setItem('total_mesas', nuevoTotal);
        if (nuevoNombre) localStorage.setItem('nombre_negocio', nuevoNombre);

    } catch (err) {
        alert("Error al guardar: " + err.message);
    }
}

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', cargarConfiguracion);