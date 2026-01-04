// js/menu.js - GESTIÓN PROFESIONAL DE MENÚ, PEDIDOS E INVENTARIO
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

    // 1. CARGA INICIAL Y VINCULACIÓN CON SUMINISTROS
    async function inicializar() {
        if (!restoIdActivo) return;

        // Configuración de Mesas
        if (mesaURL) {
            if (selectMesa) {
                selectMesa.innerHTML = `<option value="Mesa ${mesaURL}" selected>Mesa ${mesaURL}</option>`;
                selectMesa.disabled = true;
            }
        } else if (selectMesa) {
            const { data: resto } = await db.from('restaurantes').select('num_mesas').eq('id', restoIdActivo).single();
            if (resto) {
                selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
                // Opción para llevar integrada
                selectMesa.innerHTML += `<option value="Para Llevar">🥡 Para Llevar</option>`;
                for (let i = 1; i <= resto.num_mesas; i++) {
                    selectMesa.innerHTML += `<option value="Mesa ${i}">Mesa ${i}</option>`;
                }
            }
        }

        // Cargar productos y cruzar con tabla de suministros para el Stock
        const { data: productos } = await db.from('productos').select('*').eq('restaurante_id', restoIdActivo);
        const { data: suministros } = await db.from('suministros').select('nombre, cantidad').eq('restaurante_id', restoIdActivo);
        
        if (productos) { 
            productosMenu = productos.map(p => {
                const insumo = suministros?.find(s => s.nombre.toLowerCase() === p.nombre.toLowerCase());
                return { ...p, stock: insumo ? Math.floor(insumo.cantidad) : '∞' };
            });
            dibujarMenu(); 
        }
    }

    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        // Botón Nuevo Platillo (Solo Dueños)
        if (sesion.rol === 'dueño') {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
            btnNuevo.innerHTML = `<div class="plus-icon">+</div><p>Nuevo Platillo</p>`;
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
                    <p class="precio">$${parseFloat(p.precio).toFixed(2)}</p>
                    <small class="stock-tag ${p.stock <= 0 ? 'sin-stock' : ''}">Disp: ${p.stock}</small>
                </div>
            `;
            art.onclick = (e) => { if(!e.target.classList.contains('edit-btn')) agregarItem(p); };
            contenedorProductos.appendChild(art);
        });
    }

    // 2. LÓGICA DEL CARRITO (CON TACHE DE ELIMINAR ❌)
    function agregarItem(producto) {
        if (producto.stock !== '∞' && producto.stock <= 0) return alert("Producto agotado en inventario");
        const existe = ordenActual.find(i => i.id === producto.id);
        if (existe) existe.cantidad++;
        else ordenActual.push({ ...producto, cantidad: 1 });
        renderizarCarrito();
    }

    function renderizarCarrito() {
        if(!listaItemsOrden) return;
        if(ordenActual.length === 0) {
            listaItemsOrden.innerHTML = '<small>La orden está vacía.</small>';
            ordenTotalSpan.textContent = '$0.00';
            btnProcesar.disabled = true;
            return;
        }

        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-carrito">
                <div class="item-info">
                    <strong>${item.cantidad}x</strong> ${item.nombre}
                </div>
                <div class="item-acciones">
                    <span>$${(item.precio * item.cantidad).toFixed(2)}</span>
                    <button class="btn-tache" onclick="event.stopPropagation(); window.quitarUno('${item.id}')">❌</button>
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

    // 3. PROCESAR ORDEN
    btnProcesar.onclick = async () => {
        const mesaLabel = selectMesa.value;
        if (!mesaLabel) return alert("Por favor, selecciona una mesa o 'Para Llevar'");

        const nuevaOrden = {
            id: 'ORD-' + Date.now(),
            mesa: mesaLabel,
            productos: ordenActual.map(i => `${i.cantidad}x ${i.nombre}`).join(', '),
            total: parseFloat(ordenTotalSpan.textContent.replace('$', '')),
            comentarios: comentarioInput.value,
            restaurante_id: restoIdActivo,
            estado: 'pendiente'
        };

        const { error } = await db.from('ordenes').insert([nuevaOrden]);
        if (!error) {
            alert("🚀 ¡Orden enviada con éxito!");
            window.location.href = "mesas.html";
        } else {
            alert("Error: " + error.message);
        }
    };

    // 4. EDITOR Y VINCULACIÓN CON INVENTARIO
    window.abrirEditor = (id = null, e = null) => {
        if(e) e.stopPropagation();
        const form = document.getElementById('formProducto');
        form.reset();
        
        const preview = document.getElementById('imgPreview');
        if(preview) preview.src = 'https://via.placeholder.com/150';

        document.getElementById('editId').value = id || "";
        
        if (id) {
            const p = productosMenu.find(x => x.id === id);
            document.getElementById('editNombre').value = p.nombre;
            document.getElementById('editPrecio').value = p.precio;
            document.getElementById('editImg').value = p.imagen_url || "";
            if(preview && p.imagen_url) preview.src = p.imagen_url;
            if(document.getElementById('editCategoria')) document.getElementById('editCategoria').value = p.categoria || "Otros";
        }
        document.getElementById('modalEditarMenu').showModal();
    };

    document.getElementById('formProducto').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        const nombre = document.getElementById('editNombre').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if(submitBtn) submitBtn.disabled = true;

        const datos = {
            nombre: nombre,
            precio: parseFloat(document.getElementById('editPrecio').value),
            imagen_url: document.getElementById('editImg').value || null,
            categoria: document.getElementById('editCategoria')?.value || 'General',
            restaurante_id: restoIdActivo
        };

        try {
            let error;
            if (id && id !== "") {
                const res = await db.from('productos').update(datos).eq('id', id);
                error = res.error;
            } else {
                // INSERTAR PRODUCTO Y CREAR ENTRADA EN INVENTARIO AUTOMÁTICAMENTE
                const res = await db.from('productos').insert([datos]);
                error = res.error;

                if(!error) {
                    // Si es nuevo, creamos el registro en suministros/stock para que aparezca en el inventario
                    await db.from('suministros').insert([{
                        nombre: nombre,
                        cantidad: 0,
                        unidad: 'unidades',
                        restaurante_id: restoIdActivo
                    }]);
                }
            }

            if (error) throw error;

            document.getElementById('modalEditarMenu').close();
            await inicializar(); 
            alert("¡Producto y Stock sincronizados!");

        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            if(submitBtn) submitBtn.disabled = false;
        }
    };

    // Escuchar cambios en stock en tiempo real
    db.channel('cambios-menu').on('postgres_changes', { event: '*', schema: 'public', table: 'suministros' }, () => inicializar()).subscribe();

    inicializar();
});