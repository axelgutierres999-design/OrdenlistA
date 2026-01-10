// js/menu.js - GESTIÓN INTEGRAL DE MENÚ Y PEDIDOS (v10.5 - Calculadora y Ticket Térmico)
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const mesaURL = params.get("mesa");
  const restauranteIdURL = params.get("rid");

  const sesion = JSON.parse(localStorage.getItem("sesion_activa")) || { rol: "invitado" };
  const restoIdActivo = restauranteIdURL || sesion.restaurante_id;

  const contenedorProductos = document.getElementById("contenedorProductos");
  const listaItemsOrden = document.getElementById("listaItemsOrden");
  const ordenTotalSpan = document.getElementById("ordenTotal");
  const btnProcesar = document.getElementById("btnProcesarOrden");
  const selectMesa = document.getElementById("selectMesa");
  const comentarioInput = document.getElementById("comentarioPedido");
  const inputBuscar = document.getElementById("buscarProducto");
  const filtroCategoria = document.getElementById("filtroCategoria");
  const btnLlevar = document.getElementById("btnParaLlevar");

  let ordenActual = [];
  let productosMenu = [];
  let productosFiltrados = [];
  let modoLlevar = false;

  // =====================================================
  // 1️⃣ INICIALIZACIÓN
  // =====================================================
  async function inicializar() {
    if (!restoIdActivo) return;
    await cargarMesas();
    await cargarDatosMenu();
    configurarFiltros();
    configurarBotonLlevar();
  }

  // =====================================================
  // 2️⃣ CARGA DE MESAS
  // =====================================================
  async function cargarMesas() {
    if (!selectMesa) return;
    selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
    try {
      const { data: resto } = await db
        .from("restaurantes")
        .select("num_mesas")
        .eq("id", restoIdActivo)
        .single();

      const numMesas = resto?.num_mesas || 10;
      for (let i = 1; i <= numMesas; i++) {
        const mStr = `Mesa ${i}`;
        const isSelected = mesaURL === mStr ? "selected" : "";
        selectMesa.innerHTML += `<option value="${mStr}" ${isSelected}>${mStr}</option>`;
      }
    } catch (e) {
      console.error("Error cargando mesas", e);
    }

    if (mesaURL) {
      selectMesa.value = mesaURL;
      selectMesa.disabled = true;
    }
  }

  // =====================================================
  // 3️⃣ CARGA DE PRODUCTOS
  // =====================================================
  async function cargarDatosMenu() {
    try {
      const { data: productos } = await db
        .from("productos")
        .select("*")
        .eq("restaurante_id", restoIdActivo);
      const { data: suministros } = await db
        .from("suministros")
        .select("nombre, cantidad")
        .eq("restaurante_id", restoIdActivo);

      if (productos) {
        productosMenu = productos.map((p) => {
          const insumo = suministros?.find(
            (s) => s.nombre.toLowerCase() === p.nombre.toLowerCase()
          );
          return {
            ...p,
            stock: insumo ? Math.floor(insumo.cantidad) : "∞",
          };
        });
        productosFiltrados = [...productosMenu];
        dibujarMenu();
      }
    } catch (err) {
      console.error("Error al cargar datos:", err);
    }
  }

  // =====================================================
  // 4️⃣ FILTROS Y UI
  // =====================================================
  function configurarFiltros() {
    if (inputBuscar) inputBuscar.addEventListener("input", aplicarFiltros);
    if (filtroCategoria) filtroCategoria.addEventListener("change", aplicarFiltros);
  }

  function aplicarFiltros() {
    const texto = (inputBuscar?.value || "").toLowerCase();
    const categoria = filtroCategoria?.value || "Todos";
    productosFiltrados = productosMenu.filter((p) => {
      const coincideTexto = p.nombre.toLowerCase().includes(texto);
      const coincideCat = categoria === "Todos" || p.categoria === categoria;
      return coincideTexto && coincideCat;
    });
    dibujarMenu();
  }

  function dibujarMenu() {
    if (!contenedorProductos) return;
    contenedorProductos.innerHTML = "";

    // Botón para agregar nuevo producto (Solo dueños/admins)
    if (["dueño", "administrador"].includes(sesion.rol)) {
      const btnNuevo = document.createElement("article");
      btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
      btnNuevo.innerHTML =
        '<div style="font-size:3rem; color:#10ad93;">+</div><p>Nuevo Platillo</p>';
      btnNuevo.onclick = () => abrirEditor(); // Asegúrate de tener esta función definida en otro lado si la usas
      contenedorProductos.appendChild(btnNuevo);
    }

    if (productosFiltrados.length === 0) {
      contenedorProductos.innerHTML += `<article><small>No hay productos para mostrar.</small></article>`;
      return;
    }

    productosFiltrados.forEach((p) => {
      const art = document.createElement("article");
      art.className = "tarjeta-producto";
      art.innerHTML = `
        <div class="img-container">
          <img src="${p.imagen_url || "https://via.placeholder.com/150"}" alt="${p.nombre}">
          ${
            ["dueño", "administrador"].includes(sesion.rol)
              ? `<button class="edit-btn" onclick="event.stopPropagation(); abrirEditor('${p.id}')">✏️</button>`
              : ""
          }
        </div>
        <div class="info">
          <h4>${p.nombre}</h4>
          <p class="precio">$${parseFloat(p.precio).toFixed(2)}</p>
          <small class="stock-tag ${p.stock <= 0 ? "sin-stock" : ""}">
            ${p.stock <= 0 ? "Agotado" : "Stock: " + p.stock}
          </small>
        </div>
      `;
      art.onclick = () => agregarItem(p);
      contenedorProductos.appendChild(art);
    });
  }

  // =====================================================
  // 5️⃣ CARRITO
  // =====================================================
  function agregarItem(producto) {
    if (producto.stock !== "∞" && producto.stock <= 0)
      return alert("Producto sin existencias");
    const existe = ordenActual.find((i) => i.id === producto.id);
    if (existe) existe.cantidad++;
    else ordenActual.push({ ...producto, cantidad: 1 });
    renderizarCarrito();
  }

  function renderizarCarrito() {
    if (!listaItemsOrden) return;
    if (ordenActual.length === 0) {
      listaItemsOrden.innerHTML = "<small>No hay productos.</small>";
      ordenTotalSpan.textContent = "$0.00";
      btnProcesar.disabled = true;
      return;
    }

    listaItemsOrden.innerHTML = ordenActual
      .map(
        (item) => `
      <div class="item-carrito">
        <div><strong>${item.cantidad}x</strong> ${item.nombre}</div>
        <div>
          <span>$${(item.precio * item.cantidad).toFixed(2)}</span>
          <button onclick="quitarUno('${item.id}')">✕</button>
        </div>
      </div>`
      )
      .join("");

    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
    btnProcesar.disabled = false;
  }

  window.quitarUno = (id) => {
    const item = ordenActual.find((i) => i.id === id);
    if (item.cantidad > 1) item.cantidad--;
    else ordenActual = ordenActual.filter((i) => i.id !== id);
    renderizarCarrito();
  };

  // =====================================================
  // 6️⃣ PARA LLEVAR
  // =====================================================
  function configurarBotonLlevar() {
    if (!btnLlevar) return;
    btnLlevar.addEventListener("click", () => {
      modoLlevar = !modoLlevar;
      btnLlevar.classList.toggle("activo", modoLlevar);
      btnLlevar.textContent = modoLlevar ? "✅ Para Llevar" : "🥡 Para Llevar";
      if (selectMesa) {
        selectMesa.disabled = modoLlevar;
        if (modoLlevar) selectMesa.value = "";
      }
    });
  }

  // =====================================================
  // 7️⃣ PROCESAR ORDEN
  // =====================================================
  btnProcesar.onclick = async () => {
    const mesaLabel = modoLlevar ? "Para Llevar" : selectMesa.value;
    if (!mesaLabel) return alert("Selecciona mesa o activa Para Llevar");
    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

    // Si es para llevar, mostramos la NUEVA calculadora
    if (modoLlevar) return mostrarCalculadoraPago(total);
    
    // Si es mesa, guardamos directo
    await guardarOrden(mesaLabel, total);
  };

  async function guardarOrden(mesaLabel, total, metodoPago = null) {
    try {
      // 1. Guardar Orden
      const { error } = await db.from("ordenes").insert([
        {
          restaurante_id: restoIdActivo,
          mesa: mesaLabel,
          productos: ordenActual.map((i) => `${i.cantidad}x ${i.nombre}`).join(", "),
          total,
          comentarios: comentarioInput.value || "",
          // Si ya se pagó (Para llevar), entra como 'pagado', si no 'pendiente'
          estado: metodoPago ? "pagado" : "pendiente",
        },
      ]);
      if (error) throw error;

      // 2. Si hubo pago, guardar Venta
      if (metodoPago) {
        await db.from("ventas").insert([
          {
            restaurante_id: restoIdActivo,
            mesa: mesaLabel,
            productos: ordenActual.map((i) => `${i.cantidad}x ${i.nombre}`).join(", "),
            total,
            metodo_pago: metodoPago,
          },
        ]);
      }

      // 3. Generar Ticket y Limpiar
      generarTicket(total, metodoPago || "Pendiente", mesaLabel);
      if(App && App.notifyUpdate) App.notifyUpdate();
      
      // Limpieza post-venta
      ordenActual = [];
      renderizarCarrito();
      if(comentarioInput) comentarioInput.value = "";
      
      alert("✅ Pedido procesado exitosamente!");
      
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  // =====================================================
  // 8️⃣ NUEVA CALCULADORA DE PAGO (Sustituye al modal viejo)
  // =====================================================
  function mostrarCalculadoraPago(total) {
    // Creamos el modal dinámicamente para no depender del HTML
    let modal = document.getElementById("modalCalculadora");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "modalCalculadora";
      modal.style = "border:none; border-radius:15px; padding:0; box-shadow:0 10px 40px rgba(0,0,0,0.3); overflow:hidden; max-width:400px; width:90%;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#10ad93; color:white; padding:20px; text-align:center;">
        <h3 style="margin:0;">Cobrar Pedido</h3>
        <p style="margin:5px 0 0 0; opacity:0.9;">Total a Pagar</p>
        <div style="font-size:2.5rem; font-weight:bold;">$${total.toFixed(2)}</div>
      </div>
      
      <div style="padding:20px; background:white;">
        <div style="display:flex; gap:10px; margin-bottom:20px;">
          <button id="btnModoEfectivo" style="flex:1; padding:10px; border:2px solid #10ad93; background:#10ad93; color:white; border-radius:8px; cursor:pointer;">💵 Efectivo</button>
          <button id="btnModoTarjeta" style="flex:1; padding:10px; border:2px solid #ddd; background:white; color:#555; border-radius:8px; cursor:pointer;">💳 Tarjeta</button>
        </div>

        <div id="panelCalcEfectivo">
           <label style="font-weight:bold; display:block; margin-bottom:5px;">Dinero Recibido:</label>
           <input type="number" id="inputRecibido" placeholder="0.00" style="width:100%; font-size:1.5rem; padding:10px; border:2px solid #ddd; border-radius:8px; box-sizing:border-box;">
           
           <div style="margin-top:15px; text-align:center;">
              <span style="color:#888;">Cambio a devolver:</span>
              <div id="txtCambio" style="font-size:1.8rem; font-weight:bold; color:#e74c3c;">$0.00</div>
           </div>
        </div>

        <div style="margin-top:20px; display:flex; gap:10px;">
          <button id="btnCancelarCalc" style="flex:1; background:#f1f1f1; color:#333; border:none; padding:12px; border-radius:8px; cursor:pointer;">Cancelar</button>
          <button id="btnConfirmarPago" disabled style="flex:2; background:#ccc; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:not-allowed;">CONFIRMAR</button>
        </div>
      </div>
    `;

    modal.showModal();

    // Referencias DOM dentro del modal
    const btnEfec = document.getElementById("btnModoEfectivo");
    const btnTarj = document.getElementById("btnModoTarjeta");
    const panelEfec = document.getElementById("panelCalcEfectivo");
    const inputRec = document.getElementById("inputRecibido");
    const txtCambio = document.getElementById("txtCambio");
    const btnConf = document.getElementById("btnConfirmarPago");
    const btnCanc = document.getElementById("btnCancelarCalc");

    let metodoSeleccionado = "Efectivo";

    // Lógica Cambio de Pestaña
    const setMetodo = (m) => {
      metodoSeleccionado = m;
      if (m === "Efectivo") {
        btnEfec.style.cssText = "flex:1; padding:10px; border:2px solid #10ad93; background:#10ad93; color:white; border-radius:8px; cursor:pointer;";
        btnTarj.style.cssText = "flex:1; padding:10px; border:2px solid #ddd; background:white; color:#555; border-radius:8px; cursor:pointer;";
        panelEfec.style.display = "block";
        validarEfectivo();
      } else {
        btnTarj.style.cssText = "flex:1; padding:10px; border:2px solid #10ad93; background:#10ad93; color:white; border-radius:8px; cursor:pointer;";
        btnEfec.style.cssText = "flex:1; padding:10px; border:2px solid #ddd; background:white; color:#555; border-radius:8px; cursor:pointer;";
        panelEfec.style.display = "none";
        // En tarjeta siempre se puede confirmar
        btnConf.disabled = false;
        btnConf.style.background = "#10ad93";
        btnConf.style.cursor = "pointer";
      }
    };

    btnEfec.onclick = () => setMetodo("Efectivo");
    btnTarj.onclick = () => setMetodo("Tarjeta");

    // Lógica Calculadora
    const validarEfectivo = () => {
      const recibido = parseFloat(inputRec.value) || 0;
      const cambio = recibido - total;
      
      if (recibido >= total) {
        txtCambio.textContent = `$${cambio.toFixed(2)}`;
        txtCambio.style.color = "#27ae60"; // Verde
        btnConf.disabled = false;
        btnConf.style.background = "#10ad93";
        btnConf.style.cursor = "pointer";
      } else {
        txtCambio.textContent = "Faltante";
        txtCambio.style.color = "#e74c3c"; // Rojo
        btnConf.disabled = true;
        btnConf.style.background = "#ccc";
        btnConf.style.cursor = "not-allowed";
      }
    };

    inputRec.addEventListener("input", validarEfectivo);

    // Acciones finales
    btnCanc.onclick = () => modal.close();
    btnConf.onclick = async () => {
      await guardarOrden("Para Llevar", total, metodoSeleccionado);
      modal.close();
    };
    
    // Auto-focus al input
    setTimeout(() => inputRec.focus(), 100);
  }

  // =====================================================
  // 9️⃣ TICKET TÉRMICO (Estilo recibo real)
  // =====================================================
  function generarTicket(total, metodo, mesa) {
    let modal = document.getElementById("modalTicketMenu");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "modalTicketMenu";
      // Estilos inline básicos para la vista previa
      modal.style = "padding:20px; border:none; box-shadow:0 10px 30px rgba(0,0,0,0.3); border-radius:10px; text-align:center;";
      document.body.appendChild(modal);
    }

    // Construimos el HTML del ticket
    const itemsHtml = ordenActual.map(item => `
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;">
            <span>${item.cantidad} x ${item.nombre}</span>
            <span>$${(item.cantidad * item.precio).toFixed(2)}</span>
        </div>
    `).join("");

    const ticketHTML = `
      <div id="areaImpresion" style="width: 280px; font-family: 'Courier New', monospace; text-align: left; background:white; color:black;">
         <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
            <h2 style="margin:0; font-size:16px; text-transform:uppercase;">Ticket de Venta</h2>
            <p style="margin:5px 0; font-size:12px;">${new Date().toLocaleString()}</p>
         </div>
         
         <div style="margin-bottom:10px; font-size:14px;">
            <strong>Mesa:</strong> ${mesa}<br>
            <strong>Método:</strong> ${metodo}
         </div>

         <div style="border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
            ${itemsHtml}
         </div>

         <div style="text-align:right; font-size:18px; font-weight:bold;">
            TOTAL: $${total.toFixed(2)}
         </div>
         <div style="text-align:center; margin-top:20px; font-size:12px;">
            ¡Gracias por su compra!
         </div>
      </div>
    `;

    modal.innerHTML = `
      <div>
        ${ticketHTML}
        <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
           <button id="btnImprimirReal" style="padding:10px 20px; background:#333; color:white; border:none; cursor:pointer;">🖨️ Imprimir</button>
           <button onclick="document.getElementById('modalTicketMenu').close()" style="padding:10px 20px; border:1px solid #333; background:white; cursor:pointer;">Cerrar</button>
        </div>
      </div>
    `;

    modal.showModal();

    // LÓGICA DE IMPRESIÓN MEJORADA
    document.getElementById("btnImprimirReal").onclick = () => {
        const contenido = document.getElementById("areaImpresion").innerHTML;
        // Abrimos ventana popup con dimensiones específicas de ticket
        const ventana = window.open('', 'PRINT', 'height=600,width=400');
        
        ventana.document.write(`
            <html>
            <head>
                <title>Ticket</title>
                <style>
                    /* Estilos EXCLUSIVOS para la impresión */
                    @media print {
                        @page { margin: 0; size: auto; }
                        body { margin: 0; padding: 10px; width: 100%; }
                        /* Ocultar encabezados/pies de página del navegador si es posible */
                    }
                    body { font-family: 'Courier New', monospace; }
                </style>
            </head>
            <body>
                ${contenido}
            </body>
            </html>
        `);
        
        ventana.document.close(); // Necesario para terminar la carga
        ventana.focus();
        
        // Esperar un poco a que carguen estilos y lanzar print
        setTimeout(() => {
            ventana.print();
            ventana.close();
        }, 500);
    };
  }

  inicializar();
});