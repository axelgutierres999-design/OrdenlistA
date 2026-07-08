// js/menu.js - CORREGIDO: SUBIDA DE IMAGEN + BOTÓN INGREDIENTES

document.addEventListener("DOMContentLoaded", async () => {
  // =====================================================
  // 0️⃣ VARIABLES Y SELECTORES
  // =====================================================
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
  
  // Botón flotante
  const btnAgregarFloating = document.getElementById("btnAgregarProducto");

  // Variables del Editor
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

  let ordenActual = [];
  let productosMenu = [];
  let productosFiltrados = [];
  let modoLlevar = false;
  // ... variables anteriores ...
let datosRestaurante = {}; // 🆕 Variable para guardar QR y Banco

async function inicializar() {
    if (!restoIdActivo) return;
    
    // 🆕 CARGAR INFO DEL RESTAURANTE (QR y BANCO)
    const { data: info } = await db.from("restaurantes").select("qr_pago_url, datos_bancarios").eq("id", restoIdActivo).single();
    if (info) datosRestaurante = info; 

    if (["dueño", "administrador"].includes(sesion.rol) && btnAgregarFloating) {
        btnAgregarFloating.style.display = "flex";
    }

    await cargarMesas();
    await cargarDatosMenu();
    // ... resto de inicializaciones ...
}

  // =====================================================
  // 1️⃣ INICIALIZACIÓN
  // =====================================================
  // === CORRECCIÓN: UNIFICAR INICIALIZACIÓN Y AGREGAR CLICK AL BOTÓN ===
async function inicializar() {
    if (!restoIdActivo) return;

    try {
        // 1. Cargar info del restaurante (QR y Banco) - Antes se perdía por la duplicidad
       const { data: info } = await db.from("restaurantes")
            .select("nombre, direccion, telefono, mensaje_ticket, qr_pago_url, datos_bancarios")
            .eq("id", restoIdActivo)
            .single();
        if (info) datosRestaurante = info;

        // 2. Mostrar y configurar botón flotante si es admin
        if (["dueño", "administrador"].includes(sesion.rol) && btnAgregarFloating) {
            btnAgregarFloating.style.display = "flex";
            
            // ESTA ES LA LÍNEA QUE FALTABA:
            btnAgregarFloating.onclick = () => window.abrirEditor(); 
        }

        // 3. Cargar el resto de la interfaz
        await cargarMesas();
        await cargarDatosMenu();
        configurarFiltros();
        configurarBotonLlevar();
        configurarSubidaImagen(); 
        configurarEventosEditor();
        // ── NUEVO: Sincronizar mesas con el drawer móvil ──────────
// Copiar opciones de selectMesa al selectMesaDrawer
const selectMesaDrawer = document.getElementById('selectMesaDrawer');
if (selectMesaDrawer && selectMesa) {
  selectMesaDrawer.innerHTML = selectMesa.innerHTML;
  if (mesaURL) { selectMesaDrawer.value = mesaURL; selectMesaDrawer.disabled = true; }
}

// Botón Para Llevar del drawer
const btnLlevarDrawer = document.getElementById('btnParaLlevarDrawer');
btnLlevarDrawer?.addEventListener('click', () => {
  modoLlevar = !modoLlevar;
  btnLlevar?.classList.toggle('activo', modoLlevar);
  btnLlevarDrawer.classList.toggle('activo', modoLlevar);
  [btnLlevar, btnLlevarDrawer].forEach(b => { if(b) b.textContent = modoLlevar ? '✅ Para Llevar' : '🥡 Para Llevar'; });
  document.getElementById('alertaLlevar')?.classList.toggle('mostrar', modoLlevar);
  document.getElementById('alertaLlevarDrawer')?.classList.toggle('mostrar', modoLlevar);
  if (selectMesa) { selectMesa.disabled = modoLlevar; if(modoLlevar) selectMesa.value=''; }
  if (selectMesaDrawer) { selectMesaDrawer.disabled = modoLlevar; if(modoLlevar) selectMesaDrawer.value=''; }
});

// Botón procesar del drawer
document.getElementById('btnProcesarDrawer')?.addEventListener('click', async () => {
  const mesa = modoLlevar ? 'Para Llevar' : (selectMesaDrawer?.value || selectMesa?.value || '');
  if (!mesa) return alert('Selecciona mesa o activa Para Llevar');
  const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const notaExtra = document.getElementById('notaDrawer')?.value || '';
  if (modoLlevar) mostrarCalculadoraPago(total);
  else await guardarOrden(mesa, total, null, notaExtra);
  cerrarDrawer();
});

    } catch (error) {
        console.error("Error en inicialización:", error);
    }
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
      
      // Stock (Opcional: Si tienes tabla suministros, descomentar lógica de mezcla)
      if (productos) {
        productosMenu = productos.map((p) => {
          // Si usas stock_actual de la tabla productos:
          return { ...p, stock: p.stock_actual !== null ? p.stock_actual : 999 };
        });
        
        // Ordenar: Destacados primero
        productosMenu.sort((a, b) => (b.es_destacado === true) - (a.es_destacado === true));

        productosFiltrados = [...productosMenu];
        dibujarMenu();
      }
    } catch (err) { console.error(err); }
  }

  function dibujarMenu() {
    if (!contenedorProductos) return;
    contenedorProductos.innerHTML = "";

    productosFiltrados.forEach((p) => {
      const art = document.createElement("article");
      art.className = "tarjeta-producto";
      
      const agotado = p.stock <= 0;
      
      // Lógica de info (Ingredientes/Descripción)
      const tieneInfo = (p.ingredientes && p.ingredientes.trim() !== "") || (p.descripcion && p.descripcion.trim() !== "");
      const textoInfo = p.ingredientes || p.descripcion || "";

      art.innerHTML = `
        <div class="img-container" style="position:relative; width:100%; height:140px; background:#f0f0f0;">
          <img src="${p.imagen_url || "https://via.placeholder.com/150"}" 
               onerror="this.src='https://via.placeholder.com/150'" 
               style="width:100%; height:100%; object-fit:cover; display:block; ${agotado ? 'filter:grayscale(100%); opacity:0.6;' : ''}">
          
          ${p.es_destacado ? `
            <div style="position:absolute; top:0; left:0; background:#ff9800; color:white; padding:4px 8px; border-radius:0 0 8px 0; font-weight:bold; font-size:12px; box-shadow:2px 2px 5px rgba(0,0,0,0.3); z-index:5;">
                ★
            </div>
          ` : ''}

          ${["dueño", "administrador"].includes(sesion.rol) ? 
            `<button class="edit-btn" onclick="event.stopPropagation(); window.abrirEditor('${p.id}')" 
                style="position:absolute; top:5px; left:${p.es_destacado ? '35px' : '5px'}; background:white; border-radius:50%; width:30px; height:30px; border:none; box-shadow:0 2px 5px rgba(0,0,0,0.2); z-index:10; display:flex; align-items:center; justify-content:center;">✏️</button>` : ""}

          ${tieneInfo ? `
            <button onclick="event.stopPropagation(); this.nextElementSibling.style.display='flex'" 
                style="position:absolute; top:5px; right:5px; background:rgba(255,255,255,0.95); color:#10ad93; border:none; border-radius:50%; width:30px; height:30px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.3); z-index:20; cursor:pointer; display:flex; align-items:center; justify-content:center; font-family:serif; font-style:italic; font-size:16px;">
                i
            </button>
            
            <div onclick="event.stopPropagation(); this.style.display='none'" 
                 style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.9); color:white; flex-direction:column; align-items:center; justify-content:center; padding:15px; text-align:center; backdrop-filter:blur(2px); z-index:25; animation:fadeIn 0.2s ease;">
                 <h5 style="margin:0 0 5px 0; font-size:0.8rem; color:#10ad93; text-transform:uppercase; letter-spacing:1px;">Ingredientes</h5>
                 <p style="font-size:0.8rem; line-height:1.4; margin:0;">${textoInfo}</p>
                 <small style="margin-top:10px; opacity:0.7; font-size:0.65rem;">(Click para cerrar)</small>
            </div>
          ` : ''}
        </div>
        
        <div class="info">
          <div>
            <h5 style="margin:0; font-size:1rem; line-height:1.2;">${p.nombre}</h5>
            ${agotado ? `<small style="color:red; font-weight:bold;">AGOTADO</small>` : ''}
          </div>
          <div style="text-align:right;">
             <strong style="font-size:1.1rem; color:#333;">$${parseFloat(p.precio).toFixed(2)}</strong>
          </div>
        </div>`;
      
      if (!agotado) {
        art.onclick = () => agregarItem(p);
      } else {
        art.style.cursor = "not-allowed";
      }

      contenedorProductos.appendChild(art);
    });
  }

  // =====================================================
  // 3️⃣ LÓGICA DE PEDIDOS
  // =====================================================
  function agregarItem(producto) {
    const nuevoItem = {
        ...producto,
        cantidad: 1,
        comentario: "",
        tempId: Date.now() * 1000 + Math.floor(Math.random() * 1000)
    };
    ordenActual.push(nuevoItem);
    renderizarCarrito();
  }
  window.cambiarCantidad = (tempId, delta) => {
  // Convertir a número para comparación segura
  const id = Number(tempId);
  const idx = ordenActual.findIndex(i => i.tempId === id);
  if (idx === -1) return;
  ordenActual[idx].cantidad += delta;
  if (ordenActual[idx].cantidad <= 0) {
    ordenActual.splice(idx, 1);
  }
  renderizarCarrito();
};
window.quitarItem = (tempId) => {
  window.cambiarCantidad(tempId, -999);
};

  window.actualizarNotaItem = (tempId, texto) => {
      const item = ordenActual.find(i => i.tempId === tempId);
      if(item) item.comentario = texto;
  };

  function renderizarCarrito() {
  const total   = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const nItems  = ordenActual.reduce((acc, i) => acc + i.cantidad, 0);
  const fmt     = n => `$${n.toFixed(2)}`;

  // HTML de un ítem con controles +/−
  const htmlItem = item => `
    <div class="item-carrito">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <span class="nombre-item" style="flex:1;font-size:0.95rem;font-weight:700;color:#1f2937;line-height:1.4;">
          ${item.nombre}
        </span>
        <span class="precio-item" style="font-size:0.95rem;font-weight:800;color:#10ad93;margin-left:8px;">
          ${fmt(item.precio * item.cantidad)}
        </span>
      </div>
      <div class="ctrl-cantidad">
        <button class="btn-cant restar" onclick="window.cambiarCantidad(${item.tempId}, -1)">−</button>
        <span class="num-cant">${item.cantidad}</span>
        <button class="btn-cant" onclick="window.cambiarCantidad(${item.tempId}, +1)">+</button>
      </div>
      <input type="text" placeholder="Nota (ej: sin cebolla)..." value="${item.comentario}"
        oninput="window.actualizarNotaItem(${item.tempId}, this.value)"
        style="width:100%;font-size:0.78rem;padding:4px 0;border:none;border-bottom:1px solid #eee;background:transparent;outline:none;margin-top:5px;">
    </div>`;

  const htmlVacio = `<p style="text-align:center;color:#9ca3af;padding:20px 0;font-size:0.88rem;">Carrito vacío</p>`;
  const contenido = ordenActual.length === 0 ? htmlVacio : ordenActual.map(htmlItem).join('');

  // ── Actualizar panel desktop ──
  if (listaItemsOrden) listaItemsOrden.innerHTML = contenido;
  if (ordenTotalSpan)  ordenTotalSpan.textContent = fmt(total);
  if (btnProcesar)     btnProcesar.disabled = ordenActual.length === 0;

  // Badge contador desktop
  let badgeDesk = document.querySelector('.badge-contador-desk-inline');
  if (!badgeDesk) {
    const h3 = document.querySelector('#panelOrden h3');
    if (h3) {
      badgeDesk = document.createElement('span');
      badgeDesk.className = 'badge-contador-desk badge-contador-desk-inline';
      h3.appendChild(badgeDesk);
    }
  }
  if (badgeDesk) {
    badgeDesk.textContent = nItems > 0 ? `${nItems} ítem${nItems !== 1 ? 's' : ''}` : '';
    badgeDesk.style.display = nItems > 0 ? 'inline' : 'none';
  }

  // ── Actualizar drawer móvil ──
  const listaDrawer  = document.getElementById('listaItemsDrawer');
  const totalDrawer  = document.getElementById('totalDrawer');
  const badgeDrawer  = document.getElementById('badgeDrawer');
  const fabBadge     = document.getElementById('fabBadge');
  const fabTotal     = document.getElementById('fabTotal');
  const fabBtn       = document.getElementById('btnCarritoFlotante');
  const btnProcDraw  = document.getElementById('btnProcesarDrawer');

  if (listaDrawer) listaDrawer.innerHTML = contenido;
  if (totalDrawer) totalDrawer.textContent = fmt(total);
  if (badgeDrawer) { badgeDrawer.textContent = nItems; badgeDrawer.style.display = nItems > 0 ? 'inline' : 'none'; }
  if (btnProcDraw) btnProcDraw.disabled = ordenActual.length === 0;

  // Botón flotante: solo visible si hay items
  if (fabBtn)    fabBtn.style.display   = nItems > 0 ? 'flex' : 'none';
  if (fabBadge)  fabBadge.textContent   = nItems;
  if (fabTotal)  fabTotal.textContent   = fmt(total);
}

  function configurarFiltros() {
    inputBuscar?.addEventListener("input", () => {
        const txt = inputBuscar.value.toLowerCase();
        const cat = filtroCategoria.value;
        filtrar(txt, cat);
    });
    filtroCategoria?.addEventListener("change", () => {
        const txt = inputBuscar.value.toLowerCase();
        const cat = filtroCategoria.value;
        filtrar(txt, cat);
    });
  }

  function filtrar(texto, categoria) {
      productosFiltrados = productosMenu.filter(p => {
          const matchTxt = p.nombre.toLowerCase().includes(texto);
          const matchCat = categoria === "Todos" || p.categoria === categoria;
          return matchTxt && matchCat;
      });
      dibujarMenu();
  }

  function configurarBotonLlevar() {
    btnLlevar?.addEventListener("click", () => {
      modoLlevar = !modoLlevar;
      btnLlevar.classList.toggle("activo", modoLlevar);
      btnLlevar.innerHTML = modoLlevar ? "✅ Para Llevar" : "🥡 Para Llevar";
      document.getElementById("alertaLlevar")?.classList.toggle("mostrar", modoLlevar);
      const panel = document.getElementById("panelOrden");
      if(panel) panel.classList.toggle("llevar-activo", modoLlevar);
      
      if (selectMesa) { 
          selectMesa.disabled = modoLlevar; 
          if (modoLlevar) selectMesa.value = ""; 
      }
    });
  }

  btnProcesar.onclick = async () => {
    const mesaLabel = modoLlevar ? "Para Llevar" : selectMesa?.value;
    if (!mesaLabel) return alert("Selecciona mesa o activa Para Llevar");
    const total = ordenActual.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    if (modoLlevar) mostrarCalculadoraPago(total);
    else await guardarOrden(mesaLabel, total);
  };

  async function guardarOrden(mesaLabel, total, metodoPago = null, notaExtra = "") {
    try {
      let estadoInicial = "pendiente";
      if (mesaURL && sesion.rol === "invitado") estadoInicial = "por_confirmar";

      const productosTexto = ordenActual.map(i => {
          const notaLimpia = i.comentario.replace(/,/g, '.'); 
          return `${i.cantidad}x ${i.nombre}${notaLimpia ? " [" + notaLimpia + "]" : ""}`;
      }).join(", ");

      const notasDePlatos = ordenActual.filter(i => i.comentario.trim() !== "").map(i => `🔹${i.nombre}: ${i.comentario}`).join(" | ");
      const comentarioGeneral = comentarioInput?.value || notaExtra || "";

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

      // Intentar guardar detalle (opcional, si falla no detiene el flujo)
      try {
        const detalles = ordenActual.map(item => ({
            orden_id: ordenGuardada.id,
            producto_id: item.id,
            cantidad: item.cantidad,
            precio_unitario: item.precio
        }));
        await db.from("detalles_orden").insert(detalles);
      } catch(e) { console.log("No se guardaron detalles o tabla no existe"); }

      if (metodoPago) {
        await db.from("ventas").insert([{
          restaurante_id: restoIdActivo,
          mesa: mesaLabel,
          productos: ordenData.productos, 
          total,
          metodo_pago: metodoPago,
        }]);
      }

      // ── Descontar stock según recetas ──
     await descontarStock(ordenActual);

     generarTicket(total, metodoPago || "Pendiente", mesaLabel);

      if(window.App?.notifyUpdate) window.App.notifyUpdate();
      
      ordenActual = [];
      renderizarCarrito();
      if(comentarioInput) comentarioInput.value = "";
      
    } catch (err) { alert("Error al guardar: " + err.message); }
  }
  
async function descontarStock(productosVendidos) {
    try {
        for (const item of productosVendidos) {
            if (!item.id) continue;

            const { data: receta, error } = await db
                .from('recetas')
                .select('suministro_id, cantidad_necesaria')
                .eq('producto_id', item.id)
                .eq('restaurante_id', restoIdActivo);

            if (error || !receta || receta.length === 0) continue;

            for (const ingrediente of receta) {
                const cantidadADescontar =
                    ingrediente.cantidad_necesaria * item.cantidad;

                const { data: suministro } = await db
                    .from('suministros')
                    .select('cantidad')
                    .eq('id', ingrediente.suministro_id)
                    .eq('restaurante_id', restoIdActivo)
                    .single();

                if (!suministro) continue;

                const nuevoStock = Math.max(
                    0,
                    (parseFloat(suministro.cantidad) || 0) - cantidadADescontar
                );

                await db
                    .from('suministros')
                    .update({ cantidad: nuevoStock })
                    .eq('id', ingrediente.suministro_id)
                    .eq('restaurante_id', restoIdActivo);
            }
        }
        console.log("✅ Stock descontado correctamente");
    } catch (err) {
        console.warn("⚠️ Error al descontar stock:", err.message);
        // No bloquea la venta si falla el stock
    }
}
  // =====================================================
  // 4️⃣ EDITOR Y SUBIDA DE IMAGEN (SOLUCIÓN DEFINITIVA)
  // =====================================================
  function configurarSubidaImagen() {
    if(!imgPreview) return;
    
    // 1. Al hacer click en la imagen, simulamos click en el input file
    imgPreview.onclick = () => {
        inputFile.click(); 
    };

    // 2. Al seleccionar archivo, leemos y convertimos a Base64 para guardarlo
    inputFile.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validar tamaño (Opcional, ej: max 2MB)
      if(file.size > 2 * 1024 * 1024) {
          alert("La imagen es muy pesada. Intenta con una menor a 2MB.");
          return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64 = evt.target.result;
        if(inputUrlImg) inputUrlImg.value = base64; // Guardamos Base64 en el input hidden
        imgPreview.src = base64; // Mostramos vista previa
      };
      reader.readAsDataURL(file);
    };
  }

  function inyectarCamposFaltantes() {
      // Checkbox Destacado
      if(!document.getElementById("editDestacadoWrapper") && formProducto) {
        const divCheck = document.createElement("div");
        divCheck.id = "editDestacadoWrapper";
        divCheck.style.marginBottom = "10px";
        divCheck.innerHTML = `
           <label style="display:flex; align-items:center; cursor:pointer; gap:8px; font-weight:bold; font-size:0.9rem;">
             <input type="checkbox" id="editDestacado">
             ⭐ Marcar como Destacado
           </label>
        `;
        const refNode = document.getElementById("editCategoria")?.parentNode?.parentNode || formProducto.firstChild;
        formProducto.insertBefore(divCheck, refNode.nextSibling);
      }

      // Textarea Ingredientes
      if(!document.getElementById("editIngredientes") && formProducto) {
          const divIng = document.createElement("div");
          divIng.style.marginTop = "5px";
          divIng.innerHTML = `
            <label style="font-weight:bold; font-size:0.9rem;">Ingredientes / Descripción:</label>
            <textarea id="editIngredientes" rows="2" placeholder="Ej: Carne de res, queso..." style="width:100%; border:1px solid #ccc; border-radius:4px; padding:5px;"></textarea>
          `;
          const botones = formProducto.querySelector("button[type='button']")?.parentNode || formProducto.lastElementChild;
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
        ingredientes: document.getElementById("editIngredientes")?.value || "",
        es_destacado: document.getElementById("editDestacado")?.checked || false
      };

      try {
        if (id) {
          await db.from("productos").update(datos).eq("id", id);
        } else {
          await db.from("productos").insert([datos]).select().single();
          // Se eliminó la creación automática de suministro porque los ingredientes
          // reales se gestionan desde stock.html → el dueño los carga manualmente
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
      if(confirm("¿Estás seguro de eliminar este platillo?")) {
          await db.from("productos").delete().eq("id", id);
          modalEditar.close();
          cargarDatosMenu();
      }
  }

 function mostrarCalculadoraPago(total) {
  let modal = document.getElementById("modalCalculadora") || document.createElement("dialog");
  modal.id = "modalCalculadora";
  modal.style = "border:none; border-radius:15px; padding:0; width:90%; max-width:400px; box-shadow:0 10px 50px rgba(0,0,0,0.5);";
  if(!modal.parentElement) document.body.appendChild(modal);

  modal.innerHTML = `
    <div style="background:#10ad93; color:white; padding:20px; text-align:center;">
      <h3 style="margin:0;">Cobrar Pedido</h3>
      <div style="font-size:2.5rem; font-weight:bold;">$${total.toFixed(2)}</div>
    </div>
    <div style="padding:20px;">
      <div style="display:flex; gap:10px; margin-bottom:15px;">
        <button id="btnEf" style="flex:1; padding:12px; background:#10ad93; color:white; border-radius:8px; border:none; cursor:pointer;">💵 Efectivo</button>
        <button id="btnTj" style="flex:1; padding:12px; background:#eee; color:black; border-radius:8px; border:none; cursor:pointer;">💳 Tarjeta/Digital</button>
      </div>

      <div id="pTj" style="display:none; margin-bottom:15px; border:1px dashed #ccc; padding:10px; border-radius:10px;">
        <p style="text-align:center; font-size:0.8rem; margin-bottom:8px;">Seleccione método:</p>
        <div class="grid-subpagos" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button class="btn-subpago" data-met="Tarjeta (QR)">📱 Ver QR</button>
          <button class="btn-subpago" data-met="Tarjeta (Transf.)">🏦 Datos Banco</button>
          <button class="btn-subpago" data-met="Tarjeta (Terminal)" style="grid-column: span 2;">💳 Terminal Física</button>
        </div>
        
        <div id="detallePagoAjustes" style="margin-top:15px; text-align:center; display:none; background:#f9f9f9; padding:10px; border-radius:8px; font-size:0.9rem;">
        </div>
      </div>

      <div id="pEf">
        <input type="number" id="inRec" placeholder="Recibido..." style="width:100%; font-size:1.5rem; padding:10px; border:2px solid #ddd; border-radius:8px; text-align:center;">
        <div style="text-align:center; margin-top:10px; font-size:1.2rem;">Cambio: <b id="valCam" style="color:#27ae60;">$0.00</b></div>
      </div>

      <div style="display:flex; gap:10px; margin-top:20px;">
        <button onclick="document.getElementById('modalCalculadora').close()" style="flex:1; background:#f1f1f1; border:none; padding:10px; border-radius:8px; cursor:pointer;">Cancelar</button>
        <button id="btnCf" disabled style="flex:2; background:#ccc; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">CONFIRMAR</button>
      </div>
    </div>`;
  modal.showModal();

  const btnCf = modal.querySelector("#btnCf");
  const divInfo = modal.querySelector("#detallePagoAjustes");
  let met = "Efectivo";

  // Lógica de botones de Tarjeta/Digital
  modal.querySelectorAll(".btn-subpago").forEach(btn => {
    btn.onclick = () => {
      met = btn.getAttribute("data-met");
      divInfo.style.display = "block";
      divInfo.innerHTML = ""; // Limpiar

      // MOSTRAR FORMAS SEGÚN EL BOTÓN (Datos de ajustes.js)
      if (met === "Tarjeta (QR)") {
          if (datosRestaurante.qr_pago_url) {
              divInfo.innerHTML = `<img src="${datosRestaurante.qr_pago_url}" style="max-width:150px; border:5px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                                   <p style="margin-top:5px; font-weight:bold;">Escanea para pagar</p>`;
          } else {
              divInfo.innerHTML = `<p style="color:red;">⚠️ No se ha configurado un QR.</p>`;
          }
      } else if (met === "Tarjeta (Transf.)") {
          divInfo.innerHTML = `<p style="margin:0; font-weight:bold; color:#10ad93;">Datos Bancarios:</p>
                               <pre style="white-space:pre-wrap; font-family:sans-serif; margin-top:5px;">${datosRestaurante.datos_bancarios || "No hay datos configurados."}</pre>`;
      } else {
          divInfo.innerHTML = `<p>💳 Use la terminal física para procesar el pago.</p>`;
      }

      modal.querySelectorAll(".btn-subpago").forEach(b => b.style.background = "#5d6d7e");
      btn.style.background = "#10ad93";
      btnCf.disabled = false;
      btnCf.style.background = "#10ad93";
    };
  });

  // Lógica de Efectivo (Oculta info de tarjeta)
  modal.querySelector("#btnEf").onclick = () => {
      met = "Efectivo";
      modal.querySelector("#pEf").style.display = "block";
      modal.querySelector("#pTj").style.display = "none";
      divInfo.style.display = "none";
      // ... resto de lógica de colores ...
  };

  modal.querySelector("#btnTj").onclick = () => {
      modal.querySelector("#pEf").style.display = "none";
      modal.querySelector("#pTj").style.display = "block";
      // ... resto de lógica de colores ...
  };

  // El resto de tu lógica (inRec.oninput y btnCf.onclick) se mantiene igual
  const inRec = modal.querySelector("#inRec");
  inRec.oninput = () => {
      if(met === "Efectivo") {
          const cam = (parseFloat(inRec.value) || 0) - total;
          modal.querySelector("#valCam").textContent = `$${cam.toFixed(2)}`;
          btnCf.disabled = cam < 0;
          btnCf.style.background = cam >= 0 ? "#10ad93" : "#ccc";
      }
  };

  btnCf.onclick = async () => { 
      await guardarOrden("Para Llevar", total, met); 
      modal.close(); 
  };
}
function generarTicket(total, metodo, mesa) {
    let modal = document.getElementById("modalTicketMenu") || document.createElement("dialog");
    modal.id = "modalTicketMenu";
    modal.style = "padding:0; border:none; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.4); max-width:350px; width:90%;";
    if(!modal.parentElement) document.body.appendChild(modal);

    const nombreRest = datosRestaurante.nombre || "Mi Restaurante";
    const dirRest = datosRestaurante.direccion || "Dirección no configurada";
    const telRest = datosRestaurante.telefono || "000-000-0000";
    const msjRest = datosRestaurante.mensaje_ticket || "¡GRACIAS POR SU COMPRA!";
    const fechaActual = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();

    // HTML de los items para impresión
    const itemsHtml = ordenActual.map(i => `
      <tr>
        <td style="padding: 3px 0; border-bottom: 1px dotted #ccc;">${i.cantidad}</td>
        <td style="padding: 3px 0; border-bottom: 1px dotted #ccc;">
            ${i.nombre.substring(0,18)}
            ${i.comentario ? `<br><small style="color:#555; font-style:italic;">└ ${i.comentario}</small>` : ''}
        </td>
        <td style="padding: 3px 0; border-bottom: 1px dotted #ccc; text-align: right;">$${(i.cantidad * i.precio).toFixed(2)}</td>
      </tr>`).join("");

    modal.innerHTML = `
      <div id="areaImpresion" style="font-family: 'Courier New', monospace; color: black; background: white; padding: 20px; font-size: 13px;">
        <!-- ENCABEZADO -->
        <div style="text-align: center; margin-bottom: 10px;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">${nombreRest}</h2>
            <p style="font-size: 11px; margin: 2px 0;">${dirRest}</p>
            <p style="font-size: 11px; margin: 2px 0;">Tel: ${telRest}</p>
        </div>

        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

        <!-- DATOS DE ORDEN -->
        <div style="font-size: 12px;">
            <p style="margin: 2px 0;"><strong>MESA:</strong> ${mesa.toUpperCase()}</p>
            <p style="margin: 2px 0;"><strong>FECHA:</strong> ${fechaActual}</p>
            <p style="margin: 2px 0;"><strong>PAGO:</strong> ${metodo.toUpperCase()}</p>
        </div>

        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

        <!-- PRODUCTOS -->
        <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="text-align: left; padding-bottom: 5px;">CANT</th>
                    <th style="text-align: left; padding-bottom: 5px;">DESC</th>
                    <th style="text-align: right; padding-bottom: 5px;">TOTAL</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>

        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

        <!-- TOTALES -->
        <div style="text-align: right; font-size: 14px;">
            <h3 style="margin: 5px 0; font-size: 18px;">TOTAL: $${total.toFixed(2)}</h3>
        </div>

        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

        <!-- PIE DE TICKET -->
        <div style="text-align: center; font-size: 11px;">
            <p style="margin: 5px 0; font-weight: bold;">${msjRest}</p>
            <p style="margin: 2px 0;">*** ORDEN LISTA ***</p>
        </div>
      </div>
      
      <!-- BOTONES DE ACCIÓN -->
      <div class="no-print" style="display: flex; gap: 8px; padding: 15px; background: #f9f9f9; border-top: 1px solid #ddd; border-radius: 0 0 12px 12px;">
        <button id="btnPnt" style="flex: 1; padding: 10px; background: #333; color: white; border: none; border-radius: 6px; cursor: pointer;">🖨️ Imprimir</button>
        <button id="btnWts" style="flex: 1; padding: 10px; background: #25D366; color: white; border: none; border-radius: 6px; cursor: pointer;">📱 WhatsApp</button>
        <button onclick="document.getElementById('modalTicketMenu').close()" style="flex: 1; padding: 10px; background: #ccc; border: none; border-radius: 6px; cursor: pointer;">Cerrar</button>
      </div>`;
    
    modal.showModal();

    // LÓGICA DE IMPRESIÓN
    modal.querySelector("#btnPnt").onclick = () => {
      const win = window.open('', 'PRINT', 'height=600,width=400');
      win.document.write(`<html><body onload="window.print();window.close()" style="margin:0;">${document.getElementById("areaImpresion").innerHTML}</body></html>`);
      win.document.close();
    };

// LÓGICA DE WHATSAPP (GENERAR IMAGEN Y COMPARTIR)
modal.querySelector("#btnWts").onclick = async () => {
    const areaTicket = document.getElementById("areaImpresion");
    const btnWts = modal.querySelector("#btnWts");
    
    // 1. Feedback visual
    btnWts.disabled = true;
    btnWts.textContent = "Generando...";

    try {
        // 2. Convertir el HTML del ticket en un Canvas (imagen)
        // Usamos scale: 3 para que se vea en alta resolución (HD)
        const canvas = await html2canvas(areaTicket, { 
            scale: 3,
            backgroundColor: "#ffffff"
        });
        
        // 3. Convertir el Canvas a un archivo real (Blob)
        canvas.toBlob(async (blob) => {
            const file = new File([blob], `Ticket_${mesa}_${Date.now()}.png`, { type: "image/png" });

            // 4. ¿El navegador soporta compartir archivos? (Celulares y tablets)
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Ticket de Compra',
                        text: `Ticket de consumo - ${nombreRest}`
                    });
                } catch (err) {
                    console.log("Compartir cancelado o fallido", err);
                }
            } else {
                // 5. Opción para PC / Navegadores viejos: Descargar la imagen
                // Así el cajero solo la arrastra a WhatsApp Web
                const link = document.createElement('a');
                link.download = `Ticket_${mesa}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
                alert("La imagen del ticket se ha descargado. Puedes enviarla por WhatsApp Web.");
            }
            
            btnWts.disabled = false;
            btnWts.innerHTML = "📱 WhatsApp";
        }, "image/png");

    } catch (error) {
        console.error("Error generando imagen:", error);
        alert("No se pudo generar la imagen del ticket.");
        btnWts.disabled = false;
        btnWts.innerHTML = "📱 WhatsApp";
    }
};
  }

  inicializar();
});