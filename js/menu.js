// js/menu.js - GESTIÓN INTEGRAL DE MENÚ Y PEDIDOS (v10.6 - Con editor funcional)
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
  const modalEditar = document.getElementById("modalEditarMenu");
  const formProducto = document.getElementById("formProducto");
  const btnEliminarProd = document.getElementById("btnEliminarProd");

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
    configurarEditor();
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
  // 🧩 5️⃣ BLOQUE NUEVO: EDITOR DE PRODUCTOS
  // =====================================================
  window.abrirEditor = async (id = null) => {
    formProducto.reset();
    document.getElementById("imgPreview").src = "https://via.placeholder.com/150";
    document.getElementById("editId").value = id || "";
    btnEliminarProd.style.display = id ? "inline-block" : "none";

    if (id) {
      const prod = productosMenu.find((p) => p.id == id);
      if (prod) {
        document.getElementById("editNombre").value = prod.nombre;
        document.getElementById("editImg").value = prod.imagen_url || "";
        document.getElementById("editPrecio").value = prod.precio;
        document.getElementById("editCategoria").value = prod.categoria;
        document.getElementById("imgPreview").src =
          prod.imagen_url || "https://via.placeholder.com/150";
      }
    }

    modalEditar.showModal();
  };

  function configurarEditor() {
    if (!formProducto) return;

    // Guardar producto nuevo o editado
    formProducto.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById("editId").value;
      const nombre = document.getElementById("editNombre").value.trim();
      const precio = parseFloat(document.getElementById("editPrecio").value);
      const imagen_url = document.getElementById("editImg").value.trim();
      const categoria = document.getElementById("editCategoria").value;

      const productoData = {
        restaurante_id: restoIdActivo,
        nombre,
        precio,
        imagen_url,
        categoria,
      };

      try {
        if (id) {
          await db.from("productos").update(productoData).eq("id", id);
        } else {
          await db.from("productos").insert([productoData]);
        }
        alert("✅ Producto guardado correctamente.");
        modalEditar.close();
        await cargarDatosMenu();
      } catch (err) {
        alert("❌ Error al guardar producto: " + err.message);
      }
    };

    // Eliminar producto
    btnEliminarProd.onclick = async () => {
      const id = document.getElementById("editId").value;
      if (!id) return;
      if (!confirm("¿Eliminar este producto permanentemente?")) return;
      try {
        await db.from("productos").delete().eq("id", id);
        alert("🗑️ Producto eliminado.");
        modalEditar.close();
        await cargarDatosMenu();
      } catch (err) {
        alert("Error al eliminar: " + err.message);
      }
    };
  }

  // =====================================================
  // 6️⃣ CARRITO
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
  // 7️⃣ BOTÓN PARA LLEVAR
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

  inicializar();
});