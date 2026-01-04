// js/app.js - LÓGICA INTEGRAL CENTRALIZADA (ORDENLISTA) - ACTUALIZADO V3
const App = (function() {
  let ordenes = [];
  let suministros = [];
  let ventas = [];
  
  const getRestoId = () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    return sesion ? sesion.restaurante_id : null;
  };

  const renderCallbacks = {};

  // 1. CARGA DE DATOS Y SINCRONIZACIÓN
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
        console.error("Error global:", err);
    }
  };

  // 2. INTERFAZ DE COBRO MEJORADA (Efectivo, Tarjeta, QR)
  const mostrarModalPago = (orden, callbackPago) => {
    const total = parseFloat(orden.total);
    const modal = document.createElement('div');
    modal.id = "modalGlobalPago";
    modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:10000;padding:15px;";
    
    modal.innerHTML = `
      <article style="background:white;padding:1.5rem;border-radius:15px;width:100%;max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
        <header style="text-align:center; border-bottom:1px solid #eee; margin-bottom:1rem; padding-bottom:0.5rem;">
            <h3 style="margin:0;">Finalizar Mesa ${orden.mesa.replace('Mesa ', '')}</h3>
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
            <button id="btnQRUI" style="width:100%;background:#f39c12;color:white;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:bold;margin-bottom:15px;">📱 PAGO CON QR</button>
        </div>

        <div id="panelEfectivo" style="display:none; background:#f9f9f9; padding:15px; border-radius:10px; margin-bottom:15px;">
            <label>Monto Recibido:</label>
            <input type="number" id="inputRecibido" placeholder="0.00" style="font-size:1.5rem; text-align:center; margin-top:5px;">
            <div id="txtCambio" style="text-align:center; font-weight:bold; margin-top:10px; color:#e74c3c;">Cambio: $0.00</div>
            <button id="btnConfirmarEfectivo" disabled style="width:100%; margin-top:10px; background:#27ae60;">REGISTRAR PAGO</button>
        </div>

        <div id="panelQR" style="display:none; text-align:center; margin-bottom:15px;">
            <p><small>Muestre este código al cliente</small></p>
            <img src="assets/tu-qr-de-cobro.png" style="width:180px; border:4px solid #eee; border-radius:10px;">
            <button id="btnConfirmarQR" style="width:100%; margin-top:10px; background:#f39c12;">YA RECIBÍ LA TRANSFERENCIA</button>
        </div>

        <footer style="text-align:center; margin-top:10px;">
            <button id="btnCancelar" class="outline secondary" style="border:none; text-decoration:underline;">Volver a la mesa</button>
        </footer>
      </article>`;
    
    document.body.appendChild(modal);

    // Lógica de paneles
    const btnEfectivo = document.getElementById('btnEfectivoUI');
    const btnTarjeta = document.getElementById('btnTarjetaUI');
    const btnQR = document.getElementById('btnQRUI');
    const panelEfectivo = document.getElementById('panelEfectivo');
    const panelQR = document.getElementById('panelQR');
    const seccionMetodos = document.getElementById('seccionMetodos');

    btnEfectivo.onclick = () => { seccionMetodos.style.display='none'; panelEfectivo.style.display='block'; document.getElementById('inputRecibido').focus(); };
    btnQR.onclick = () => { seccionMetodos.style.display='none'; panelQR.style.display='block'; };
    
    // Cálculo de cambio
    const input = document.getElementById('inputRecibido');
    input.addEventListener('input', () => {
        const recibido = parseFloat(input.value) || 0;
        const cambio = recibido - total;
        const txtCambio = document.getElementById('txtCambio');
        const btnConf = document.getElementById('btnConfirmarEfectivo');
        if (recibido >= total) {
            txtCambio.textContent = `Cambio: $${cambio.toFixed(2)}`;
            txtCambio.style.color = "#27ae60";
            btnConf.disabled = false;
        } else {
            txtCambio.textContent = "Monto insuficiente";
            txtCambio.style.color = "#c0392b";
            btnConf.disabled = true;
        }
    });

    // Finalización de pagos
    document.getElementById('btnConfirmarEfectivo').onclick = () => { callbackPago('efectivo'); modal.remove(); };
    btnTarjeta.onclick = () => { if(confirm("¿Se procesó el pago en la terminal?")) { callbackPago('tarjeta'); modal.remove(); } };
    document.getElementById('btnConfirmarQR').onclick = () => { callbackPago('qr'); modal.remove(); };
    document.getElementById('btnCancelar').onclick = () => modal.remove();
  };

  // 3. IMPRESIÓN DE TICKET
  const imprimirTicketVenta = (venta) => {
    const ventana = window.open("", "_blank", "width=350,height=550");
    const items = venta.productos.split(',').map(p => `<tr><td style="text-align:left; padding:5px 0;">${p.trim()}</td><td style="text-align:right;">---</td></tr>`).join('');

    ventana.document.write(`
        <html><head><style>body{font-family:'Courier New',monospace;padding:15px;text-align:center;} table{width:100%;margin-top:10px;font-size:12px;} .total{font-size:20px;font-weight:bold;border-top:1px dashed #000;margin-top:10px;padding-top:10px;}</style></head>
        <body>
            <h2>${JSON.parse(localStorage.getItem('sesion_activa'))?.nombre_restaurante || 'ORDENLISTA'}</h2>
            <p>Ticket #${venta.id.toString().slice(-6)}<br>${new Date().toLocaleString()}</p>
            <hr><h3>${venta.mesa}</h3><hr>
            <table>${items}</table>
            <div class="total">TOTAL: $${venta.total.toFixed(2)}</div>
            <p>Método: ${venta.metodo_pago.toUpperCase()}</p>
            <p>¡Vuelva pronto!</p>
            <script>window.print(); setTimeout(()=>window.close(), 600);</script>
        </body></html>`);
    ventana.document.close();
  };

  return {
    init: async () => { await cargarDatosIniciales(); },
    getOrdenes: () => ordenes,
    getSuministros: () => suministros,
    getVentas: () => ventas,

    // Lógica para agregar productos a mesa existente
    addOrden: async (orden) => {
      const restoId = getRestoId();
      if (!restoId) return;
      const existente = ordenes.find(o => o.mesa === orden.mesa && o.estado !== 'pagado');
      
      if (existente) {
         await db.from('ordenes').update({
             productos: existente.productos + `, ${orden.productos}`,
             total: existente.total + orden.total,
             estado: 'pendiente'
         }).eq('id', existente.id);
         return { id: existente.id };
      }
      return await db.from('ordenes').insert([{ ...orden, restaurante_id: restoId }]);
    },

    updateEstado: async (id, nuevoEstado) => {
      await db.from('ordenes').update({ estado: nuevoEstado }).eq('id', id);
    },

    // FUNCIÓN CENTRAL DE COBRO (Se llama desde mesas.js)
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

            const { data: vtaGuardada, error } = await db.from('ventas').insert([venta]).select().single();
            if (error) throw error;

            await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
            imprimirTicketVenta(vtaGuardada);
            App.init(); 
            alert("Mesa liberada correctamente.");
        } catch (err) {
            alert("Error: " + err.message);
        }
      });
    },

    registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
    notifyUpdate: () => { Object.values(renderCallbacks).forEach(cb => { if(typeof cb === 'function') cb(); }); }
  };
})();

// --- SEGURIDAD Y NAVEGACIÓN ---
const Seguridad = {
  verificarAcceso: () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    const pag = window.location.pathname.split("/").pop();
    if (!sesion && !["login.html", "registro.html", "index.html", ""].includes(pag)) {
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
        <li><a href="mesas.html" class="${pag === 'mesas.html' ? 'activo' : 'outline'}">🪑 Mesas</a></li> 
        <li><a href="ordenes.html" class="${pag === 'ordenes.html' ? 'activo' : 'outline'}">📋 Órdenes</a></li>
        <li><a href="menu.html" class="${pag === 'menu.html' ? 'activo' : 'outline'}">📜 Menú</a></li>
        <li><a href="cocina.html" class="${pag === 'cocina.html' ? 'activo' : 'outline'}">👨‍🍳 Cocina</a></li>
        ${esDueño ? `
            <li><a href="stock.html" class="${pag === 'stock.html' ? 'activo' : 'outline'}">📦 Stock</a></li>
            <li><a href="ventas.html" class="${pag === 'ventas.html' ? 'activo' : 'outline'}">📊 Ventas</a></li>
        ` : ''}
        <li><button onclick="localStorage.removeItem('sesion_activa'); location.reload();" class="contrast" style="padding:4px 10px;">Salir</button></li>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
  Seguridad.verificarAcceso();
  renderizarMenuSeguro();
  App.init(); 

  const restoId = JSON.parse(localStorage.getItem('sesion_activa'))?.restaurante_id;
  if (typeof db !== 'undefined' && restoId) {
      db.channel('global-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` }, () => App.init()).subscribe();
  }
});