// js/menu.js - GESTIÓN INTEGRAL, STOCK Y COBRO (V8.0 - REVISADO)
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const mesaURL = params.get('mesa'); 
    const restauranteIdURL = params.get('rid'); 
    
    const sesion = JSON.parse(localStorage.getItem('sesion_activa')) || { rol: 'invitado' };
    const restoIdActivo = restauranteIdURL || sesion.restaurante_id;
    
    const contenedorProductos = document.getElementById('contenedorProductos');
    const listaItemsOrden = document.getElementById('listaItemsOrden');
    const ordenTotalSpan = document.getElementById('ordenTotal');
    const btnProcesar = document.getElementById('btnProcesarOrden');
    const selectMesa = document.getElementById('selectMesa');
    const comentarioInput = document.getElementById('comentarioPedido');

    let ordenActual = [];
    let productosMenu = [];

    // --- 1. INICIALIZACIÓN ---
    async function inicializar() {
        if (!restoIdActivo) return;

        if (selectMesa) {
            selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
            selectMesa.innerHTML += `<option value="Para Llevar">🥡 Para Llevar</option>`;
            try {
                const { data: resto } = await db.from('restaurantes').select('num_mesas').eq('id', restoIdActivo).single();
                if (resto) {
                    for (let i = 1; i <= resto.num_mesas; i++) {
                        const mStr = `Mesa ${i}`;
                        // Verificamos si la mesa de la URL coincide
                        const isSelected = (mesaURL === mStr) ? 'selected' : '';
                        selectMesa.innerHTML += `<option value="${mStr}" ${isSelected}>Mesa ${i}</option>`;
                    }
                }
            } catch (e) { console.error("Error cargando mesas", e); }
            
            // Si viene de mesas.js, bloqueamos el select en esa mesa
            if (mesaURL) {
                selectMesa.value = mesaURL;
                selectMesa.disabled = true;
            }
        }
        await cargarDatosMenu();
    }

    async function cargarDatosMenu() {
        try {
            const { data: productos } = await db.from('productos').select('*').eq('restaurante_id', restoIdActivo);
            const { data: suministros } = await db.from('suministros').select('nombre, cantidad').eq('restaurante_id', restoIdActivo);
            
            if (productos) { 
                productosMenu = productos.map(p => {
                    const insumo = suministros?.find(s => s.nombre.toLowerCase() === p.nombre.toLowerCase());
                    return { 
                        ...p, 
                        stock: insumo ? Math.floor(insumo.cantidad) : '∞'
                    };
                });
                dibujarMenu(); 
            }
        } catch (err) { console.error("Error al cargar datos:", err); }
    }

    // --- 2. RENDERIZADO ---
    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        if (sesion.rol === 'dueño') {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
            btnNuevo.innerHTML = `<div style="font-size:3rem; color:#10ad93;">+</div><p>Nuevo Platillo</p>`;
            btnNuevo.onclick = () => abrirEditor();
            contenedorProductos.appendChild(btnNuevo);
        }

        productosMenu.forEach(p => {
            const art = document.createElement('article');
            art.className = "tarjeta-producto";
            art.innerHTML = `
                <div class="img-container">
                    <img src="${p.imagen_url || 'https://via.placeholder.com/150'}" alt="${p.nombre}">
                    ${sesion.rol === 'dueño' ? `<button class="edit-btn" onclick="event.stopPropagation(); abrirEditor('${p.id}')">✏️</button>` : ''}
                </div>
                <div class="info">
                    <h4>${p.nombre}</h4>
                    <p class="precio">$${parseFloat(p.precio).toFixed(2)}</p>
                    <small class="stock-tag ${p.stock <= 0 ? 'sin-stock' : ''}">${p.stock <= 0 ? 'Agotado' : 'Stock: ' + p.stock}</small>
                </div>
            `;
            art.onclick = () => agregarItem(p);
            contenedorProductos.appendChild(art);
        });
    }

    function agregarItem(producto) {
        if (producto.stock !== '∞' && producto.stock <= 0) return alert("Producto sin existencias");
        const existe = ordenActual.find(i => i.id === producto.id);
        if (existe) existe.cantidad++;
        else ordenActual.push({ ...producto, cantidad: 1 });
        renderizarCarrito();
    }

    function renderizarCarrito() {
        if(!listaItemsOrden) return;
        if(ordenActual.length === 0) {
            listaItemsOrden.innerHTML = '<small>No hay productos.</small>';
            ordenTotalSpan.textContent = '$0.00';
            btnProcesar.disabled = true;
            return;
        }

        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-carrito">
                <div><strong>${item.cantidad}x</strong> ${item.nombre}</div>
                <div>
                    <span>$${(item.precio * item.cantidad).toFixed(2)}</span>
                    <button onclick="quitarUno('${item.id}')">✕</button>
                </div>
            </div>
        `).join('');

        const total = ordenActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
        btnProcesar.disabled = false;
    }

    window.quitarUno = (id) => {
        const item = ordenActual.find(i => i.id === id);
        if (item.cantidad > 1) item.cantidad--;
        else ordenActual = ordenActual.filter(i => i.id !== id);
        renderizarCarrito();
    };

    // --- 3. PROCESAR ORDEN & COBRO ---
    btnProcesar.onclick = async () => {
        const mesaLabel = selectMesa.value;
        if (!mesaLabel) return alert("Selecciona mesa");

        if (mesaLabel === "Para Llevar") {
            const modalCobro = document.getElementById('modalCobro');
            const total = ordenActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
            document.getElementById('cobroMesaTitulo').textContent = "📦 Para Llevar";
            document.getElementById('cobroTotal').textContent = total.toFixed(2);
            
            window.procesarPago = async (metodo) => {
                await ejecutarEnvioPedido(mesaLabel, metodo);
                modalCobro.close();
            };
            modalCobro.showModal();
        } else {
            await ejecutarEnvioPedido(mesaLabel, null);
        }
    };

    async function ejecutarEnvioPedido(mesaLabel, metodoPago = null) {
        btnProcesar.disabled = true;
        btnProcesar.innerText = "⏳ Enviando...";

        const totalFinal = ordenActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        const productosTexto = ordenActual.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

        try {
            // A. Insertar Orden (Siempre 'pendiente' para que Cocina lo vea)
            const { data: nuevaOrden, error: errO } = await db.from('ordenes').insert([{
                restaurante_id: restoIdActivo,
                mesa: mesaLabel,
                productos: productosTexto,
                total: totalFinal,
                comentarios: comentarioInput.value || '',
                estado: 'pendiente' 
            }]).select().single();

            if (errO) throw errO;

            // B. Registrar Venta si es pago inmediato (Para Llevar)
            if (metodoPago) {
                await db.from('ventas').insert([{
                    restaurante_id: restoIdActivo,
                    total: totalFinal,
                    metodo_pago: metodoPago,
                    productos: productosTexto,
                    mesa: "LLEVAR"
                }]);
            }

            alert("✅ ¡Pedido enviado a cocina!");
            window.location.href = (sesion.rol === 'invitado') ? `menu.html?rid=${restoIdActivo}` : "mesas.html";
            
        } catch (err) {
            alert("Error: " + err.message);
            btnProcesar.disabled = false;
            btnProcesar.innerText = "🚀 Procesar Pedido";
        }
    }

    // --- 4. EDITOR Y VÍNCULO CON INVENTARIO ---
    window.abrirEditor = (id = null) => {
        const modal = document.getElementById('modalEditarMenu');
        const form = document.getElementById('formProducto');
        form.reset();
        document.getElementById('editId').value = id || "";
        
        if (id) {
            const p = productosMenu.find(x => x.id === id);
            document.getElementById('editNombre').value = p.nombre;
            document.getElementById('editPrecio').value = p.precio;
            document.getElementById('editImg').value = p.imagen_url || "";
            document.getElementById('editCategoria').value = p.categoria || "General";
        }
        modal.showModal();
    };

    const formProducto = document.getElementById('formProducto');
    if (formProducto) {
        formProducto.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const nombre = document.getElementById('editNombre').value.trim();
            const precio = parseFloat(document.getElementById('editPrecio').value);

            const datos = {
                nombre,
                precio,
                imagen_url: document.getElementById('editImg').value || null,
                categoria: document.getElementById('editCategoria').value,
                restaurante_id: restoIdActivo
            };

            try {
                // 1. Guardar en tabla Productos
                const { error } = id 
                    ? await db.from('productos').update(datos).eq('id', id)
                    : await db.from('productos').insert([datos]);

                if (error) throw error;

                // 2. SOLUCIÓN PUNTO 2: Vincular con Suministros automáticamente
                // Verificamos si ya existe un suministro con ese nombre
                const { data: existeSuministro } = await db.from('suministros')
                    .select('id')
                    .eq('restaurante_id', restoIdActivo)
                    .ilike('nombre', nombre)
                    .maybeSingle();

                if (!existeSuministro) {
                    // Si no existe, lo creamos para poder manejar su stock en la sección Inventario
                    await db.from('suministros').insert([{
                        nombre: nombre,
                        cantidad: 0,
                        unidad: 'unidades',
                        restaurante_id: restoIdActivo,
                        categoria: 'Platillos'
                    }]);
                }

                document.getElementById('modalEditarMenu').close();
                cargarDatosMenu(); 
            } catch (err) { alert("Error: " + err.message); }
        };
    }

    inicializar();
});