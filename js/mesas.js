// js/mesas.js - GESTIÓN DE SALÓN (V6.1 - REALTIME READY)
document.addEventListener('DOMContentLoaded', async () => {
    const contenedorMesas = document.getElementById('contenedorMesas');
    const inputNumMesas = document.getElementById('numMesasInput');
    
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return window.location.href = 'login.html';

    let totalMesas = 10; 

    // --- 1. CARGAR CONFIGURACIÓN ---
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

    // --- 2. RENDERIZADO REACTIVO ---
    function renderizarMesas() {
        if (!contenedorMesas || typeof App === 'undefined') return;
        contenedorMesas.innerHTML = '';
        
        const ordenes = App.getOrdenes();

        for (let i = 1; i <= totalMesas; i++) {
            const nombreMesa = `Mesa ${i}`;
            const orden = ordenes.find(o => o.mesa === nombreMesa && !['pagado', 'cancelado'].includes(o.estado));
            
            let clase = 'mesa-libre';
            let estadoTexto = 'Libre';
            let contenido = '';

            if (orden) {
                // ESTADO: PEDIDO NUEVO DESDE QR (POR APROBAR)
                if (orden.estado === 'por_confirmar') {
                    clase = 'mesa-urgente'; 
                    estadoTexto = '🔔 SOLICITUD QR';
                    contenido = `
                        <div style="background: #fff3cd; padding: 8px; border-radius: 8px; margin-bottom: 8px; font-size: 0.8rem; color: #856404; text-align:center; border:1px solid #ffeeba;">
                            Nuevo pedido de cliente
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                            <button onclick="App.updateEstado('${orden.id}', 'pendiente')" style="background:#27ae60; color:white; border:none; border-radius:5px; padding:10px; cursor:pointer;">Aceptar</button>
                            <button onclick="App.eliminarOrden('${orden.id}')" style="background:#e74c3c; color:white; border:none; border-radius:5px; padding:10px; cursor:pointer;">Rechazar</button>
                        </div>
                    `;
                } else {
                    // ESTADO: MESA OCUPADA (PROCESO NORMAL)
                    clase = 'mesa-ocupada';
                    const totalNum = parseFloat(orden.total) || 0;
                    estadoTexto = `Ocupada ($${totalNum.toFixed(2)})`;
                    
                    contenido = `
                        <button onclick="App.liberarMesaManual('${orden.id}')" style="width:100%; background:#10ad93; border:none; color:white; margin-bottom:10px; font-weight:bold; padding: 12px; border-radius: 8px; cursor:pointer; box-shadow: 0 4px 0 #0d8a75;">
                            💰 Cobrar Mesa
                        </button>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                            <button class="outline" style="padding:10px; font-size:0.8rem; border-radius:8px;" onclick="App.verDetalleMesa('${orden.id}')">🧾 Ticket</button>
                            <button class="outline" style="padding:10px; font-size:0.8rem; border-radius:8px; background:#f8f9fa;" onclick="window.location.href='menu.html?mesa=${i}'">+ Pedir</button>
                        </div>
                    `;
                }
            } else {
                // ESTADO: MESA DISPONIBLE
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
            // Estilos en línea para asegurar consistencia visual
            div.style = `background:white; border-radius:18px; padding:20px; box-shadow: 0 6px 12px rgba(0,0,0,0.08); border: 2px solid ${orden ? (orden.estado === 'por_confirmar' ? '#f39c12' : '#10ad93') : '#f1f1f1'}; transition: transform 0.2s;`;
            
            div.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px;">
                    <h3 style="margin:0; font-size:1.2rem; color:#2c3e50;">Mesa ${i}</h3>
                    <span style="font-size:1.5rem;">${orden ? '🍽️' : '🪑'}</span>
                </div>
                <div style="text-align:center; margin-bottom:15px;">
                    <span style="font-size:0.75rem; background:${orden ? (orden.estado === 'por_confirmar' ? '#f39c12' : '#10ad93') : '#bdc3c7'}; color:white; padding:4px 12px; border-radius:20px; font-weight:bold; display:inline-block; text-transform:uppercase;">
                        ${estadoTexto}
                    </span>
                </div>
                <div class="mesa-acciones">
                    ${contenido}
                </div>
            `;
            contenedorMesas.appendChild(div);
        }
    }

    // --- 3. GENERADOR DE QR ---
    window.generarQR = (numMesa) => {
        const urlBase = window.location.origin + window.location.pathname.replace('mesas.html', '');
        const urlFinal = `${urlBase}menu.html?mesa=${numMesa}&rid=${sesion.restaurante_id}`;
        
        const ventana = window.open("", "_blank", "width=500,height=700");
        ventana.document.write(`
            <html>
            <head>
                <title>QR Mesa ${numMesa}</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
                <style>
                    body { text-align:center; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding:40px; color:#333; background:#f4f7f6; }
                    .card { background:white; border: 4px solid #10ad93; padding: 40px; border-radius: 25px; display: inline-block; box-shadow: 0 15px 35px rgba(0,0,0,0.15); }
                    .btn { margin-top: 30px; padding: 15px 30px; background: #10ad93; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight:bold; font-size:1.1rem; }
                    h1 { margin:0 0 5px 0; color:#10ad93; font-size: 2rem; }
                    p { color: #666; margin-bottom: 25px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>${sesion.nombre_restaurante || 'OrdenLista'}</h1>
                    <p>Escanea para pedir desde tu mesa</p>
                    <canvas id="qr"></canvas>
                    <h2 style="margin-top:25px; letter-spacing:4px; font-size:1.8rem; color:#2c3e50;">MESA ${numMesa}</h2>
                </div><br>
                <button class="btn" onclick="window.print()">🖨️ Imprimir Código</button>
                <script>
                    new QRious({
                        element: document.getElementById('qr'),
                        value: '${urlFinal}',
                        size: 300,
                        level: 'H'
                    });
                </script>
            </body></html>
        `);
        ventana.document.close();
    };

    // --- 4. INICIALIZACIÓN ---
    await cargarConfiguracion();
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
    }
});