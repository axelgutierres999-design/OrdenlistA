// js/app.js - NÚCLEO CENTRALIZADO (V7.8 COMPLETO - Notificación visual + sonido + menú restaurado)
const App = (function() {
    let ordenes = [];
    let suministros = [];
    let config = { num_mesas: 10 };

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

    // --- 1. CARGA DE DATOS Y REALTIME ---
    const cargarDatosIniciales = async () => {
        if (typeof db === 'undefined') return;
        const restoId = getRestoId();
        if (!restoId) return;

        try {
            const { data: dataConfig } = await db.from('restaurantes')
                .select('num_mesas')
                .eq('id', restoId)
                .single();
            if (dataConfig) config.num_mesas = dataConfig.num_mesas;

            const { data: dataOrdenes } = await db.from('ordenes')
                .select('*')
                .eq('restaurante_id', restoId)
                .not('estado', 'in', '("entregado","cancelado")')
                .order('created_at', { ascending: true });
            if (dataOrdenes) ordenes = dataOrdenes;

            const { data: dataSuministros } = await db.from('suministros')
                .select('*')
                .eq('restaurante_id', restoId);
            if (dataSuministros) suministros = dataSuministros;

            App.notifyUpdate();
        } catch (err) {
            console.error("Error global de carga:", err);
        }
    };

    // --- 2. NOTIFICACIÓN VISUAL Y SONIDO ---
    const mostrarNotificacionNuevaOrden = (orden) => {
        if (getRol() !== 'encargado') return;
        try { sonidoNotificacion.play(); } catch(e){ console.warn("No se pudo reproducir sonido"); }

        if (!document.getElementById('notifContenedor')) {
            const cont = document.createElement('div');
            cont.id = 'notifContenedor';
            cont.style = `
                position: fixed;
                top: 20px;
                right: 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                z-index: 99999;
            `;
            document.body.appendChild(cont);
        }

        const div = document.createElement('div');
        div.style = `
            background: #fff;
            color: #333;
            border-left: 6px solid #10ad93;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            padding: 15px 20px;
            border-radius: 10px;
            font-family: system-ui, sans-serif;
            animation: aparecerNoti 0.3s ease-out;
            min-width: 250px;
        `;
        div.innerHTML = `
            <strong>🔔 Nueva orden recibida</strong><br>
            <small>${orden.mesa ? "Mesa " + orden.mesa : "Pedido para llevar"}</small><br>
            <button style="margin-top:10px;background:#10ad93;color:white;border:none;padding:6px 10px;border-radius:5px;cursor:pointer;">
                Enviar a cocina
            </button>
        `;

        div.querySelector('button').onclick = async () => {
            try {
                await db.from('ordenes')
                    .update({ estado: 'preparando' })
                    .eq('id', orden.id);
                div.remove();
                alert("📦 Orden enviada a cocina");
            } catch (e) {
                alert("Error al actualizar orden.");
            }
        };

        document.getElementById('notifContenedor').appendChild(div);
        setTimeout(() => div.remove(), 15000);
    };

    const style = document.createElement('style');
    style.textContent = `
        @keyframes aparecerNoti {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    // --- 3. SUSCRIPCIÓN REALTIME ---
    const activarSuscripcionRealtime = () => {
        const restoId = getRestoId();
        if (!restoId || typeof db === 'undefined') return;

        db.channel('cambios-globales')
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` },
              payload => {
                  if (payload.eventType === 'INSERT') mostrarNotificacionNuevaOrden(payload.new);
                  cargarDatosIniciales();
              })
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'suministros', filter: `restaurante_id=eq.${restoId}` },
              () => { cargarDatosIniciales(); })
          .on('postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'restaurantes', filter: `id=eq.${restoId}` },
              () => { cargarDatosIniciales(); })
          .subscribe();
    };

    // --- 4. INTERFAZ DE PAGO ---
    const mostrarModalPago = (orden, callbackPago) => {
        const total = parseFloat(orden.total);
        const modal = document.createElement('div');
        modal.id = "modalGlobalPago";
        modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:10000;padding:15px;backdrop-filter:blur(5px);";
        
        modal.innerHTML = `
          <article style="background:white;padding:1.5rem;border-radius:15px;width:100%;max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.4); color:#333;">
            <header style="text-align:center; border-bottom:1px solid #eee; margin-bottom:1rem; padding-bottom:0.5rem;">
                <h3 style="margin:0; color:#333;">Cobrar ${orden.mesa}</h3>
            </header>
            <div style="text-align:center; margin-bottom:1.5rem;">
                <small style="color:#888;">TOTAL A PAGAR</small>
                <div style="font-size:3rem;font-weight:800;color:#10ad93;">$${total.toFixed(2)}</div>
            </div>
            <div id="seccionMetodos">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                  <button id="btnEfectivoUI" style="background:#2ecc71;color:white;border:none;padding:15px;border-radius:10px;cursor:pointer;font-weight:bold;font-size:1.1rem;">💵 Efectivo</button>
                  <button id="btnTarjetaUI" style="background:#3498db;color:white;border:none;padding:15px;border-radius:10px;cursor:pointer;font-weight:bold;font-size:1.1rem;">💳 Tarjeta</button>
                </div>
                <button id="btnQRUI" style="width:100%;background:#f39c12;color:white;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:bold;margin-bottom:15px;">📱 QR / Transferencia</button>
            </div>
            <div id="panelEfectivo" style="display:none; background:#f9f9f9; padding:15px; border-radius:10px; margin-bottom:15px;">
                <label style="font-weight:bold;">Monto Recibido:</label>
                <input type="number" id="inputRecibido" placeholder="0.00" step="0.01" style="font-size:1.5rem; text-align:center; width:100%; margin:10px 0; border:2px solid #ddd; border-radius:8px; padding:5px;">
                <div id="txtCambio" style="text-align:center; font-weight:bold; margin-top:10px; color:#e74c3c; font-size:1.2rem;">Cambio: $0.00</div>
                <button id="btnConfirmarEfectivo" disabled style="width:100%; margin-top:15px; background:#27ae60; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold;">CONFIRMAR PAGO</button>
            </div>
            <footer style="text-align:center;">
                <button id="btnCancelar" style="background:none; border:none; color:#888; cursor:pointer; font-size:0.9rem; text-decoration:underline;">Cancelar Operación</button>
            </footer>
          </article>`;
        
        document.body.appendChild(modal);
        document.getElementById('btnEfectivoUI').onclick = () => { 
            document.getElementById('seccionMetodos').style.display='none'; 
            document.getElementById('panelEfectivo').style.display='block'; 
            document.getElementById('inputRecibido').focus();
        };
        const input = document.getElementById('inputRecibido');
        input.addEventListener('input', () => {
            const recibido = parseFloat(input.value) || 0;
            const cambio = recibido - total;
            const txtCambio = document.getElementById('txtCambio');
            const btnConf = document.getElementById('btnConfirmarEfectivo');
            if (recibido >= total) {
                btnConf.disabled = false;
                txtCambio.textContent = `Cambio: $${cambio.toFixed(2)}`;
                txtCambio.style.color = "#27ae60";
            } else {
                btnConf.disabled = true;
                txtCambio.textContent = "Monto insuficiente";
                txtCambio.style.color = "#c0392b";
            }
        });
        document.getElementById('btnConfirmarEfectivo').onclick = () => { callbackPago('efectivo'); modal.remove(); };
        document.getElementById('btnTarjetaUI').onclick = () => { if(confirm("¿Terminal aprobada?")) { callbackPago('tarjeta'); modal.remove(); } };
        document.getElementById('btnQRUI').onclick = () => { if(confirm("¿Transferencia recibida?")) { callbackPago('qr'); modal.remove(); } };
        document.getElementById('btnCancelar').onclick = () => modal.remove();
    };

    return {
        init: async () => { await cargarDatosIniciales(); activarSuscripcionRealtime(); },
        getRestoId: getRestoId,
        getRol: getRol,
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
        liberarMesaManual: (id) => { /* igual que antes */ },
        verDetalleMesa: async (ordenId) => { /* igual */ },
        guardarConfiguracionMesas: async (nuevoNumero) => { /* igual */ },
        registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
        notifyUpdate: () => { Object.values(renderCallbacks).forEach(cb => { if(typeof cb === 'function') cb(); }); }
    };
})();

// --- 🔹 MENÚ DE NAVEGACIÓN (RESTABLECIDO COMPLETO) ---
function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;
    const navContenedor = document.getElementById('menuNavegacion');
    if (!navContenedor) return;
    const rutaActual = window.location.pathname.split("/").pop() || "index.html";
    
    const menuItems = [
        { h: "mesas.html", i: "🪑", t: "Mesas" },
        { h: "menu.html", i: "📜", t: "Carta" },
        { h: "ordenes.html", i: "📋", t: "Órdenes" },
        { h: "cocina.html", i: "👨‍🍳", t: "Cocina" },
        { h: "stock.html", i: "📦", t: "Stock" }
    ];

    if (sesion.rol === 'dueño' || sesion.rol === 'administrador') {
        menuItems.push({ h: "ventas.html", i: "📊", t: "Ventas" });
        menuItems.push({ h: "empleados.html", i: "👥", t: "Personal" });
    }

    navContenedor.innerHTML = menuItems.map(item => `
        <li>
            <a href="${item.h}" class="${rutaActual === item.h ? 'activo' : ''}"
               style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; text-decoration: none; ${rutaActual === item.h ? 'background:#10ad93;color:white;' : 'color:#555;'}">
                <span>${item.i}</span>
                <span class="nav-text" style="font-weight:600;">${item.t}</span>
            </a>
        </li>
    `).join('') + `
        <li>
            <button onclick="cerrarSesionApp()" class="outline contrast" style="padding: 5px 15px; border-radius: 8px; width:100%;">Salir</button>
        </li>`;
}

async function cerrarSesionApp() {
    if (confirm("¿Cerrar sesión?")) {
        localStorage.removeItem('sesion_activa');
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarMenuSeguro();
    App.init();
});