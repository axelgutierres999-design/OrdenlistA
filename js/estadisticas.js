// js/estadisticas.js - REPORTES Y KPIs DE VENTAS (V6.2 - ESTABLE)
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificación de sesión y conexión
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') {
        console.warn("Sesión no válida o base de datos no conectada.");
        return;
    }

    // Elementos UI
    const spanTotalDia = document.getElementById('totalDia');
    const spanEfectivo = document.getElementById('totalEfectivo');
    const spanTarjeta = document.getElementById('totalTarjeta');
    const spanNumVentas = document.getElementById('numVentasDia');
    const spanTicketPromedio = document.getElementById('ticketPromedio');
    const listaVentas = document.getElementById('listaUltimasVentas');

    let chartInstancia = null;
    let ventasHoy = [];

    // --- 2. CARGA DE DATOS ---
    async function cargarEstadisticas() {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        try {
            const { data, error } = await db
                .from('ventas')
                .select('*')
                .eq('restaurante_id', sesion.restaurante_id)
                // FIX: Ajuste de zona horaria (UTC -6 MX)
                .gte('created_at', new Date(hoy.getTime() - 6 * 60 * 60 * 1000).toISOString())
                .order('created_at', { ascending: false });

            if (error) throw error;

            ventasHoy = data || [];

            actualizarKPIs();
            renderizarTabla();
            dibujarGrafico();

        } catch (err) {
            console.error("Error cargando estadísticas:", err.message);
        }
    }

    // --- 3. KPI PRINCIPALES ---
    function actualizarKPIs() {
        let totalGeneral = 0, totalEfec = 0, totalTarj = 0;

        ventasHoy.forEach(v => {
            const monto = parseFloat(v.total) || 0;
            totalGeneral += monto;

            const metodo = (v.metodo_pago || 'efectivo').toLowerCase();
            if (metodo.includes('tarjeta')) totalTarj += monto;
            else totalEfec += monto;
        });

        const cantidad = ventasHoy.length;
        const promedio = cantidad > 0 ? totalGeneral / cantidad : 0;
        const f = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

        if (spanTotalDia) spanTotalDia.innerText = f.format(totalGeneral);
        if (spanEfectivo) spanEfectivo.innerText = f.format(totalEfec);
        if (spanTarjeta) spanTarjeta.innerText = f.format(totalTarj);
        if (spanNumVentas) spanNumVentas.innerText = cantidad;
        if (spanTicketPromedio) spanTicketPromedio.innerText = f.format(promedio);
    }

    // --- 4. TABLA DE VENTAS ---
    function renderizarTabla() {
        if (!listaVentas) return;

        if (ventasHoy.length === 0) {
            listaVentas.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding: 2rem; color: #888;">
                        No se han registrado ventas hoy.
                    </td>
                </tr>`;
            return;
        }

        listaVentas.innerHTML = ventasHoy.map(v => {
            const esTarjeta = (v.metodo_pago || '').toLowerCase().includes('tarjeta');
            const color = esTarjeta ? '#3498db' : '#10ad93';
            const metodo = (v.metodo_pago || 'EFECTIVO').toUpperCase();

            return `
                <tr>
                    <td><small style="font-family: monospace;">#${v.id.toString().slice(-5).toUpperCase()}</small></td>
                    <td><mark>${v.mesa || 'LLEVAR'}</mark></td>
                    <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
                    <td><span class="badge" style="background:${color};">${metodo}</span></td>
                    <td>${new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>`;
        }).join('');
    }

    // --- 5. GRÁFICO TOP PRODUCTOS ---
    function dibujarGrafico() {
        const canvas = document.getElementById('graficoCategorias');
        if (!canvas || typeof Chart === 'undefined') return;

        if (ventasHoy.length === 0) {
            if (chartInstancia && chartInstancia.destroy) chartInstancia.destroy();
            return;
        }

        const resumen = {};
        ventasHoy.forEach(v => {
            if (!v.productos) return;
            v.productos.split(',').forEach(p => {
                const match = p.trim().match(/^(\d+)x\s+(.+)$/);
                if (match) {
                    const cant = parseInt(match[1]);
                    const nombre = match[2];
                    resumen[nombre] = (resumen[nombre] || 0) + cant;
                } else {
                    const nombre = p.trim();
                    resumen[nombre] = (resumen[nombre] || 0) + 1;
                }
            });
        });

        const labels = Object.keys(resumen).sort((a, b) => resumen[b] - resumen[a]).slice(0, 5);
        const values = labels.map(l => resumen[l]);

        if (chartInstancia && chartInstancia.destroy) chartInstancia.destroy();

        chartInstancia = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#10ad93', '#3498db', '#9b59b6', '#f1c40f', '#e67e22'],
                    hoverOffset: 10,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } },
                    tooltip: { enabled: true }
                },
                cutout: '60%'
            }
        });
    }

    // --- 6. CORTE DE CAJA / IMPRESIÓN ---
    window.imprimirCorteCaja = () => {
        if (ventasHoy.length === 0) return alert("No hay ventas para imprimir el corte.");

        const fecha = new Date().toLocaleDateString();
        const hora = new Date().toLocaleTimeString();

        const ventana = window.open("", "_blank", "width=400,height=600");
        ventana.document.write(`
            <html>
            <head>
                <title>Corte de Caja - ${sesion?.nombre_restaurante || "Restaurante"}</title>
                <style>
                    body { font-family: 'Courier New', Courier, monospace; padding: 25px; color: #000; line-height: 1.4; }
                    .center { text-align: center; }
                    .bold { font-weight: bold; font-size: 1.1rem; }
                    .line { border-top: 1px dashed #000; margin: 12px 0; }
                    .flex { display: flex; justify-content: space-between; margin: 5px 0; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="center">
                    <h2 style="margin:0;">CORTE DE CAJA</h2>
                    <p class="bold">${(sesion?.nombre_restaurante || "Restaurante").toUpperCase()}</p>
                    <p>Fecha: ${fecha}<br>Hora: ${hora}</p>
                </div>
                <div class="line"></div>
                <div class="flex bold"><span>VENTAS TOTALES:</span><span>${spanTotalDia.innerText}</span></div>
                <div class="line"></div>
                <div class="flex"><span>Efectivo:</span><span>${spanEfectivo.innerText}</span></div>
                <div class="flex"><span>Tarjeta:</span><span>${spanTarjeta.innerText}</span></div>
                <div class="line"></div>
                <div class="flex"><span>Tickets Emitidos:</span><span>${spanNumVentas.innerText}</span></div>
                <div class="flex"><span>Ticket Promedio:</span><span>${spanTicketPromedio.innerText}</span></div>
                <div class="line"></div>
                <p class="center" style="font-size: 0.8rem;">Responsable: ${sesion?.nombre || "Usuario"}</p>
                <p class="center" style="margin-top: 30px;">*** FIN DE REPORTE ***</p>
                <script>
                    window.onload = () => {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    };
                </script>
            </body>
            </html>
        `);
        ventana.document.close();
    };

    // --- 7. ACTUALIZACIÓN AUTOMÁTICA (REALTIME) ---
    if (db.channel) {
        const canal = db.channel('ventas-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => {
                cargarEstadisticas();
            })
            .subscribe();
    }

    // Inicializar
    cargarEstadisticas();
});