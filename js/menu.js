// js/menu.js - GESTIÓN INTEGRAL DE MENÚ Y PEDIDOS (V9.5 - persistencia + cobro)
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
  const inputNumMesas = document.getElementById("numMesas");
  const btnGuardarMesas = document.getElementById("guardarMesas");

  let ordenActual = [];
  let productosMenu = [];
  let productosFiltrados = [];
  let modoLlevar = false;

  // =====================================================
  // 1️⃣ INICIALIZACIÓN
  // =====================================================
  async function inicializar() {
    if (!restoIdActivo) return;

    await cargarConfigMesas(); // cargar número real de mesas
    await cargarMesas();
    await cargarDatosMenu();
    configurarFiltros();
    configurarBotonLlevar();
  }

  // =====================================================
  // 2️⃣ CONFIG MESAS (PERSISTENCIA)
  // =====================================================
  async function cargarConfigMesas() {
    if (!inputNumMesas || !btnGuardarMesas) return;
    const { data, error } = await db
      .from("restaurantes")
      .select("num_mesas")
      .eq("id", restoIdActivo)
      .single();

    if (data) inputNumMesas.value = data.num_mesas || 10;

    btnGuardarMesas.onclick = async () => {
      const nuevo = parseInt(inputNumMesas.value);
      if (isNaN(nuevo) || nuevo < 1) return alert("Número inválido");
      const { error } = await db
        .from("restaurantes")
        .update({ num_mesas: nuevo })
        .eq("id", restoIdActivo);
      if (error) alert("Error al guardar");
      else alert("✅ Número de mesas actualizado correctamente");
    };
  }

  async function cargarMesas() {
    if (!selectMesa) return;
    selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
    try {
      const { data: resto } = await db
        .from("restaurantes")
        .select("num_mesas")
        .eq("id", restoIdActivo)
        .single();

      if (resto) {
        for (let i = 1; i <= resto.num_mesas; i++) {
          const mStr = `Mesa ${i}`;
          const isSelected = mesaURL === mStr ? "selected" : "";
          selectMesa.innerHTML += `<option value="${mStr}" ${isSelected}>${mStr}</option>`;
        }
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
  // 3️⃣ CARGA DE DATOS DE MENÚ
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
  // 4️⃣ FILTROS Y RENDERIZADO
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
  // 7️⃣ COBRO Y TICKET PARA LLEVAR
  // =====================================================
  btnProcesar.onclick = async () => {
    const mesaLabel = modoLlevar ? "Para Llevar" : selectMesa.value;
    if (!mesaLabel) return alert("Selecciona mesa o activa Para Llevar");
    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

    // Si es para llevar, abrimos modal de cobro
    if (modoLlevar) return mostrarModalPago(total);

    // Normal
    await guardarOrden(mesaLabel, total);
  };

  async function guardarOrden(mesaLabel, total) {
    try {
      await db.from("ordenes").insert([
        {
          restaurante_id: restoIdActivo,
          mesa: mesaLabel,
          productos: ordenActual.map((i) => `${i.cantidad}x ${i.nombre}`).join(", "),
          total,
          comentarios: comentarioInput.value || "",
          estado: "pendiente",
        },
      ]);
      alert("✅ Pedido enviado a cocina!");
      App?.notifyUpdate?.();
      window.location.href =
        sesion.rol === "invitado"
          ? `menu.html?rid=${restoIdActivo}`
          : "mesas.html";
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  function mostrarModalPago(total) {
    const modal = document.createElement("div");
    modal.id = "modalPago";
    modal.style = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.8);display:flex;align-items:center;
      justify-content:center;z-index:10000;
    `;
    modal.innerHTML = `
      <div style="background:white;padding:20px;border-radius:10px;max-width:400px;width:90%;">
        <h3>💰 Cobrar Pedido Para Llevar</h3>
        <p><strong>Total:</strong> $${total.toFixed(2)}</p>
        <button id="pagoEfectivo">💵 Efectivo</button>
        <button id="pagoTarjeta">💳 Tarjeta</button>
        <div id="panelEfectivo" style="display:none;margin-top:15px;">
          <label>Monto recibido:</label>
          <input id="montoRecibido" type="number" min="0" step="0.01" style="width:100%;">
          <p id="txtCambio"></p>
          <button id="confirmarEfectivo" disabled>Confirmar Cobro</button>
        </div>
        <button id="cerrarModal" style="margin-top:10px;">Cancelar</button>
      </div>
    `;
    document.body.appendChild(modal);

    const panel = modal.querySelector("#panelEfectivo");
    const inputMonto = modal.querySelector("#montoRecibido");
    const txtCambio = modal.querySelector("#txtCambio");
    const btnConfirmar = modal.querySelector("#confirmarEfectivo");

    modal.querySelector("#pagoEfectivo").onclick = () => {
      panel.style.display = "block";
    };
    modal.querySelector("#pagoTarjeta").onclick = async () => {
      await guardarOrden("Para Llevar", total);
      generarTicket(total, "Tarjeta");
      modal.remove();
    };
    modal.querySelector("#cerrarModal").onclick = () => modal.remove();

    inputMonto.oninput = () => {
      const recibido = parseFloat(inputMonto.value) || 0;
      const cambio = recibido - total;
      if (recibido >= total) {
        txtCambio.textContent = `Cambio: $${cambio.toFixed(2)}`;
        txtCambio.style.color = "green";
        btnConfirmar.disabled = false;
      } else {
        txtCambio.textContent = "Monto insuficiente";
        txtCambio.style.color = "red";
        btnConfirmar.disabled = true;
      }
    };

    btnConfirmar.onclick = async () => {
      await guardarOrden("Para Llevar", total);
      generarTicket(total, "Efectivo");
      modal.remove();
    };
  }

  function generarTicket(total, metodo) {
    const ticket = window.open("", "_blank");
    ticket.document.write(`
      <h2>OrdenLista</h2>
      <p><strong>Tipo:</strong> Para Llevar</p>
      <p><strong>Total:</strong> $${total.toFixed(2)}</p>
      <p><strong>Pago:</strong> ${metodo}</p>
      <p>${new Date().toLocaleString()}</p>
      <hr>
      <p>¡Gracias por su compra!</p>
    `);
    ticket.document.close();
  }

  // =====================================================
  // 8️⃣ EDITOR DE PRODUCTOS
  // =====================================================
  window.abrirEditor = (id = null) => {
    const modal = document.getElementById("modalEditarMenu");
    const form = document.getElementById("formProducto");
    form.reset();
    document.getElementById("editId").value = id || "";

    if (id) {
      const p = productosMenu.find((x) => x.id === id);
      if (p) {
        document.getElementById("editNombre").value = p.nombre;
        document.getElementById("editPrecio").value = p.precio;
        document.getElementById("editImg").value = p.imagen_url || "";
        document.getElementById("editCategoria").value = p.categoria || "General";
      }
    }
    modal.showModal();
  };

  const formProducto = document.getElementById("formProducto");
  if (formProducto) {
    formProducto.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById("editId").value;
      const nombre = document.getElementById("editNombre").value.trim();
      const precio = parseFloat(document.getElementById("editPrecio").value);

      const datos = {
        nombre,
        precio,
        imagen_url: document.getElementById("editImg").value || null,
        categoria: document.getElementById("editCategoria").value,
        restaurante_id: restoIdActivo,
      };

      try {
        const { error } = id
          ? await db.from("productos").update(datos).eq("id", id)
          : await db.from("productos").insert([datos]);
        if (error) throw error;
        document.getElementById("modalEditarMenu").close();
        cargarDatosMenu();
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
  }

  inicializar();
});