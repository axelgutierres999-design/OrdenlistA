// js/mesas.js - GESTIÓN DE MESAS, COBROS, QR, CONFIGURACIÓN Y PEDIDO QR CLIENTE (V9.6 - persistencia real + ticket auto)
document.addEventListener('DOMContentLoaded', async () => {
  const gridMesas = document.getElementById('gridMesas');
  const modalCobro = document.getElementById('modalCobro');

  let mesaActualCobro = null;
  let totalActualCobro = 0;
  let ordenesIdsCobro = [];

  // =====================================================
  // 1️⃣ ESPERA APP PRINCIPAL Y SINCRONIZA
  // =====================================================
  async function esperarAppYRenderizar() {
    if (typeof App !== 'undefined' && App.getOrdenes && App.getConfig) {
      App.registerRender('mesas', renderizarMesas);
      await renderizarMesas();
    } else {
      setTimeout(esperarAppYRenderizar, 300);
    }
  }
  esperarAppYRenderizar();

  // =====================================================
  // 2️⃣ RENDERIZAR MESAS
  // =====================================================
  async function renderizarMesas() {
    if (!gridMesas || typeof App === 'undefined') return;

    const sesion = JSON.parse(localStorage.getItem('sesion_activa')) || {};
    const restoId = sesion.restaurante_id;

    // 🔄 Obtenemos num_mesas directamente de la BD (persistente)
    let numMesas = 10;
    try {
      const { data } = await db.from('restaurantes').select('num_mesas').eq('id', restoId).single();
      if (data?.num_mesas) numMesas = data.num_mesas;
    } catch (e) {
      console.warn('No se pudo cargar número de mesas desde BD:', e);
    }

    const ordenes = App.getOrdenes();
    gridMesas.innerHTML = '';
    gridMesas.style.display = 'grid';
    gridMesas.style.gridTemplateColumns = `repeat(auto-fill, minmax(160px, 1fr))`;
    gridMesas.style.gap = '15px';

    for (let i = 1; i <= numMesas; i++) {
      const nombreMesa = `Mesa ${i}`;
      const ordenesMesa = ordenes.filter(o =>
        o.mesa === nombreMesa && !['pagado', 'cancelado', 'entregado'].includes(o.estado)
      );

      const ocupada = ordenesMesa.length > 0;
      const totalMesa = ordenesMesa.reduce((acc, orden) => acc + parseFloat(orden.total), 0);

      let estadoClase = 'libre';
      let estadoTexto = 'Libre';
      if (ocupada) {
        const hayListas = ordenesMesa.some(o => o.estado === 'terminado');
        if (hayListas) {
          estadoClase = 'listo';
          estadoTexto = '🍽️ Sirviendo';
        } else {
          estadoClase = 'ocupada';
          estadoTexto = `Ocupada ($${totalMesa.toFixed(2)})`;
        }
      }

      const div = document.createElement('div');
      div.className = `tarjeta-mesa ${estadoClase}`;
      div.style = `
        border: 2px solid ${ocupada ? '#10ad93' : '#ccc'};
        padding: 15px;
        border-radius: 12px;
        background: ${ocupada ? '#f0fff4' : 'white'};
        text-align: center;
        transition: all 0.2s ease;
      `;

      div.innerHTML = `
        <div class="mesa-header" style="margin-bottom: 10px;">
          <h3 style="margin:0;">${nombreMesa}</h3>
          <span class="badge-mesa badge-${estadoClase}">
            ${estadoTexto}
          </span>
        </div>
        <div class="mesa-actions" style="display: flex; flex-direction: column; gap: 5px;">
          ${
            ocupada
              ? `
            <button onclick="abrirModalCobro('${nombreMesa}', ${totalMesa})"
              style="background:#10ad93; color:white; border:none;
              padding:8px; border-radius:5px; cursor:pointer; font-weight:bold;">
              💰 Cobrar
            </button>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
              <button onclick="verTicketMesa('${nombreMesa}')"
                class="secondary outline" style="padding:5px; font-size:0.8rem;">🧾 Ticket</button>
              <button onclick="agregarPedido('${i}')"
                class="contrast outline" style="padding:5px; font-size:0.8rem;">+ Pedir</button>
            </div>
          `
              : `
            <button onclick="agregarPedido('${i}')"
              style="background:white; color:#10ad93; border:1px solid #10ad93;
              padding:8px; border-radius:5px; cursor:pointer;">
              📝 Nueva Orden
            </button>
          `
          }
          <button onclick="generarQR('${nombreMesa}')"
            class="outline secondary"
            style="margin-top:5px; font-size:0.8rem;">📱 QR de esta Mesa</button>
        </div>
      `;
      gridMesas.appendChild(div);
    }
  }

  // =====================================================
  // 3️⃣ COBRO Y PAGO + TICKET AUTOMÁTICO
  // =====================================================
  window.abrirModalCobro = (mesa, total) => {
    mesaActualCobro = mesa;
    totalActualCobro = total;

    const ordenes = App.getOrdenes().filter(o =>
      o.mesa === mesa && !['pagado', 'cancelado'].includes(o.estado)
    );
    ordenesIdsCobro = ordenes.map(o => o.id);

    document.getElementById('cobroMesaTitulo').textContent = mesa;
    document.getElementById('cobroTotal').textContent = total.toFixed(2);
    modalCobro.showModal();
  };

  async function calcularCambio(total) {
    const entregado = parseFloat(prompt(`💵 Total: $${total.toFixed(2)}\nIngrese monto entregado:`));
    if (isNaN(entregado)) return alert("⚠️ Monto no válido.");
    if (entregado < total) return alert("❌ El monto entregado es menor al total.");
    const cambio = entregado - total;
    alert(`✅ Cambio: $${cambio.toFixed(2)}`);
    return true;
  }

  window.procesarPago = async (metodo) => {
    if (!mesaActualCobro || ordenesIdsCobro.length === 0) return;
    const restoId = App.getRestoId ? App.getRestoId() : null;
    if (!restoId) return alert("Error: restaurante no identificado.");

    if (metodo === 'efectivo') {
      const continuar = await calcularCambio(totalActualCobro);
      if (!continuar) return;
    }

    try {
      let todosProductos = [];
      let folio = Date.now();

      for (const id of ordenesIdsCobro) {
        const ordenData = App.getOrdenes().find(o => o.id === id);
        if (ordenData) {
          todosProductos = todosProductos.concat(
            typeof ordenData.productos === 'string'
              ? ordenData.productos.split(',')
              : ordenData.productos
          );
          await db.from('ventas').insert([{
            restaurante_id: restoId,
            mesa: ordenData.mesa,
            productos: ordenData.productos,
            total: ordenData.total,
            metodo_pago: metodo
          }]);
          await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
        }
      }

      alert("✅ Pago registrado correctamente.");
      modalCobro.close();
      renderizarMesas();

      // ✅ MOSTRAR TICKET AUTOMÁTICO
      mostrarTicket({
        id: folio,
        mesa: mesaActualCobro,
        total: totalActualCobro,
        productos: todosProductos
      });

    } catch (error) {
      console.error(error);
      alert("❌ Error al procesar el pago.");
    }
  };

  // =====================================================
  // 4️⃣ MOSTRAR TICKET
  // =====================================================
  function mostrarTicket(orden) {
    const modal = document.getElementById('modalTicket');
    document.getElementById('t-mesa').textContent = orden.mesa;
    document.getElementById('t-fecha').textContent = new Date().toLocaleString();
    document.getElementById('t-folio').textContent = orden.id;
    document.getElementById('t-total').textContent = parseFloat(orden.total).toFixed(2);

    const tbody = document.getElementById('t-items');
    tbody.innerHTML = (orden.productos || [])
      .map(p => `<tr><td>${p}</td><td style="text-align:right;">—</td></tr>`)
      .join('');

    modal.showModal();
  }

  // =====================================================
  // 5️⃣ CONFIGURACIÓN DE MESAS (GUARDADO PERSISTENTE)
  // =====================================================
  window.guardarConfiguracionMesas = async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa')) || {};
    const restoId = sesion.restaurante_id;
    const n = parseInt(document.getElementById('inputNumMesas').value);
    if (isNaN(n) || n <= 0 || n > 100) return alert("Ingresa un número entre 1 y 100.");
    try {
      await db.from('restaurantes').update({ num_mesas: n }).eq('id', restoId);
      alert("✅ Número de mesas actualizado.");
      renderizarMesas();
    } catch (err) {
      console.error(err);
      alert("❌ Error al guardar configuración.");
    }
  };

  // =====================================================
  // 6️⃣ AGREGAR PEDIDO (MODO MESERO)
  // =====================================================
  window.agregarPedido = (numMesa) => {
    window.location.href = `menu.html?mesa=Mesa ${numMesa}`;
  };

  // =====================================================
  // 7️⃣ GENERAR CÓDIGO QR POR MESA (CLIENTE MÓVIL)
  // =====================================================
  window.generarQR = (mesaLabel) => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion?.restaurante_id) return alert("Error: restaurante no identificado.");

    const urlMesa = `${window.location.origin}/pedido.html?rid=${sesion.restaurante_id}&mesa=${encodeURIComponent(mesaLabel)}`;

    const modal = document.createElement('dialog');
    modal.innerHTML = `
      <article style="text-align:center;">
        <h3>📱 QR - ${mesaLabel}</h3>
        <div id="qrCanvas" style="margin:1rem auto;"></div>
        <p style="font-size:0.8rem; color:#555;">${urlMesa}</p>
        <footer><button onclick="this.closest('dialog').close()">Cerrar</button></footer>
      </article>
    `;
    document.body.appendChild(modal);
    modal.showModal();

    if (typeof QRCode === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js";
      script.onload = () => new QRCode(document.getElementById("qrCanvas"), { text: urlMesa, width: 200, height: 200 });
      document.head.appendChild(script);
    } else {
      new QRCode(document.getElementById("qrCanvas"), { text: urlMesa, width: 200, height: 200 });
    }
  };
});