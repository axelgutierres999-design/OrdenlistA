// js/app.js - NÚCLEO CENTRALIZADO (V8.4 - Filtros por Rol y Seguridad)
const App = (function() {
    let ordenes = [];
    let suministros = [];
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

    // === CARGA INICIAL ===
    const cargarDatosIniciales = async () => {
        if (typeof db === 'undefined') return;
        const restoId = getRestoId();
        if (!restoId) return;

        try {
            const { data: dataConfig } = await db.from('restaurantes')
                .select('num_mesas, corte_actual')
                .eq('id', restoId)
                .single();
            if (dataConfig) config = { ...config, ...dataConfig };

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

    // === NOTIFICACIÓN UNIVERSAL ===
    const mostrarNotificacionNuevaOrden = (orden) => {
        const rol = getRol();
        // Solo notificamos a roles operativos relevantes
        if (!["mesero", "encargado", "dueño", "administrador", "cocinero"].includes(rol)) return;

        try { sonidoNotificacion.play(); } catch(e){ console.warn("No se pudo reproducir sonido"); }

        if (!document.getElementById('notifContenedor')) {
            const cont = document.createElement('div');
            cont.id = 'notifContenedor';
            cont.style = `position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 99999;`;
            document.body.appendChild(cont);
        }

        const div = document.createElement('div');
        div.style = `background: #fff; color: #333; border-left: 6px solid #10ad93; box-shadow: 0 4px 15px rgba(0,0,0,0.3); padding: 15px 20px; border-radius: 10px; font-family: system-ui, sans-serif; animation: aparecerNoti 0.3s ease-out; min-width: 250px;`;
        div.innerHTML = `
            <strong>🔔 Nueva orden recibida</strong><br>
            <small>${orden.mesa ? "Mesa " + orden.mesa : "Pedido para llevar"}</small><br>
            ${(rol === "mesero" || rol === "encargado") ? `<button style="margin-top:10px;background:#10ad93;color:white;border:none;padding:6px 10px;border-radius:5px;cursor:pointer;">Enviar a cocina</button>` : ""}
        `;

        const boton = div.querySelector('button');
        if (boton) {
            boton.onclick = async () => {
                try {
                    await db.from('ordenes').update({ estado: 'preparando' }).eq('id', orden.id);
                    div.remove();
                    alert("📦 Orden enviada a cocina");
                } catch (e) { alert("Error al actualizar orden."); }
            };
        }

        document.getElementById('notifContenedor').appendChild(div);
        setTimeout(() => div.remove(), 15000);
    };

    // === ANIMACIÓN CSS ===
    const style = document.createElement('style');
    style.textContent = `@keyframes aparecerNoti { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } dialog#modalTicketApp::backdrop { background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }`;
    document.head.appendChild(style);

    // === SUSCRIPCIÓN REALTIME ===
    const activarSuscripcionRealtime = () => {
        const restoId = getRestoId();
        if (!restoId || typeof db === 'undefined') return;

        db.channel('cambios-globales')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` }, payload => {
                if (payload.eventType === 'INSERT') mostrarNotificacionNuevaOrden(payload.new);
                cargarDatosIniciales();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'suministros', filter: `restaurante_id=eq.${restoId}` }, () => cargarDatosIniciales())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurantes', filter: `id=eq.${restoId}` }, () => cargarDatosIniciales())
            .subscribe();
    };

    // === MODAL DE PAGO ===
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

        document.getElementById('btnConfirmarEfectivo').onclick = () => { generarTicket(orden, 'Efectivo'); callbackPago('efectivo'); modal.remove(); };
        document.getElementById('btnTarjetaUI').onclick = () => { if(confirm("¿Terminal aprobada?")) { generarTicket(orden, 'Tarjeta'); callbackPago('tarjeta'); modal.remove(); } };
        document.getElementById('btnQRUI').onclick = () => { if(confirm("¿Transferencia recibida?")) { generarTicket(orden, 'QR / Transferencia'); callbackPago('qr'); modal.remove(); } };
        document.getElementById('btnCancelar').onclick = () => modal.remove();
    };

    // === NUEVO SISTEMA DE TICKET EN MODAL ===
    const generarTicket = (orden, metodo) => {
        let modal = document.getElementById("modalTicketApp");
        if (!modal) {
            modal = document.createElement("dialog");
            modal.id = "modalTicketApp";
            modal.innerHTML = `
              <article style="text-align:center; max-width:400px;">
                <h3>🧾 Ticket de Venta</h3>
                <div id="ticketContenido" style="text-align:left; font-family:monospace; margin:1rem 0; background:#f9f9f9; padding:10px; border-radius:8px;"></div>
                <footer style="display:flex; gap:10px; justify-content:center;">
                  <button id="btnImprimirTicket">🖨️ Imprimir</button>
                  <button onclick="document.getElementById('modalTicketApp').close()">Cerrar</button>
                </footer>
              </article>`;
            document.body.appendChild(modal);

            document.getElementById("btnImprimirTicket").onclick = () => {
                const contenido = document.getElementById("ticketContenido").innerHTML;
                const ventana = window.open('', '_blank');
                ventana.document.write(`<html><body>${contenido}</body></html>`);
                ventana.print();
                ventana.close();
            };
        }

        document.getElementById("ticketContenido").innerHTML = `
            <p><strong>Mesa:</strong> ${orden.mesa || "Para llevar"}</p>
            <p><strong>Total:</strong> $${orden.total}</p>
            <p><strong>Método:</strong> ${metodo}</p>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
            <hr>
            <p>¡Gracias por su compra!</p>
        `;
        modal.showModal();
    };

    return {
        init: async () => { await cargarDatosIniciales(); activarSuscripcionRealtime(); },
        getRestoId, getRol,
        getOrdenes: () => ordenes,
        getSuministros: () => suministros,
        getConfig: () => config,
        guardarConfiguracionMesas: async (nuevoNumero) => {
            const restoId = getRestoId();
            if (!restoId) return alert("Restaurante no identificado.");
            if (isNaN(nuevoNumero) || nuevoNumero < 1 || nuevoNumero > 100) return alert("⚠️ Ingresa un número entre 1 y 100 mesas.");
            try {
                const { error } = await db.from('restaurantes').update({ num_mesas: nuevoNumero }).eq('id', restoId);
                if (error) throw error;
                config.num_mesas = nuevoNumero;
                alert("✅ Número de mesas actualizado correctamente.");
                App.notifyUpdate();
            } catch (err) { alert("❌ Error al actualizar número de mesas."); }
        },
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

// === MENÚ DE NAVEGACIÓN Y SEGURIDAD ===
function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return; // Si no hay sesión, el usuario debería estar en login.html
    
    const navContenedor = document.getElementById('menuNavegacion');
    if (!navContenedor) return;
    
    // Normalizar ruta actual para comparaciones
    const rutaActual = window.location.pathname.split("/").pop() || "index.html";
    const rol = sesion.rol;
    let menuItems = [];

    // 1. DEFINICIÓN DE PERMISOS POR ROL
    if (rol === "mesero") {
        menuItems = [
            { h: "mesas.html", i: "🪑", t: "Mesas" },
            { h: "menu.html", i: "📜", t: "Menú" }
        ];
    } 
    else if (rol === "cocinero") {
        menuItems = [
            { h: "ordenes.html", i: "📋", t: "Órdenes" },
            { h: "cocina.html", i: "👨‍🍳", t: "Cocina" }
        ];
    }
    else {
        // Lógica base para Encargado, Dueño, Admin (Ver todo lo operativo)
        menuItems = [
            { h: "mesas.html", i: "🪑", t: "Mesas" },
            { h: "menu.html", i: "📜", t: "Menú" },
            { h: "ordenes.html", i: "📋", t: "Órdenes" },
            { h: "cocina.html", i: "👨‍🍳", t: "Cocina" },
            { h: "stock.html", i: "📦", t: "Stock" }
        ];

        // Agregados exclusivos para Dueño/Admin
        if (["dueño", "administrador"].includes(rol)) {
            menuItems.push({ h: "ventas.html", i: "📊", t: "Ventas" });
            menuItems.push({ h: "empleados.html", i: "👥", t: "Personal" });
        }
    }

    // 2. SEGURIDAD DE NAVEGACIÓN (Redirección si intentan entrar donde no deben)
    // Lista de páginas públicas que no requieren filtro de rol
    const paginasPublicas = ["index.html", "login.html", ""]; 
    
    // Verificamos si la página actual está en su menú permitido
    const accesoPermitido = menuItems.some(item => item.h === rutaActual) || paginasPublicas.includes(rutaActual);

    // Si estás en una página que no te corresponde, te sacamos
    if (!accesoPermitido && rutaActual !== 'index.html') {
        // Redirigir a su primera opción disponible
        window.location.href = menuItems[0].h;
        return;
    }

    // 3. RENDERIZADO VISUAL DEL MENÚ
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
        // Usamos la función global de logout.js si existe, sino lo hacemos manual
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
    App.init();
});