// js/menu.js - TOMA DE PEDIDOS Y GESTIÓN DE PRODUCTOS
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

    async function cargarMenu() {
        if (!restoIdActivo) return;
        const { data } = await db.from('productos').select('*').eq('restaurante_id', restoIdActivo).order('categoria');
        if (data) { productosMenu = data; dibujarMenu(); }
    }

    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        if (sesion.rol === 'dueño' && !modoCliente) {
            const btnNuevo = document.createElement('article');
            btnNuevo.className = "tarjeta-producto";
            btnNuevo.style = "border: 2px dashed #10ad93; display: flex; justify-content:center; align-items:center; cursor:pointer;";
            btnNuevo.innerHTML = `<h3 style="color:#10ad93;">+ Nuevo Producto</h3>`;
            btnNuevo.onclick = () => abrirEditor();
            contenedorProductos.appendChild(btnNuevo);
        }

        productosMenu.forEach(p => {
            const art = document.createElement('article');
            art.className = "tarjeta-producto";
            const imagen = p.imagen_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=80';
            const btnEdit = (sesion.rol === 'dueño' && !modoCliente) 
                ? `<button class="btn-editar-flotante" onclick="abrirEditor('${p.id}', event)">✏️</button>` : '';

            art.innerHTML = `
                ${btnEdit}
                <img src="${imagen}" alt="${p.nombre}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;">
                <h4 style="margin: 10px 0 5px 0;">${p.nombre}</h4>
                <footer><strong>$${parseFloat(p.precio).toFixed(2)}</strong></footer>
            `;
            art.onclick = (e) => { if(e.target.tagName !== 'BUTTON') agregarItem(p); };
            contenedorProductos.appendChild(art);
        });
    }

    function agregarItem(producto) {
        const existe = ordenActual.find(i => i.id === producto.id);
        if (existe) existe.cantidad++;
        else ordenActual.push({ ...producto, cantidad: 1 });
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
        if (ordenActual.length === 0) {
            listaItemsOrden.innerHTML = '<small>La orden está vacía.</small>';
            ordenTotalSpan.textContent = '$0.00';
            btnProcesar.disabled = true;
            return;
        }
        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-orden" style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span><b>${item.cantidad}x</b> ${item.nombre}</span>
                <span onclick="eliminarItem('${item.id}')" style="cursor:pointer; color:red;">❌</span>
            </div>
        `).join('');
        const total = ordenActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
        btnProcesar.disabled = false;
    }

    btnProcesar.onclick = async () => {
        const mesa = selectMesa ? selectMesa.value : `Mesa ${mesaQR}`;
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
            alert("Orden enviada");
            ordenActual = [];
            renderizarCarrito();
        }
    };

    // --- CRUD DE PRODUCTOS (CORREGIDO) ---
    window.abrirEditor = (id = null, e = null) => {
        if(e) e.stopPropagation();
        document.getElementById('formProducto').reset();
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
        const s = JSON.parse(localStorage.getItem('sesion_activa')); // Obtenemos sesión fresca
        
        const datos = {
            nombre: document.getElementById('editNombre').value,
            precio: parseFloat(document.getElementById('editPrecio').value),
            categoria: document.getElementById('editCategoria').value,
            restaurante_id: s.restaurante_id // REGLA DE ORO
        };

        const { error } = id 
            ? await db.from('productos').update(datos).eq('id', id) 
            : await db.from('productos').insert([datos]);

        if (!error) {
            document.getElementById('modalEditarMenu').close();
            cargarMenu();
        } else {
            alert("Error al guardar producto: " + error.message);
        }
    };

    cargarMenu();
});