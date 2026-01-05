    // js/mesas.js - GESTIÓN DE MESAS, COBROS Y CONFIGURACIÓN (V7.3 - ESTABLE + FIX GUARDAR)
document.addEventListener('DOMContentLoaded', () => {
    const gridMesas = document.getElementById('gridMesas');
    const modalCobro = document.getElementById('modalCobro');

    // Variables globales para el cobro
    let mesaActualCobro = null;
    let totalActualCobro = 0;
    let ordenesIdsCobro = [];

    // 🕒 Esperar a que App esté disponible
    function esperarAppYRenderizar() {
        if (typeof App !== 'undefined' && App.getOrdenes && App.getConfig) {
            App.registerRender('mesas', renderizarMesas);
            renderizarMesas();
        } else {
            setTimeout(esperarAppYRenderizar, 300);
        }
    }
    esperarAppYRenderizar();

    // =====================================================
    // 1️⃣ RENDERIZADO DE MESAS
    // =====================================================
    function renderizarMesas() {
        if (!gridMesas || typeof App === 'undefined') return;

        const config = App.getConfig();
        const ordenes = App.getOrdenes();
        const numMesas = config.num_mesas || 10;

        gridMesas.innerHTML = '';
        gridMesas.style.display = 'grid';
        gridMesas.style.gridTemplateColumns = `repeat(auto-fill, minmax(160px, 1fr))`;
        gridMesas.style.gap = '15px';

        for (let i = 1; i <= numMesas; i++) {
            const nombreMesa = `Mesa ${i}`;

            const ordenesMesa = ordenes.filter(o =>
                o.mesa === nombreMesa &&
                !['pagado', 'cancelado', 'entregado'].includes(o.estado)
            );

            const ocupada = ordenesMesa.length > 0;
            const totalMesa = ordenesMesa.reduce((acc, orden) => acc + parseFloat(orden.total), 0);

            let estadoClase = 'libre';
            let estadoTexto = 'Libre';
            if (ocupada) {
                const hayListas = ordenesMesa.some(o => o.estado === 'terminado');
                if (hayListas) {
                    estadoClase = 'listo';
                    estadoTexto = '🍽️ Sirviendo';
                } else {
                    estadoClase = 'ocupada';
                    estadoTexto = `Ocupada ($${totalMesa.toFixed(2)})`;
                }
            }

            const div = document.createElement('div');
            div.className = `tarjeta-mesa ${ocupada ? 'ocupada' : ''}`;
            div.style = `border: 2px solid ${ocupada ? '#10ad93' : '#ddd'}; 
                         padding: 15px; border-radius: 12px; 
                         background: ${ocupada ? '#f0fff4' : 'white'}; 
                         text-align: center; transition: all 0.2s ease;`;

            div.innerHTML = `
                <div class="mesa-header" style="margin-bottom: 10px;">
                    <h3 style="margin:0;">${nombreMesa}</h3>
                    <span class="badge-mesa badge-${estadoClase}" 
                          style="font-weight:bold; color:${ocupada ? '#10ad93' : '#888'};">
                          ${estadoTexto}
                    </span>
                </div>
                
                <div class="mesa-actions" style="display: flex; flex-direction: column; gap: 5px;">
                    ${ocupada ? `
                        <button onclick="abrirModalCobro('${nombreMesa}', ${totalMesa})" 
                                style="background:#10ad93; color:white; border:none; 
                                padding:8px; border-radius:5px; cursor:pointer; font-weight:bold;">
                            💰 Cobrar
                        </button>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                            <button onclick="verTicketMesa('${nombreMesa}')" 
                                    class="secondary outline" style="padding:5px; font-size:0.8rem;">🧾 Ticket</button>
                            <button onclick="agregarPedido('${i}')" 
                                    class="contrast outline" style="padding:5px; font-size:0.8rem;">+ Pedir</button>
                        </div>
                    ` : `
                        <button onclick="agregarPedido('${i}')" 
                                style="background:white; color:#10ad93; border:1px solid #10ad93; 
                                padding:8px; border-radius:5px; cursor:pointer;">
                            📝 Nueva Orden
                        </button>
                    `}
                </div>
            `;
            gridMesas.appendChild(div);
        }
    }

    // =====================================================
    // 2️⃣ COBRO Y PAGO
    // =====================================================
    window.abrirModalCobro = (mesa, total) => {
        mesaActualCobro = mesa;
        totalActualCobro = total;

        const ordenes = App.getOrdenes().filter(o =>
            o.mesa === mesa &&
            !['pagado', 'cancelado'].includes(o.estado)
        );
        ordenesIdsCobro = ordenes.map(o => o.id);

        const titulo = document.getElementById('cobroMesaTitulo');
        const monto = document.getElementById('cobroTotal');
        if (titulo) titulo.textContent = mesa;
        if (monto) monto.textContent = total.toFixed(2);
        if (modalCobro) modalCobro.showModal();
    };

    window.procesarPago = async (metodo) => {
        if (!mesaActualCobro || ordenesIdsCobro.length === 0) return;
        const restoId = App.getRestoId ? App.getRestoId() : null;
        if (!restoId) return alert("Error: restaurante no identificado.");

        try {
            for (const id of ordenesIdsCobro) {
                const ordenData = App.getOrdenes().find(o => o.id === id);
                if (ordenData) {
                    await db.from('ventas').insert([{
                        restaurante_id: restoId,
                        mesa: ordenData.mesa,
                        productos: ordenData.productos,
                        total: ordenData.total,
                        metodo_pago: metodo
                    }]);
                    await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
                }
            }

            alert("✅ Pago registrado correctamente.");
            if (modalCobro) modalCobro.close();
            renderizarMesas(); // refresco inmediato

        } catch (error) {
            console.error(error);
            alert("❌ Error al procesar el pago.");
        }
    };

    // =====================================================
    // 3️⃣ TICKET DE MESA
    // =====================================================
    window.verTicketMesa = (mesa) => {
        const ordenes = App.getOrdenes().filter(o =>
            o.mesa === mesa &&
            ['pendiente', 'preparando', 'terminado', 'entregado'].includes(o.estado)
        );

        if (ordenes.length === 0) return;

        let todosProductos = [];
        let granTotal = 0;
        let fechaInicio = ordenes[0].created_at;

        ordenes.forEach(o => {
            const items = typeof o.productos === 'string' ? o.productos.split(',') : o.productos;
            todosProductos = todosProductos.concat(items);
            granTotal += parseFloat(o.total);
        });

        const modalTicket = document.getElementById('modalTicket');
        if (modalTicket) {
            document.getElementById('t-mesa').textContent = mesa;
            document.getElementById('t-fecha').textContent = new Date(fechaInicio).toLocaleString();
            const tbody = document.getElementById('t-items');
            tbody.innerHTML = todosProductos.map(p => `
                <tr><td style="border-bottom:1px dashed #ccc; padding:5px;">${p}</td></tr>
            `).join('');
            document.getElementById('t-total').textContent = granTotal.toFixed(2);
            modalTicket.showModal();
        } else if (App.verDetalleMesa) {
            App.verDetalleMesa(ordenes[0].id);
        }
    };

    // =====================================================
    // 4️⃣ CONFIGURACIÓN DE MESAS
    // =====================================================
    window.guardarConfiguracionMesas = async () => {
        const input = document.getElementById('inputNumMesas');
        if (!input) return;
        const n = parseInt(input.value);
        if (isNaN(n) || n <= 0 || n > 100) {
            return alert("Ingresa un número entre 1 y 100.");
        }

        try {
            await App.guardarConfiguracionMesas(n);
            alert("✅ Número de mesas actualizado correctamente.");
            renderizarMesas();
        } catch (err) {
            console.error(err);
            alert("❌ No se pudo guardar la configuración.");
        }
    };

    // =====================================================
    // 5️⃣ REDIRECCIÓN A MENU
    // =====================================================
    window.agregarPedido = (numMesa) => {
        window.location.href = `menu.html?mesa=Mesa ${numMesa}`;
    };
});