// js/menu.js - GESTIÓN DE PEDIDOS E INVENTARIO (V5.2 - INTEGRADO)
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

        // Cargar número de mesas para el Select
        if (selectMesa) {
            selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
            selectMesa.innerHTML += `<option value="Para Llevar">🥡 Para Llevar</option>`;
            
            try {
                const { data: resto } = await db.from('restaurantes').select('num_mesas').eq('id', restoIdActivo).single();
                if (resto) {
                    for (let i = 1; i <= resto.num_mesas; i++) {
                        const optionValue = `Mesa ${i}`;
                        const isSelected = (mesaURL === i.toString()) ? 'selected' : '';
                        selectMesa.innerHTML += `<option value="${optionValue}" ${isSelected}>Mesa ${i}</option>`;
                    }
                }
            } catch (e) { console.error("Error cargando mesas", e); }
            
            if (mesaURL) selectMesa.disabled = true;
        }

        // Cargar productos y cruzar con Stock de suministros
        try {
            const { data: productos } = await db.from('productos').select('*').eq('restaurante_id', restoIdActivo);
            const { data: suministros } = await db.from('suministros').select('nombre, cantidad').eq('restaurante_id', restoIdActivo);
            
            if (productos) { 
                productosMenu = productos.map(p => {
                    const insumo = suministros?.find(s => s.nombre.toLowerCase() === p.nombre.toLowerCase());
                    return { 
                        ...p, 
                        stock: insumo ? Math.floor(insumo.cantidad) : '∞',
                        categoria: p.categoria || 'Otros'
                    };
                });
                dibujarMenu(); 
            }
        } catch (err) { console.error("Error al inicializar menú:", err); }
    }

    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        // Botón "Nuevo" solo para dueños
        if (sesion.rol === 'dueño') {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
            btnNuevo.innerHTML = `<div style="font-size:2rem; color:#10ad93;">+</div><p>Nuevo Platillo</p>`;
            btnNuevo.onclick = () => abrirEditor();
            contenedorProductos.appendChild(btnNuevo);
        }

        productosMenu.forEach(p => {
            const art = document.createElement('article');
            art.className = "tarjeta-producto";
            const img = p.imagen_url || 'https://via.placeholder.com/150?text=Platillo';
            
            art.innerHTML = `
                <div class="img-container">
                    <img src="${img}" alt="${p.nombre}">
                    ${sesion.rol === 'dueño' ? `<button class="edit-btn" onclick="abrirEditor('${p.id}', event)">✏️</button>` : ''}
                </div>
                <div class="info">
                    <h4 style="margin:5px 0;">${p.nombre}</h4>
                    <p style="color:#10ad93; font-weight:bold; margin:0;">$${parseFloat(p.precio).toFixed(2)}</p>
                    <small class="stock-tag ${p.stock <= 0 ? 'sin-stock' : ''}">${p.stock <= 0 ? 'Agotado' : 'Stock: ' + p.stock}</small>
                </div>
            `;
            art.onclick = (e) => { 
                if(!e.target.classList.contains('edit-btn')) agregarItem(p); 
            };
            contenedorProductos.appendChild(art);
        });
    }

    // --- 2. LÓGICA DEL CARRITO ---
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
            <div class="item-carrito">
                <div><strong>${item.cantidad}x</strong> ${item.nombre}</div>
                <div>
                    <span>$${(item.precio * item.cantidad).toFixed(2)}</span>
                    <button onclick="window.quitarUno('${item.id}')" style="background:none; border:none; color:#e53935; margin-left:10px; cursor:pointer;">✕</button>
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

    // --- 3. PROCESAR ORDEN ---
    btnProcesar.onclick = async () => {
        const mesaLabel = selectMesa.value;
        if (!mesaLabel) return alert("Por favor, selecciona una mesa o 'Para Llevar'");

        let metodoPago = null;
        if (mesaLabel === "Para Llevar") {
            const confirmPago = confirm("¿El pago es con TARJETA o QR? (Aceptar = Tarjeta/QR, Cancelar = Efectivo)");
            metodoPago = confirmPago ? 'tarjeta' : 'efectivo';
        }

        btnProcesar.disabled = true;
        btnProcesar.innerText = "Enviando...";

        const totalFinal = parseFloat(ordenTotalSpan.textContent.replace('$', ''));
        const productosTexto = ordenActual.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

        const datosOrden = {
            mesa: mesaLabel,
            productos: productosTexto,
            total: totalFinal,
            comentarios: comentarioInput.value || '',
            estado: 'pendiente',
            restaurante_id: restoIdActivo
        };

        try {
            // A. Registrar en cocina
            const { error: errorOrden } = await db.from('ordenes').insert([datosOrden]);
            if (errorOrden) throw errorOrden;

            // B. Si fue "Para Llevar", registrar directamente en Ventas
            if (mesaLabel === "Para Llevar") {
                await db.from('ventas').insert([{
                    restaurante_id: restoIdActivo,
                    total: totalFinal,
                    metodo_pago: metodoPago,
                    productos: productosTexto,
                    mesa: "LLEVAR"
                }]);
            }

            alert("✅ Orden procesada con éxito");
            window.location.href = (sesion.rol === 'invitado') ? `menu.html?rid=${restoIdActivo}` : "mesas.html";
            
        } catch (err) {
            console.error(err);
            alert("Error al procesar: " + (err.message || "Error desconocido"));
            btnProcesar.disabled = false;
            btnProcesar.innerText = "🚀 Procesar Pedido";
        }
    };

    // --- 4. EDITOR DE PRODUCTOS (SOLO DUEÑOS) ---
    window.abrirEditor = (id = null, e = null) => {
        if(e) e.stopPropagation();
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
            document.getElementById('editCategoria').value = p.categoria || "Platillo";
            document.getElementById('imgPreview').src = p.imagen_url || "https://via.placeholder.com/150";
        }
        modal.showModal();
    };

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

                if (!id) {
                    await db.from('suministros').insert([{
                        nombre: nombre,
                        cantidad: 0,
                        unidad: 'unidades',
                        restaurante_id: restoIdActivo
                    }]);
                }
                
                document.getElementById('modalEditarMenu').close();
                inicializar(); 
            } catch (err) {
                alert("Error al guardar: " + err.message);
            }
        };
    }

    inicializar();
});