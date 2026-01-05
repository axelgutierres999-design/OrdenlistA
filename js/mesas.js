// js/mesas.js - GESTIÓN DE MESAS, COBROS Y CONFIGURACIÓN (V7.1 - INTEGRADO)
document.addEventListener('DOMContentLoaded', () => {
    const gridMesas = document.getElementById('gridMesas');
    const modalConfig = document.getElementById('modalConfigMesas');
    const modalCobro = document.getElementById('modalCobro');
    
    // Variables globales para el cobro
    let mesaActualCobro = null;
    let totalActualCobro = 0;
    let ordenesIdsCobro = []; 

    // 1. RENDERIZADO DE MESAS
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
            
            // FILTRAR: Buscamos TODAS las órdenes activas para esta mesa
            const ordenesMesa = ordenes.filter(o => 
                o.mesa === nombreMesa && 
                !['pagado', 'cancelado', 'entregado'].includes(o.estado)
            );

            // CALCULAR TOTAL ACUMULADO
            const ocupada = ordenesMesa.length > 0;
            const totalMesa = ordenesMesa.reduce((acc, orden) => acc + parseFloat(orden.total), 0);

            // ESTADO VISUAL
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
            // Mantenemos estilos para asegurar visibilidad
            div.style = `border: 2px solid ${ocupada ? '#10ad93' : '#ddd'}; padding: 15px; border-radius: 12px; background: ${ocupada ? '#f0fff4' : 'white'}; text-align: center;`;
            
            div.innerHTML = `
                <div class="mesa-header" style="margin-bottom: 10px;">
                    <h3 style="margin:0;">${nombreMesa}</h3>
                    <span class="badge-mesa badge-${estadoClase}" style="font-weight:bold; color:${ocupada ? '#10ad93' : '#888'};">${estadoTexto}</span>
                </div>
                
                <div class="mesa-actions" style="display: flex; flex-direction: column; gap: 5px;">
                    ${ocupada ? `
                        <button onclick="abrirModalCobro('${nombreMesa}', ${totalMesa})" style="background:#10ad93; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-weight:bold;">
                            💰 Cobrar
                        </button>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                            <button onclick="verTicketMesa('${nombreMesa}')" class="secondary outline" style="padding:5px; font-size:0.8rem;">🧾 Ticket</button>
                            <button onclick="agregarPedido('${i}')" class="contrast outline" style="padding:5px; font-size:0.8rem;">+ Pedir</button>
                        </div>
                    ` : `
                        <button onclick="agregarPedido('${i}')" style="background:white; color:#10ad93; border:1px solid #10ad93; padding:8px; border-radius:5px; cursor:pointer;">
                            📝 Nueva Orden
                        </button>
                    `}
                </div>
            `;
            gridMesas.appendChild(div);
        }
    }

    // 2. ABRIR MODAL DE COBRO
    window.abrirModalCobro = (mesa, total) => {
        mesaActualCobro = mesa;
        totalActualCobro = total;
        
        const ordenes = App.getOrdenes().filter(o => 
            o.mesa === mesa && 
            !['pagado', 'cancelado'].includes(o.estado)
        );
        ordenesIdsCobro = ordenes.map(o => o.id);

        // Intentar usar el modal de App si existe, o el local
        if (typeof App.liberarMesaManual === 'function' && ordenesIdsCobro.length === 1) {
            App.liberarMesaManual(ordenesIdsCobro[0]);
        } else {
            // Lógica para cobrar múltiples órdenes juntas
            const titulo = document.getElementById('cobroMesaTitulo');
            const monto = document.getElementById('cobroTotal');
            if(titulo) titulo.textContent = mesa;
            if(monto) monto.textContent = total.toFixed(2);
            if(modalCobro) modalCobro.showModal();
        }
    };

    // 3. PROCESAR EL PAGO (MULTIPLE)
    window.procesarPago = async (metodo) => {
        if (!mesaActualCobro || ordenesIdsCobro.length === 0) return;
        const restoId = App.getRestoId();

        try {
            for (const id of ordenesIdsCobro) {
                const ordenData = App.getOrdenes().find(o => o.id === id);
                if (ordenData) {
                    // 1. Insertar en ventas
                    await db.from('ventas').insert([{
                        restaurante_id: restoId,
                        mesa: ordenData.mesa,
                        productos: ordenData.productos,
                        total: ordenData.total,
                        metodo_pago: metodo
                    }]);
                    
                    // 2. Marcar orden como pagada
                    await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
                }
            }
            
            alert("✅ Pago registrado. Mesa liberada.");
            if(modalCobro) modalCobro.close();
            // El realtime de App.js refrescará la UI

        } catch (error) {
            console.error(error);
            alert("❌ Error al procesar el pago.");
        }
    };

    // 4. VER TICKET UNIFICADO
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
            // Si productos es string, lo limpiamos; si es array, lo recorremos
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
        } else {
            // Si no hay modal de ticket en HTML, usamos el detalle de App
            App.verDetalleMesa(ordenes[0].id);
        }
    };

    // 5. NAVEGACIÓN Y CONFIGURACIÓN
    window.agregarPedido = (numMesa) => {
        window.location.href = `menu.html?mesa=Mesa ${numMesa}`;
    };

    window.guardarConfiguracionMesasLocal = async () => {
        const input = document.getElementById('inputNumMesas');
        if (!input) return;
        const n = parseInt(input.value);
        if (n > 0 && n <= 100) {
            await App.guardarConfiguracionMesas(n);
            if(modalConfig) modalConfig.close();
        } else {
            alert("Ingresa un número entre 1 y 100.");
        }
    };

    // Botón de configuración
    const btnConfig = document.getElementById('btnConfigMesas');
    if(btnConfig) btnConfig.onclick = () => modalConfig.showModal();

    // Iniciar registro en el App Core
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
    }
});