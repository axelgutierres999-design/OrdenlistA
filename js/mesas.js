// js/mesas.js - GESTIÓN DE MESAS, COBROS Y CONFIGURACIÓN (V FINAL)
document.addEventListener('DOMContentLoaded', () => {
    const gridMesas = document.getElementById('gridMesas');
    const modalConfig = document.getElementById('modalConfigMesas');
    const modalCobro = document.getElementById('modalCobro');
    
    // Variables globales para el cobro
    let mesaActualCobro = null;
    let totalActualCobro = 0;
    let ordenesIdsCobro = []; // Guardará IDs de todas las órdenes de la mesa

    // 1. RENDERIZADO DE MESAS
    function renderizarMesas() {
        if (!gridMesas || typeof App === 'undefined') return;
        
        const config = App.getConfig();
        const ordenes = App.getOrdenes(); // Trae todas las órdenes
        const numMesas = config.num_mesas || 10;

        gridMesas.innerHTML = '';
        gridMesas.style.gridTemplateColumns = `repeat(auto-fill, minmax(160px, 1fr))`;

        for (let i = 1; i <= numMesas; i++) {
            const nombreMesa = `Mesa ${i}`;
            
            // FILTRAR: Buscamos TODAS las órdenes activas para esta mesa (no solo una)
            // Ignoramos las pagadas, canceladas o entregadas (si ya se fueron)
            const ordenesMesa = ordenes.filter(o => 
                o.mesa === nombreMesa && 
                o.estado !== 'pagado' && 
                o.estado !== 'cancelado' &&
                o.estado !== 'entregado' // Si ya se entregó pero no pagó, debe seguir aquí. Si tu flujo es cobrar antes, ajustamos.
            );

            // CALCULAR TOTAL ACUMULADO
            const ocupada = ordenesMesa.length > 0;
            const totalMesa = ordenesMesa.reduce((acc, orden) => acc + parseFloat(orden.total), 0);

            // ESTADO VISUAL
            let estadoClase = 'libre';
            let estadoTexto = 'Libre';
            if (ocupada) {
                // Si alguna orden está lista, mostramos aviso
                const hayListas = ordenesMesa.some(o => o.estado === 'terminado');
                if (hayListas) {
                    estadoClase = 'listo'; // Puedes definir estilo verde en CSS
                    estadoTexto = '🍽️ Sirviendo';
                } else {
                    estadoClase = 'ocupada';
                    estadoTexto = `Ocupada ($${totalMesa.toFixed(2)})`;
                }
            }

            // HTML DE LA TARJETA
            const div = document.createElement('div');
            div.className = `tarjeta-mesa ${ocupada ? 'ocupada' : ''}`;
            div.innerHTML = `
                <div class="mesa-header">
                    <h3>${nombreMesa}</h3>
                    <span class="badge-mesa badge-${estadoClase}">${estadoTexto}</span>
                </div>
                
                <div class="mesa-actions">
                    ${ocupada ? `
                        <button onclick="abrirModalCobro('${nombreMesa}', ${totalMesa})" class="btn-cobrar">
                            💰 Cobrar
                        </button>
                        <div class="grid" style="gap:5px; margin-top:5px;">
                            <button onclick="verTicketMesa('${nombreMesa}')" class="secondary outline" style="padding:5px;">🧾 Ver Ticket</button>
                            <button onclick="agregarPedido('${i}')" class="contrast outline" style="padding:5px;">+ Pedir</button>
                        </div>
                    ` : `
                        <button onclick="agregarPedido('${i}')" class="btn-nueva">
                            📝 Nueva Orden
                        </button>
                    `}
                </div>
            `;
            gridMesas.appendChild(div);
        }
    }

    // 2. ABRIR MODAL DE COBRO (PROFESIONAL)
    window.abrirModalCobro = (mesa, total) => {
        mesaActualCobro = mesa;
        totalActualCobro = total;
        
        // Buscar IDs de órdenes asociadas
        const ordenes = App.getOrdenes().filter(o => 
            o.mesa === mesa && 
            o.estado !== 'pagado' && 
            o.estado !== 'cancelado'
        );
        ordenesIdsCobro = ordenes.map(o => o.id);

        document.getElementById('cobroMesaTitulo').textContent = mesa;
        document.getElementById('cobroTotal').textContent = total.toFixed(2);
        
        if(modalCobro) modalCobro.showModal();
    };

    // 3. PROCESAR EL PAGO
    window.procesarPago = async (metodo) => {
        if (!mesaActualCobro || ordenesIdsCobro.length === 0) return;

        // Cambiar texto botón a "Procesando..."
        const btn = document.activeElement;
        const textoOriginal = btn.innerText;
        btn.innerText = "⏳ Procesando...";
        btn.disabled = true;

        try {
            // Actualizamos TODAS las órdenes de la mesa a 'pagado'
            // También registramos el método de pago en la tabla 'ventas' (si existe trigger) o aquí directo
            // Para simplificar, actualizamos 'ordenes' y usamos el SQL function que te di para reportes
            
            for (const id of ordenesIdsCobro) {
                /*
                  NOTA: Si usas el SQL nuevo, la tabla 'ventas' es separada. 
                  Lo ideal es insertar en ventas y borrar/archivar ordenes.
                  Pero para mantener tu flujo simple: Marcamos orden como 'pagado'.
                  El monitor de cocina NO muestra 'pagado', así que desaparece de allá.
                */
                await App.supabase
                    .from('ordenes')
                    .update({ 
                        estado: 'pagado',
                        // Podríamos guardar metodo_pago si agregaste esa columna a ordenes, 
                        // si no, lo manejamos solo visualmente o creamos la venta
                    })
                    .eq('id', id);
                
                // OPCIONAL: Crear registro en tabla 'ventas' para el corte de caja exacto
                // Esto asegura que el corte de caja funcione perfecto
                const ordenData = App.getOrdenes().find(o => o.id === id);
                if (ordenData) {
                    await App.supabase.from('ventas').insert({
                        restaurante_id: App.restauranteId,
                        mesa: ordenData.mesa,
                        productos: ordenData.productos,
                        total: ordenData.total,
                        metodo_pago: metodo
                    });
                }
            }
            
            alert("¡Pago registrado con éxito! La mesa está libre.");
            if(modalCobro) modalCobro.close();
            // App.js actualizará la vista automáticamente por el Realtime

        } catch (error) {
            console.error(error);
            alert("Error al procesar el pago.");
        } finally {
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    };

    // 4. VER TICKET UNIFICADO
    window.verTicketMesa = (mesa) => {
        const ordenes = App.getOrdenes().filter(o => 
            o.mesa === mesa && 
            ['pendiente', 'preparando', 'terminado', 'entregado'].includes(o.estado)
        );

        if (ordenes.length === 0) return;

        // Unificar productos
        let todosProductos = [];
        let granTotal = 0;
        let fechaInicio = ordenes[0].created_at;

        ordenes.forEach(o => {
            const items = o.productos.split(',');
            todosProductos = todosProductos.concat(items);
            granTotal += parseFloat(o.total);
        });

        // Usamos el modal de ticket global (definido en ordenes.html o app.js)
        // Si no existe global, lo inyectamos o usamos una función simple
        // Aquí asumimos que tienes el modalTicket en el HTML
        const modalTicket = document.getElementById('modalTicket');
        if (modalTicket) {
            document.getElementById('t-mesa').textContent = mesa;
            document.getElementById('t-folio').textContent = "VARIOS";
            document.getElementById('t-fecha').textContent = new Date(fechaInicio).toLocaleString();
            
            const tbody = document.getElementById('t-items');
            tbody.innerHTML = todosProductos.map(p => `
                <tr><td style="border-bottom:1px dashed #ccc; padding:5px;">${p.trim()}</td></tr>
            `).join('');
            
            document.getElementById('t-total').textContent = granTotal.toFixed(2);
            modalTicket.showModal();
        }
    };

    // 5. NAVEGACIÓN Y CONFIGURACIÓN
    window.agregarPedido = (numMesa) => {
        // Redirigir al menú con parámetro de mesa
        window.location.href = `menu.html?mesa=${numMesa}`;
    };

    // Guardar configuración de mesas
    window.guardarConfiguracionMesas = async () => {
        const input = document.getElementById('inputNumMesas');
        const n = parseInt(input.value);
        if (n > 0 && n <= 50) {
            // Actualizar en Supabase
            const { error } = await App.supabase
                .from('restaurantes')
                .update({ num_mesas: n })
                .eq('id', App.restauranteId);

            if (error) {
                alert("Error al guardar: " + error.message);
            } else {
                alert("Configuración guardada.");
                modalConfig.close();
                // Forzar recarga de config local
                location.reload(); 
            }
        } else {
            alert("Por favor ingresa un número entre 1 y 50.");
        }
    };

    // Botón flotante para config (si existe en tu HTML)
    const btnConfig = document.getElementById('btnConfigMesas'); // Asegúrate de tener este ID en tu botón de "Mesas" o settings
    if(btnConfig) btnConfig.onclick = () => modalConfig.showModal();

    // Iniciar
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
    }
});