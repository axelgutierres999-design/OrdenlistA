// js/menu.js - VERSIÓN COMPATIBLE SQL V9.4 (VIÑETAS + INGREDIENTES)

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
  const comentarioInput = document.getElementById("comentarioPedido"); // Comentario GENERAL
  const inputBuscar = document.getElementById("buscarProducto");
  const filtroCategoria = document.getElementById("filtroCategoria");
  const btnLlevar = document.getElementById("btnParaLlevar");

  // Variables del Editor de Menú
  const modalEditar = document.getElementById("modalEditarMenu");
  const formProducto = document.getElementById("formProducto");
  const btnEliminarProd = document.getElementById("btnEliminarProd");
  const imgPreview = document.getElementById("imgPreview");
  const inputUrlImg = document.getElementById("editImg");

  // Input file invisible para subida de imágenes
  const inputFile = document.createElement("input");
  inputFile.type = "file";
  inputFile.accept = "image/*";
  inputFile.style.display = "none";
  document.body.appendChild(inputFile);

  let ordenActual = []; // Carrito
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
      // 🔥 IMPORTANTE: Traemos los campos nuevos (ingredientes, es_destacado)
      const { data: productos } = await db.from("productos").select("*").eq("restaurante_id", restoIdActivo);
      
      // Intentamos traer suministros para calcular stock real (opcional)
      const { data: suministros } = await db.from("suministros").select("nombre, cantidad").eq("restaurante_id", restoIdActivo);

      if (productos) {
        productosMenu = productos.map((p) => {
          // Si existe un suministro con el mismo nombre, usamos su cantidad como stock
          const insumo = suministros?.find(s => s.nombre.toLowerCase() === p.nombre.toLowerCase());
          // Priorizamos stock_actual de la tabla productos si no hay suministro vinculado
          const stockReal = insumo ? Math.floor(insumo.cantidad) : p.stock_actual;
          
          return { ...p, stock: stockReal };
        });
        
        // Ordenamos: Primero los destacados
        productosMenu.sort((a, b) => (b.es_destacado === true) - (a.es_destacado === true));

        productosFiltrados = [...productosMenu];
        dibujarMenu();
      }
    } catch (err) { console.error(err); }
  }

  function dibujarMenu() {
    if (!contenedorProductos) return;
    contenedorProductos.innerHTML = "";

    // Botón Nuevo Platillo (Solo Admin/Dueño)
    if (["dueño", "administrador"].includes(sesion.rol)) {
      const btnNuevo = document.createElement("article");
      btnNuevo.className = "tarjeta-producto";
      btnNuevo.style.border = "2px dashed #10ad93";
      btnNuevo.style.justifyContent = "center";
      btnNuevo.style.cursor = "pointer";
      btnNuevo.innerHTML = `<div style="font-size:3rem; color:#10ad93;">+</div><p style="font-weight:bold; color:#10ad93;">Nuevo Platillo</p>`;
      btnNuevo.onclick = () => window.abrirEditor(); 
      contenedorProductos.appendChild(btnNuevo);
    }

    productosFiltrados.forEach((p) => {
      const art = document.createElement("article");
      art.className = "tarjeta-producto";
      
      // Verificamos estado
      const agotado = p.stock !== null && p.stock <= 0;
      const tieneInfo = (p.ingredientes && p.ingredientes.trim().length > 0) || (p.descripcion && p.descripcion.trim().length > 0);
      const textoInfo = p.descripcion || p.ingredientes; // Priorizamos descripción, si no, ingredientes

      art.innerHTML = `
        <div class="img-container" style="position:relative; overflow:hidden; border-radius:8px 8px 0 0;">
          <img src="${p.imagen_url || "https://via.placeholder.com/150"}" 
               onerror="this.src='https://via.placeholder.com/150'" 
               style="width:100%; height:150px; object-fit:cover; ${agotado ? 'filter:grayscale(100%); opacity:0.6;' : ''}">
          
          ${/* 🔶 VIÑETA DE DESTACADO (ESTRELLA) */ ''}
          ${p.es_destacado ? `
            <div style="position:absolute; top:0; left:0; background:#ff9800; color:white; padding:5px 8px; border-radius:0 0 8px 0; font-weight:bold; font-size:14px; box-shadow:2px 2px 5px rgba(0,0,0,0.3); z-index:5;">
                ★
            </div>
          ` : ''}

          ${/* ✏️ BOTÓN EDITAR (Solo admin) */ ''}
          ${["dueño", "administrador"].includes(sesion.rol) ? 
            `<button class="edit-btn" onclick="event.stopPropagation(); window.abrirEditor('${p.id}')" style="position:absolute; top:8px; left:${p.es_destacado ? '40px' : '8px'}; z-index:10;">✏️</button>` : ""}

          ${/* ℹ️ BOTÓN INFO (Ingredientes) */ ''}
          ${tieneInfo ? `
            <button onclick="event.stopPropagation(); this.nextElementSibling.style.display='flex'" 
                style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.95); color:#10ad93; border:none; border-radius:50%; width:28px; height:28px; font-weight:bold; box-shadow:0 2px 6px rgba(0,0,0,0.3); z-index:8; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                i
            </button>
            
            <div onclick="event.stopPropagation(); this.style.display='none'" 
                 style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.85); color:white; flex-direction:column; align-items:center; justify-content:center; padding:15px; text-align:center; backdrop-filter:blur(3px); z-index:9; animation:fadeIn 0.2s ease;">
                 <h5 style="margin:0 0 5px 0; font-size:0.9rem; color:#10ad93; text-transform:uppercase;">Detalles</h5>
                 <p style="font-size:0.85rem; line-height:1.4; margin:0;">${textoInfo}</p>
                 <small style="margin-top:10px; opacity:0.7; font-size:0.7rem;">(Toca para cerrar)</small>
            </div>
          ` : ''}
        </div>
        
        <div class="info">
          <h4>${p.nombre}</h4>
          <p class="precio">$${parseFloat(p.precio).toFixed(2)}</p>
          
          <small class="stock-tag ${agotado ? "sin-stock" : ""}" style="display:block; margin-top:5px;">
            ${agotado ? "🚫 AGOTADO" : (p.stock > 50 ? "" : "Disponibles: " + p.stock)}
          </small>
        </div>`;
      
      if (!agotado) {
        art.onclick = () => agregarItem(p);
      } else {
        art.style.cursor = "not-allowed";
        art.style.opacity = "0.8";
      }

      contenedorProductos.appendChild(art);
    });
  }

  // =====================================================
  // 3️⃣ LÓGICA DE PEDIDOS
  // =====================================================
  
  function agregarItem(producto) {
    // Creamos un ID temporal único
    const nuevoItem = {
        ...producto,
        cantidad: 1,
        comentario: "",
        tempId: Date.now() + Math.random() 
    };
    
    ordenActual.push(nuevoItem);
    renderizarCarrito();
  }

  window.actualizarNotaItem = (tempId, texto) => {
      const item = ordenActual.find(i => i.tempId === tempId);
      if(item) item.comentario = texto;
  };

  function renderizarCarrito() {
    if (!listaItemsOrden) return;
    
    if (ordenActual.length === 0) {
      listaItemsOrden.innerHTML = "<small style='display:block; text-align:center; color:#999; margin-top:20px;'>Tu orden está vacía.</small>";
      ordenTotalSpan.textContent = "$0.00";
      if(btnProcesar) btnProcesar.disabled = true;
      return;
    }

    listaItemsOrden.innerHTML = ordenActual.map(item => `
      <div class="item-carrito" style="border-bottom: 1px dashed #e0e0e0; padding: 10px 0; animation: fadeIn 0.3s ease;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
            <div style="font-weight: 600; font-size: 0.95rem; color: #333; width: 70%; line-height: 1.2;">
                ${item.cantidad}x ${item.nombre}
            </div>
            <div style="text-align: right;">
                <span style="font-weight: bold;">$${(item.precio * item.cantidad).toFixed(2)}</span>
                <button onclick="window.quitarItem(${item.tempId})" style="border:none; background:none; color:red; font-size:1.2rem; margin-left:5px;">&times;</button>
            </div>
        </div>
        <input type="text" placeholder="Nota del platillo..." value="${item.comentario}" 
               oninput="window.actualizarNotaItem(${item.tempId}, this.value)"
               style="width: 100%; font-size: 0.8rem; border: none; border-bottom: 1px solid #ddd; outline:none;">
      </div>`).join("");

    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
    if(btnProcesar) btnProcesar.disabled = false;
  }

  window.quitarItem = (tempId) => {
    ordenActual = ordenActual.filter((i) => i.tempId !== tempId);
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

  async function guardarOrden(mesaLabel, total, metodoPago = null) {
    try {
      let estadoInicial = "pendiente";
      if (mesaURL && sesion.rol === "invitado") estadoInicial = "por_confirmar";

      const productosTexto = ordenActual.map(i => {
          const notaLimpia = i.comentario.replace(/,/g, '.'); 
          return `${i.cantidad}x ${i.nombre}${notaLimpia ? " [" + notaLimpia + "]" : ""}`;
      }).join(", ");

      const notasDePlatos = ordenActual.filter(i => i.comentario.trim() !== "").map(i => `🔹${i.nombre}: ${i.comentario}`).join(" | ");
      const comentarioGeneral = comentarioInput?.value || "";

      let comentarioFinal = "";
      if (notasDePlatos) comentarioFinal += notasDePlatos;
      if (notasDePlatos && comentarioGeneral) comentarioFinal += " --- ";
      if (comentarioGeneral) comentarioFinal += `GENERAL: ${comentarioGeneral}`;

      const ordenData = {
        restaurante_id: restoIdActivo,
        mesa: mesaLabel,
        productos: productosTexto,
        total,
        comentarios: comentarioFinal,
        estado: estadoInicial
      };

      const { data: ordenGuardada, error: errorOrden } = await db.from("ordenes").insert([ordenData]).select().single();
      if (errorOrden) throw errorOrden;

      // Guardar detalles para el inventario
      const detalles = ordenActual.map(item => ({
        orden_id: ordenGuardada.id,
        producto_id: item.id,
        cantidad: item.cantidad,
        precio_unitario: item.precio
      }));
      await db.from("detalles_orden").insert(detalles);

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
  // 4️⃣ EDITOR ACTUALIZADO (Con Ingredientes y Destacado)
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

  // Inyectamos dinámicamente los campos que faltan en el HTML
  function inyectarCamposFaltantes() {
      // 1. Checkbox Destacado
      if(!document.getElementById("editDestacadoWrapper") && formProducto) {
        const divCheck = document.createElement("div");
        divCheck.id = "editDestacadoWrapper";
        divCheck.style.marginBottom = "10px";
        divCheck.innerHTML = `
           <label style="display:flex; align-items:center; cursor:pointer; gap:8px; font-weight:bold;">
             <input type="checkbox" id="editDestacado">
             ⭐ Marcar como Destacado / Recomendado
           </label>
        `;
        // Insertar después del input de imagen o al principio
        const refNode = document.getElementById("editCategoria")?.parentNode || formProducto.firstChild;
        formProducto.insertBefore(divCheck, refNode);
      }

      // 2. Textarea Ingredientes
      if(!document.getElementById("editIngredientes") && formProducto) {
          const divIng = document.createElement("div");
          divIng.style.marginTop = "10px";
          divIng.innerHTML = `
            <label style="font-weight:bold; font-size:0.9rem;">Ingredientes / Descripción</label>
            <textarea id="editIngredientes" rows="3" placeholder="Ej: Salsa de tomate, mozzarella, albahaca..." style="width:100%; border:1px solid #ccc; border-radius:4px; padding:5px;"></textarea>
          `;
          const botones = formProducto.querySelector("footer") || formProducto.lastElementChild;
          formProducto.insertBefore(divIng, botones);
      }
  }

  function configurarEventosEditor() {
    if (!formProducto) return;
    
    inyectarCamposFaltantes();

    formProducto.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById("editId").value;
      
      const datos = {
        restaurante_id: restoIdActivo,
        nombre: document.getElementById("editNombre").value,
        precio: parseFloat(document.getElementById("editPrecio").value),
        imagen_url: inputUrlImg ? inputUrlImg.value : "",
        categoria: document.getElementById("editCategoria").value,
        // 🔥 CAMPOS NUEVOS
        ingredientes: document.getElementById("editIngredientes")?.value || "",
        es_destacado: document.getElementById("editDestacado")?.checked || false
      };

      try {
        if (id) {
          await db.from("productos").update(datos).eq("id", id);
        } else {
          await db.from("productos").insert([datos]);
          // Crear suministro simple
          await db.from("suministros").insert([{ 
            restaurante_id: restoIdActivo,
            nombre: datos.nombre,
            cantidad: 50, // Stock inicial
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
    
    inyectarCamposFaltantes();

    if (id) {
      const prod = productosMenu.find(p => p.id === id);
      if (prod) {
        document.getElementById("editNombre").value = prod.nombre;
        document.getElementById("editPrecio").value = prod.precio;
        if(inputUrlImg) inputUrlImg.value = prod.imagen_url || "";
        document.getElementById("editCategoria").value = prod.categoria;
        
        // Cargar nuevos campos
        if(document.getElementById("editIngredientes")) document.getElementById("editIngredientes").value = prod.ingredientes || "";
        if(document.getElementById("editDestacado")) document.getElementById("editDestacado").checked = prod.es_destacado || false;

        imgPreview.src = prod.imagen_url || imgPreview.src;
        btnEliminarProd.style.display = "block";
      }
    } else { 
        btnEliminarProd.style.display = "none"; 
        if(document.getElementById("editDestacado")) document.getElementById("editDestacado").checked = false;
    }
    modalEditar.showModal();
  };

  btnEliminarProd.onclick = async () => {
      const id = document.getElementById("editId").value;
      if(!id) return;
      if(confirm("¿Eliminar este platillo?")) {
          await db.from("productos").delete().eq("id", id);
          modalEditar.close();
          cargarDatosMenu();
      }
  }

  // =====================================================
  // 5️⃣ CALCULADORA Y TICKET (Sin cambios mayores)
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
      <div style="margin-bottom:5px;">
        <div style="display:flex; justify-content:space-between;">
            <span>${i.cantidad}x ${i.nombre.substring(0,18)}</span>
            <span>$${(i.cantidad * i.precio).toFixed(2)}</span>
        </div>
        ${i.comentario ? `<div style="font-size:11px; color:#555; margin-left:10px; font-style:italic;">└ ${i.comentario}</div>` : ''}
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