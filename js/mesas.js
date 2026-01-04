// js/mesas.js - GESTIÓN DE SALÓN (V6 - SYNC TOTAL)
document.addEventListener('DOMContentLoaded', async () => {
    const contenedorMesas = document.getElementById('contenedorMesas');
    const inputNumMesas = document.getElementById('numMesasInput');
    
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return window.location.href = 'login.html';

    let totalMesas = 10; 

    // 1. CARGAR CONFIGURACIÓN DESDE DB
    async function cargarConfiguracion() {
        if (typeof db !== 'undefined') {
            try {
                const { data } = await db.from('restaurantes')
                    .select('num_mesas')
                    .eq('id', sesion.restaurante_id)
                    .single();
                
                if (data && data.num_mesas) {
                    totalMesas = data.num_mesas;
                    if (inputNumMesas) inputNumMesas.value = totalMesas;
                }
            } catch (e) { console.error("Error al cargar mesas:", e); }
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
            // Buscamos orden activa (que no esté pagada ni cancelada)
            const orden = ordenes.find(o => o.mesa === nombreMesa && !['pagado', 'cancelado'].includes(o.estado));
            
            let clase = 'mesa-libre';
            let estadoTexto = 'Libre';
            let contenido = '';

            if (orden) {
                // Estado especial para pedidos QR que esperan aprobación
                if (orden.estado === 'por_confirmar') {
                    clase = 'mesa-urgente'; 
                    estadoTexto = '🔔 SOLICITUD QR';
                    contenido = `
                        <div style="background: #fff3cd; padding: 5px; border-radius: 4px; margin-bottom: 8px; font-size: 0.8rem; color: #856404; text-align:center;">
                            Pedido pendiente de aprobar
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                            <button onclick="App.aceptarOrdenQR('${orden.id}')" style="background:#27ae60; color:white; border:none; font-size:0.75rem; padding:8px;">Aceptar</button>
                            <button onclick="App.eliminarOrden('${orden.id}')" style="background:#e74c3c; color:white; border:none; font-size:0.75rem; padding:8px;">Rechazar</button>
                        </div>
                    `;
                } else {
                    clase = 'mesa-ocupada';
                    // Mostramos el total acumulado
                    const totalNum = parseFloat(orden.total) || 0;
                    estadoTexto = `Ocupada ($${totalNum.toFixed(2)})`;
                    
                    contenido = `
                        <button onclick="App.liberarMesaManual('${orden.id}')" style="width:100%; background:#10ad93; border:none; color:white; margin-bottom:8px; font-weight:bold; padding: 12px; border-radius: 8px; cursor:pointer;">
                            💰 Cobrar Mesa
                        </button>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                            <button class="outline" style="padding:8px; font-size:0.75rem;" onclick="App.verDetalleMesa('${orden.id}')">🧾 Ticket</button>
                            <button class="outline" style="padding:8px; font-size:0.75rem;" onclick="window.location.href='menu.html?mesa=${i}'">+ Pedir</button>
                        </div>
                    `;
                }
            } else {
                // Mesa disponible
                contenido = `
                    <button class="outline" onclick="window.location.href='menu.html?mesa=${i}'" style="width:100%; margin-bottom:8px; border-radius: 8px; padding:12px;">
                        📝 Nueva Orden
                    </button>
                    <button class="secondary outline" onclick="generarQR('${i}')" style="width:100%; border-style: dashed; font-size: 0.8rem; border-radius: 8px; padding:8px;">
                        📱 Ver QR
                    </button>
                `;
            }

            const div = document.createElement('div');
            div.className = `mesa-card ${clase}`;
            div.style = "background:white; border-radius:15px; padding:15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #eee;";
            
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <span style="font-size:1.5rem;">${orden ? '🍽️' : '🪑'}</span>
                    <h3 style="margin:0; font-size:1.1rem; color:#333;">Mesa ${i}</h3>
                </div>
                <div style="text-align:center; margin-bottom:12px;">
                    <span style="font-size:0.7rem; background:${orden ? (orden.estado === 'por_confirmar' ? '#e67e22' : '#10ad93') : '#95a5a6'}; color:white; padding:3px 10px; border-radius:12px; font-weight:bold; display:inline-block;">
                        ${estadoTexto}
                    </span>
                </div>
                <div>
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
                    body { text-align:center; font-family:sans-serif; padding:40px; color:#333; background:#f4f7f6; }
                    .card { background:white; border: 3px solid #10ad93; padding: 30px; border-radius: 20px; display: inline-block; box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
                    .btn { margin-top: 25px; padding: 12px 25px; background: #10ad93; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight:bold; font-size:1rem; }
                    h1 { margin:0 0 10px 0; color:#10ad93; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>${sesion.nombre_restaurante || 'OrdenLista'}</h1>
                    <p style="margin-bottom:20px;">Escanea este código para ver el menú y pedir</p>
                    <canvas id="qr"></canvas>
                    <h2 style="margin-top:20px; letter-spacing:2px;">MESA ${numMesa}</h2>
                </div><br>
                <button class="btn" onclick="window.print()">🖨️ Imprimir para la mesa</button>
                <script>new QRious({element: document.getElementById('qr'), value: '${urlFinal}', size: 280, level: 'H'});</script>
            </body></html>
        `);
        ventana.document.close();
    };

    // Inicialización y registro en App.js para actualizaciones en tiempo real
    await cargarConfiguracion();
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
    }
});