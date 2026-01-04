// js/app.js - NÚCLEO CENTRALIZADO (V6.1 - INTEGRACIÓN TOTAL)
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
            const { data: dataOrdenes, error: errO } = await db.from('ordenes')
                .select('*')
                .eq('restaurante_id', restoId)
                .not('estado', 'in', '("pagado","cancelado")'); 
            
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

    // --- 2. INTERFAZ DE PAGO ---
    const mostrarModalPago = (orden, callbackPago) => {
        const total = parseFloat(orden.total);
        const modal = document.createElement('div');
        modal.id = "modalGlobalPago";
        modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:10000;padding:15px;backdrop-filter:blur(5px);";
        
        modal.innerHTML = `
          <article style="background:white;padding:1.5rem;border-radius:15px;width:100%;max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.4); color:#333;">
            <header style="text-align:center; border-bottom:1px solid #eee; margin-bottom:1rem; padding-bottom:0.5rem;">
                <h3 style="margin:0; color:#333;">Finalizar ${orden.mesa}</h3>
            </header>
            <div style="text-align:center; margin-bottom:1.5rem;">
                <small style="color:#888;">TOTAL A COBRAR</small>
                <div style="font-size:2.8rem;font-weight:bold;color:#10ad93;">$${total.toFixed(2)}</div>
            </div>
            <div id="seccionMetodos">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                  <button id="btnEfectivoUI" style="background:#2ecc71;color:white;border:none;padding:15px;border-radius:10px;cursor:pointer;font-weight:bold;">💵 EFECTIVO</button>
                  <button id="btnTarjetaUI" style="background:#3498db;color:white;border:none;padding:15px;border-radius:10px;cursor:pointer;font-weight:bold;">💳 TARJETA</button>
                </div>
                <button id="btnQRUI" style="width:100%;background:#f39c12;color:white;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:bold;margin-bottom:15px;">📱 TRANSFERENCIA / QR</button>
            </div>
            <div id="panelEfectivo" style="display:none; background:#f9f9f9; padding:15px; border-radius:10px; margin-bottom:15px;">
                <label>Monto Recibido:</label>
                <input type="number" id="inputRecibido" placeholder="0.00" step="0.01" style="font-size:1.5rem; text-align:center; width:100%; margin:10px 0;">
                <div id="txtCambio" style="text-align:center; font-weight:bold; margin-top:10px; color:#e74c3c;">Cambio: $0.00</div>
                <button id="btnConfirmarEfectivo" disabled style="width:100%; margin-top:15px; background:#27ae60; color:white; border:none; padding:10px; border-radius:5px;">REGISTRAR PAGO</button>
            </div>
            <footer style="text-align:center;">
                <button id="btnCancelar" style="background:none; border:none; color:#888; cursor:pointer; font-size:0.9rem;">Volver</button>
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
        document.getElementById('btnTarjetaUI').onclick = () => { if(confirm("¿Confirmar pago con tarjeta?")) { callbackPago('tarjeta'); modal.remove(); } };
        document.getElementById('btnQRUI').onclick = () => { if(confirm("¿Confirmar pago con QR/Transferencia?")) { callbackPago('qr'); modal.remove(); } };
        document.getElementById('btnCancelar').onclick = () => modal.remove();
    };

    // --- 3. FUNCIONES PÚBLICAS ---
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
            const { error } = await db.from('ordenes').delete().eq('id', id);
            if (error) console.error("Error al eliminar:", error);
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
                    await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
                    alert("✅ Pago procesado y mesa liberada.");
                } catch (err) { 
                    console.error(err);
                    alert("❌ Error al procesar el cobro."); 
                }
            });
        },

        verDetalleMesa: async (ordenId) => {
            try {
                const { data, error } = await db.from('detalles_orden')
                    .select('*, productos(nombre)')
                    .eq('orden_id', ordenId);
                if (error) throw error;
                const lista = data.map(d => `${d.cantidad}x ${d.productos?.nombre || 'Producto'}`).join('\n');
                alert("Detalles de la Orden:\n" + lista);
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
            <button onclick="cerrarSesionApp()" class="outline contrast" style="padding: 5px 15px; border-radius: 8px;">Salir</button>
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