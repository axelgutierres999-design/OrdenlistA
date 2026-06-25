// js/app.js - NÚCLEO CENTRALIZADO CON SISTEMA DE NOTIFICACIONES GLOBALES
const App = (function() {
    let ordenes = [];
    let suministros = [];
    let reservaciones = []; // 🆕 Añadido para el conteo de notificaciones
    let config = { num_mesas: 10 };

    // === SESIÓN ACTIVA ===
    const getRestoId = () => {
        const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
        return sesion ? sesion.restaurante_id : null;
    };

    const getRol = () => {
        const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
        return sesion ? sesion.rol : null;
    };

    const renderCallbacks = {};
    const sonidoNotificacion = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_8b3c3b9ad9.mp3?filename=notification-106557.mp3");

    // === CARGA INICIAL DE DATOS ===
    const cargarDatosIniciales = async () => {
        if (typeof db === 'undefined') return;
        const restoId = getRestoId();
        if (!restoId) return;

        try {
            // 1. Datos del restaurante y SaaS
            const { data: dataResto } = await db.from('restaurantes').select('num_mesas, corte_actual, estado_pago, fecha_vencimiento').eq('id', restoId).single();
            const { data: masterConfig } = await db.from('master_config').select('*').eq('id', 'global_config').single();
            
            if (dataResto) {
                config = { ...config, ...dataResto };
                if (masterConfig?.fondo_url) {
                    document.body.style.background = `url('${masterConfig.fondo_url}') no-repeat center center fixed`;
                    document.body.style.backgroundSize = "cover";
                }
                verificarBloqueo(dataResto, masterConfig);
            }

            // 2. Traer Órdenes activas
            const { data: dataOrdenes } = await db.from('ordenes')
                .select('*')
                .eq('restaurante_id', restoId)
                .not('estado', 'in', '("entregado","cancelado")')
                .order('created_at', { ascending: true });
            if (dataOrdenes) ordenes = dataOrdenes;

            // 3. Traer Reservaciones pendientes
            const { data: dataRes } = await db.from('reservaciones')
                .select('*')
                .eq('restaurante_id', restoId)
                .eq('estado', 'pendiente');
            if (dataRes) reservaciones = dataRes;

            // 4. Traer suministros
            const { data: dataSuministros } = await db.from('suministros').select('*').eq('restaurante_id', restoId);
            if (dataSuministros) suministros = dataSuministros;

            // 🚀 Actualizar Puntos Rojos y pantallas
            actualizarBadges();
            App.notifyUpdate();
        } catch (err) {
            console.error("Error global de carga:", err);
        }
    };

    // === ACTUALIZADOR DE BADGES (PUNTOS ROJOS) ===
    const actualizarBadges = () => {
        // Contar cuántas requieren atención
        const ordPendientes = ordenes.filter(o => o.estado === 'pendiente' || o.estado === 'por_confirmar').length;
        const resPendientes = reservaciones.length; // Ya filtramos las pendientes en SQL

        // Buscar los elementos en el menú y actualizar número
        const badgeOrd = document.getElementById('badge-ordenes');
        if (badgeOrd) {
            badgeOrd.textContent = ordPendientes;
            badgeOrd.style.display = ordPendientes > 0 ? 'inline-block' : 'none';
        }

        const badgeRes = document.getElementById('badge-reservas');
        if (badgeRes) {
            badgeRes.textContent = resPendientes;
            badgeRes.style.display = resPendientes > 0 ? 'inline-block' : 'none';
        }
    };

    // === NOTIFICACIÓN UNIVERSAL EMERGENTE ===
    const mostrarNotificacionGlobal = (data, tipo) => {
        const rol = getRol();
        if (!["mesero", "encargado", "dueño", "administrador", "cocinero"].includes(rol)) return;

        try { sonidoNotificacion.play().catch(()=>{}); } catch(e){}

        if (!document.getElementById('notifContenedor')) {
            const cont = document.createElement('div');
            cont.id = 'notifContenedor';
            document.body.appendChild(cont);
        }

        const div = document.createElement('div');
        div.style = `background: #fff; color: #333; border-left: 6px solid #10ad93; box-shadow: 0 4px 15px rgba(0,0,0,0.3); padding: 15px 20px; border-radius: 10px; font-family: system-ui, sans-serif; animation: aparecerNoti 0.3s ease-out; min-width: 250px; cursor: pointer; position: relative;`;
        
        if (tipo === 'orden') {
            div.innerHTML = `<strong>🔔 Nueva Orden Recibida</strong><br><small>${data.mesa ? "Mesa: " + data.mesa : "Para llevar"}</small>`;
            div.onclick = () => window.location.href = 'ordenes.html';
        } else if (tipo === 'reserva') {
            div.innerHTML = `<strong>📅 Nueva Reservación</strong><br><small>${data.nombre_cliente} - ${data.mesa}</small>`;
            div.onclick = () => window.location.href = 'reservaciones.html';
        }

        document.getElementById('notifContenedor').appendChild(div);
        setTimeout(() => { if(div.parentNode) div.remove(); }, 8000);
    };

    // === CANAL GLOBAL REALTIME (SIN BUGS DE UUID) ===
    const activarSuscripcionGlobal = () => {
        const restoId = getRestoId();
        if (!restoId || typeof db === 'undefined') return;

        console.log("🛰️ Iniciando Canal Global de Notificaciones...");

        db.channel('canal-notificaciones-sistema')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, async (payload) => {
              const data = payload.new || payload.old;
              if (data && data.restaurante_id === restoId) {
                  if (payload.eventType === 'INSERT') mostrarNotificacionGlobal(data, 'orden');
                  await cargarDatosIniciales(); // Descarga los datos frescos y actualiza los badges
              }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'reservaciones' }, async (payload) => {
              const data = payload.new || payload.old;
              if (data && data.restaurante_id === restoId) {
                  if (payload.eventType === 'INSERT' && data.estado === 'pendiente') mostrarNotificacionGlobal(data, 'reserva');
                  await cargarDatosIniciales(); // Descarga los datos frescos y actualiza los badges
              }
          })
          .subscribe();
    };

    // === ANIMACIÓN CSS PARA NOTIFICACIONES ===
    const style = document.createElement('style');
    style.textContent = `@keyframes aparecerNoti { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } } dialog#modalTicketApp::backdrop { background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }`;
    document.head.appendChild(style);

    // === FUNCIONES DE BLOQUEO SaaS ===
    const verificarBloqueo = (datosResto, masterConfig) => {
        if (!datosResto) return;
        const hoy = new Date();
        const vencimiento = datosResto.fecha_vencimiento ? new Date(datosResto.fecha_vencimiento) : new Date(0);
        const estado = (datosResto.estado_pago || '').toLowerCase();
        
        if (estado === 'pendiente' || estado === 'vencido' || hoy > vencimiento) {
            console.warn("⚠️ BLOQUEO ACTIVADO: Suscripción no válida.");
            renderizarPantallaBloqueo(masterConfig);
        }
    };

    const renderizarPantallaBloqueo = (mConfig) => {
        if (document.getElementById('modalBloqueoSaaS')) return;
        const overlay = document.createElement('div');
        overlay.id = 'modalBloqueoSaaS';
        overlay.style = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); backdrop-filter:blur(8px); z-index:100000; display:flex; justify-content:center; align-items:center; color:white; padding:20px;`;
        overlay.innerHTML = `
            <div style="background:#111; padding:40px; border-radius:20px; border:1px solid #333; max-width:500px; text-align:center; box-shadow:0 0 50px rgba(0,0,0,0.8);">
                <div style="font-size:50px; margin-bottom:20px;">🔒</div>
                <h2 style="color:white; font-weight:600;">Acceso Restringido</h2>
                <p style="color:#888;">Tu suscripción mensual ha expirado o se encuentra pendiente de pago.</p>
                <div style="background:rgba(255,255,255,0.05); padding:20px; border-radius:12px; margin:25px 0; border:1px solid #444; text-align:left;">
                    <span style="color:#10ad93; font-size:0.7rem; font-weight:bold; text-transform:uppercase;">Instrucciones de Pago:</span>
                    <pre style="background:transparent; border:none; color:#eee; font-family:inherit; margin-top:10px; white-space:pre-wrap; font-size:0.9rem;">${mConfig?.datos_pago || 'Cargando datos...'}</pre>
                </div>
                <p style="font-size:0.8rem; color:#666; margin-bottom:25px;">${mConfig?.mensaje_exito || 'Una vez realizado el pago, el sistema se reactivará automáticamente.'}</p>
                <a href="https://wa.me/TUNUMERO" target="_blank" style="background:#25d366; color:white; padding:12px 25px; border-radius:10px; text-decoration:none; font-weight:bold; display:inline-block;">
                    Enviar Comprobante por WhatsApp
                </a>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.style.overflow = "hidden";
    };

    return {
        init: async () => { 
            await cargarDatosIniciales();
            activarSuscripcionGlobal(); 
        },
        getRestoId, getRol,
        getOrdenes: () => ordenes,
        getSuministros: () => suministros,
        getConfig: () => config,
        updateEstado: async (id, nuevoEstado) => {
            const { error } = await db.from('ordenes').update({ estado: nuevoEstado }).eq('id', id);
            if (error) console.error("Error al actualizar estado:", error);
        },
        eliminarOrden: async (id) => {
            if (!confirm("¿Cancelar esta orden permanentemente?")) return;
            const { error } = await db.from('ordenes').update({estado: 'cancelado'}).eq('id', id);
            if (error) console.error("Error al eliminar:", error);
            else cargarDatosIniciales();
        },
        registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
        notifyUpdate: () => { Object.values(renderCallbacks).forEach(cb => { if(typeof cb === 'function') cb(); }); }
    };
})();

// === MENÚ DE NAVEGACIÓN CON BADGES ===
function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return; 
    
    const navContenedor = document.getElementById('menuNavegacion');
    if (!navContenedor) return;
    
    const rutaActual = window.location.pathname.split("/").pop() || "index.html";
    const rol = sesion.rol;
    let menuItems = [];

    // 1. DEFINICIÓN DE MENÚS CON IDENTIFICADOR (key)
    if (rol === "mesero") {
        menuItems = [
            { h: "mesas.html", i: "🪑", t: "Mesas", key: "mesas" },
            { h: "menu.html", i: "📜", t: "Menú", key: "menu" }
        ];
    } else if (rol === "cocinero") {
        menuItems = [
            { h: "ordenes.html", i: "📋", t: "Órdenes", key: "ordenes" },
            { h: "cocina.html", i: "👨‍🍳", t: "Cocina", key: "cocina" }
        ];
    } else {
        menuItems = [
            { h: "mesas.html", i: "🪑", t: "Mesas", key: "mesas" },
            { h: "menu.html", i: "📜", t: "Menú", key: "menu" },
            { h: "ordenes.html", i: "📋", t: "Órdenes", key: "ordenes" },
            { h: "cocina.html", i: "👨‍🍳", t: "Cocina", key: "cocina" },
            { h: "stock.html", i: "📦", t: "Stock", key: "stock" },
            { h: "reservaciones.html", i: "📅", t: "Reservas", key: "reservas" },
            { h: "pedidos_recoger.html", i: "🚶", t: "Recoger", key: "recoger" }
        ];
        if (["dueño", "administrador"].includes(rol)) {
            menuItems.push({ h: "ventas.html", i: "📊", t: "Ventas", key: "ventas" });
            menuItems.push({ h: "empleados.html", i: "👥", t: "Personal", key: "personal" });
        }
    }

    // 2. SEGURIDAD DE NAVEGACIÓN
    const paginasPublicas = ["index.html", "login.html", ""];
    const accesoPermitido = menuItems.some(item => item.h === rutaActual) || paginasPublicas.includes(rutaActual);
    if (!accesoPermitido && rutaActual !== 'index.html') {
        window.location.href = menuItems[0].h;
        return;
    }

    // 3. RENDERIZADO VISUAL DEL MENÚ CON BADGE INCLUIDO
    navContenedor.innerHTML = menuItems.map(item => `
        <li>
            <a href="${item.h}" class="${rutaActual === item.h ? 'activo' : ''}"
               style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; text-decoration: none; position: relative; ${rutaActual === item.h ? 'background:#10ad93;color:white;' : 'color:#555;'}">
                <span>${item.i}</span>
                <span class="nav-text" style="font-weight:600;">${item.t}</span>
                <span id="badge-${item.key}" class="badge-rojo" style="display:none;">0</span>
            </a>
        </li>
    `).join('') + `
        <li>
            <button onclick="cerrarSesionApp()" class="outline contrast" style="padding: 5px 15px; border-radius: 8px; width:100%;">Salir</button>
        </li>`;
}

async function cerrarSesionApp() {
    if (confirm("¿Cerrar sesión?")) {
        if(window.cerrarSesion) {
             await window.cerrarSesion();
        } else {
             localStorage.removeItem('sesion_activa');
             window.location.href = 'login.html';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarMenuSeguro();
    App.init(); // Arranca el motor
});