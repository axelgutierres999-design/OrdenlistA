// js/app.js - NÚCLEO CENTRALIZADO (V6 - REALTIME & KDS READY)
const App = (function() {
  let ordenes = [];
  let suministros = [];
  
  // Helper para obtener el ID del restaurante de forma segura
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
        // Traer órdenes activas (Excluimos pagadas y canceladas)
        const { data: dataOrdenes, error: errO } = await db.from('ordenes')
            .select('*')
            .eq('restaurante_id', restoId)
            .not('estado', 'in', '("pagado","cancelado")'); 
        
        if (dataOrdenes) ordenes = dataOrdenes;

        // Traer suministros para validación visual
        const { data: dataSuministros } = await db.from('suministros')
            .select('*')
            .eq('restaurante_id', restoId);
        
        if (dataSuministros) suministros = dataSuministros;

        // Notificar a todas las pantallas (Mesas, Cocina, Stock) que hay datos nuevos
        App.notifyUpdate();
    } catch (err) {
        console.error("Error global de carga:", err);
    }
  };

  // Escucha cambios en Supabase para sincronización instantánea entre dispositivos
  const activarSuscripcionRealtime = () => {
    const restoId = getRestoId();
    if (!restoId || typeof db === 'undefined') return;

    db.channel('cambios-globales')
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` }, 
          () => {
              console.log('🔄 Sincronizando por cambio en Órdenes...');
              cargarDatosIniciales(); 
          })
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'suministros', filter: `restaurante_id=eq.${restoId}` }, 
          () => {
              console.log('📦 Sincronizando por cambio en Stock...');
              cargarDatosIniciales(); 
          })
      .subscribe();
  };

  // --- 2. INTERFAZ DE PAGO (MODAL GLOBAL) ---
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

    // Lógica interna del modal
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

    // Agregar producto a una mesa (o crear orden nueva)
    addOrden: async (nuevaOrden) => {
      const restoId = getRestoId();
      if (!restoId) return;
      
      // Buscar si la mesa ya tiene una cuenta abierta
      const existente = ordenes.find(o => o.mesa === nuevaOrden.mesa && o.estado !== 'pagado');
      
      try {
          if (existente) {
             // IMPORTANTE: Concatenamos productos y sumamos totales
             const nuevoTotal = parseFloat(existente.total) + parseFloat(nuevaOrden.total);
             const nuevosProductos = existente.productos + `, ${nuevaOrden.productos}`;
             
             return await db.from('ordenes').update({
                 productos: nuevosProductos,
                 total: nuevoTotal,
                 estado: 'pendiente' // Si estaba "listo", vuelve a "pendiente" para cocina
             }).eq('id', existente.id);
          } else {
             // Crear nueva orden
             return await db.from('ordenes').insert([{ ...nuevaOrden, restaurante_id: restoId }]);
          }
      } catch (err) {
          console.error("Error en addOrden:", err);
      }
    },

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
            
            // 1. Registrar en tabla ventas
            const { error: errorVenta } = await db.from('ventas').insert([venta]);
            if (errorVenta) throw errorVenta;

            // 2. Marcar orden como pagada (esto la quita de Mesas y Cocina)
            await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
            
            alert("✅ Pago procesado y mesa liberada.");
        } catch (err) { 
            console.error(err);
            alert("❌ Error al procesar el cobro."); 
        }
      });
    },

    // Sistema de renderizado reactivo
    registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
    notifyUpdate: () => { 
        Object.values(renderCallbacks).forEach(cb => { 
            if(typeof cb === 'function') cb(); 
        }); 
    }
  };
})();

/**
 * NAVEGACIÓN UNIFICADA
 * Controla qué pestañas ve cada empleado según su rol
 */
function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;

    const navContenedor = document.getElementById('menuNavegacion');
    if (!navContenedor) return;

    const rutaActual = window.location.pathname.split("/").pop() || "index.html";
    
    // Configuración de accesos
    const menuItems = [
        { h: "mesas.html", i: "🪑", t: "Mesas" },
        { h: "menu.html", i: "📜", t: "Menú" },
        { h: "cocina.html", i: "👨‍🍳", t: "Cocina" },
        { h: "stock.html", i: "📦", t: "Stock" }
    ];

    // Solo el dueño ve Analíticas/Ventas
    if (sesion.rol === 'dueño' || sesion.rol === 'administrador') {
        menuItems.push({ h: "ventas.html", i: "📊", t: "Ventas" });
        menuItems.push({ h: "empleados.html", i: "👥", t: "Personal" });
    }

    navContenedor.innerHTML = menuItems.map(item => `
        <li>
            <a href="${item.h}" class="${rutaActual === item.h ? 'activo' : 'outline'}" 
               style="${rutaActual === item.h ? 'background:#10ad93;color:white;border:none;' : ''}">
               ${item.i} ${item.t}
            </a>
        </li>
    `).join('') + `
        <li>
            <button onclick="cerrarSesionApp()" class="outline contrast" style="padding: 0.5rem 1rem;">Salir</button>
        </li>`;
}

// Función de salida segura
async function cerrarSesionApp() {
    if (confirm("¿Cerrar sesión y registrar salida?")) {
        localStorage.removeItem('sesion_activa');
        // El resto de la limpieza se encarga logout.js si está presente, 
        // si no, simplemente recargamos.
        window.location.href = 'login.html';
    }
}

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  renderizarMenuSeguro();
  App.init(); 
});