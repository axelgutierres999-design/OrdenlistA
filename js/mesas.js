// js/mesas.js - GESTIÓN DE SALÓN, COBROS Y TICKETS (ACTUALIZADO)
document.addEventListener('DOMContentLoaded', async () => {
    const contenedorMesas = document.getElementById('contenedorMesas');
    const inputNumMesas = document.getElementById('numMesasInput');
    
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return window.location.href = 'login.html';

    let totalMesas = 10; 

    // 1. CARGAR CONFIGURACIÓN DESDE DB
    async function cargarConfiguracion() {
        if (typeof db !== 'undefined') {
            const { data } = await db.from('restaurantes')
                .select('num_mesas')
                .eq('id', sesion.restaurante_id)
                .single();
            
            if (data && data.num_mesas) {
                totalMesas = data.num_mesas;
                if (inputNumMesas) inputNumMesas.value = totalMesas;
            }
        }
        renderizarMesas();
    }

    // 2. RENDERIZADO DE MESAS
    function renderizarMesas() {
        if (!contenedorMesas || typeof App === 'undefined') return;
        contenedorMesas.innerHTML = '';
        
        const ordenes = App.getOrdenes();

        for (let i = 1; i <= totalMesas; i++) {
            const nombreMesa = `Mesa ${i}`;
            // Buscar orden activa (excluyendo pagadas y canceladas)
            const orden = ordenes.find(o => o.mesa === nombreMesa && o.estado !== 'pagado' && o.estado !== 'cancelado');
            
            let clase = 'mesa-libre';
            let estadoTexto = 'Libre';
            let contenido = '';

            if (orden) {
                if (orden.estado === 'por_confirmar') {
                    // MESA SOLICITANDO APERTURA QR
                    clase = 'mesa-urgente'; 
                    estadoTexto = '🔔 SOLICITUD QR';
                    contenido = `
                        <div style="background: #fff3cd; padding: 5px; border-radius: 4px; margin-bottom: 8px; font-size: 0.8rem; color: #856404;">
                            Cliente escaneó QR
                        </div>
                        <div class="grid">
                            <button onclick="App.aceptarOrdenQR('${orden.id}')" class="primary" style="font-size:0.7rem; padding: 5px;">Aceptar</button>
                            <button onclick="App.eliminarOrden('${orden.id}')" class="secondary outline" style="font-size:0.7rem; padding: 5px;">Rechazar</button>
                        </div>
                    `;
                } else {
                    // MESA OCUPADA
                    clase = 'mesa-ocupada';
                    estadoTexto = `Ocupada ($${parseFloat(orden.total).toFixed(2)})`;
                    
                    contenido = `
                        <button onclick="window.abrirModalCobro('${orden.id}', ${orden.total})" style="width:100%; background:#27ae60; border:none; color:white; margin-bottom:8px; font-weight:bold; padding: 12px; border-radius: 8px;">
                            💰 Cobrar Mesa
                        </button>
                        <div class="grid">
                            <button class="secondary outline" style="padding:5px; font-size:0.75rem;" onclick="window.location.href='ordenes.html?mesa=${i}&verTicket=true'">🧾 Ver Ticket</button>
                            <button class="outline" style="padding:5px; font-size:0.75rem;" onclick="window.location.href='menu.html?mesa=${i}'">+ Agregar</button>
                        </div>
                    `;
                }
            } else {
                // MESA LIBRE
                contenido = `
                    <button class="outline" onclick="window.location.href='menu.html?mesa=${i}'" style="width:100%; margin-bottom:8px; border-radius: 8px;">
                        📝 Nueva Orden
                    </button>
                    <button class="secondary outline" onclick="generarQR('${i}')" style="width:100%; border-style: dashed; font-size: 0.8rem; border-radius: 8px;">
                        📱 Ver QR
                    </button>
                `;
            }

            const div = document.createElement('div');
            div.className = `mesa-card ${clase}`;
            div.innerHTML = `
                <div class="mesa-header" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <span style="font-size:1.5rem;">${orden ? '🍽️' : '🪑'}</span>
                    <h3 style="margin:0; font-size:1.1rem;">Mesa ${i}</h3>
                </div>
                <div style="text-align:center; margin-bottom:12px;">
                    <span class="badge" style="font-size:0.7rem; background:${orden ? (orden.estado === 'por_confirmar' ? '#e67e22' : '#2ecc71') : '#95a5a6'}; color:white; padding:2px 8px; border-radius:10px;">
                        ${estadoTexto}
                    </span>
                </div>
                <div class="mesa-body">
                    ${contenido}
                </div>
            `;
            contenedorMesas.appendChild(div);
        }
    }

    // 3. GENERADOR DE QR MEJORADO
    window.generarQR = (numMesa) => {
        const urlBase = window.location.origin + window.location.pathname.replace('mesas.html', '');
        const urlFinal = `${urlBase}menu.html?mesa=${numMesa}&rid=${sesion.restaurante_id}`;
        
        const ventana = window.open("", "_blank", "width=450,height=600");
        ventana.document.write(`
            <html>
            <head>
                <title>QR Mesa ${numMesa}</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
                <style>
                    body { text-align:center; font-family:sans-serif; padding:20px; }
                    .card { border: 2px solid #333; padding: 20px; border-radius: 15px; display: inline-block; }
                    .btn { margin-top: 20px; padding: 10px 20px; background: #10ad93; color: white; border: none; border-radius: 5px; cursor: pointer; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>${sesion.nombre_restaurante || 'OrdenLista'}</h1>
                    <p>Escanea para ver el menú y pedir</p>
                    <canvas id="qr"></canvas>
                    <h2>MESA ${numMesa}</h2>
                </div><br>
                <button class="btn" onclick="window.print()">🖨️ Imprimir QR</button>
                <script>new QRious({element: document.getElementById('qr'), value: '${urlFinal}', size: 250, level: 'H'});</script>
            </body></html>
        `);
        ventana.document.close();
    };

    // 4. LÓGICA DE COBRO (VINCULADA A APP.JS)
    window.abrirModalCobro = (ordenId, total) => {
        // Usamos la función de App.js que ya maneja el proceso de pago
        if (typeof App !== 'undefined' && App.mostrarModalPago) {
            App.mostrarModalPago(ordenId, total);
        } else {
            // Fallback si App no está cargada del todo
            const confirmacion = confirm(`Total a cobrar: $${total}\n\n¿Proceder con el pago?`);
            if (confirmacion) App.liberarMesaManual(ordenId);
        }
    };

    window.guardarConfig = async () => {
        const val = parseInt(inputNumMesas.value);
        if (val > 0) {
            const { error } = await db.from('restaurantes').update({ num_mesas: val }).eq('id', sesion.restaurante_id);
            if (!error) {
                totalMesas = val;
                alert("✅ Mesas actualizadas");
                renderizarMesas();
            }
        }
    };

    // Inicialización y Realtime
    await cargarConfiguracion();
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
    }
});