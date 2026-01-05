// js/mesas.js - GESTIÓN DE SALÓN (V6.5 - FIXED)
document.addEventListener('DOMContentLoaded', async () => {
    const contenedorMesas = document.getElementById('contenedorMesas');
    const inputNumMesas = document.getElementById('numMesasInput');
    const btnGuardarConfig = document.getElementById('btnGuardarMesas'); // Asegúrate de tener este ID en tu HTML
    
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return window.location.href = 'login.html';

    let totalMesas = 10; 

    // --- 1. CARGAR Y GUARDAR CONFIGURACIÓN ---
    async function cargarConfiguracion() {
        try {
            const { data } = await db.from('restaurantes')
                .select('num_mesas')
                .eq('id', sesion.restaurante_id)
                .single();
            
            if (data) {
                totalMesas = data.num_mesas;
                if (inputNumMesas) inputNumMesas.value = totalMesas;
            }
        } catch (e) { console.error("Error al cargar mesas:", e); }
        renderizarMesas();
    }

    // Nueva función para guardar el número de mesas en la DB
    if (btnGuardarConfig) {
        btnGuardarConfig.onclick = async () => {
            const nuevoTotal = parseInt(inputNumMesas.value);
            if (nuevoTotal > 0) {
                const { error } = await db.from('restaurantes')
                    .update({ num_mesas: nuevoTotal })
                    .eq('id', sesion.restaurante_id);
                
                if (error) alert("Error al guardar: " + error.message);
                else {
                    totalMesas = nuevoTotal;
                    alert("Configuración guardada ✅");
                    renderizarMesas();
                }
            }
        };
    }

    // --- 2. RENDERIZADO REACTIVO ---
    function renderizarMesas() {
        if (!contenedorMesas || typeof App === 'undefined') return;
        contenedorMesas.innerHTML = '';
        
        const ordenes = App.getOrdenes();

        for (let i = 1; i <= totalMesas; i++) {
            const nombreMesa = `Mesa ${i}`;
            // Buscamos orden activa (que no esté pagada o cancelada)
            const orden = ordenes.find(o => o.mesa === nombreMesa && !['pagado', 'cancelado'].includes(o.estado));
            
            let clase = 'mesa-libre';
            let estadoTexto = 'Libre';
            let contenido = '';

            if (orden) {
                if (orden.estado === 'por_confirmar') {
                    clase = 'mesa-urgente'; 
                    estadoTexto = '🔔 SOLICITUD QR';
                    contenido = `
                        <div style="background: #fff3cd; padding: 8px; border-radius: 8px; margin-bottom: 8px; font-size: 0.8rem; color: #856404; text-align:center; border:1px solid #ffeeba;">Nuevo pedido QR</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                            <button onclick="App.updateEstado('${orden.id}', 'pendiente')" style="background:#27ae60; color:white; border:none; border-radius:5px; padding:10px; cursor:pointer;">Aceptar</button>
                            <button onclick="App.eliminarOrden('${orden.id}')" style="background:#e74c3c; color:white; border:none; border-radius:5px; padding:10px; cursor:pointer;">Rechazar</button>
                        </div>
                    `;
                } else {
                    clase = 'mesa-ocupada';
                    const totalNum = parseFloat(orden.total) || 0;
                    estadoTexto = `Ocupada ($${totalNum.toFixed(2)})`;
                    
                    contenido = `
                        <button onclick="abrirModalCobro('${orden.id}', ${totalNum})" style="width:100%; background:#10ad93; border:none; color:white; margin-bottom:10px; font-weight:bold; padding: 12px; border-radius: 8px; cursor:pointer; box-shadow: 0 4px 0 #0d8a75;">
                            💰 Cobrar Mesa
                        </button>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                            <button class="outline" style="padding:10px; font-size:0.8rem; border-radius:8px;" onclick="App.verDetalleMesa('${orden.id}')">🧾 Ticket</button>
                            <button class="outline" style="padding:10px; font-size:0.8rem; border-radius:8px; background:#f8f9fa;" onclick="irAMenuConOrden('${i}', '${orden.id}')">+ Pedir</button>
                        </div>
                    `;
                }
            } else {
                contenido = `
                    <button class="outline" onclick="window.location.href='menu.html?mesa=${i}'" style="width:100%; margin-bottom:10px; border-radius: 8px; padding:12px; font-weight:500;">
                        📝 Nueva Orden
                    </button>
                    <button class="secondary outline" onclick="generarQR('${i}')" style="width:100%; border-style: dashed; font-size: 0.8rem; border-radius: 8px; padding:8px; color:#777;">
                        📱 Ver QR
                    </button>
                `;
            }

            const div = document.createElement('div');
            div.className = `mesa-card ${clase}`;
            div.style = `background:white; border-radius:18px; padding:20px; box-shadow: 0 6px 12px rgba(0,0,0,0.08); border: 2px solid ${orden ? (orden.estado === 'por_confirmar' ? '#f39c12' : '#10ad93') : '#f1f1f1'};`;
            
            div.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px;">
                    <h3 style="margin:0; font-size:1.2rem; color:#2c3e50;">Mesa ${i}</h3>
                    <span style="font-size:1.5rem;">${orden ? '🍽️' : '🪑'}</span>
                </div>
                <div style="text-align:center; margin-bottom:15px;">
                    <span style="font-size:0.75rem; background:${orden ? (orden.estado === 'por_confirmar' ? '#f39c12' : '#10ad93') : '#bdc3c7'}; color:white; padding:4px 12px; border-radius:20px; font-weight:bold; display:inline-block;">
                        ${estadoTexto}
                    </span>
                </div>
                <div class="mesa-acciones">${contenido}</div>
            `;
            contenedorMesas.appendChild(div);
        }
    }

    // --- 3. LÓGICA DE NAVEGACIÓN Y COBRO ---
    window.irAMenuConOrden = (numMesa, ordenId) => {
        // Guardamos el ID de la orden actual para que el menu.js sepa que debe sumar y no crear
        localStorage.setItem('orden_pendiente_id', ordenId);
        window.location.href = `menu.html?mesa=${numMesa}`;
    };

    window.abrirModalCobro = (ordenId, total) => {
        // Usamos SweetAlert2 si lo tienes, o un modal personalizado
        // Aquí simplificamos para usar tu modal de pago
        const modal = document.getElementById('modalCobro'); 
        if(modal) {
            document.getElementById('totalACobrar').innerText = `$${total.toFixed(2)}`;
            document.getElementById('btnConfirmarPago').onclick = () => procesarPago(ordenId, 'efectivo');
            document.getElementById('btnConfirmarDigital').onclick = () => procesarPago(ordenId, 'tarjeta'); // Unificado
            modal.showModal();
        } else {
            // Fallback si no hay modal HTML
            const met = confirm("¿Pago Digital (Tarjeta/QR/Transferencia)? Cancelar para Efectivo") ? 'tarjeta' : 'efectivo';
            procesarPago(ordenId, met);
        }
    };

    async function procesarPago(ordenId, metodo) {
        try {
            const orden = App.getOrdenes().find(o => o.id === ordenId);
            // 1. Registrar Venta
            await db.from('ventas').insert([{
                restaurante_id: sesion.restaurante_id,
                total: orden.total,
                metodo_pago: metodo,
                productos: orden.productos,
                mesa: orden.mesa
            }]);
            // 2. Marcar Orden como Pagada
            await App.updateEstado(ordenId, 'pagado');
            alert("Venta completada con éxito ✅");
            if(document.getElementById('modalCobro')) document.getElementById('modalCobro').close();
        } catch (e) {
            alert("Error al procesar pago");
        }
    }

    // --- 4. GENERADOR DE QR ---
    window.generarQR = (numMesa) => {
        const urlBase = window.location.origin + window.location.pathname.replace('mesas.html', '');
        const urlFinal = `${urlBase}menu.html?mesa=${numMesa}&rid=${sesion.restaurante_id}`;
        const ventana = window.open("", "_blank", "width=500,height=700");
        ventana.document.write(`
            <html>
            <head><title>QR Mesa ${numMesa}</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script></head>
            <body style="text-align:center; font-family:sans-serif; padding:40px;">
                <div style="border:10px solid #10ad93; padding:20px; border-radius:20px; display:inline-block;">
                    <h1 style="color:#10ad93;">${sesion.nombre_restaurante || 'OrdenLista'}</h1>
                    <canvas id="qr"></canvas>
                    <h2>MESA ${numMesa}</h2>
                </div><br><br>
                <button onclick="window.print()" style="padding:10px 20px; background:#10ad93; color:white; border:none; border-radius:5px;">Imprimir</button>
                <script>new QRious({element:document.getElementById('qr'), value:'${urlFinal}', size:250});</script>
            </body></html>
        `);
        ventana.document.close();
    };

    await cargarConfiguracion();
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
    }
});