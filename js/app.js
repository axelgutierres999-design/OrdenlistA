// js/app.js - LÓGICA INTEGRAL CENTRALIZADA (ORDENLISTA) - ACTUALIZADO
const App = (function() {
  let ordenes = [];
  let suministros = [];
  let ventas = [];
  
  // Obtener el ID del restaurante de la sesión activa (Regla de Oro)
  const getRestoId = () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    return sesion ? sesion.restaurante_id : null;
  };

  const renderCallbacks = {};

  // 1. CARGA DE DATOS DESDE SUPABASE
  const cargarDatosIniciales = async () => {
    if (typeof db === 'undefined') return;
    const restoId = getRestoId();
    if (!restoId) return;

    try {
        // Cargar Órdenes activas (que no estén pagadas ni canceladas)
        const { data: dataOrdenes } = await db.from('ordenes')
            .select('*')
            .eq('restaurante_id', restoId)
            .neq('estado', 'pagado'); 
        if (dataOrdenes) ordenes = dataOrdenes;

        // Cargar Suministros/Stock
        const { data: dataSuministros } = await db.from('suministros')
            .select('*')
            .eq('restaurante_id', restoId);
        if (dataSuministros) suministros = dataSuministros;

        // Cargar últimas Ventas (Historial)
        const { data: dataVentas } = await db.from('ventas')
            .select('*')
            .eq('restaurante_id', restoId)
            .order('created_at', { ascending: false })
            .limit(50); 
        if (dataVentas) ventas = dataVentas;

        App.notifyUpdate();
    } catch (err) {
        console.error("Error cargando datos globales:", err);
    }
  };

  // 2. INTERFAZ DE COBRO (MODAL)
  const mostrarModalPago = (total, callbackPago) => {
    const modal = document.createElement('div');
    modal.id = "modalGlobalPago";
    modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:10000;font-family:sans-serif;padding:10px;";
    
    modal.innerHTML = `
      <div style="background:white;padding:2rem;border-radius:15px;width:100%;max-width:350px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <h3 style="margin-top:0;color:#333;">Finalizar Cuenta</h3>
        <div style="font-size:2.5rem;font-weight:bold;color:#10ad93;margin-bottom:1rem;">$${total.toFixed(2)}</div>
        <div style="text-align:left; margin-bottom:1rem;">
            <label style="font-size:0.9rem;color:#666;">💵 Efectivo Recibido:</label>
            <input type="number" id="inputRecibido" placeholder="0.00" style="width:100%;padding:12px;font-size:1.2rem;margin-top:5px;border:2px solid #eee;border-radius:8px;">
            <div id="txtCambio" style="margin-top:8px;font-weight:bold;color:#777;text-align:center;">Cambio: $0.00</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;">
          <button id="btnEfectivo" disabled style="background:#2ecc71;color:white;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">EFECTIVO</button>
          <button id="btnTarjeta" style="background:#3498db;color:white;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">TARJETA</button>
        </div>
        <button id="btnCancelar" style="background:none;border:none;text-decoration:underline;cursor:pointer;color:#999;font-size:0.9rem;">Volver a la mesa</button>
      </div>`;
    
    document.body.appendChild(modal);
    const input = document.getElementById('inputRecibido');
    const txtCambio = document.getElementById('txtCambio');
    const btnEfectivo = document.getElementById('btnEfectivo');

    input.addEventListener('input', () => {
      const recibido = parseFloat(input.value) || 0;
      const cambio = recibido - total;
      if (recibido >= total) {
        txtCambio.textContent = `Cambio: $${cambio.toFixed(2)}`;
        txtCambio.style.color = "#27ae60";
        btnEfectivo.disabled = false;
      } else {
        txtCambio.textContent = "Monto insuficiente";
        txtCambio.style.color = "#c0392b";
        btnEfectivo.disabled = true;
      }
    });

    document.getElementById('btnEfectivo').onclick = () => { callbackPago('efectivo'); modal.remove(); };
    document.getElementById('btnTarjeta').onclick = () => { callbackPago('tarjeta'); modal.remove(); };
    document.getElementById('btnCancelar').onclick = () => modal.remove();
    input.focus();
  };

  // 3. IMPRESIÓN DE TICKET
  const imprimirTicketVenta = (venta) => {
    const ventana = window.open("", "_blank", "width=350,height=550");
    const items = venta.productos.split(',').map(p => {
        return `<tr><td style="text-align:left; border-bottom:1px solid #eee; padding:5px 0;">${p.trim()}</td><td style="text-align:right; border-bottom:1px solid #eee; padding:5px 0;">$ --</td></tr>`;
    }).join('');

    ventana.document.write(`
        <html><head><title>Ticket #${venta.id.toString().slice(-5)}</title>
            <style>body { font-family: 'Courier New', monospace; font-size: 13px; padding: 10px; text-align: center; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; } th { border-bottom: 1px dashed black; } .total { font-size: 18px; font-weight: bold; margin-top: 15px; border-top: 1px dashed black; padding-top: 10px; } @media print { .no-print { display: none; } }</style>
        </head><body>
            <h3>${JSON.parse(localStorage.getItem('sesion_activa'))?.nombre_restaurante || 'ORDENLISTA'}</h3><p>Ticket de Venta</p>
            <p style="font-size:11px;">Folio: ${venta.id}<br>Fecha: ${new Date().toLocaleString()}</p>
            <p><strong>MESA: ${venta.mesa}</strong></p><table><thead><tr><th align="left">Producto</th><th align="right">Subt.</th></tr></thead><tbody>${items}</tbody></table>
            <div class="total">TOTAL: $${venta.total.toFixed(2)}</div><p>Método de Pago: ${(venta.metodo_pago || 'efectivo').toUpperCase()}</p>
            <p>¡Gracias por su visita!</p><script>window.print(); setTimeout(()=>window.close(), 500);</script>
        </body></html>`);
    ventana.document.close();
  };

  return {
    init: async () => { await cargarDatosIniciales(); },
    getOrdenes: () => ordenes,
    getSuministros: () => suministros,
    getVentas: () => ventas,

    // AGREGAR O ACTUALIZAR ORDEN (LÓGICA MULTI-PRODUCTO POR MESA)
    addOrden: async (orden) => {
      const restoId = getRestoId();
      if (!restoId) return;
      let nuevaOrden = { ...orden, restaurante_id: restoId };
      
      const existente = ordenes.find(o => o.mesa === orden.mesa && o.estado !== 'pagado' && o.estado !== 'cancelado');
      if (existente) {
         const prodActualizado = existente.productos + `, ${orden.productos}`;
         const totalActualizado = existente.total + orden.total;
         const comActualizado = (existente.comentarios ? existente.comentarios + " | " : "") + (orden.comentarios || "");
         
         await db.from('ordenes').update({
             productos: prodActualizado,
             total: totalActualizado,
             comentarios: comActualizado,
             estado: 'pendiente'
         }).eq('id', existente.id);
         return { id: existente.id };
      }

      await db.from('ordenes').insert([nuevaOrden]);
      return { id: nuevaOrden.id };
    },

    // CAMBIO DE ESTADO (COCINA -> LISTO)
    updateEstado: async (id, nuevoEstado) => {
      // IMPORTANTE: El descuento de inventario se hace ahora vía TRIGGER en SQL
      // al detectar el estado 'terminado'. No hace falta llamar a JS.
      await db.from('ordenes').update({ estado: nuevoEstado }).eq('id', id);
    },

    // PROCESO DE COBRO FINAL Y CIERRE DE MESA
    liberarMesaManual: (id) => {
      const orden = ordenes.find(o => o.id === id);
      const restoId = getRestoId();
      if (!orden || !restoId) return;
      
      mostrarModalPago(orden.total, async (metodo) => {
        const venta = {
          restaurante_id: restoId,
          mesa: orden.mesa,
          productos: orden.productos,
          total: orden.total,
          metodo_pago: metodo
        };

        const { data: vtaGuardada, error } = await db.from('ventas').insert([venta]).select().single();
        
        if (!error) {
            await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
            imprimirTicketVenta(vtaGuardada);
            App.init();
        } else {
            alert("Error al procesar venta: " + error.message);
        }
      });
    },

    // SISTEMA DE RENDERIZADO REACTIVO
    registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
    notifyUpdate: () => { Object.values(renderCallbacks).forEach(cb => { if(typeof cb === 'function') cb(); }); }
  };
})();

// --- SEGURIDAD Y NAVEGACIÓN ---
const Seguridad = {
  verificarAcceso: () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    const pag = window.location.pathname.split("/").pop();
    const publicas = ["index.html", "login.html", "registro.html", ""];
    
    if (!sesion && !publicas.includes(pag)) {
        window.location.href = "login.html";
    }
  }
};

function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;

    const esDueño = (sesion.rol === 'dueño');
    const pag = window.location.pathname.split("/").pop();
    const navContenedor = document.getElementById('menuNavegacion');
    if (!navContenedor) return;

    navContenedor.innerHTML = `
        <li><a href="mesas.html" class="${pag === 'mesas.html' ? 'activo' : ''}">🪑 Mesas</a></li> 
        <li><a href="menu.html" class="${pag === 'menu.html' ? 'activo' : ''}">📜 Menú</a></li>
        <li><a href="cocina.html" class="${pag === 'cocina.html' ? 'activo' : ''}">👨‍🍳 Cocina</a></li>
        ${esDueño ? `
            <li><a href="inventario.html" class="${pag === 'inventario.html' ? 'activo' : ''}">📦 Stock</a></li>
            <li><a href="empleados.html" class="${pag === 'empleados.html' ? 'activo' : ''}">👥 Empleados</a></li>
            <li><a href="ventas.html" class="${pag === 'ventas.html' ? 'activo' : ''}">📊 Ventas</a></li>
        ` : ''}
        <li><button onclick="localStorage.removeItem('sesion_activa'); location.reload();" class="outline contrast" style="padding:4px 10px; margin-left:10px;">Salir</button></li>
    `;
}

// INICIALIZACIÓN Y REALTIME
document.addEventListener('DOMContentLoaded', () => {
  Seguridad.verificarAcceso();
  renderizarMenuSeguro();
  App.init(); 

  const restoId = JSON.parse(localStorage.getItem('sesion_activa'))?.restaurante_id;
  if (typeof db !== 'undefined' && restoId) {
      db.channel('cambios-ordenes')
      .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'ordenes', 
          filter: `restaurante_id=eq.${restoId}` 
      }, () => App.init())
      .subscribe();
  }
});