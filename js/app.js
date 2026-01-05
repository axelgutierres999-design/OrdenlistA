// js/app.js - NÚCLEO CENTRALIZADO (V6.9 - FINAL FIX)
const App = (function() {
    let ordenes = [];
    let suministros = [];
    
    const getRestoId = () => {
        const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
        return sesion ? sesion.restaurante_id : null;
    };

    const renderCallbacks = {};

    // --- 1. CARGA DE DATOS Y REALTIME ---
    const cargarDatosIniciales = async () => {
        if (typeof db === 'undefined') return;
        const restoId = getRestoId();
        if (!restoId) return;

        try {
            // CORRECCIÓN CRÍTICA:
            // Ahora traemos órdenes 'pagado' también, para que Cocina las vea si son Para Llevar.
            // Solo excluimos lo que ya se entregó al cliente ('entregado') o se canceló.
            const { data: dataOrdenes, error: errO } = await db.from('ordenes')
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

    const activarSuscripcionRealtime = () => {
        const restoId = getRestoId();
        if (!restoId || typeof db === 'undefined') return;

        db.channel('cambios-globales')
          .on('postgres_changes', 
              { event: '*', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` }, 
              () => { cargarDatosIniciales(); })
          .on('postgres_changes', 
              { event: '*', schema: 'public', table: 'suministros', filter: `restaurante_id=eq.${restoId}` }, 
              () => { cargarDatosIniciales(); })
          .subscribe();
    };

    // --- 2. INTERFAZ DE PAGO (MODAL) ---
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

        // Lógica de Efectivo
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

        // Callbacks
        document.getElementById('btnConfirmarEfectivo').onclick = () => { callbackPago('efectivo'); modal.remove(); };
        document.getElementById('btnTarjetaUI').onclick = () => { if(confirm("¿Terminal aprobada?")) { callbackPago('tarjeta'); modal.remove(); } };
        document.getElementById('btnQRUI').onclick = () => { if(confirm("¿Transferencia recibida?")) { callbackPago('qr'); modal.remove(); } };
        document.getElementById('btnCancelar').onclick = () => modal.remove();
    };

    // --- 3. VISTA DE TICKET (MODAL) ---
    const mostrarModalTicket = (orden, detalles) => {
        const modal = document.createElement('div');
        modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:10000;backdrop-filter:blur(3px);";
        
        const fecha = new Date(orden.created_at).toLocaleString();
        const itemsHtml = detalles.map(d => `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9rem;">
                <span>${d.cantidad} x ${d.productos?.nombre || 'Item'}</span>
                <span>$${(d.cantidad * d.precio_unitario).toFixed(2)}</span>
            </div>
        `).join('');

        modal.innerHTML = `
            <div style="background:white; width:300px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,0.3); font-family:'Courier New', monospace; color:black; border-top: 5px solid #333;">
                <div style="text-align:center; margin-bottom:15px; border-bottom:1px dashed #000; padding-bottom:10px;">
                    <h2 style="margin:0; font-size:1.5rem;">TICKET</h2>
                    <p style="margin:5px 0; font-size:0.8rem;">${fecha}</p>
                    <h3 style="margin:5px 0;">${orden.mesa}</h3>
                </div>
                <div style="margin-bottom:15px; border-bottom:1px dashed #000; padding-bottom:10px;">
                    ${itemsHtml}
                </div>
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem; margin-bottom:20px;">
                    <span>TOTAL:</span>
                    <span>$${parseFloat(orden.total).toFixed(2)}</span>
                </div>
                <button id="btnCerrarTicket" style="width:100%; padding:10px; background:#333; color:white; border:none; cursor:pointer;">CERRAR</button>
                <button onclick="window.print()" style="width:100%; padding:10px; margin-top:5px; background:white; color:#333; border:1px solid #333; cursor:pointer;">🖨️ IMPRIMIR</button>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('btnCerrarTicket').onclick = () => modal.remove();
    };

    // --- 4. FUNCIONES PÚBLICAS ---
    return {
        init: async () => { 
            await cargarDatosIniciales(); 
            activarSuscripcionRealtime();
        },
        getOrdenes: () => ordenes,
        getSuministros: () => suministros,

        updateEstado: async (id, nuevoEstado) => {
            const { error } = await db.from('ordenes').update({ estado: nuevoEstado }).eq('id', id);
            if (error) console.error("Error al actualizar estado:", error);
        },

        eliminarOrden: async (id) => {
            if (!confirm("¿Cancelar esta orden permanentemente?")) return;
            // Marcamos como cancelado en lugar de delete físico, para historial
            const { error } = await db.from('ordenes').update({estado: 'cancelado'}).eq('id', id);
            // Si prefieres borrar: await db.from('ordenes').delete().eq('id', id);
            if (error) console.error("Error al eliminar:", error);
            else cargarDatosIniciales(); // Forzar recarga visual
        },

        liberarMesaManual: (id) => {
            const orden = ordenes.find(o => o.id === id);
            if (!orden) return;
            
            mostrarModalPago(orden, async (metodo) => {
                try {
                    const venta = { 
                        restaurante_id: getRestoId(), 
                        mesa: orden.mesa, 
                        productos: orden.productos, 
                        total: orden.total, 
                        metodo_pago: metodo 
                    };
                    const { error: errorVenta } = await db.from('ventas').insert([venta]);
                    if (errorVenta) throw errorVenta;
                    
                    // Si es Mesa física -> 'pagado' (se libera la mesa)
                    // Si es Para Llevar -> 'pagado' (pero Cocina aún debe verla si no se entregó)
                    await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
                    
                    alert("✅ Pago procesado exitosamente.");
                } catch (err) { 
                    console.error(err);
                    alert("❌ Error al procesar el cobro."); 
                }
            });
        },

        verDetalleMesa: async (ordenId) => {
            const orden = ordenes.find(o => o.id === ordenId);
            if(!orden) return;
            try {
                const { data, error } = await db.from('detalles_orden')
                    .select('*, productos(nombre)')
                    .eq('orden_id', ordenId);
                if (error) throw error;
                
                mostrarModalTicket(orden, data);
            } catch (e) { alert("No se pudo cargar el detalle."); }
        },

        registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
        notifyUpdate: () => { 
            Object.values(renderCallbacks).forEach(cb => { 
                if(typeof cb === 'function') cb(); 
            }); 
        }
    };
})();

// --- MENÚ DE NAVEGACIÓN ---
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