// js/menu.js - GESTIÓN INTEGRAL DE MENÚ Y PEDIDOS (v10.4 - integración visual de cobro)
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
  // 4️⃣ FILTROS
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

    if (["dueño", "administrador"].includes(sesion.rol)) {
      const btnNuevo = document.createElement("article");
      btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
      btnNuevo.innerHTML =
        '<div style="font-size:3rem; color:#10ad93;">+</div><p>Nuevo Platillo</p>';
      btnNuevo.onclick = () => abrirEditor();
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
  // 7️⃣ GUARDAR PEDIDO / COBRO + TICKET
  // =====================================================
  btnProcesar.onclick = async () => {
    const mesaLabel = modoLlevar ? "Para Llevar" : selectMesa.value;
    if (!mesaLabel) return alert("Selecciona mesa o activa Para Llevar");
    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

    if (modoLlevar) return mostrarModalPago(total);
    await guardarOrden(mesaLabel, total);
  };

  async function guardarOrden(mesaLabel, total, metodoPago = null) {
    try {
      const { error } = await db.from("ordenes").insert([
        {
          restaurante_id: restoIdActivo,
          mesa: mesaLabel,
          productos: ordenActual.map((i) => `${i.cantidad}x ${i.nombre}`).join(", "),
          total,
          comentarios: comentarioInput.value || "",
          estado: "pendiente",
        },
      ]);
      if (error) throw error;

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

      generarTicket(total, metodoPago || "Pendiente", mesaLabel);
      App?.notifyUpdate?.();
      alert("✅ Pedido enviado a cocina!");
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  // =====================================================
  // 8️⃣ MODAL DE COBRO (Para Llevar) — AHORA VISUAL UNIFICADO
  // =====================================================
  function mostrarModalPago(total) {
    const modal = document.getElementById("modalCobro");
    if (!modal) return alert("Modal de cobro no encontrado.");

    const totalLabel = document.getElementById("montoTotalModal");
    totalLabel.textContent = `$${total.toFixed(2)}`;

    modal.showModal();

    const btnEfectivo = document.getElementById("btnCobroEfectivo");
    const btnTarjeta = document.getElementById("btnCobroTarjeta");
    const btnCancelar = document.getElementById("cancelarCobro");

    btnEfectivo.onclick = async () => {
      await guardarOrden("Para Llevar", total, "Efectivo");
      modal.close();
    };
    btnTarjeta.onclick = async () => {
      await guardarOrden("Para Llevar", total, "Tarjeta");
      modal.close();
    };
    btnCancelar.onclick = () => modal.close();
  }

  // =====================================================
  // 9️⃣ GENERAR TICKET EN MODAL
  // =====================================================
  function generarTicket(total, metodo, mesa) {
    let modal = document.getElementById("modalTicketMenu");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "modalTicketMenu";
      modal.innerHTML = `
        <article style="text-align:center; max-width:400px;">
          <h3>🧾 Ticket del Pedido</h3>
          <div id="ticketContenidoMenu" style="text-align:left; font-family:monospace; margin:1rem 0;"></div>
          <footer style="display:flex; gap:10px; justify-content:center;">
            <button id="btnImprimirTicketMenu">🖨️ Imprimir</button>
            <button onclick="document.getElementById('modalTicketMenu').close()">Cerrar</button>
          </footer>
        </article>`;
      document.body.appendChild(modal);

      document.getElementById("btnImprimirTicketMenu").onclick = () => {
        const contenido = document.getElementById("ticketContenidoMenu").innerHTML;
        const ventana = window.open('', '_blank');
        ventana.document.write(`<html><body>${contenido}</body></html>`);
        ventana.print();
        ventana.close();
      };
    }

    document.getElementById("ticketContenidoMenu").innerHTML = `
      <p><strong>Mesa:</strong> ${mesa}</p>
      <p><strong>Total:</strong> $${total.toFixed(2)}</p>
      <p><strong>Método:</strong> ${metodo}</p>
      <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
      <hr>
      <p>¡Gracias por su compra!</p>
    `;
    modal.showModal();
  }

  inicializar();
});