// js/estadisticas.js - REPORTES Y KPIs DE VENTAS (ACTUALIZADO)

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') return;

    const spanTotalDia = document.getElementById('totalDia');
    const spanNumVentas = document.getElementById('numVentasDia');
    const spanTicketPromedio = document.getElementById('ticketPromedio');
    const listaVentas = document.getElementById('listaUltimasVentas');
    
    let chartInstancia = null;
    let ventasHoy = [];

    // --- 1. CARGAR DATOS DESDE TABLA VENTAS ---
    async function cargarEstadisticas() {
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        
        // Consultamos la tabla 'ventas' (Historial definitivo)
        const { data, error } = await db
            .from('ventas')
            .select('*')
            .eq('restaurante_id', sesion.restaurante_id)
            .gte('created_at', hoy.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error cargando ventas:", error);
            return;
        }

        ventasHoy = data || [];
        actualizarKPIs();
        renderizarTabla();
        dibujarGrafico();
    }

    // --- 2. KPIs (Total, Cantidad y Promedio) ---
    function actualizarKPIs() {
        const total = ventasHoy.reduce((acc, v) => acc + parseFloat(v.total), 0);
        const cantidad = ventasHoy.length;
        const promedio = cantidad > 0 ? total / cantidad : 0;

        if (spanTotalDia) spanTotalDia.innerText = `$${total.toFixed(2)}`;
        if (spanNumVentas) spanNumVentas.innerText = cantidad;
        if (spanTicketPromedio) spanTicketPromedio.innerText = `$${promedio.toFixed(2)}`;
    }

    // --- 3. TABLA DE HISTORIAL ---
    function renderizarTabla() {
        if (!listaVentas) return;
        
        if (ventasHoy.length === 0) {
            listaVentas.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay ventas registradas hoy.</td></tr>';
            return;
        }

        listaVentas.innerHTML = ventasHoy.map(v => {
            const fecha = new Date(v.created_at);
            const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return `
                <tr>
                    <td><small>#${v.id.toString().slice(-5).toUpperCase()}</small></td>
                    <td>${v.mesa}</td>
                    <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
                    <td><span class="badge-metodo">${v.metodo_pago || 'efectivo'}</span></td>
                    <td>${hora}</td>
                </tr>
            `;
        }).join('');
    }

    // --- 4. GRÁFICO DE PRODUCTOS (Lógica de limpieza mejorada) ---
    function dibujarGrafico() {
        const canvas = document.getElementById('graficoCategorias');
        if (!canvas || typeof Chart === 'undefined' || ventasHoy.length === 0) return;

        // Si ya existe un gráfico, lo destruimos para evitar errores de renderizado
        if (chartInstancia) chartInstancia.destroy();

        const resumen = {};
        ventasHoy.forEach(v => {
            // Separamos productos y limpiamos el formato "1x Producto"
            v.productos.split(',').forEach(p => {
                const nombreLimpio = p.trim().replace(/^\d+x\s/, ''); 
                resumen[nombreLimpio] = (resumen[nombreLimpio] || 0) + 1;
            });
        });

        // Ordenar por más vendidos y tomar los mejores 5
        const labels = Object.keys(resumen).sort((a,b) => resumen[b] - resumen[a]).slice(0, 5);
        const values = labels.map(l => resumen[l]);

        chartInstancia = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#10ad93', '#3498db', '#9b59b6', '#f1c40f', '#e67e22'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true } }
                }
            }
        });
    }

    // --- 5. FUNCIÓN DE IMPRESIÓN DE CORTE ---
    window.imprimirCorteCaja = () => {
        const total = spanTotalDia.innerText;
        const num = spanNumVentas.innerText;
        const promedio = spanTicketPromedio.innerText;
        const fecha = new Date().toLocaleDateString();

        const ventana = window.open("", "_blank", "width=400,height=600");
        ventana.document.write(`
            <html>
            <head>
                <title>Corte de Caja</title>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 20px; text-align: center; font-size: 14px; }
                    .line { border-top: 1px dashed #000; margin: 15px 0; }
                    .total-box { font-size: 22px; font-weight: bold; margin: 10px 0; }
                    table { width: 100%; font-size: 11px; text-align: left; }
                </style>
            </head>
            <body>
                <h2 style="margin:0;">CORTE DE CAJA</h2>
                <p style="margin:5px;">${sesion.nombre_restaurante}</p>
                <p>Fecha: ${fecha}</p>
                <div class="line"></div>
                <div class="total-box">TOTAL: ${total}</div>
                <p>Ventas Realizadas: ${num}</p>
                <p>Ticket Promedio: ${promedio}</p>
                <div class="line"></div>
                <p>Resumen de movimientos:</p>
                <table>
                    <thead>
                        <tr><th>ID</th><th>Mesa</th><th>Total</th><th>Hora</th></tr>
                    </thead>
                    <tbody>
                        ${ventasHoy.map(v => `
                            <tr>
                                <td>${v.id.toString().slice(-4)}</td>
                                <td>${v.mesa}</td>
                                <td>$${parseFloat(v.total).toFixed(2)}</td>
                                <td>${new Date(v.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="line"></div>
                <p>OrdenLista - Sistema de Gestión</p>
                <script>window.print(); setTimeout(()=>window.close(), 500);</script>
            </body>
            </html>
        `);
        ventana.document.close();
    };

    // Carga inicial
    cargarEstadisticas();
});