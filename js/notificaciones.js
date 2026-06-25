// js/notificaciones.js - MOTOR INDEPENDIENTE DE ALERTAS GLOBALES
document.addEventListener('DOMContentLoaded', () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') return;

    const restoId = sesion.restaurante_id;
    const rol = sesion.rol;
    
    if (!["mesero", "encargado", "dueño", "administrador", "cocinero"].includes(rol)) return;

    const sonidoNotificacion = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_8b3c3b9ad9.mp3?filename=notification-106557.mp3");

    // Función para actualizar el punto rojo (Badge) en tu menú
    const actualizarBadge = () => {
        const badges = document.querySelectorAll('.badge-rojo');
        badges.forEach(badge => {
            badge.style.display = 'inline-block'; // Lo muestra
            // Si quieres que el número suba, podrías implementar un contador aquí
        });
    };

    // Función para el Toast
    const lanzarAlertaVisual = (titulo, detalle, urlDestino) => {
        try { sonidoNotificacion.play().catch(()=>{}); } catch(e){}

        // Usamos el ID del CSS directamente
        let contenedor = document.getElementById('notifContenedor');
        
        // Si no existe el contenedor en tu HTML, lo creamos
        if (!contenedor) {
            contenedor = document.createElement('div');
            contenedor.id = 'notifContenedor';
            document.body.appendChild(contenedor);
        }

        const toast = document.createElement('div');
        toast.className = 'toast-notificacion'; // Usamos clase CSS
        toast.innerHTML = `<strong>${titulo}</strong><br><small style="color:#666;">${detalle}</small>`;
        toast.onclick = () => window.location.href = urlDestino;

        contenedor.appendChild(toast);
        
        // Actualizamos el badge también
        actualizarBadge();

        setTimeout(() => { if(toast.parentNode) toast.remove(); }, 6000);
    };

    // --- SUSCRIPCIÓN SUPABASE ---
    db.channel(`alertas-globales-${restoId}`)
        .on('postgres_changes', { 
            event: 'INSERT', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` 
        }, payload => {
            lanzarAlertaVisual('🔔 Nueva Orden', `Mesa: ${payload.new.mesa || 'Para llevar'}`, 'ordenes.html');
        })
        .on('postgres_changes', { 
            event: 'INSERT', schema: 'public', table: 'reservaciones', filter: `restaurante_id=eq.${restoId}` 
        }, payload => {
            if (payload.new.estado === 'pendiente') {
                lanzarAlertaVisual('📅 Nueva Reservación', `${payload.new.nombre_cliente}`, 'reservaciones.html');
            }
        })
        .subscribe();
});