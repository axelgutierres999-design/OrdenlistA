// js/estadisticas.js - REPORTES Y KPIs DE VENTAS (DIVISIÓN EFECTIVO/TARJETA)

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') return;

    // Elementos de la UI
    const spanTotalDia = document.getElementById('totalDia');
    const spanEfectivo = document.getElementById('totalEfectivo');
    const spanTarjeta = document.getElementById('totalTarjeta');
    const spanNumVentas = document.getElementById('numVentasDia');
    const spanTicketPromedio = document.getElementById('ticketPromedio');
    const listaVentas = document.getElementById('listaUltimasVentas');
    
    let chartInstancia = null;
    let ventasHoy = [];

    async function cargarEstadisticas() {
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        
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

    function actualizarKPIs() {
        let totalGeneral = 0;
        let totalEfec = 0;
        let totalTarj = 0;

        ventasHoy.forEach(v => {
            const monto = parseFloat(v.total);
            totalGeneral += monto;
            if (v.metodo_pago === 'tarjeta') totalTarj += monto;
            else totalEfec += monto; // Default a efectivo
        });

        const cantidad = ventasHoy.length;
        const promedio = cantidad > 0 ? totalGeneral / cantidad : 0;

        if (spanTotalDia) spanTotalDia.innerText = `$${totalGeneral.toFixed(2)}`;
        if (spanEfectivo) spanEfectivo.innerText = `$${totalEfec.toFixed(2)}`;
        if (spanTarjeta) spanTarjeta.innerText = `$${totalTarj.toFixed(2)}`;
        if (spanNumVentas) spanNumVentas.innerText = cantidad;
        if (spanTicketPromedio) spanTicketPromedio.innerText = `$${promedio.toFixed(2)}`;
    }

    function renderizarTabla() {
        if (!listaVentas) return;
        if (ventasHoy.length === 0) {
            listaVentas.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay ventas registradas hoy.</td></tr>';
            return;
        }

        listaVentas.innerHTML = ventasHoy.map(v => `
            <tr>
                <td><small>#${v.id.toString().slice(-5).toUpperCase()}</small></td>
                <td>${v.mesa}</td>
                <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
                <td><span class="badge" style="background:${v.metodo_pago === 'tarjeta' ? '#3498db' : '#10ad93'}; color:white; padding:2px 8px; border-radius:5px; font-size:0.7rem;">${v.metodo_pago.toUpperCase()}</span></td>
                <td>${new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
        `).join('');
    }

    function dibujarGrafico() {
        const canvas = document.getElementById('graficoCategorias');
        if (!canvas || typeof Chart === 'undefined' || ventasHoy.length === 0) return;

        if (chartInstancia) chartInstancia.destroy();

        const resumen = {};
        ventasHoy.forEach(v => {
            v.productos.split(',').forEach(p => {
                const nombreLimpio = p.trim().replace(/^\d+x\s/, ''); 
                resumen[nombreLimpio] = (resumen[nombreLimpio] || 0) + 1;
            });
        });

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
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    window.imprimirCorteCaja = () => {
        const fecha = new Date().toLocaleDateString();
        const hora = new Date().toLocaleTimeString();

        const ventana = window.open("", "_blank", "width=400,height=600");
        ventana.document.write(`
            <html>
            <head>
                <title>Corte de Caja</title>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 20px; color: #000; }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .line { border-top: 1px dashed #000; margin: 10px 0; }
                    .flex { display: flex; justify-content: space-between; }
                </style>
            </head>
            <body>
                <div class="center">
                    <h2 style="margin:0;">CORTE DE CAJA</h2>
                    <p>${sesion.nombre_restaurante}</p>
                    <p>${fecha} - ${hora}</p>
                </div>
                <div class="line"></div>
                <div class="flex bold"><span>VENTAS TOTALES:</span><span>${spanTotalDia.innerText}</span></div>
                <div class="line"></div>
                <div class="flex"><span>Efectivo:</span><span>${spanEfectivo.innerText}</span></div>
                <div class="flex"><span>Tarjeta:</span><span>${spanTarjeta.innerText}</span></div>
                <div class="line"></div>
                <div class="flex"><span>Tickets:</span><span>${spanNumVentas.innerText}</span></div>
                <div class="flex"><span>Promedio:</span><span>${spanTicketPromedio.innerText}</span></div>
                <div class="line"></div>
                <p class="center">*** Fin de Reporte ***</p>
                <script>window.print(); setTimeout(()=>window.close(), 500);</script>
            </body>
            </html>
        `);
        ventana.document.close();
    };

    cargarEstadisticas();
});