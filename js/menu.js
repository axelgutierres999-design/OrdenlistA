// js/menu.js - TOMA DE PEDIDOS Y GESTIÓN DE PRODUCTOS (CORREGIDO)
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const mesaQR = params.get('mesa');
    const restauranteIdQR = params.get('rid'); 
    
    const sesion = JSON.parse(localStorage.getItem('sesion_activa')) || { rol: 'invitado' };
    const restoIdActivo = restauranteIdQR || sesion.restaurante_id;
    let modoCliente = !!mesaQR;

    if (modoCliente) document.body.classList.add('modo-cliente');

    const contenedorProductos = document.getElementById('contenedorProductos');
    const listaItemsOrden = document.getElementById('listaItemsOrden');
    const ordenTotalSpan = document.getElementById('ordenTotal');
    const btnProcesar = document.getElementById('btnProcesarOrden');
    const selectMesa = document.getElementById('selectMesa');
    const comentarioInput = document.getElementById('comentarioPedido');

    let ordenActual = [];
    let productosMenu = [];

    // 1. CARGAR CONFIGURACIÓN DEL RESTAURANTE Y MENÚ
    async function inicializar() {
        if (!restoIdActivo) return;

        // Cargar datos del restaurante (específicamente el número de mesas)
        const { data: resto } = await db.from('restaurantes').select('num_mesas').eq('id', restoIdActivo).single();
        
        if (resto && selectMesa && !modoCliente) {
            generarOpcionesMesas(resto.num_mesas);
        }

        // Cargar productos
        const { data: productos } = await db.from('productos')
            .select('*')
            .eq('restaurante_id', restoIdActivo)
            .order('categoria');
            
        if (productos) { 
            productosMenu = productos; 
            dibujarMenu(); 
        }
    }

    // Genera las opciones del select de mesas basado en la DB
    function generarOpcionesMesas(cantidad) {
        selectMesa.innerHTML = '<option value="" disabled selected>Seleccionar Mesa</option>';
        for (let i = 1; i <= cantidad; i++) {
            const opt = document.createElement('option');
            opt.value = `Mesa ${i}`;
            opt.textContent = `Mesa ${i}`;
            selectMesa.appendChild(opt);
        }
    }

    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        // Botón de nuevo producto solo para dueños
        if (sesion.rol === 'dueño' && !modoCliente) {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto";
            btnNuevo.style = "border: 2px dashed #10ad93; display:flex; flex-direction:column; justify-content:center; align-items:center; cursor:pointer; min-height:180px;";
            btnNuevo.innerHTML = `<h3 style="color:#10ad93; margin:0;">+</h3><p style="color:#10ad93;">Nuevo Producto</p>`;
            btnNuevo.onclick = () => abrirEditor();
            contenedorProductos.appendChild(btnNuevo);
        }

        productosMenu.forEach(p => {
            const art = document.createElement('article');
            art.className = "tarjeta-producto";
            const imagen = p.imagen_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=80';
            
            const btnEdit = (sesion.rol === 'dueño' && !modoCliente) 
                ? `<button class="btn-editar-flotante" onclick="abrirEditor('${p.id}', event)" style="position:absolute; top:5px; right:5px; z-index:10; background:white; border-radius:50%; border:1px solid #ccc; width:30px; height:30px;">✏️</button>` : '';

            art.style.position = 'relative';
            art.innerHTML = `
                ${btnEdit}
                <img src="${imagen}" alt="${p.nombre}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;">
                <h4 style="margin: 10px 0 5px 0; font-size:1rem;">${p.nombre}</h4>
                <footer style="margin-top:auto;"><strong>$${parseFloat(p.precio).toFixed(2)}</strong></footer>
            `;
            art.onclick = (e) => { 
                if(!e.target.closest('.btn-editar-flotante')) agregarItem(p); 
            };
            contenedorProductos.appendChild(art);
        });
    }

    function agregarItem(producto) {
        const existe = ordenActual.find(i => i.id === producto.id);
        if (existe) {
            existe.cantidad++;
        } else {
            ordenActual.push({ ...producto, cantidad: 1 });
        }
        renderizarCarrito();
    }

    window.eliminarItem = (id) => {
        const idx = ordenActual.findIndex(i => i.id === id);
        if (idx > -1) {
            if (ordenActual[idx].cantidad > 1) ordenActual[idx].cantidad--;
            else ordenActual.splice(idx, 1);
            renderizarCarrito();
        }
    };

    function renderizarCarrito() {
        if (!listaItemsOrden) return;
        
        if (ordenActual.length === 0) {
            listaItemsOrden.innerHTML = '<small style="color:#999;">La orden está vacía.</small>';
            ordenTotalSpan.textContent = '$0.00';
            btnProcesar.disabled = true;
            return;
        }

        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-orden" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;">
                <span><b>${item.cantidad}x</b> ${item.nombre}</span>
                <div style="display:flex; gap:10px; align-items:center;">
                    <span style="font-weight:bold;">$${(item.precio * item.cantidad).toFixed(2)}</span>
                    <span onclick="eliminarItem('${item.id}')" style="cursor:pointer; color:#e74c3c; font-size:1.2rem;">&times;</span>
                </div>
            </div>
        `).join('');

        const total = ordenActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
        btnProcesar.disabled = false;
    }

    btnProcesar.onclick = async () => {
        const mesa = selectMesa ? selectMesa.value : `Mesa ${mesaQR}`;
        if (!mesa && !modoCliente) return alert("Por favor selecciona una mesa");

        const productosStr = ordenActual.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
        const total = parseFloat(ordenTotalSpan.textContent.replace('$',''));

        const nuevaOrden = {
            id: `ORD-${Date.now()}`,
            mesa: mesa,
            productos: productosStr,
            total: total,
            comentarios: comentarioInput.value,
            restaurante_id: restoIdActivo,
            estado: modoCliente ? 'por_confirmar' : 'pendiente'
        };

        const { error } = await db.from('ordenes').insert([nuevaOrden]);
        if (!error) {
            alert("✅ Orden enviada correctamente");
            ordenActual = [];
            comentarioInput.value = "";
            renderizarCarrito();
        } else {
            alert("❌ Error al enviar: " + error.message);
        }
    };

    // --- CRUD DE PRODUCTOS ---
    window.abrirEditor = (id = null, e = null) => {
        if(e) e.stopPropagation();
        const form = document.getElementById('formProducto');
        form.reset();
        document.getElementById('editId').value = id || "";
        
        if (id) {
            const p = productosMenu.find(x => x.id === id);
            document.getElementById('editNombre').value = p.nombre;
            document.getElementById('editPrecio').value = p.precio;
            document.getElementById('editCategoria').value = p.categoria;
        }
        document.getElementById('modalEditarMenu').showModal();
    };

    document.getElementById('formProducto').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        
        const datos = {
            nombre: document.getElementById('editNombre').value.trim(),
            precio: parseFloat(document.getElementById('editPrecio').value),
            categoria: document.getElementById('editCategoria').value,
            restaurante_id: restoIdActivo 
        };

        let result;
        if (id) {
            result = await db.from('productos').update(datos).eq('id', id);
        } else {
            result = await db.from('productos').insert([datos]);
        }

        if (!result.error) {
            document.getElementById('modalEditarMenu').close();
            inicializar(); // Recargar menú
        } else {
            alert("Error al guardar producto: " + result.error.message);
        }
    };

    inicializar();
});