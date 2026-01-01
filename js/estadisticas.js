// js/estadisticas.js - REPORTES Y KPIs (CORREGIDO MULTINEGOCIO)

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || !db) return;

    const spanTotalDia = document.getElementById('totalDia');
    const spanNumVentas = document.getElementById('numVentasDia');
    const listaVentas = document.getElementById('listaUltimasVentas');
    let ventasHoy = [];

    // --- 1. CARGAR DATOS ---
    async function cargarEstadisticas() {
        // Obtenemos el inicio del día local en formato ISO
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        
        const { data, error } = await db
            .from('ordenes') // Consultamos la tabla de ordenes pagadas
            .select('*')
            .eq('restaurante_id', sesion.restaurante_id)
            .eq('estado', 'pagado')
            .gte('created_at', hoy.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error cargando estadísticas:", error);
            return;
        }

        ventasHoy = data;
        actualizarKPIs();
        renderizarTabla();
        dibujarGrafico();
    }

    // --- 2. KPIs ---
    function actualizarKPIs() {
        const total = ventasHoy.reduce((acc, v) => acc + parseFloat(v.total), 0);
        if (spanTotalDia) spanTotalDia.innerText = `$${total.toFixed(2)}`;
        if (spanNumVentas) spanNumVentas.innerText = ventasHoy.length;
    }

    // --- 3. TABLA DE VENTAS ---
    function renderizarTabla() {
        if (!listaVentas) return;
        listaVentas.innerHTML = '';
        
        ventasHoy.forEach(v => {
            const fecha = new Date(v.created_at);
            const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            listaVentas.innerHTML += `
                <tr>
                    <td><small>#${v.id.slice(-4).toUpperCase()}</small></td>
                    <td>${v.mesa}</td>
                    <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
                    <td><span class="badge-metodo">${v.metodo_pago || 'Efectivo'}</span></td>
                    <td>${hora}</td>
                </tr>
            `;
        });
    }

    // --- 4. GRÁFICO DE CATEGORÍAS ---
    function dibujarGrafico() {
        const ctx = document.getElementById('graficoCategorias');
        if (!ctx || typeof Chart === 'undefined' || ventasHoy.length === 0) return;

        // Agrupamos por productos (simulación de categorías)
        const resumen = {};
        ventasHoy.forEach(v => {
            // Dividimos el string de productos "1x Café, 2x Pan"
            const items = v.productos.split(',');
            items.forEach(item => {
                const nombre = item.trim().split('x ')[1] || 'Otros';
                resumen[nombre] = (resumen[nombre] || 0) + 1;
            });
        });

        // Tomamos los 5 más vendidos
        const labels = Object.keys(resumen).slice(0, 5);
        const values = Object.values(resumen).slice(0, 5);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#10ad93', '#3498db', '#9b59b6', '#f1c40f', '#e67e22'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // --- 5. FUNCIÓN DE IMPRESIÓN ---
    window.imprimirCorteCaja = () => {
        const total = spanTotalDia.innerText;
        const num = spanNumVentas.innerText;
        const fecha = new Date().toLocaleDateString();

        const ventana = window.open("", "_blank", "width=400,height=600");
        ventana.document.write(`
            <html>
            <head>
                <title>Corte de Caja</title>
                <style>
                    body { font-family: monospace; padding: 20px; text-align: center; }
                    .line { border-top: 1px dashed #000; margin: 10px 0; }
                    table { width: 100%; font-size: 12px; }
                </style>
            </head>
            <body>
                <h2>CORTE DE CAJA</h2>
                <p>${sesion.nombre_restaurante}</p>
                <p>Fecha: ${fecha}</p>
                <div class="line"></div>
                <h3>TOTAL: ${total}</h3>
                <p>Transacciones: ${num}</p>
                <div class="line"></div>
                <p>Gracias por su trabajo hoy.</p>
                <script>window.print();</script>
            </body>
            </html>
        `);
        ventana.document.close();
    };

    cargarEstadisticas();
});