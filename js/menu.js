// js/menu.js - GESTIÓN INTEGRAL (V6.2 - FIX UUID & EDITOR)
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

    // --- 1. CARGA INICIAL ---
    async function inicializar() {
        if (!restoIdActivo) return;

        // Cargar Mesas en el Select
        if (selectMesa) {
            selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
            selectMesa.innerHTML += `<option value="Para Llevar">🥡 Para Llevar</option>`;
            try {
                const { data: resto } = await db.from('restaurantes').select('num_mesas').eq('id', restoIdActivo).single();
                if (resto) {
                    for (let i = 1; i <= resto.num_mesas; i++) {
                        const mStr = `Mesa ${i}`;
                        const isSelected = (mesaURL == i) ? 'selected' : '';
                        selectMesa.innerHTML += `<option value="${mStr}" ${isSelected}>Mesa ${i}</option>`;
                    }
                }
            } catch (e) { console.error("Error cargando mesas", e); }
            if (mesaURL) selectMesa.disabled = true;
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

    // --- 2. RENDERIZADO DEL MENÚ ---
    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        // BOTÓN NUEVO PLATILLO (Solo para dueños)
        if (sesion.rol === 'dueño') {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
            btnNuevo.style = "border: 2px dashed #10ad93; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; min-height: 200px;";
            btnNuevo.innerHTML = `<div style="font-size:3rem; color:#10ad93;">+</div><p style="font-weight:bold; color:#10ad93;">Nuevo Platillo</p>`;
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

    // --- 3. GESTIÓN DEL CARRITO ---
    function agregarItem(producto) {
        if (producto.stock !== '∞' && producto.stock <= 0) return alert("Producto sin existencias");
        const existe = ordenActual.find(i => i.id === producto.id);
        if (existe) {
            existe.cantidad++;
        } else {
            ordenActual.push({ ...producto, cantidad: 1 });
        }
        renderizarCarrito();
    }

    function renderizarCarrito() {
        if(!listaItemsOrden) return;
        if(ordenActual.length === 0) {
            listaItemsOrden.innerHTML = '<small>No hay productos seleccionados.</small>';
            ordenTotalSpan.textContent = '$0.00';
            btnProcesar.disabled = true;
            return;
        }

        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-carrito" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                <div><strong>${item.cantidad}x</strong> ${item.nombre}</div>
                <div>
                    <span>$${(item.precio * item.cantidad).toFixed(2)}</span>
                    <button onclick="quitarUno('${item.id}')" style="background:none; border:none; color:#e53935; margin-left:10px; cursor:pointer; font-weight:bold;">✕</button>
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

    // --- 4. PROCESAR ORDEN (FIX UUID) ---
    btnProcesar.onclick = async () => {
        const mesaLabel = selectMesa.value;
        if (!mesaLabel) return alert("Por favor, selecciona mesa o destino");

        btnProcesar.disabled = true;
        btnProcesar.innerText = "Enviando...";

        const totalFinal = parseFloat(ordenTotalSpan.textContent.replace('$', ''));
        const productosTexto = ordenActual.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

        try {
            // A. Insertar Orden (El ID se genera automáticamente en la DB)
            const { data: nuevaOrden, error: errO } = await db.from('ordenes').insert([{
                restaurante_id: restoIdActivo,
                mesa: mesaLabel,
                productos: productosTexto,
                total: totalFinal,
                comentarios: comentarioInput.value || '',
                estado: 'pendiente'
            }]).select().single();

            if (errO) throw errO;

            // B. Insertar Detalles Atómicos
            const detalles = ordenActual.map(item => ({
                orden_id: nuevaOrden.id, // Usamos el UUID recién creado
                producto_id: item.id,
                cantidad: item.cantidad,
                precio_unitario: item.precio
            }));

            const { error: errD } = await db.from('detalles_orden').insert(detalles);
            if (errD) throw errD;

            // C. Registro directo en Ventas si es "Para Llevar"
            if (mesaLabel === "Para Llevar") {
                const metodo = confirm("¿El pago es con TARJETA?") ? 'tarjeta' : 'efectivo';
                await db.from('ventas').insert([{
                    restaurante_id: restoIdActivo,
                    total: totalFinal,
                    metodo_pago: metodo,
                    productos: productosTexto,
                    mesa: "LLEVAR"
                }]);
                await db.from('ordenes').update({ estado: 'pagado' }).eq('id', nuevaOrden.id);
            }

            alert("✅ Orden procesada con éxito");
            window.location.href = (sesion.rol === 'invitado') ? `menu.html?rid=${restoIdActivo}` : "mesas.html";
            
        } catch (err) {
            console.error(err);
            alert("Error al procesar: " + err.message);
            btnProcesar.disabled = false;
            btnProcesar.innerText = "🚀 Procesar Pedido";
        }
    };

    // --- 5. EDITOR DE PRODUCTOS (SOLO DUEÑOS) ---
    window.abrirEditor = (id = null) => {
        const modal = document.getElementById('modalEditarMenu');
        const form = document.getElementById('formProducto');
        if(!modal || !form) return;
        
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

    // Manejo del Guardado del Producto
    const formProducto = document.getElementById('formProducto');
    if (formProducto) {
        formProducto.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const nombre = document.getElementById('editNombre').value;

            const datos = {
                nombre: nombre,
                precio: parseFloat(document.getElementById('editPrecio').value),
                imagen_url: document.getElementById('editImg').value || null,
                categoria: document.getElementById('editCategoria').value,
                restaurante_id: restoIdActivo
            };

            try {
                const { error } = id 
                    ? await db.from('productos').update(datos).eq('id', id)
                    : await db.from('productos').insert([datos]);

                if (error) throw error;

                // Crear suministro base si es producto nuevo
                if (!id) {
                    await db.from('suministros').insert([{
                        nombre: nombre,
                        cantidad: 0,
                        unidad: 'unidades',
                        restaurante_id: restoIdActivo
                    }]);
                }
                
                document.getElementById('modalEditarMenu').close();
                cargarDatosMenu(); 
            } catch (err) {
                alert("Error al guardar: " + err.message);
            }
        };
    }

    inicializar();
});