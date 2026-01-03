// js/menu.js - TOMA DE PEDIDOS Y GESTIÓN DE PRODUCTOS (CORREGIDO)
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

        if (mesaURL) {
            if (selectMesa) {
                selectMesa.innerHTML = `<option value="Mesa ${mesaURL}" selected>Mesa ${mesaURL}</option>`;
                selectMesa.disabled = true;
            }
        } else if (selectMesa) {
            const { data: resto } = await db.from('restaurantes').select('num_mesas').eq('id', restoIdActivo).single();
            if (resto) {
                selectMesa.innerHTML = '<option value="" disabled selected>Selecciona mesa...</option>';
                for (let i = 1; i <= resto.num_mesas; i++) {
                    selectMesa.innerHTML += `<option value="Mesa ${i}">Mesa ${i}</option>`;
                }
            }
        }

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

        if (sesion.rol === 'dueño') {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto nuevo-producto-btn";
            btnNuevo.style.cursor = "pointer";
            btnNuevo.innerHTML = `<div style="font-size:3rem; color:#10ad93;">+</div><p>Nuevo Platillo</p>`;
            btnNuevo.onclick = () => abrirEditor();
            contenedorProductos.appendChild(btnNuevo);
        }

        productosMenu.forEach(p => {
            const art = document.createElement('article');
            art.className = "tarjeta-producto";
            const img = p.imagen_url || 'https://via.placeholder.com/150?text=Platillo';
            
            art.innerHTML = `
                <img src="${img}" alt="${p.nombre}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;">
                <div class="info">
                    <h4>${p.nombre}</h4>
                    <p><strong>$${parseFloat(p.precio).toFixed(2)}</strong></p>
                    <small class="stock-tag">Disp: ${p.stock}</small>
                </div>
                ${sesion.rol === 'dueño' ? `<button class="edit-btn" onclick="abrirEditor('${p.id}', event)">✏️</button>` : ''}
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
        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-carrito" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <span>${item.cantidad}x ${item.nombre}</span>
                <button onclick="event.stopPropagation(); window.quitarUno('${item.id}')" style="padding:2px 8px;"> - </button>
            </div>
        `).join('');
        const total = ordenActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
        btnProcesar.disabled = ordenActual.length === 0;
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
        if (!mesaLabel) return alert("Selecciona una mesa");

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
            alert("¡Orden enviada!");
            window.location.href = "mesas.html";
        }
    };

    // 4. EDITOR DE PRODUCTOS
    window.abrirEditor = (id = null, e = null) => {
        if(e) e.stopPropagation();
        const form = document.getElementById('formProducto');
        form.reset();
        
        // Reset de imagen preview
        const preview = document.getElementById('imgPreview');
        if(preview) preview.src = 'https://via.placeholder.com/150';

        document.getElementById('editId').value = id || "";
        
        if (id) {
            const p = productosMenu.find(x => x.id === id);
            document.getElementById('editNombre').value = p.nombre;
            document.getElementById('editPrecio').value = p.precio;
            // Aseguramos que cargue en el input de texto editImg
            const inputImg = document.getElementById('editImg');
            if(inputImg) {
                inputImg.value = p.imagen_url || "";
                if(preview && p.imagen_url) preview.src = p.imagen_url;
            }
            if(document.getElementById('editCategoria')) {
                document.getElementById('editCategoria').value = p.categoria || "Otros";
            }
        }
        document.getElementById('modalEditarMenu').showModal();
    };

    // ENVÍO DEL FORMULARIO - SINCRONIZADO CON HTML
    document.getElementById('formProducto').onsubmit = async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editId').value;
        const nombre = document.getElementById('editNombre').value;
        const precio = parseFloat(document.getElementById('editPrecio').value);
        const inputImg = document.getElementById('editImg'); // ID correcto según el nuevo HTML
        const inputCat = document.getElementById('editCategoria');

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if(submitBtn) submitBtn.disabled = true;

        const datos = {
            nombre: nombre,
            precio: precio,
            imagen_url: inputImg ? inputImg.value : null,
            categoria: inputCat ? inputCat.value : 'General',
            restaurante_id: restoIdActivo
        };

        try {
            let error;
            if (id && id !== "") {
                const res = await db.from('productos').update(datos).eq('id', id);
                error = res.error;
            } else {
                const res = await db.from('productos').insert([datos]);
                error = res.error;
            }

            if (error) throw error;

            document.getElementById('modalEditarMenu').close();
            await inicializar(); 
            alert("¡Producto guardado!");

        } catch (err) {
            console.error("Error al guardar:", err);
            alert("Error: " + err.message);
        } finally {
            if(submitBtn) submitBtn.disabled = false;
        }
    };

    db.channel('productos-cambios').on('postgres_changes', { event: '*', schema: 'public', table: 'suministros' }, () => inicializar()).subscribe();

    inicializar();
});