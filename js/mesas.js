// js/mesas.js - GESTIÓN DE MESAS, COBROS (QR/TRANSFERENCIA/TERMINAL), CONFIGURACIÓN
document.addEventListener('DOMContentLoaded', async () => {
  const gridMesas = document.getElementById('gridMesas');
  const modalCobro = document.getElementById('modalCobro');

  let mesaActualCobro = null;
  let totalActualCobro = 0;
  let ordenesIdsCobro = [];
  let configRestaurante = {}; // Guardará datos bancarios y URL del QR

  // =====================================================
  // 1️⃣ INICIALIZACIÓN Y CARGA DE CONFIG
  // =====================================================
  async function esperarAppYRenderizar() {
    if (typeof App !== 'undefined' && App.getOrdenes && App.getConfig) {
      // Cargamos la config del restaurante (QR, Banco, etc)
      await cargarConfigRestaurante();
      
      App.registerRender('mesas', renderizarMesas);
      await renderizarMesas();
    } else {
      setTimeout(esperarAppYRenderizar, 300);
    }
  }

  async function cargarConfigRestaurante() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if(!sesion) return;
    try {
      const { data } = await db.from('restaurantes').select('*').eq('id', sesion.restaurante_id).single();
      if(data) configRestaurante = data;
    } catch(e) { console.error("Error cargando config pagos:", e); }
  }

  esperarAppYRenderizar();

  // =====================================================
  // 2️⃣ RENDERIZAR MESAS
  // =====================================================
  async function renderizarMesas() {
    if (!gridMesas || typeof App === 'undefined') return;

    // Usar config cargada o valor por defecto
    const numMesas = configRestaurante.num_mesas || 10;
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
            style="margin-top:5px; font-size:0.8rem;">📱 QR Pedido</button>
        </div>
      `;
      gridMesas.appendChild(div);
    }
  }

  // =====================================================
  // 3️⃣ LÓGICA DE COBRO (ACTUALIZADA V9.0)
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
    
    // Si tienes un input de efectivo en el HTML, límpialo
    const inputEfec = document.getElementById('inputEfectivo'); 
    if(inputEfec) inputEfec.value = '';

    modalCobro.showModal();
  };

  // Función principal llamada por los botones del HTML (Efectivo / Tarjeta)
  window.procesarPago = async (metodoInicial) => {
    if (!mesaActualCobro || ordenesIdsCobro.length === 0) return;

    // 1. PAGO EFECTIVO (Flujo normal)
    if (metodoInicial === 'efectivo') {
      const entregado = parseFloat(prompt(`💵 Total: $${totalActualCobro.toFixed(2)}\nIngrese monto entregado:`));
      if (isNaN(entregado)) return alert("⚠️ Monto no válido.");
      if (entregado < totalActualCobro) return alert("❌ Falta dinero.");
      
      const cambio = entregado - totalActualCobro;
      alert(`✅ Cambio: $${cambio.toFixed(2)}`);
      await ejecutarTransaccionDB('efectivo');
      return;
    }

    // 2. PAGO TARJETA/DIGITAL (Muestra sub-menú)
    if (metodoInicial === 'tarjeta') {
      mostrarOpcionesDigitales();
    }
  };

  // =====================================================
  // 4️⃣ MENÚ SELECCIÓN PAGO DIGITAL (QR / TRANSF / TERMINAL)
  // =====================================================
  function mostrarOpcionesDigitales() {
    // Cerramos temporalmente el modal de cobro principal si es necesario, 
    // o sobreponemos este nuevo modal.
    
    const div = document.createElement('dialog');
    div.style = "padding:20px; border-radius:15px; border:none; box-shadow:0 10px 30px rgba(0,0,0,0.5); max-width:400px; width:90%";
    div.innerHTML = `
      <header style="text-align:center; margin-bottom:15px;">
        <h3>💳 Tipo de Pago Digital</h3>
        <p>Selecciona la opción para la <b>${mesaActualCobro}</b></p>
      </header>
      <div style="display:flex; flex-direction:column; gap:10px;">
        
        <button id="btnPagoQR" style="padding:15px; background:#fff; border:2px solid #10ad93; color:#10ad93; border-radius:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
          📱 Código QR (CoDi / App)
        </button>

        <button id="btnPagoTransf" style="padding:15px; background:#fff; border:2px solid #3b82f6; color:#3b82f6; border-radius:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
          🏦 Transferencia
        </button>

        <button id="btnPagoTerminal" style="padding:15px; background:#333; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
          📟 Terminal Bancaria
        </button>

      </div>
      <footer style="margin-top:15px; text-align:center;">
        <button id="btnCancelarSel" style="background:transparent; border:none; color:grey; text-decoration:underline; cursor:pointer;">Cancelar</button>
      </footer>
    `;
    document.body.appendChild(div);
    div.showModal();

    // -- LOGICA BOTONES --

    // 1. TERMINAL: Cobro directo y ticket
    div.querySelector('#btnPagoTerminal').onclick = () => {
      div.close();
      ejecutarTransaccionDB('tarjeta'); // Guarda como 'tarjeta' en BD
    };

    // 2. QR: Muestra imagen del QR configurada
    div.querySelector('#btnPagoQR').onclick = () => {
      div.close();
      mostrarModalInfoPago('qr');
    };

    // 3. TRANSFERENCIA: Muestra datos bancarios
    div.querySelector('#btnPagoTransf').onclick = () => {
      div.close();
      mostrarModalInfoPago('transferencia');
    };

    div.querySelector('#btnCancelarSel').onclick = () => div.close();
  }

  // Muestra el detalle (Imagen QR o Texto Banco) y espera confirmación
  function mostrarModalInfoPago(tipo) {
    const dialogInfo = document.createElement('dialog');
    dialogInfo.style = "padding:0; border-radius:15px; border:none; max-width:350px; width:90%; overflow:hidden;";
    
    let contenido = '';
    let titulo = '';

    if (tipo === 'qr') {
      titulo = 'Escanea para Pagar';
      const imgUrl = configRestaurante.qr_pago_url 
        ? configRestaurante.qr_pago_url 
        : 'https://via.placeholder.com/200?text=QR+No+Configurado';
      contenido = `<img src="${imgUrl}" style="width:100%; display:block;">`;
    } else {
      titulo = 'Datos Bancarios';
      const texto = configRestaurante.datos_bancarios 
        ? configRestaurante.datos_bancarios.replace(/\n/g, '<br>') 
        : 'Sin datos configurados.';
      contenido = `<div style="padding:20px; font-size:1.1rem; color:#333; background:#f9f9f9;">${texto}</div>`;
    }

    dialogInfo.innerHTML = `
      <div style="background:#10ad93; color:white; padding:15px; text-align:center;">
        <h3 style="margin:0;">${titulo}</h3>
        <small>Total: $${totalActualCobro.toFixed(2)}</small>
      </div>
      ${contenido}
      <div style="padding:15px; display:flex; gap:10px;">
        <button id="btnConfirmarPago" style="flex:1; background:#10ad93; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold;">✅ Ya Pagaron</button>
        <button onclick="this.closest('dialog').close()" style="flex:1; background:#ccc; border:none; padding:12px; border-radius:8px;">Cerrar</button>
      </div>
    `;

    document.body.appendChild(dialogInfo);
    dialogInfo.showModal();

    dialogInfo.querySelector('#btnConfirmarPago').onclick = async () => {
      dialogInfo.close();
      await ejecutarTransaccionDB(tipo); // Guarda como 'qr' o 'transferencia'
    };
  }

  // =====================================================
  // 5️⃣ EJECUCIÓN REAL DEL COBRO (BASE DE DATOS)
  // =====================================================
  async function ejecutarTransaccionDB(metodo) {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion?.restaurante_id) return alert("Error de sesión.");

    try {
      let todosProductos = [];
      let folio = Date.now();

      // Recopilar productos y actualizar estado
      for (const id of ordenesIdsCobro) {
        const ordenData = App.getOrdenes().find(o => o.id === id);
        if (ordenData) {
          todosProductos = todosProductos.concat(
            typeof ordenData.productos === 'string'
              ? ordenData.productos.split(',')
              : ordenData.productos
          );
          
          // Registrar Venta
          await db.from('ventas').insert([{
            restaurante_id: sesion.restaurante_id,
            mesa: ordenData.mesa,
            productos: ordenData.productos,
            total: ordenData.total,
            metodo_pago: metodo
          }]);
          
          // Cerrar Orden
          await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
        }
      }

      // Éxito
      alert("✅ Pago registrado correctamente.");
      if(modalCobro.open) modalCobro.close();
      renderizarMesas();

      // GENERAR TICKET AUTOMÁTICO
      mostrarTicket({
        id: folio,
        mesa: mesaActualCobro,
        total: totalActualCobro,
        productos: todosProductos,
        metodo: metodo // Pasamos el método para que salga en el ticket si quieres
      });

    } catch (error) {
      console.error(error);
      alert("❌ Error al procesar el pago en base de datos.");
    }
  }

  // =====================================================
  // 6️⃣ MOSTRAR TICKET (Resto del código igual)
  // =====================================================
  function mostrarTicket(orden) {
    const modal = document.getElementById('modalTicket');
    document.getElementById('t-mesa').textContent = orden.mesa;
    document.getElementById('t-fecha').textContent = new Date().toLocaleString();
    document.getElementById('t-folio').textContent = orden.id;
    document.getElementById('t-total').textContent = parseFloat(orden.total).toFixed(2);
    
    // Opcional: mostrar método en ticket si tienes un elemento con id 't-metodo'
    const elMetodo = document.getElementById('t-metodo');
    if(elMetodo) elMetodo.textContent = (orden.metodo || 'Efectivo').toUpperCase();

    const tbody = document.getElementById('t-items');
    tbody.innerHTML = (orden.productos || [])
      .map(p => `<tr><td>${p}</td><td style="text-align:right;">—</td></tr>`)
      .join('');

    modal.showModal();
  }

  // =====================================================
  // 7️⃣ CONFIGURACIÓN DE MESAS Y QR MÓVIL
  // =====================================================
  window.guardarConfiguracionMesas = async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa')) || {};
    const n = parseInt(document.getElementById('inputNumMesas').value);
    if (isNaN(n) || n <= 0) return alert("Ingresa un número válido.");
    try {
      await db.from('restaurantes').update({ num_mesas: n }).eq('id', sesion.restaurante_id);
      alert("✅ Configuración guardada.");
      // Actualizamos localmente para ver el cambio rápido
      configRestaurante.num_mesas = n; 
      renderizarMesas();
    } catch (err) { console.error(err); alert("Error al guardar."); }
  };

  window.agregarPedido = (numMesa) => {
    window.location.href = `menu.html?mesa=Mesa ${numMesa}`;
  };

  window.generarQR = (mesaLabel) => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion?.restaurante_id) return alert("Error sesión.");
    const urlMesa = `${window.location.origin}/pedido.html?rid=${sesion.restaurante_id}&mesa=${encodeURIComponent(mesaLabel)}`;
    
    // Crear modal dinámico para el QR
    const modal = document.createElement('dialog');
    modal.innerHTML = `
      <article style="text-align:center;">
        <h3>📱 QR - ${mesaLabel}</h3>
        <div id="qrCanvas" style="margin:1rem auto;"></div>
        <p style="font-size:0.8rem; color:#555;">Escanea para pedir</p>
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