// js/menu.js - GESTIÓN INTEGRAL DE MENÚ Y PEDIDOS (v10.6 - Fix botón Nuevo Platillo)
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

  // =====================================================
  // 4.1️⃣ FUNCIÓN NUEVO PLATILLO (corregida)
  // =====================================================
  function abrirEditor(id = null) {
    // Si no existe modal, crear uno dinámico
    let modal = document.getElementById("modalNuevoPlatillo");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "modalNuevoPlatillo";
      modal.style =
        "border:none; border-radius:10px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,0.3); width:90%; max-width:400px;";
      document.body.appendChild(modal);
    }

    const producto = id ? productosMenu.find((p) => p.id == id) : null;

    modal.innerHTML = `
      <h3 style="margin-top:0;">${id ? "Editar" : "Nuevo"} Platillo</h3>
      <label>Nombre:</label>
      <input id="platilloNombre" value="${producto?.nombre || ""}" style="width:100%; margin-bottom:10px; padding:8px;">
      <label>Precio:</label>
      <input type="number" id="platilloPrecio" value="${producto?.precio || ""}" style="width:100%; margin-bottom:10px; padding:8px;">
      <label>Imagen URL:</label>
      <input id="platilloImg" value="${producto?.imagen_url || ""}" style="width:100%; margin-bottom:10px; padding:8px;">
      <label>Categoría:</label>
      <input id="platilloCat" value="${producto?.categoria || "Platillo"}" style="width:100%; margin-bottom:10px; padding:8px;">

      <div style="margin-top:15px; display:flex; gap:10px; justify-content:end;">
        <button id="cancelarPlatillo" style="background:#ccc; border:none; padding:8px 15px; border-radius:6px;">Cancelar</button>
        <button id="guardarPlatillo" style="background:#10ad93; color:white; border:none; padding:8px 15px; border-radius:6px;">Guardar</button>
      </div>
    `;

    modal.showModal();

    document.getElementById("cancelarPlatillo").onclick = () => modal.close();

    document.getElementById("guardarPlatillo").onclick = async () => {
      const nombre = document.getElementById("platilloNombre").value.trim();
      const precio = parseFloat(document.getElementById("platilloPrecio").value);
      const imagen = document.getElementById("platilloImg").value.trim();
      const cat = document.getElementById("platilloCat").value.trim() || "Platillo";

      if (!nombre || isNaN(precio)) return alert("Complete los campos requeridos");

      const nuevo = {
        nombre,
        precio,
        imagen_url: imagen,
        categoria: cat,
        restaurante_id: restoIdActivo,
      };

      try {
        if (id) {
          await db.from("productos").update(nuevo).eq("id", id);
        } else {
          await db.from("productos").insert([nuevo]);
        }
        modal.close();
        await cargarDatosMenu();
        alert("✅ Platillo guardado correctamente");
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
  }

  // =====================================================
  // 5️⃣ DIBUJAR MENÚ (con botón funcional)
  // =====================================================
  function dibujarMenu() {
    if (!contenedorProductos) return;
    contenedorProductos.innerHTML = "";

    // Botón "＋ Nuevo Platillo"
    if (["dueño", "administrador"].includes(sesion.rol)) {
      const btnNuevo = document.createElement("article");
      btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
      btnNuevo.innerHTML =
        '<div style="font-size:3rem; color:#10ad93;">＋</div><p>Nuevo Platillo</p>';
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
  // 6️⃣ CARRITO, PAGO, TICKET (SIN CAMBIOS)
  // =====================================================
  // ⚠️ Mantengo todo igual de tu versión v10.5
  // Desde aquí no se altera ninguna función
  // =====================================================

  // (Tu código desde la función agregarItem() hasta generarTicket() se mantiene idéntico)
  // =====================================================

  inicializar();
});