// js/menu.js - GESTIÓN PROFESIONAL DE MENÚ, PEDIDOS E INVENTARIO (V5 - PAGO PARA LLEVAR)
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

    // 1. CARGA INICIAL
    async function inicializar() {
        if (!restoIdActivo) return;

        // Configuración de Mesas en el Select
        if (selectMesa) {
            selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
            selectMesa.innerHTML += `<option value="Para Llevar">🥡 Para Llevar</option>`;
            
            const { data: resto } = await db.from('restaurantes').select('num_mesas').eq('id', restoIdActivo).single();
            if (resto) {
                for (let i = 1; i <= resto.num_mesas; i++) {
                    const optionValue = `Mesa ${i}`;
                    const selected = (mesaURL === i.toString()) ? 'selected' : '';
                    selectMesa.innerHTML += `<option value="${optionValue}" ${selected}>Mesa ${i}</option>`;
                }
            }
            if (mesaURL) selectMesa.disabled = true;
        }

        // Cargar productos y cruzar con Stock
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
    }

    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        if (sesion.rol === 'dueño') {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
            btnNuevo.style.border = "2px dashed #10ad93";
            btnNuevo.innerHTML = `<div class="plus-icon" style="color:#10ad93; font-size:2rem; font-weight:bold;">+</div><p>Nuevo Platillo</p>`;
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
                    <h4>${p.nombre}</h4>
                    <p class="precio" style="color:#10ad93; font-weight:bold;">$${parseFloat(p.precio).toFixed(2)}</p>
                    <small class="stock-tag ${p.stock <= 0 ? 'sin-stock' : ''}">${p.stock <= 0 ? 'Agotado' : 'Disp: ' + p.stock}</small>
                </div>
            `;
            art.onclick = (e) => { if(!e.target.classList.contains('edit-btn')) agregarItem(p); };
            contenedorProductos.appendChild(art);
        });
    }

    // 2. LÓGICA DEL CARRITO
    function agregarItem(producto) {
        if (producto.stock !== '∞' && producto.stock <= 0) return alert("Producto agotado");
        const existe = ordenActual.find(i => i.id === producto.id);
        if (existe) existe.cantidad++;
        else ordenActual.push({ ...producto, cantidad: 1 });
        renderizarCarrito();
    }

    function renderizarCarrito() {
        if(!listaItemsOrden) return;
        if(ordenActual.length === 0) {
            listaItemsOrden.innerHTML = '<div style="text-align:center; padding:1rem; color:#888;">La orden está vacía.</div>';
            ordenTotalSpan.textContent = '$0.00';
            btnProcesar.disabled = true;
            return;
        }

        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-carrito" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                <div>
                    <strong>${item.cantidad}x</strong> ${item.nombre}
                    <br><small style="color:#888;">${item.categoria}</small>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-weight:bold;">$${(item.precio * item.cantidad).toFixed(2)}</span>
                    <button onclick="window.quitarUno('${item.id}')" style="background:none; border:none; color:red; cursor:pointer;">❌</button>
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

    // 3. PROCESAR ORDEN (CON PAGO SI ES PARA LLEVAR)
    btnProcesar.onclick = async () => {
        const mesaLabel = selectMesa.value;
        if (!mesaLabel) return alert("Selecciona una mesa");

        let metodoPago = null;

        // Si es para llevar, pedimos el método de pago antes de continuar
        if (mesaLabel === "Para Llevar") {
            const confirmPago = confirm("¿El pago es con TARJETA o QR? \n(Aceptar = Tarjeta, Cancelar = Efectivo)");
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
            restaurante_id: restoIdActivo,
            metodo_pago: metodoPago // Campo opcional para cocina/mesas
        };

        try {
            // A. Registrar en cocina
            const { error: errorOrden } = await App.addOrden(datosOrden);
            if (errorOrden) throw errorOrden;

            // B. Si fue "Para Llevar", registrar la venta de una vez en las estadísticas
            if (mesaLabel === "Para Llevar") {
                await db.from('ventas').insert([{
                    restaurante_id: restoIdActivo,
                    total: totalFinal,
                    metodo_pago: metodoPago,
                    productos: productosTexto,
                    mesa: "LLEVAR"
                }]);
            }

            alert("🚀 Orden enviada a cocina" + (metodoPago ? ` (Pago: ${metodoPago})` : ""));
            window.location.href = "mesas.html";
        } catch (err) {
            alert("Error: " + err.message);
            btnProcesar.disabled = false;
            btnProcesar.innerText = "Confirmar Orden";
        }
    };

    // 4. EDITOR DE PRODUCTOS
    window.abrirEditor = (id = null, e = null) => {
        if(e) e.stopPropagation();
        const form = document.getElementById('formProducto');
        if(!form) return;
        form.reset();
        
        document.getElementById('editId').value = id || "";
        if (id) {
            const p = productosMenu.find(x => x.id === id);
            document.getElementById('editNombre').value = p.nombre;
            document.getElementById('editPrecio').value = p.precio;
            document.getElementById('editImg').value = p.imagen_url || "";
            document.getElementById('editCategoria').value = p.categoria || "Platillo";
        }
        document.getElementById('modalEditarMenu').showModal();
    };

    document.getElementById('formProducto').onsubmit = async (e) => {
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

        const { error } = id 
            ? await db.from('productos').update(datos).eq('id', id)
            : await db.from('productos').insert([datos]);

        if (!error) {
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
        } else {
            alert("Error al guardar: " + error.message);
        }
    };

    inicializar();
});