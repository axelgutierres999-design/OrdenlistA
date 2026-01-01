// js/app.js - LÓGICA INTEGRAL CON INVENTARIO Y FILTRO POR NEGOCIO
const App = (function() {
  let ordenes = [];
  let suministros = [];
  let ventas = [];
  
  // Obtener el ID del restaurante de la sesión activa
  const getRestoId = () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    return sesion ? sesion.restaurante_id : null;
  };

  let recetas = JSON.parse(localStorage.getItem('recetas_db')) || {
    'cafe americano': { 'cafe en grano': 0.015 },
    'cafe con leche': { 'cafe en grano': 0.015, 'leche entera': 0.150 },
    'te de hierbas': { 'te de hierbas': 1 },
    'pastel de chocolate': { 'pastel de chocolate': 1 },
    'jugo de naranja': { 'jugo de naranja': 1 }
  };

  const renderCallbacks = {};
  const normalizar = (texto) =>
    texto ? texto.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

  const cargarDatosIniciales = async () => {
    if (typeof db === 'undefined') return;
    const restoId = getRestoId();
    if (!restoId) return;

    try {
        const { data: dataOrdenes } = await db.from('ordenes')
            .select('*')
            .eq('restaurante_id', restoId)
            .neq('estado', 'terminado');
        if (dataOrdenes) ordenes = dataOrdenes;

        const { data: dataSuministros } = await db.from('suministros')
            .select('*')
            .eq('restaurante_id', restoId);
        if (dataSuministros) suministros = dataSuministros;

        const { data: dataVentas } = await db.from('ventas')
            .select('*')
            .eq('restaurante_id', restoId)
            .order('fecha', { ascending: false })
            .limit(50); 
        if (dataVentas) ventas = dataVentas;

        App.notifyUpdate();
    } catch (err) {
        console.error("Error cargando datos:", err);
    }
  };

  const mostrarModalPago = (total, callbackPago) => {
    const modal = document.createElement('div');
    modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:10000;font-family:sans-serif;";
    
    modal.innerHTML = `
      <div style="background:white;padding:2rem;border-radius:15px;width:350px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <h3 style="margin-top:0;">Total a Cobrar</h3>
        <div style="font-size:2.5rem;font-weight:bold;color:#10ad93;margin-bottom:1rem;">$${total.toFixed(2)}</div>
        <div style="text-align:left; margin-bottom:1rem;">
            <label>💵 Efectivo Recibido:</label>
            <input type="number" id="inputRecibido" placeholder="0.00" style="width:100%;padding:8px;font-size:1.1rem;margin-top:5px;">
            <div id="txtCambio" style="margin-top:5px;font-weight:bold;color:#777;">Cambio: $0.00</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <button id="btnEfectivo" disabled style="background:#2ecc71;color:white;border:none;padding:10px;border-radius:5px;cursor:pointer;">Efectivo</button>
          <button id="btnTarjeta" style="background:#3498db;color:white;border:none;padding:10px;border-radius:5px;cursor:pointer;">Tarjeta</button>
        </div>
        <button id="btnCancelar" style="background:none;border:none;text-decoration:underline;cursor:pointer;color:#666;">Cancelar</button>
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
        txtCambio.textContent = "Falta dinero";
        txtCambio.style.color = "#c0392b";
        btnEfectivo.disabled = true;
      }
    });

    document.getElementById('btnEfectivo').onclick = () => { callbackPago('efectivo'); modal.remove(); };
    document.getElementById('btnTarjeta').onclick = () => { callbackPago('tarjeta'); modal.remove(); };
    document.getElementById('btnCancelar').onclick = () => modal.remove();
    input.focus();
  };

  const imprimirTicketVenta = (venta) => {
    const ventana = window.open("", "_blank", "width=350,height=550");
    const items = venta.productos.split(',').map(p => {
        return `<tr><td style="text-align:left; border-bottom:1px solid #eee; padding:5px 0;">${p.trim()}</td><td style="text-align:right; border-bottom:1px solid #eee; padding:5px 0;">--</td></tr>`;
    }).join('');

    ventana.document.write(`
        <html><head><title>Ticket #${venta.id}</title>
            <style>body { font-family: 'Courier New', monospace; font-size: 13px; padding: 10px; text-align: center; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; } th { border-bottom: 1px dashed black; } .total { font-size: 18px; font-weight: bold; margin-top: 15px; border-top: 1px dashed black; padding-top: 10px; } button { display:none; } @media print { button { display: none; } }</style>
        </head><body>
            <h3>ORDENLISTA</h3><p>Ticket de Venta</p><p style="font-size:11px;">Folio: ${venta.id}<br>Fecha: ${new Date().toLocaleString()}</p>
            <p><strong>Mesa: ${venta.mesa}</strong></p><table><thead><tr><th align="left">Producto</th><th align="right">$$</th></tr></thead><tbody>${items}</tbody></table>
            <div class="total">TOTAL: $${venta.total.toFixed(2)}</div><p>Método: ${(venta.metodo_pago || 'efectivo').toUpperCase()}</p>
            <div class="footer"><p>¡Gracias por su compra!</p></div><script>window.print();</script>
        </body></html>`);
    ventana.document.close();
  };

  return {
    init: async () => { await cargarDatosIniciales(); },
    getOrdenes: () => ordenes,
    getSuministros: () => suministros,
    getVentas: () => ventas,
    getRecetas: () => recetas,

    addOrden: async (orden) => {
      const restoId = getRestoId();
      if (!restoId) return;
      let nuevaOrden = { ...orden, restaurante_id: restoId };
      
      if (orden.estado === 'por_confirmar') {
          nuevaOrden.id = `PEND-${Date.now()}`;
      } else {
          const existente = ordenes.find(o => o.mesa === orden.mesa && o.estado !== 'terminado' && o.estado !== 'por_confirmar');
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
             App.init();
             return { id: existente.id };
          }
          nuevaOrden.id = `ORD-${Date.now()}`;
          nuevaOrden.estado = 'pendiente';
      }

      await db.from('ordenes').insert([nuevaOrden]);
      App.init();
      return { id: nuevaOrden.id };
    },

    updateEstado: async (id, nuevoEstado) => {
      const orden = ordenes.find(o => o.id === id);
      if(orden && nuevoEstado === 'terminado') {
          App.descontarInventario(orden.productos);
      }
      await db.from('ordenes').update({ estado: nuevoEstado }).eq('id', id);
      App.init();
    },

    liberarMesaManual: (id) => {
      const orden = ordenes.find(o => o.id === id);
      const restoId = getRestoId();
      if (!orden || !restoId) return;
      
      mostrarModalPago(orden.total, async (metodo) => {
        const venta = {
          id: `VTA-${Date.now()}`,
          restaurante_id: restoId,
          mesa: orden.mesa,
          productos: orden.productos,
          total: orden.total,
          metodo_pago: metodo
        };
        const { error } = await db.from('ventas').insert([venta]);
        if (!error) {
            await db.from('ordenes').delete().eq('id', id);
            imprimirTicketVenta(venta);
            App.init();
        }
      });
    },

    descontarInventario: (productosString) => {
      if (!productosString) return;
      const items = productosString.split(/,|\n/);
      items.forEach(async item => {
        const partes = item.trim().split('x '); 
        if (partes.length < 2) return;
        const nombreProducto = normalizar(partes[1]);
        const cantidadPedida = parseInt(partes[0]);
        const receta = recetas[nombreProducto];

        if (receta) {
          for (let ingrediente in receta) {
            const insumo = suministros.find(s => normalizar(s.nombre) === normalizar(ingrediente));
            if (insumo) {
              const nuevaCant = parseFloat((insumo.cantidad - (receta[ingrediente] * cantidadPedida)).toFixed(3));
              await db.from('suministros').update({ cantidad: nuevaCant }).eq('id', insumo.id);
            }
          }
        }
      });
    },

    registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },
    notifyUpdate: () => { Object.values(renderCallbacks).forEach(cb => { if(typeof cb === 'function') cb(); }); }
  };
})();

// --- SEGURIDAD Y MENÚ DINÁMICO ---
const Seguridad = {
  verificarAcceso: () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    const pag = window.location.pathname.split("/").pop();
    // Agregamos index.html y login.html como públicas
    const publicas = ["index.html", "login.html", "", "registro.html"];
    
    if (!sesion && !publicas.includes(pag)) {
        // CORRECCIÓN: Si no hay sesión, mandar a LOGIN, no a registro
        window.location.href = "login.html";
    }
  }
};

function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;

    const esDueño = (sesion.rol === 'dueño' || sesion.rol === 'admin');
    const pag = window.location.pathname.split("/").pop();
    
    const navContenedor = document.getElementById('menuNavegacion') || document.querySelector('.nav-botones');
    if (!navContenedor) return;

    // NOTA: Asegúrate de que tu archivo se llama ventas.html para que este link funcione
    navContenedor.innerHTML = `
        <li><a href="mesas.html" class="${pag === 'mesas.html' ? 'activo' : ''}">🪑 Mesas</a></li> 
        <li><a href="menu.html" class="${pag === 'menu.html' ? 'activo' : ''}">📜 Menú</a></li>
        <li><a href="cocina.html" class="${pag === 'cocina.html' ? 'activo' : ''}">👨‍🍳 Cocina</a></li>
        ${esDueño ? `
            <li><a href="inventario.html" class="${pag === 'inventario.html' ? 'activo' : ''}">📦 Stock</a></li>
            <li><a href="empleados.html" class="${pag === 'empleados.html' ? 'activo' : ''}">👥 Empleados</a></li>
            <li><a href="ventas.html" class="${pag === 'ventas.html' ? 'activo' : ''}">📊 Ventas</a></li>
        ` : ''}
        <li><button onclick="cerrarSesion()" class="outline contrast" style="padding:4px 10px; margin-left:10px;">Salir</button></li>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
  Seguridad.verificarAcceso();
  renderizarMenuSeguro();
  App.init(); 

  const restoId = JSON.parse(localStorage.getItem('sesion_activa'))?.restaurante_id;
  if (typeof db !== 'undefined' && restoId) {
      db.channel('cambios-ordenes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes', filter: `restaurante_id=eq.${restoId}` }, () => App.init())
      .subscribe();
  }
});
// Se eliminó la función window.cerrarSesion de aquí porque logout.js ya la maneja mejor.