// js/mesas.js - GESTIÓN DE SALÓN (CORREGIDO Y CONECTADO)

document.addEventListener('DOMContentLoaded', async () => {
    const contenedorMesas = document.getElementById('contenedorMesas');
    const inputNumMesas = document.getElementById('numMesasInput');
    
    // Obtener sesión activa
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return window.location.href = 'login.html';

    let totalMesas = 10; // Valor por defecto

    // 1. CARGAR CONFIGURACIÓN REAL (Desde Base de Datos)
    // Esto asegura que si cambias el número de mesas, se actualice en todos los dispositivos
    async function cargarConfiguracion() {
        if (typeof db !== 'undefined') {
            const { data, error } = await db.from('restaurantes')
                .select('num_mesas')
                .eq('id', sesion.restaurante_id)
                .single();
            
            if (data && data.num_mesas) {
                totalMesas = data.num_mesas;
                if (inputNumMesas) inputNumMesas.value = totalMesas;
                renderizarMesas(); // Re-renderizar con el número correcto
            }
        }
    }

    // --- RENDERIZADO REACTIVO DE LAS MESAS ---
    function renderizarMesas() {
        if (!contenedorMesas || typeof App === 'undefined') return;
        contenedorMesas.innerHTML = '';
        
        const ordenes = App.getOrdenes();

        for (let i = 1; i <= totalMesas; i++) {
            const nombreMesa = `Mesa ${i}`;
            // Buscar si esta mesa tiene una orden activa
            const orden = ordenes.find(o => o.mesa === nombreMesa && o.estado !== 'pagado' && o.estado !== 'cancelado');
            
            let clase = 'mesa-libre';
            let estadoTexto = 'Libre';
            let contenido = '';

            if (orden) {
                if (orden.estado === 'por_confirmar') {
                    // CASO: Cliente pidió por QR y espera confirmación
                    clase = 'mesa-urgente'; 
                    estadoTexto = '🔔 SOLICITUD QR';
                    contenido = `
                        <div style="background: white; padding: 5px; border-radius: 4px; margin-bottom: 5px;">
                            <small>Solicita abrir cuenta</small>
                        </div>
                        <div class="grid">
                            <button onclick="App.aceptarOrdenQR('${orden.id}')" class="primary" style="font-size:0.8rem;">✅ Aceptar</button>
                            <button onclick="App.eliminarOrden('${orden.id}')" class="secondary outline" style="font-size:0.8rem;">❌</button>
                        </div>
                    `;
                } else {
                    // CASO: Mesa ocupada con orden en curso
                    clase = 'mesa-ocupada';
                    estadoTexto = `Ocupada ($${parseFloat(orden.total).toFixed(2)})`;
                    
                    // Botón COBRAR conectado a App.liberarMesaManual (La solución al problema)
                    contenido = `
                        <button onclick="App.liberarMesaManual('${orden.id}')" style="width:100%; background:#27ae60; border:none; color:white; margin-bottom:5px; font-weight:bold; padding: 10px;">
                            💰 Cobrar $${parseFloat(orden.total).toFixed(2)}
                        </button>
                        <div class="grid">
                            <button class="secondary outline" style="padding:5px;" onclick="window.location.href='ordenes.html'">Ver Estado</button>
                            <button class="outline" style="padding:5px;" onclick="window.location.href='menu.html?mesa=${i}'">+ Agregar</button>
                        </div>
                    `;
                }
            } else {
                // CASO: Mesa Libre
                contenido = `
                    <button class="outline" onclick="window.location.href='menu.html?mesa=${i}'" style="width:100%; margin-bottom:10px;">
                        📝 Nueva Orden
                    </button>
                    <button class="secondary outline" onclick="generarQR('${i}')" style="width:100%; border-style: dashed; font-size: 0.8rem;">
                        📱 Ver QR
                    </button>
                `;
            }

            const div = document.createElement('div');
            div.className = `mesa-card ${clase}`;
            div.innerHTML = `
                <div class="mesa-header">
                    <span class="mesa-icon">${orden ? '🍽️' : '🪑'}</span>
                    <h3 style="margin:0;">${nombreMesa}</h3>
                </div>
                <div style="text-align:center; margin-bottom:10px;">
                    <span class="badge" style="font-size:0.75rem; background:${orden ? '' : '#7f8c8d'}">${estadoTexto}</span>
                </div>
                <div class="mesa-body">
                    ${contenido}
                </div>
            `;
            contenedorMesas.appendChild(div);
        }
    }

    // --- GENERADOR DE QR ---
    window.generarQR = (numMesa) => {
        const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const urlFinal = `${urlBase}/menu.html?mesa=${numMesa}&rid=${sesion.restaurante_id}`;
        
        const ventana = window.open("", "_blank", "width=400,height=550");
        ventana.document.write(`
            <html>
            <head><title>QR Mesa ${numMesa}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
            <style>
                body{text-align:center; font-family:'Segoe UI', sans-serif; padding:40px 20px; color: #333;} 
                .btn{padding:12px 24px; background:#333; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; margin-top:20px;}
            </style>
            </head>
            <body>
                <h1 style="margin:0;">${sesion.nombre_restaurante || 'Mi Restaurante'}</h1>
                <p style="color:#666;">Escanea para ver el menú</p>
                <canvas id="qr"></canvas>
                <h2 style="margin-top:10px;">Mesa ${numMesa}</h2>
                <button class="btn" onclick="window.print()">🖨️ Imprimir QR</button>
                <script>new QRious({element: document.getElementById('qr'), value: '${urlFinal}', size: 250, level: 'H'});</script>
            </body></html>
        `);
        ventana.document.close();
    };

    // --- GUARDAR CONFIGURACIÓN EN DB ---
    window.guardarConfig = async () => {
        const val = parseInt(inputNumMesas.value);
        if (val > 0) {
            // Guardamos en la base de datos para persistencia real
            const { error } = await db.from('restaurantes')
                .update({ num_mesas: val })
                .eq('id', sesion.restaurante_id);
            
            if (!error) {
                totalMesas = val;
                alert("Configuración guardada correctamente");
                renderizarMesas();
            } else {
                alert("Error al guardar: " + error.message);
            }
        }
    };

    // INICIALIZACIÓN
    await cargarConfiguracion();

    // Conectar con App.js para que se actualice solo cuando cambien las órdenes
    if (typeof App !== 'undefined') {
        App.registerRender('mesas', renderizarMesas);
        renderizarMesas(); // Render inicial
    }
});