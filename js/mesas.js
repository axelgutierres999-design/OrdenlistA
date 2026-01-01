// js/mesas.js - GESTIÓN DE SALÓN (CORREGIDO MULTINEGOCIO)

document.addEventListener('DOMContentLoaded', () => {
    const contenedorMesas = document.getElementById('contenedorMesas');
    const inputNumMesas = document.getElementById('numMesasInput');
    
    // Obtener sesión activa para asegurar que guardamos la config por restaurante
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;

    // La cantidad de mesas se guarda en localStorage pero con el prefijo del restaurante_id
    const keyMesas = `total_mesas_${sesion.restaurante_id}`;
    let totalMesas = parseInt(localStorage.getItem(keyMesas)) || 10;
    if (inputNumMesas) inputNumMesas.value = totalMesas;

    // --- GENERADOR DE QR ---
    window.generarQR = (numMesa) => {
        const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        // Pasamos tanto la mesa como el restaurante_id para que el cliente ordene al lugar correcto
        const urlFinal = `${urlBase}/menu.html?mesa=${numMesa}&rid=${sesion.restaurante_id}`;
        
        const ventana = window.open("", "_blank", "width=400,height=550");
        ventana.document.write(`
            <html>
            <head><title>QR Mesa ${numMesa}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
            <style>body{text-align:center; font-family:sans-serif; padding:20px; color: #333;} #qr{margin: 20px 0;} .btn{padding:10px 20px; background:black; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;}</style>
            </head>
            <body>
                <h1 style="margin-bottom:0;">${sesion.nombre_restaurante || 'Mi Café'}</h1>
                <h2 style="margin-top:5px;">Mesa ${numMesa}</h2>
                <canvas id="qr"></canvas>
                <p>Escanea el código para ver el menú y ordenar directamente desde tu móvil.</p>
                <button class="btn" onclick="window.print()">Imprimir Código</button>
                <script>new QRious({element: document.getElementById('qr'), value: '${urlFinal}', size: 250, level: 'H'});</script>
            </body></html>
        `);
        ventana.document.close();
    };

    // --- RENDERIZADO REACTIVO ---
    function renderizarMesas() {
        if (!contenedorMesas || typeof App === 'undefined') return;
        contenedorMesas.innerHTML = '';
        
        const ordenes = App.getOrdenes();

        for (let i = 1; i <= totalMesas; i++) {
            const nombreMesa = `Mesa ${i}`;
            // Buscar orden activa del negocio (App ya filtra por restaurante_id)
            const orden = ordenes.find(o => o.mesa === nombreMesa && o.estado !== 'pagado' && o.estado !== 'cancelado');
            
            let clase = 'mesa-libre';
            let estadoTexto = 'Libre';
            let contenido = '';

            if (orden) {
                if (orden.estado === 'por_confirmar') {
                    clase = 'mesa-urgente'; 
                    estadoTexto = '🔔 PEDIDO QR';
                    contenido = `
                        <button onclick="App.aceptarOrdenQR('${orden.id}')" class="primary" style="width:100%; margin-bottom:5px;">✅ Aceptar</button>
                        <button onclick="App.eliminarOrden('${orden.id}')" class="secondary outline" style="width:100%;">❌ Rechazar</button>
                    `;
                } else {
                    clase = 'mesa-ocupada';
                    estadoTexto = `Ocupada ($${parseFloat(orden.total).toFixed(2)})`;
                    contenido = `
                        <button onclick="abrirModalCobro('${orden.id}')" style="width:100%; background:#27ae60; border:none; color:white; margin-bottom:5px; font-weight:bold;">💰 Cobrar</button>
                        <div class="grid">
                            <button class="secondary outline" style="padding:5px;" onclick="window.location.href='ordenes.html'">Monitor</button>
                            <button class="outline" style="padding:5px;" onclick="window.location.href='menu.html?mesa=${i}'">+ Item</button>
                        </div>
                    `;
                }
            } else {
                contenido = `
                    <button class="outline" onclick="window.location.href='menu.html?mesa=${i}'" style="width:100%; margin-bottom:10px;">📝 Abrir Cuenta</button>
                    <button class="secondary outline" onclick="generarQR('${i}')" style="width:100%; border-style: dashed;">📱 Generar QR</button>
                `;
            }

            const div = document.createElement('div');
            div.className = `mesa-card ${clase}`;
            div.innerHTML = `
                <div class="mesa-header">
                    <span class="mesa-icon">${orden ? '☕' : '🪑'}</span>
                    <h3 style="margin:0;">${nombreMesa}</h3>
                    <span class="badge" style="font-size:0.7rem;">${estadoTexto}</span>
                </div>
                <hr style="margin: 10px 0;">
                <div class="mesa-body">
                    ${contenido}
                </div>
            `;
            contenedorMesas.appendChild(div);
        }
    }

    // --- LÓGICA DE COBRO (MODAL) ---
    window.abrirModalCobro = (ordenId) => {
        const o = App.getOrdenes().find(item => item.id === ordenId);
        if (!o) return;
        
        const modal = document.getElementById('modalTicket');
        document.getElementById('t-folio').textContent = o.id.slice(-6).toUpperCase();
        document.getElementById('t-mesa').textContent = o.mesa;
        document.getElementById('t-total').textContent = parseFloat(o.total).toFixed(2);
        document.getElementById('t-fecha').textContent = new Date().toLocaleString();
        
        const tbody = document.getElementById('t-items');
        tbody.innerHTML = '';
        o.productos.split(',').forEach(p => {
            tbody.innerHTML += `<tr><td style="padding:4px 0;">${p.trim()}</td><td style="text-align:right;">-</td></tr>`;
        });

        // Configurar botones de pago final
        document.getElementById('btnEfectivo').onclick = () => procesarPago(ordenId, 'efectivo');
        document.getElementById('btnTarjeta').onclick = () => procesarPago(ordenId, 'tarjeta');

        modal.style.display = 'flex';
    };

    async function procesarPago(id, metodo) {
        if (confirm(`¿Confirmar pago en ${metodo.toUpperCase()}?`)) {
            // Llamamos a la función centralizada en App.js
            const exito = await App.cambiarEstadoOrden(id, 'pagado', metodo);
            if (exito) {
                document.getElementById('modalTicket').style.display = 'none';
                // El render se dispara automáticamente por la suscripción de App.js
            }
        }
    }

    window.guardarConfig = () => {
        const val = parseInt(inputNumMesas.value);
        if (val > 0) {
            localStorage.setItem(keyMesas, val);
            totalMesas = val;
            renderizarMesas();
        }
    };

    // CONEXIÓN CON APP.JS
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
        renderizarMesas();
    }
});