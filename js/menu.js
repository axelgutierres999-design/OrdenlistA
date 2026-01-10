// js/menu.js - GESTIÓN INTEGRAL DE MENÚ Y PEDIDOS (v10.6 - con Editor Integrado)
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
  // 7️⃣ PROCESAR ORDEN
  // =====================================================
  btnProcesar.onclick = async () => {
    const mesaLabel = modoLlevar ? "Para Llevar" : selectMesa.value;
    if (!mesaLabel) return alert("Selecciona mesa o activa Para Llevar");
    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

    if (modoLlevar) return mostrarCalculadoraPago(total);
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
          estado: metodoPago ? "pagado" : "pendiente",
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
      if (App && App.notifyUpdate) App.notifyUpdate();

      ordenActual = [];
      renderizarCarrito();
      if (comentarioInput) comentarioInput.value = "";
      alert("✅ Pedido procesado exitosamente!");
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  // =====================================================
  // 🔧 EDITOR DE PRODUCTOS (CREAR / EDITAR PLATILLOS)
  // =====================================================
  window.abrirEditor = async (id = null) => {
    let producto = { nombre: "", precio: "", categoria: "", imagen_url: "" };

    if (id) {
      const { data } = await db.from("productos").select("*").eq("id", id).single();
      if (data) producto = data;
    }

    let modal = document.getElementById("modalProducto");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "modalProducto";
      modal.style = "border:none; border-radius:10px; padding:20px; max-width:400px; width:90%;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <h3 style="margin-top:0;">${id ? "Editar Platillo" : "Nuevo Platillo"}</h3>
      <label>Nombre:</label>
      <input type="text" id="prodNombre" value="${producto.nombre || ""}" />
      
      <label>Precio:</label>
      <input type="number" id="prodPrecio" value="${producto.precio || ""}" />
      
      <label>Categoría:</label>
      <select id="prodCategoria">
        <option value="Platillo" ${producto.categoria === "Platillo" ? "selected" : ""}>Platillo</option>
        <option value="Bebidas" ${producto.categoria === "Bebidas" ? "selected" : ""}>Bebida</option>
        <option value="Postres" ${producto.categoria === "Postres" ? "selected" : ""}>Postre</option>
      </select>
      
      <label>Imagen URL:</label>
      <input type="text" id="prodImagen" value="${producto.imagen_url || ""}" placeholder="https://..." />
      
      <div style="display:flex; gap:10px; margin-top:20px; justify-content:center;">
        <button id="btnCancelarProd" style="flex:1;">Cancelar</button>
        <button id="btnGuardarProd" style="flex:1; background:#10ad93; color:white; border:none;">Guardar</button>
      </div>
    `;

    modal.showModal();

    document.getElementById("btnCancelarProd").onclick = () => modal.close();

    document.getElementById("btnGuardarProd").onclick = async () => {
      const nuevo = {
        restaurante_id: restoIdActivo,
        nombre: document.getElementById("prodNombre").value.trim(),
        precio: parseFloat(document.getElementById("prodPrecio").value) || 0,
        categoria: document.getElementById("prodCategoria").value,
        imagen_url: document.getElementById("prodImagen").value.trim(),
      };

      if (!nuevo.nombre || !nuevo.precio) return alert("Completa nombre y precio");

      try {
        if (id) {
          await db.from("productos").update(nuevo).eq("id", id);
          alert("✅ Producto actualizado");
        } else {
          await db.from("productos").insert([nuevo]);
          alert("✅ Nuevo platillo agregado");
        }
        modal.close();
        await cargarDatosMenu();
      } catch (e) {
        alert("Error guardando producto: " + e.message);
      }
    };
  };

  inicializar();
});