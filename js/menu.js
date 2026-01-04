// js/menu.js - GESTIÓN DE PEDIDOS CON DESGLOSE (V6.0)
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

    async function inicializar() {
        if (!restoIdActivo) return;

        // Cargar Mesas
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
            } catch (e) { console.error("Error mesas", e); }
            if (mesaURL) selectMesa.disabled = true;
        }

        // Cargar Productos y Stock
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
        } catch (err) { console.error("Error menú", err); }
    }

    function dibujarMenu() {
        if (!contenedorProductos) return;
        contenedorProductos.innerHTML = '';

        productosMenu.forEach(p => {
            const art = document.createElement('article');
            art.className = "tarjeta-producto";
            art.innerHTML = `
                <div class="img-container">
                    <img src="${p.imagen_url || 'https://via.placeholder.com/150'}" alt="${p.nombre}">
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
        if (producto.stock !== '∞' && producto.stock <= 0) return alert("Sin existencias");
        const existe = ordenActual.find(i => i.id === producto.id);
        if (existe) existe.cantidad++;
        else ordenActual.push({ ...producto, cantidad: 1 });
        renderizarCarrito();
    }

    function renderizarCarrito() {
        if(!listaItemsOrden) return;
        listaItemsOrden.innerHTML = ordenActual.map(item => `
            <div class="item-carrito" style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span><strong>${item.cantidad}x</strong> ${item.nombre}</span>
                <button onclick="quitarUno('${item.id}')" style="background:none; border:none; color:red;">✕</button>
            </div>
        `).join('');
        const total = ordenActual.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        ordenTotalSpan.textContent = `$${total.toFixed(2)}`;
        btnProcesar.disabled = ordenActual.length === 0;
    }

    window.quitarUno = (id) => {
        const idx = ordenActual.findIndex(i => i.id === id);
        if (ordenActual[idx].cantidad > 1) ordenActual[idx].cantidad--;
        else ordenActual.splice(idx, 1);
        renderizarCarrito();
    };

    // --- PROCESAR ORDEN (NUEVA LÓGICA DE DETALLES) ---
    btnProcesar.onclick = async () => {
        const mesaLabel = selectMesa.value;
        if (!mesaLabel) return alert("Selecciona una mesa");

        btnProcesar.disabled = true;
        btnProcesar.innerText = "Enviando...";

        const totalFinal = parseFloat(ordenTotalSpan.textContent.replace('$', ''));
        const productosTexto = ordenActual.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

        try {
            // 1. Crear la cabecera de la orden
            const { data: nuevaOrden, error: errO } = await db.from('ordenes').insert([{
                mesa: mesaLabel,
                productos: productosTexto, // Resumen para vista rápida
                total: totalFinal,
                comentarios: comentarioInput.value || '',
                estado: 'pendiente',
                restaurante_id: restoIdActivo
            }]).select().single();

            if (errO) throw errO;

            // 2. Crear los detalles atómicos (Para ver platillo por platillo)
            const detalles = ordenActual.map(item => ({
                orden_id: nuevaOrden.id,
                producto_id: item.id,
                cantidad: item.cantidad,
                precio_unitario: item.precio
            }));

            const { error: errD } = await db.from('detalles_orden').insert(detalles);
            if (errD) throw errD;

            // 3. Si es "Para Llevar", cobrar de inmediato
            if (mesaLabel === "Para Llevar") {
                const met = confirm("¿Pago con Tarjeta/QR?") ? 'tarjeta' : 'efectivo';
                await db.from('ventas').insert([{
                    restaurante_id: restoIdActivo,
                    total: totalFinal,
                    metodo_pago: met,
                    productos: productosTexto,
                    mesa: "LLEVAR"
                }]);
                await db.from('ordenes').update({ estado: 'pagado' }).eq('id', nuevaOrden.id);
            }

            alert("✅ Pedido enviado correctamente");
            window.location.href = (sesion.rol === 'invitado') ? `menu.html?rid=${restoIdActivo}` : "mesas.html";

        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
            btnProcesar.disabled = false;
            btnProcesar.innerText = "🚀 Procesar Pedido";
        }
    };

    inicializar();
});