// js/menu.js - CORREGIDO (Validación de Elementos nulos)
document.addEventListener("DOMContentLoaded", async () => {
  // =====================================================
  // 0️⃣ VARIABLES Y SELECTORES
  // =====================================================
  const params = new URLSearchParams(window.location.search);
  const mesaURL = params.get("mesa");
  const restauranteIdURL = params.get("rid");

  const sesion = JSON.parse(localStorage.getItem("sesion_activa")) || { rol: "invitado" };
  const restoIdActivo = restauranteIdURL || sesion.restaurante_id;

  // Contenedores principales
  const contenedorProductos = document.getElementById("contenedorProductos");
  const listaItemsOrden = document.getElementById("listaItemsOrden");
  const ordenTotalSpan = document.getElementById("ordenTotal");
  const btnProcesar = document.getElementById("btnProcesarOrden");
  const selectMesa = document.getElementById("selectMesa");
  const comentarioInput = document.getElementById("comentarioPedido");
  const inputBuscar = document.getElementById("buscarProducto");
  const filtroCategoria = document.getElementById("filtroCategoria");
  const btnLlevar = document.getElementById("btnParaLlevar");

  // Elementos del Modal Editor (Pueden no existir en el HTML)
  const modalEditar = document.getElementById("modalEditarMenu");
  const formProducto = document.getElementById("formProducto");
  const btnEliminarProd = document.getElementById("btnEliminarProd");
  const imgPreview = document.getElementById("imgPreview");
  const inputUrlImg = document.getElementById("editImg");

  // Input de archivo oculto para la subida de imágenes
  const inputFile = document.createElement("input");
  inputFile.type = "file";
  inputFile.accept = "image/*";
  inputFile.style.display = "none";
  document.body.appendChild(inputFile);

  let ordenActual = [];
  let productosMenu = [];
  let productosFiltrados = [];
  let modoLlevar = false;

  // =====================================================
  // 1️⃣ INICIALIZACIÓN
  // =====================================================
  async function inicializar() {
    console.log("Iniciando Menu...");
    if (!restoIdActivo) return console.error("No hay ID de restaurante");
    
    await cargarMesas();
    await cargarDatosMenu();
    configurarFiltros();
    configurarBotonLlevar();
    configurarSubidaImagen(); 
    configurarEventosEditor(); // Nueva función segura
  }

  // =====================================================
  // 2️⃣ CARGA DE DATOS
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

  async function cargarDatosMenu() {
    try {
      // 1. Cargar Productos
      const { data: productos, error } = await db
        .from("productos")
        .select("*")
        .eq("restaurante_id", restoIdActivo);

      if (error) throw error;
      
      // 2. Cargar Suministros (para validar stock real)
      const { data: suministros } = await db
        .from("suministros")
        .select("nombre, cantidad")
        .eq("restaurante_id", restoIdActivo);

      if (productos) {
        productosMenu = productos.map((p) => {
          // Buscamos si existe un insumo con el mismo nombre para ver su stock real
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
      console.error("Error al cargar datos del menú:", err);
      if(contenedorProductos) contenedorProductos.innerHTML = `<p style="color:red">Error cargando menú: ${err.message}</p>`;
    }
  }

  // =====================================================
  // 3️⃣ RENDERIZADO DEL MENÚ
  // =====================================================
  function dibujarMenu() {
    if (!contenedorProductos) return;
    contenedorProductos.innerHTML = "";

    // BOTÓN DE NUEVO PRODUCTO (Solo Admins/Dueños)
    if (["dueño", "administrador"].includes(sesion.rol)) {
      const btnNuevo = document.createElement("article");
      btnNuevo.className = "tarjeta-producto";
      btnNuevo.style.border = "2px dashed #10ad93";
      btnNuevo.style.justifyContent = "center";
      btnNuevo.style.cursor = "pointer";
      btnNuevo.innerHTML = `
        <div style="font-size:3rem; color:#10ad93;">+</div>
        <p style="margin:0; font-weight:bold; color:#10ad93;">Nuevo Platillo</p>
      `;
      btnNuevo.onclick = () => window.abrirEditor(); 
      contenedorProductos.appendChild(btnNuevo);
    }

    if (productosFiltrados.length === 0 && !["dueño", "administrador"].includes(sesion.rol)) {
      contenedorProductos.innerHTML = `<article><small>No hay productos disponibles.</small></article>`;
      return;
    }

    productosFiltrados.forEach((p) => {
      const art = document.createElement("article");
      art.className = "tarjeta-producto";
      art.innerHTML = `
        <div class="img-container" style="position:relative;">
          <img src="${p.imagen_url || "https://via.placeholder.com/150"}" alt="${p.nombre}" onerror="this.src='https://via.placeholder.com/150'">
          ${
            ["dueño", "administrador"].includes(sesion.rol)
              ? `<button class="edit-btn" onclick="event.stopPropagation(); window.abrirEditor('${p.id}')">✏️</button>`
              : ""
          }
        </div>
        <div class="info">
          <h4>${p.nombre}</h4>
          <p class="precio">$${parseFloat(p.precio).toFixed(2)}</p>
          <small class="stock-tag ${p.stock !== "∞" && p.stock <= 0 ? "sin-stock" : ""}">
            ${p.stock !== "∞" && p.stock <= 0 ? "Agotado" : "Stock: " + p.stock}
          </small>
        </div>
      `;
      art.onclick = () => agregarItem(p);
      contenedorProductos.appendChild(art);
    });
  }

  // =====================================================
  // 4️⃣ LÓGICA DE CARRITO Y PEDIDOS
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
      if(btnProcesar) btnProcesar.disabled = true;
      return;
    }

    listaItemsOrden.innerHTML = ordenActual
      .map(
        (item) => `
      <div class="item-carrito">
        <div><strong>${item.cantidad}x</strong> ${item.nombre}</div>
        <div>
          <span>$${(item.precio * item.cantidad).toFixed(2)}</span>
          <button style="background:none; border:none; color:red; cursor:pointer;" onclick="window.quitarUno('${item.id}')">✕</button>
        </div>
      </div>`
      )
      .join("");

    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
    if(btnProcesar) btnProcesar.disabled = false;
  }

  window.quitarUno = (id) => {
    const item = ordenActual.find((i) => i.id === id);
    if (item.cantidad > 1) item.cantidad--;
    else ordenActual = ordenActual.filter((i) => i.id !== id);
    renderizarCarrito();
  };

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

  function configurarBotonLlevar() {
    if (!btnLlevar) return;
    btnLlevar.addEventListener("click", () => {
      modoLlevar = !modoLlevar;
      btnLlevar.classList.toggle("activo", modoLlevar);
      btnLlevar.textContent = modoLlevar ? "✅ Para Llevar" : "🥡 Para Llevar";
      const alerta = document.getElementById("alertaLlevar");
      if(alerta) alerta.classList.toggle("mostrar", modoLlevar);
      if (selectMesa) {
        selectMesa.disabled = modoLlevar;
        if (modoLlevar) selectMesa.value = "";
      }
    });
  }

  if (btnProcesar) {
      btnProcesar.onclick = async () => {
        const mesaLabel = modoLlevar ? "Para Llevar" : selectMesa?.value;
        if (!mesaLabel) return alert("Selecciona mesa o activa Para Llevar");
        const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

        if (modoLlevar) return mostrarCalculadoraPago(total);
        await guardarOrden(mesaLabel, total);
      };
  }

  async function guardarOrden(mesaLabel, total, metodoPago = null) {
    try {
      const { error } = await db.from("ordenes").insert([
        {
          restaurante_id: restoIdActivo,
          mesa: mesaLabel,
          productos: ordenActual.map((i) => `${i.cantidad}x ${i.nombre}`).join(", "),
          total,
          comentarios: comentarioInput?.value || "",
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
      if(typeof App !== 'undefined' && App.notifyUpdate) App.notifyUpdate();
      
      ordenActual = [];
      renderizarCarrito();
      if(comentarioInput) comentarioInput.value = "";
      alert("✅ Pedido procesado exitosamente!");
      
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  // =====================================================
  // 5️⃣ EDITOR DE PRODUCTOS (CORREGIDO Y SEGURO)
  // =====================================================

  function configurarSubidaImagen() {
    if(!imgPreview) return; // Si no existe el preview, salimos para no dar error

    imgPreview.style.cursor = "pointer";
    imgPreview.title = "Click para cambiar imagen";
    imgPreview.onclick = () => inputFile.click();

    inputFile.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 500000) return alert("⚠️ Imagen muy pesada (Máx 500KB)");

        const reader = new FileReader();
        reader.onload = (evt) => {
            if(inputUrlImg) inputUrlImg.value = evt.target.result;
            if(imgPreview) imgPreview.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    };
  }

  function configurarEventosEditor() {
    // Si el formulario no existe (porque falta el HTML), no hacemos nada
    if (!formProducto) return;

    formProducto.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById("editId").value;
        const datos = {
        restaurante_id: restoIdActivo,
        nombre: document.getElementById("editNombre").value,
        precio: parseFloat(document.getElementById("editPrecio").value),
        imagen_url: inputUrlImg ? inputUrlImg.value : "",
        categoria: document.getElementById("editCategoria").value
        };

        try {
        if (id) {
            const { error } = await db.from("productos").update(datos).eq("id", id);
            if (error) throw error;
        } else {
            const { error } = await db.from("productos").insert([datos]);
            if (error) throw error;
        }
        
        alert("✅ Menú actualizado");
        if(modalEditar) modalEditar.close();
        cargarDatosMenu(); 
        } catch (err) {
        alert("Error al guardar: " + err.message);
        }
    };

    if (btnEliminarProd) {
        btnEliminarProd.onclick = async () => {
            const id = document.getElementById("editId").value;
            if (!id || !confirm("¿Estás seguro de eliminar este platillo?")) return;

            try {
            const { error } = await db.from("productos").delete().eq("id", id);
            if (error) throw error;
            if(modalEditar) modalEditar.close();
            cargarDatosMenu();
            } catch (err) {
            alert("Error al eliminar: " + err.message);
            }
        };
    }
  }

  window.abrirEditor = async (id = null) => {
    if(!modalEditar) return alert("Error: Falta el HTML del modal editor en menu.html");

    if(formProducto) formProducto.reset();
    const inputId = document.getElementById("editId");
    if(inputId) inputId.value = id || "";
    
    if(imgPreview) imgPreview.src = "https://via.placeholder.com/150";
    
    if (id) {
      const prod = productosMenu.find(p => p.id === id);
      if (prod) {
        if(document.getElementById("editNombre")) document.getElementById("editNombre").value = prod.nombre;
        if(document.getElementById("editPrecio")) document.getElementById("editPrecio").value = prod.precio;
        if(inputUrlImg) inputUrlImg.value = prod.imagen_url || "";
        if(document.getElementById("editCategoria")) document.getElementById("editCategoria").value = prod.categoria;
        if (prod.imagen_url && imgPreview) imgPreview.src = prod.imagen_url;
        if(btnEliminarProd) btnEliminarProd.style.display = "block";
      }
    } else {
      if(btnEliminarProd) btnEliminarProd.style.display = "none";
    }
    
    modalEditar.showModal();
  };

  // Función para cerrar modal desde HTML
  window.cerrarEditor = () => {
      if(modalEditar) modalEditar.close();
  };

  // =====================================================
  // 6️⃣ HERRAMIENTAS DE PAGO
  // =====================================================
  function mostrarCalculadoraPago(total) {
    let modal = document.getElementById("modalCalculadora");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "modalCalculadora";
      modal.style = "border:none; border-radius:15px; padding:0; box-shadow:0 10px 40px rgba(0,0,0,0.3); overflow:hidden; max-width:400px; width:90%; z-index:9999;";
      document.body.appendChild(modal);
    }
    // ... Contenido del modal calculadora ...
    modal.innerHTML = `
      <div style="background:#10ad93; color:white; padding:20px; text-align:center;">
        <h3 style="margin:0;">Cobrar Pedido</h3>
        <p style="margin:5px 0 0 0; opacity:0.9;">Total a Pagar</p>
        <div style="font-size:2.5rem; font-weight:bold;">$${total.toFixed(2)}</div>
      </div>
      <div style="padding:20px; background:white;">
        <div style="display:flex; gap:10px; margin-bottom:20px;">
          <button id="btnModoEfectivo" style="flex:1; padding:10px; border:2px solid #10ad93; background:#10ad93; color:white; border-radius:8px;">💵 Efectivo</button>
          <button id="btnModoTarjeta" style="flex:1; padding:10px; border:2px solid #ddd; background:white; color:#555; border-radius:8px;">💳 Tarjeta</button>
        </div>
        <div id="panelCalcEfectivo">
           <label style="font-weight:bold; display:block; margin-bottom:5px;">Dinero Recibido:</label>
           <input type="number" id="inputRecibido" placeholder="0.00" style="width:100%; font-size:1.5rem; padding:10px; border:2px solid #ddd; border-radius:8px;">
           <div style="margin-top:15px; text-align:center;">
              <span style="color:#888;">Cambio a devolver:</span>
              <div id="txtCambio" style="font-size:1.8rem; font-weight:bold; color:#e74c3c;">$0.00</div>
           </div>
        </div>
        <div style="margin-top:20px; display:flex; gap:10px;">
          <button id="btnCancelarCalc" style="flex:1; background:#f1f1f1; border:none; padding:12px; border-radius:8px;">Cancelar</button>
          <button id="btnConfirmarPago" disabled style="flex:2; background:#ccc; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold;">CONFIRMAR</button>
        </div>
      </div>
    `;
    modal.showModal();
    // ... Logica interna calculadora ...
    const btnEfec = modal.querySelector("#btnModoEfectivo");
    const btnTarj = modal.querySelector("#btnModoTarjeta");
    const panelEfec = modal.querySelector("#panelCalcEfectivo");
    const inputRec = modal.querySelector("#inputRecibido");
    const txtCambio = modal.querySelector("#txtCambio");
    const btnConf = modal.querySelector("#btnConfirmarPago");
    let metodo = "Efectivo";

    const setMetodo = (m) => {
      metodo = m;
      if (m === "Efectivo") {
        btnEfec.style.background = "#10ad93"; btnEfec.style.color = "white"; btnEfec.style.borderColor = "#10ad93";
        btnTarj.style.background = "white"; btnTarj.style.color = "#555"; btnTarj.style.borderColor = "#ddd";
        panelEfec.style.display = "block";
        validar();
      } else {
        btnTarj.style.background = "#10ad93"; btnTarj.style.color = "white"; btnTarj.style.borderColor = "#10ad93";
        btnEfec.style.background = "white"; btnEfec.style.color = "#555"; btnEfec.style.borderColor = "#ddd";
        panelEfec.style.display = "none";
        btnConf.disabled = false; btnConf.style.background = "#10ad93";
      }
    };

    const validar = () => {
      const rec = parseFloat(inputRec.value) || 0;
      const cambio = rec - total;
      if (rec >= total) {
        txtCambio.textContent = `$${cambio.toFixed(2)}`;
        txtCambio.style.color = "#27ae60";
        btnConf.disabled = false; btnConf.style.background = "#10ad93";
      } else {
        txtCambio.textContent = "Faltante";
        txtCambio.style.color = "#e74c3c";
        btnConf.disabled = true; btnConf.style.background = "#ccc";
      }
    };

    btnEfec.onclick = () => setMetodo("Efectivo");
    btnTarj.onclick = () => setMetodo("Tarjeta");
    inputRec.addEventListener("input", validar);
    modal.querySelector("#btnCancelarCalc").onclick = () => modal.close();
    btnConf.onclick = async () => {
      await guardarOrden("Para Llevar", total, metodo);
      modal.close();
    };
  }

  function generarTicket(total, metodo, mesa) {
    let modal = document.getElementById("modalTicketMenu");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "modalTicketMenu";
      modal.style = "padding:20px; border:none; border-radius:10px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.3); z-index:10000;";
      document.body.appendChild(modal);
    }
    // ... Contenido Ticket ...
    const itemsHtml = ordenActual.map(item => `
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;">
            <span>${item.cantidad} x ${item.nombre}</span>
            <span>$${(item.cantidad * item.precio).toFixed(2)}</span>
        </div>
    `).join("");

    modal.innerHTML = `
      <div>
        <div id="areaImpresion" style="width: 280px; font-family: 'Courier New', monospace; text-align: left; background:white; color:black;">
            <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
                <h2 style="margin:0; font-size:16px;">Ticket de Venta</h2>
                <p style="margin:5px 0; font-size:12px;">${new Date().toLocaleString()}</p>
            </div>
            <div style="margin-bottom:10px; font-size:14px;">
                <strong>Mesa:</strong> ${mesa}<br><strong>Método:</strong> ${metodo}
            </div>
            <div style="border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">${itemsHtml}</div>
            <div style="text-align:right; font-size:18px; font-weight:bold;">TOTAL: $${total.toFixed(2)}</div>
            <div style="text-align:center; margin-top:20px; font-size:12px;">¡Gracias por su compra!</div>
        </div>
        <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
           <button id="btnImprimirReal" style="padding:10px 20px; background:#333; color:white; border:none; cursor:pointer;">🖨️ Imprimir</button>
           <button onclick="document.getElementById('modalTicketMenu').close()" style="padding:10px 20px; border:1px solid #333; background:white; cursor:pointer;">Cerrar</button>
        </div>
      </div>
    `;
    modal.showModal();

    modal.querySelector("#btnImprimirReal").onclick = () => {
        const contenido = document.getElementById("areaImpresion").innerHTML;
        const ventana = window.open('', 'PRINT', 'height=600,width=400');
        ventana.document.write(`<html><head><title>Ticket</title><style>@media print { body { margin: 0; padding: 10px; } }</style></head><body>${contenido}</body></html>`);
        ventana.document.close();
        ventana.focus();
        setTimeout(() => { ventana.print(); ventana.close(); }, 500);
    };
  }

  inicializar();
});