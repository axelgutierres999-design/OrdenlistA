// js/menu.js - CORREGIDO: Lógica de Estados (QR vs Staff/Llevar)
document.addEventListener("DOMContentLoaded", async () => {
  // =====================================================
  // 0️⃣ VARIABLES Y SELECTORES
  // =====================================================
  const params = new URLSearchParams(window.location.search);
  const mesaURL = params.get("mesa"); // Detecta si viene de un QR
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
  const imgPreview = document.getElementById("imgPreview");
  const inputUrlImg = document.getElementById("editImg");

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
    if (!restoIdActivo) return;
    await cargarMesas();
    await cargarDatosMenu();
    configurarFiltros();
    configurarBotonLlevar();
    configurarSubidaImagen(); 
    configurarEventosEditor();
  }

  // =====================================================
  // 2️⃣ CARGA DE DATOS
  // =====================================================
  async function cargarMesas() {
    if (!selectMesa) return;
    selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
    try {
      const { data: resto } = await db.from("restaurantes").select("num_mesas").eq("id", restoIdActivo).single();
      const numMesas = resto?.num_mesas || 10;
      for (let i = 1; i <= numMesas; i++) {
        const mStr = `Mesa ${i}`;
        const isSelected = mesaURL === mStr ? "selected" : "";
        selectMesa.innerHTML += `<option value="${mStr}" ${isSelected}>${mStr}</option>`;
      }
    } catch (e) { console.error(e); }
    if (mesaURL) { selectMesa.value = mesaURL; selectMesa.disabled = true; }
  }

  async function cargarDatosMenu() {
    try {
      const { data: productos } = await db.from("productos").select("*").eq("restaurante_id", restoIdActivo);
      const { data: suministros } = await db.from("suministros").select("nombre, cantidad").eq("restaurante_id", restoIdActivo);

      if (productos) {
        productosMenu = productos.map((p) => {
          const insumo = suministros?.find(s => s.nombre.toLowerCase() === p.nombre.toLowerCase());
          return { ...p, stock: insumo ? Math.floor(insumo.cantidad) : "∞" };
        });
        productosFiltrados = [...productosMenu];
        dibujarMenu();
      }
    } catch (err) { console.error(err); }
  }

  function dibujarMenu() {
    if (!contenedorProductos) return;
    contenedorProductos.innerHTML = "";

    if (["dueño", "administrador"].includes(sesion.rol)) {
      const btnNuevo = document.createElement("article");
      btnNuevo.className = "tarjeta-producto";
      btnNuevo.style.border = "2px dashed #10ad93";
      btnNuevo.style.justifyContent = "center";
      btnNuevo.innerHTML = `<div style="font-size:3rem; color:#10ad93;">+</div><p style="font-weight:bold; color:#10ad93;">Nuevo Platillo</p>`;
      btnNuevo.onclick = () => window.abrirEditor(); 
      contenedorProductos.appendChild(btnNuevo);
    }

    productosFiltrados.forEach((p) => {
      const art = document.createElement("article");
      art.className = "tarjeta-producto";
      art.innerHTML = `
        <div class="img-container" style="position:relative;">
          <img src="${p.imagen_url || "https://via.placeholder.com/150"}" onerror="this.src='https://via.placeholder.com/150'">
          ${["dueño", "administrador"].includes(sesion.rol) ? `<button class="edit-btn" onclick="event.stopPropagation(); window.abrirEditor('${p.id}')">✏️</button>` : ""}
        </div>
        <div class="info">
          <h4>${p.nombre}</h4>
          <p class="precio">$${parseFloat(p.precio).toFixed(2)}</p>
          <small class="stock-tag ${p.stock !== "∞" && p.stock <= 0 ? "sin-stock" : ""}">
            ${p.stock !== "∞" && p.stock <= 0 ? "Agotado" : "Stock: " + p.stock}
          </small>
        </div>`;
      art.onclick = () => agregarItem(p);
      contenedorProductos.appendChild(art);
    });
  }

  // =====================================================
  // 3️⃣ LÓGICA DE PEDIDOS
  // =====================================================
  function agregarItem(producto) {
    if (producto.stock !== "∞" && producto.stock <= 0) return alert("Producto sin existencias");
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
    listaItemsOrden.innerHTML = ordenActual.map(item => `
      <div class="item-carrito">
        <div><strong>${item.cantidad}x</strong> ${item.nombre}</div>
        <div><span>$${(item.precio * item.cantidad).toFixed(2)}</span>
        <button style="background:none; border:none; color:red; cursor:pointer;" onclick="window.quitarUno('${item.id}')">✕</button></div>
      </div>`).join("");
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

  function aplicarFiltros() {
    const texto = (inputBuscar?.value || "").toLowerCase();
    const categoria = filtroCategoria?.value || "Todos";
    productosFiltrados = productosMenu.filter((p) => {
      const coincideTexto = p.nombre.toLowerCase().includes(texto);
      return coincideTexto && (categoria === "Todos" || p.categoria === categoria);
    });
    dibujarMenu();
  }

  function configurarFiltros() {
    inputBuscar?.addEventListener("input", aplicarFiltros);
    filtroCategoria?.addEventListener("change", aplicarFiltros);
  }

  function configurarBotonLlevar() {
    btnLlevar?.addEventListener("click", () => {
      modoLlevar = !modoLlevar;
      btnLlevar.classList.toggle("activo", modoLlevar);
      btnLlevar.innerHTML = modoLlevar ? "✅ Para Llevar" : "🥡 Para Llevar";
      document.getElementById("alertaLlevar")?.classList.toggle("mostrar", modoLlevar);
      if (selectMesa) { selectMesa.disabled = modoLlevar; if (modoLlevar) selectMesa.value = ""; }
    });
  }

  btnProcesar.onclick = async () => {
    const mesaLabel = modoLlevar ? "Para Llevar" : selectMesa?.value;
    if (!mesaLabel) return alert("Selecciona mesa o activa Para Llevar");
    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    if (modoLlevar) mostrarCalculadoraPago(total);
    else await guardarOrden(mesaLabel, total);
  };

  // 🔴 AQUÍ ESTÁ LA CORRECCIÓN CLAVE
  async function guardarOrden(mesaLabel, total, metodoPago = null) {
    try {
      // Por defecto, asumimos que es una orden interna (Mesero/Dueño/Para llevar)
      // Estado: 'pendiente' -> Pasa directo a Cocina
      let estadoInicial = "pendiente";

      // LÓGICA DE VALIDACIÓN:
      // Si existe 'mesaURL' (parametro ?mesa= en URL) Y el usuario es 'invitado'
      // Significa que es un cliente externo escaneando QR -> Requiere confirmación.
      if (mesaURL && sesion.rol === "invitado") {
        estadoInicial = "por_confirmar";
      }

      const ordenData = {
        restaurante_id: restoIdActivo,
        mesa: mesaLabel,
        productos: ordenActual.map((i) => `${i.cantidad}x ${i.nombre}`).join(", "),
        total,
        comentarios: comentarioInput?.value || "",
        estado: estadoInicial // Asignamos el estado calculado
      };

      const { error: errorOrden } = await db.from("ordenes").insert([ordenData]);
      if (errorOrden) throw errorOrden;

      // Si hay método de pago (Para llevar), registramos la venta inmediatamente
      if (metodoPago) {
        await db.from("ventas").insert([{
          restaurante_id: restoIdActivo,
          mesa: mesaLabel,
          productos: ordenData.productos,
          total,
          metodo_pago: metodoPago,
        }]);
      }

      generarTicket(total, metodoPago || "Pendiente", mesaLabel);
      if(window.App?.notifyUpdate) window.App.notifyUpdate();
      
      ordenActual = [];
      renderizarCarrito();
      if(comentarioInput) comentarioInput.value = "";
      
    } catch (err) { alert("Error: " + err.message); }
  }

  // =====================================================
  // 4️⃣ EDITOR Y SINCRONIZACIÓN INVENTARIO
  // =====================================================
  function configurarSubidaImagen() {
    if(!imgPreview) return;
    imgPreview.onclick = () => inputFile.click();
    inputFile.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        if(inputUrlImg) inputUrlImg.value = evt.target.result;
        imgPreview.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    };
  }

  function configurarEventosEditor() {
    if (!formProducto) return;
    formProducto.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById("editId").value;
      const nombre = document.getElementById("editNombre").value;
      const datos = {
        restaurante_id: restoIdActivo,
        nombre: nombre,
        precio: parseFloat(document.getElementById("editPrecio").value),
        imagen_url: inputUrlImg ? inputUrlImg.value : "",
        categoria: document.getElementById("editCategoria").value
      };

      try {
        if (id) {
          await db.from("productos").update(datos).eq("id", id);
        } else {
          // Crear Producto
          await db.from("productos").insert([datos]);
          // Crear automáticamente en Suministros (Inventario)
          await db.from("suministros").insert([{
            restaurante_id: restoIdActivo,
            nombre: nombre,
            cantidad: 0,
            unidad: "Pz"
          }]);
        }
        modalEditar.close();
        cargarDatosMenu(); 
      } catch (err) { alert("Error: " + err.message); }
    };
  }

  window.abrirEditor = (id = null) => {
    formProducto.reset();
    document.getElementById("editId").value = id || "";
    imgPreview.src = "https://via.placeholder.com/150";
    if (id) {
      const prod = productosMenu.find(p => p.id === id);
      if (prod) {
        document.getElementById("editNombre").value = prod.nombre;
        document.getElementById("editPrecio").value = prod.precio;
        if(inputUrlImg) inputUrlImg.value = prod.imagen_url || "";
        document.getElementById("editCategoria").value = prod.categoria;
        imgPreview.src = prod.imagen_url || imgPreview.src;
        btnEliminarProd.style.display = "block";
      }
    } else { btnEliminarProd.style.display = "none"; }
    modalEditar.showModal();
  };

  // =====================================================
  // 5️⃣ CALCULADORA Y TICKET PROFESIONAL
  // =====================================================
  function mostrarCalculadoraPago(total) {
    let modal = document.getElementById("modalCalculadora") || document.createElement("dialog");
    modal.id = "modalCalculadora";
    modal.style = "border:none; border-radius:15px; padding:0; width:90%; max-width:400px;";
    document.body.appendChild(modal);

    modal.innerHTML = `
      <div style="background:#10ad93; color:white; padding:20px; text-align:center;">
        <h3 style="margin:0;">Cobrar Pedido</h3>
        <div style="font-size:2rem; font-weight:bold;">$${total.toFixed(2)}</div>
      </div>
      <div style="padding:20px;">
        <div style="display:flex; gap:10px; margin-bottom:15px;">
          <button id="btnEf" style="flex:1; padding:10px; background:#10ad93; color:white; border-radius:8px; border:none;">💵 Efectivo</button>
          <button id="btnTj" style="flex:1; padding:10px; background:#eee; border-radius:8px; border:none;">💳 Tarjeta</button>
        </div>
        <div id="pEf">
          <input type="number" id="inRec" placeholder="Recibido..." style="width:100%; font-size:1.5rem; padding:10px;">
          <div style="text-align:center; margin-top:10px;">Cambio: <b id="valCam" style="color:#27ae60;">$0.00</b></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:20px;">
          <button onclick="this.closest('dialog').close()" style="flex:1; background:#f1f1f1; border:none; padding:10px; border-radius:8px;">Cancelar</button>
          <button id="btnCf" disabled style="flex:2; background:#ccc; color:white; border:none; border-radius:8px;">CONFIRMAR PAGO</button>
        </div>
      </div>`;
    modal.showModal();

    let met = "Efectivo";
    const btnCf = modal.querySelector("#btnCf");
    const inRec = modal.querySelector("#inRec");

    modal.querySelector("#btnEf").onclick = () => { met = "Efectivo"; modal.querySelector("#pEf").style.display="block"; };
    modal.querySelector("#btnTj").onclick = () => { met = "Tarjeta"; modal.querySelector("#pEf").style.display="none"; btnCf.disabled=false; btnCf.style.background="#10ad93"; };

    inRec.oninput = () => {
      const cam = (parseFloat(inRec.value) || 0) - total;
      modal.querySelector("#valCam").textContent = `$${cam.toFixed(2)}`;
      btnCf.disabled = cam < 0;
      btnCf.style.background = cam >= 0 ? "#10ad93" : "#ccc";
    };

    btnCf.onclick = async () => { await guardarOrden("Para Llevar", total, met); modal.close(); };
  }

  function generarTicket(total, metodo, mesa) {
    let modal = document.getElementById("modalTicketMenu") || document.createElement("dialog");
    modal.id = "modalTicketMenu";
    modal.style = "padding:20px; border:none; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.4);";
    document.body.appendChild(modal);

    const itemsHtml = ordenActual.map(i => `
      <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
        <span>${i.cantidad}x ${i.nombre.substring(0,15)}</span>
        <span>$${(i.cantidad * i.precio).toFixed(2)}</span>
      </div>`).join("");

    modal.innerHTML = `
      <div id="areaImpresion" style="width:280px; font-family:'Courier New', monospace; font-size:13px; color:black; background:white; padding:10px;">
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:5px;">*** ORDEN LISTA ***</div>
        <div style="text-align:center; margin-bottom:10px; border-bottom:1px dashed #000; padding-bottom:5px;">
          ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
        </div>
        <div style="margin-bottom:10px;">
          <b>MESA:</b> ${mesa.toUpperCase()}<br>
          <b>PAGO:</b> ${metodo.toUpperCase()}
        </div>
        <div style="border-bottom:1px dashed #000; margin-bottom:5px;"></div>
        ${itemsHtml}
        <div style="border-bottom:1px dashed #000; margin-top:5px; margin-bottom:5px;"></div>
        <div style="text-align:right; font-size:16px; font-weight:bold;">TOTAL: $${total.toFixed(2)}</div>
        <div style="text-align:center; margin-top:15px; border-top:1px dashed #000; padding-top:10px;">
          ¡GRACIAS POR SU COMPRA!
        </div>
      </div>
      <div style="margin-top:20px; display:flex; gap:10px;">
        <button id="btnPnt" style="flex:1; padding:12px; background:#333; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">🖨️ IMPRIMIR</button>
        <button onclick="this.closest('dialog').close()" style="flex:1; padding:12px; background:white; border:1px solid #333; border-radius:8px; cursor:pointer;">CERRAR</button>
      </div>`;
    modal.showModal();

    modal.querySelector("#btnPnt").onclick = () => {
      const win = window.open('', 'PRINT', 'height=600,width=400');
      win.document.write(`<html><body onload="window.print();window.close()">${document.getElementById("areaImpresion").innerHTML}</body></html>`);
      win.document.close();
    };
  }

  inicializar();
});