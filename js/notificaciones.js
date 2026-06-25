// js/notificaciones.js - MOTOR INDEPENDIENTE DE ALERTAS GLOBALES
document.addEventListener('DOMContentLoaded', () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') return;

    const restoId = sesion.restaurante_id;
    const rol = sesion.rol;
    
    // Solo mostramos notificaciones a roles operativos
    if (!["mesero", "encargado", "dueño", "administrador", "cocinero"].includes(rol)) return;

    const sonidoNotificacion = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_8b3c3b9ad9.mp3?filename=notification-106557.mp3");

    // --- FUNCIÓN PARA PINTAR EL GLOBO EMERGENTE (TOAST) ---
    const lanzarAlertaVisual = (titulo, detalle, urlDestino) => {
        try { sonidoNotificacion.play().catch(()=>{}); } catch(e){}

        let contenedor = document.getElementById('notifContenedorGlobal');
        if (!contenedor) {
            contenedor = document.createElement('div');
            contenedor.id = 'notifContenedorGlobal';
            contenedor.style = "position: fixed; top: 80px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 999999;";
            document.body.appendChild(contenedor);
        }

        const toast = document.createElement('div');
        toast.style = "background: #fff; color: #333; border-left: 6px solid #10ad93; box-shadow: 0 4px 15px rgba(0,0,0,0.3); padding: 15px 20px; border-radius: 10px; font-family: system-ui, sans-serif; cursor: pointer; min-width: 250px; animation: aparecerNoti 0.3s ease-out;";
        toast.innerHTML = `<strong>${titulo}</strong><br><small style="color:#666;">${detalle}</small>`;
        
        toast.onclick = () => window.location.href = urlDestino;

        contenedor.appendChild(toast);
        setTimeout(() => { if(toast.parentNode) toast.remove(); }, 6000);
    };

    // --- ESCUCHAR SUPABASE EN TIEMPO REAL ---
    console.log("🔔 Motor de notificaciones globales iniciado...");

    db.channel(`alertas-globales-${restoId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'ordenes', 
            filter: `restaurante_id=eq.${restoId}` 
        }, payload => {
            const orden = payload.new;
            const destino = orden.mesa ? `Mesa: ${orden.mesa}` : "Pedido para llevar";
            lanzarAlertaVisual('🔔 Nueva Orden Recibida', destino, 'ordenes.html');
        })
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'reservaciones', 
            filter: `restaurante_id=eq.${restoId}` 
        }, payload => {
            const reserva = payload.new;
            if (reserva.estado === 'pendiente') {
                lanzarAlertaVisual('📅 Nueva Reservación', `${reserva.nombre_cliente} - ${reserva.mesa}`, 'reservaciones.html');
            }
        })
        .subscribe();

    // Animación CSS inyectada para el Toast
    if (!document.getElementById('animNotifCSS')) {
        const style = document.createElement('style');
        style.id = 'animNotifCSS';
        style.textContent = `@keyframes aparecerNoti { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }`;
        document.head.appendChild(style);
    }
});