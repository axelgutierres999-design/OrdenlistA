// js/app.js - NÚCLEO CENTRALIZADO (V5 - REALTIME & KDS READY)
const App = (function() {
  let ordenes = [];
  let suministros = [];
  let ventas = [];
  
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
        const { data: dataOrdenes } = await db.from('ordenes')
            .select('*')
            .eq('restaurante_id', restoId)
            .neq('estado', 'pagado')
            .neq('estado', 'cancelado'); 
        if (dataOrdenes) ordenes = dataOrdenes;

        const { data: dataSuministros } = await db.from('suministros').select('*').eq('restaurante_id', restoId);
        if (dataSuministros) suministros = dataSuministros;

        const { data: dataVentas } = await db.from('ventas')
            .select('*')
            .eq('restaurante_id', restoId)
            .order('created_at', { ascending: false }).limit(50); 
        if (dataVentas) ventas = dataVentas;

        App.notifyUpdate();
    } catch (err) {
        console.error("Error global de carga:", err);
    }
  };

  // Escucha cambios en Supabase para actualizar Cocina y Mesas automáticamente
  const activarSuscripcionRealtime = () => {
    const restoId = getRestoId();
    if (!restoId) return;

    db.channel('cambios-ordenes')
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` }, 
          () => {
              console.log('🔄 Cambio detectado: Sincronizando pantallas...');
              cargarDatosIniciales(); 
          })
      .subscribe();
  };

  // --- 2. INTERFAZ DE PAGO (MODAL) ---
  const mostrarModalPago = (orden, callbackPago) => {
    const total = parseFloat(orden.total);
    const modal = document.createElement('div');
    modal.id = "modalGlobalPago";
    modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:10000;padding:15px;";
    
    modal.innerHTML = `
      <article style="background:white;padding:1.5rem;border-radius:15px;width:100%;max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.3); color:#333;">
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
            <button id="btnQRUI" style="width:100%;background:#f39c12;color:white;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:bold;margin-bottom:15px;">📱 QR</button>
        </div>
        <div id="panelEfectivo" style="display:none; background:#f9f9f9; padding:15px; border-radius:10px; margin-bottom:15px;">
            <label>Monto Recibido:</label>
            <input type="number" id="inputRecibido" placeholder="0.00" style="font-size:1.5rem; text-align:center; width:100%;">
            <div id="txtCambio" style="text-align:center; font-weight:bold; margin-top:10px; color:#e74c3c;">Cambio: $0.00</div>
            <button id="btnConfirmarEfectivo" disabled style="width:100%; margin-top:10px; background:#27ae60; color:white;">REGISTRAR</button>
        </div>
        <footer style="text-align:center;">
            <button id="btnCancelar" style="background:none; border:none; color:#888; cursor:pointer;">Volver</button>
        </footer>
      </article>`;
    
    document.body.appendChild(modal);

    document.getElementById('btnEfectivoUI').onclick = () => { 
        document.getElementById('seccionMetodos').style.display='none'; 
        document.getElementById('panelEfectivo').style.display='block'; 
    };
    
    const input = document.getElementById('inputRecibido');
    input.addEventListener('input', () => {
        const recibido = parseFloat(input.value) || 0;
        const cambio = recibido - total;
        const txtCambio = document.getElementById('txtCambio');
        const btnConf = document.getElementById('btnConfirmarEfectivo');
        btnConf.disabled = recibido < total;
        txtCambio.textContent = recibido >= total ? `Cambio: $${cambio.toFixed(2)}` : "Monto insuficiente";
        txtCambio.style.color = recibido >= total ? "#27ae60" : "#c0392b";
    });

    document.getElementById('btnConfirmarEfectivo').onclick = () => { callbackPago('efectivo'); modal.remove(); };
    document.getElementById('btnTarjetaUI').onclick = () => { if(confirm("¿Pago con Tarjeta?")) { callbackPago('tarjeta'); modal.remove(); } };
    document.getElementById('btnQRUI').onclick = () => { if(confirm("¿Pago con QR?")) { callbackPago('qr'); modal.remove(); } };
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

    // Gestión de Órdenes
    addOrden: async (orden) => {
      const restoId = getRestoId();
      if (!restoId) return;
      
      const existente = ordenes.find(o => o.mesa === orden.mesa && o.estado !== 'pagado');
      
      if (existente) {
         const nuevoTotal = parseFloat(existente.total) + parseFloat(orden.total);
         return await db.from('ordenes').update({
             productos: existente.productos + `, ${orden.productos}`,
             total: nuevoTotal,
             estado: 'pendiente' // Regresa a cocina si se agrega algo más
         }).eq('id', existente.id);
      }
      return await db.from('ordenes').insert([{ ...orden, restaurante_id: restoId }]);
    },

    updateEstado: async (id, nuevoEstado) => {
        const { error } = await db.from('ordenes').update({ estado: nuevoEstado }).eq('id', id);
        if (error) console.error("Error al actualizar estado:", error);
    },

    eliminarOrden: async (id) => {
        const { error } = await db.from('ordenes').delete().eq('id', id);
        if (error) console.error("Error al eliminar:", error);
    },

    aceptarOrdenQR: async (id) => {
        await App.updateEstado(id, 'pendiente');
    },

    verDetalleMesa: (id) => {
        const orden = ordenes.find(o => o.id === id);
        if (!orden) return;
        alert(`CONSUMO - ${orden.mesa}\n${orden.productos.split(',').join('\n')}\nTOTAL: $${parseFloat(orden.total).toFixed(2)}`);
    },

    liberarMesaManual: (id) => {
      const orden = ordenes.find(o => o.id === id);
      if (!orden) return;
      
      mostrarModalPago(orden, async (metodo) => {
        try {
            const venta = { restaurante_id: getRestoId(), mesa: orden.mesa, productos: orden.productos, total: orden.total, metodo_pago: metodo };
            await db.from('ventas').insert([venta]);
            await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
            alert("Venta registrada con éxito");
        } catch (err) { alert("Error al cobrar"); }
      });
    },

    registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
    notifyUpdate: () => { Object.values(renderCallbacks).forEach(cb => { if(typeof cb === 'function') cb(); }); }
  };
})();

// NAVEGACIÓN Y LOGIN (Se mantiene igual pero verificado)
function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;
    const navContenedor = document.getElementById('menuNavegacion');
    if (!navContenedor) return;
    const pag = window.location.pathname.split("/").pop() || "index.html";
    
    const menuItems = [
        { h: "mesas.html", i: "🪑", t: "Mesas" },
        { h: "menu.html", i: "📜", t: "Menú" },
        { h: "cocina.html", i: "👨‍🍳", t: "Cocina" },
        { h: "stock.html", i: "📦", t: "Stock" }
    ];
    if (sesion.rol === 'dueño') {
        menuItems.push({ h: "ventas.html", i: "📊", t: "Ventas" });
    }

    navContenedor.innerHTML = menuItems.map(item => `
        <li><a href="${item.h}" class="${pag === item.h ? '' : 'outline'}" style="${pag === item.h ? 'background:#10ad93;color:white;border:none;' : ''}">${item.i} ${item.t}</a></li>
    `).join('') + `<li><button onclick="localStorage.removeItem('sesion_activa');location.reload();" class="outline contrast">Salir</button></li>`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderizarMenuSeguro();
  App.init(); 
});