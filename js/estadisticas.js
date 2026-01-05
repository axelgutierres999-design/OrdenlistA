// js/estadisticas.js - REPORTES Y KPIs CON CORTE DE TURNO (V7.0)
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') return;

    const spanTotalDia = document.getElementById('totalDia');
    const spanEfectivo = document.getElementById('totalEfectivo');
    const spanTarjeta = document.getElementById('totalTarjeta');
    const spanNumVentas = document.getElementById('numVentasDia');
    const spanTicketPromedio = document.getElementById('ticketPromedio');
    const listaVentas = document.getElementById('listaUltimasVentas');

    let chartInstancia = null;
    let ventasHoy = [];

    // --- 1. CARGA DE DATOS FILTRADOS ---
    async function cargarEstadisticas() {
        try {
            // Buscamos solo ventas del restaurante que NO hayan sido cortadas (estado != 'archivado')
            const { data, error } = await db
                .from('ventas')
                .select('*')
                .eq('restaurante_id', sesion.restaurante_id)
                .neq('estado', 'archivado') // Solo lo que pertenece al turno actual
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

    // --- 2. CÁLCULOS ---
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

    // --- 3. TABLA DE VENTAS ---
    function renderizarTabla() {
        if (!listaVentas) return;
        if (ventasHoy.length === 0) {
            listaVentas.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #888;">Caja en cero. No hay ventas activas.</td></tr>`;
            return;
        }

        listaVentas.innerHTML = ventasHoy.map(v => `
            <tr>
                <td><small>#${v.id.toString().slice(-4)}</small></td>
                <td><mark>${v.mesa || 'LLEVAR'}</mark></td>
                <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
                <td><span class="badge" style="background:${v.metodo_pago?.toLowerCase().includes('tarjeta') ? '#3498db' : '#10ad93'};">${v.metodo_pago?.toUpperCase()}</span></td>
                <td>${new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>`).join('');
    }

    // --- 4. GRÁFICO (Doughnut) ---
    function dibujarGrafico() {
        const canvas = document.getElementById('graficoCategorias');
        if (!canvas || typeof Chart === 'undefined') return;
        if (chartInstancia) chartInstancia.destroy();
        if (ventasHoy.length === 0) return;

        const resumen = {};
        ventasHoy.forEach(v => {
            if (!v.productos) return;
            v.productos.split(',').forEach(p => {
                const nombre = p.trim();
                resumen[nombre] = (resumen[nombre] || 0) + 1;
            });
        });

        const labels = Object.keys(resumen).slice(0, 5);
        const values = labels.map(l => resumen[l]);

        chartInstancia = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: values, backgroundColor: ['#10ad93', '#3498db', '#9b59b6', '#f1c40f', '#e67e22'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // --- 5. FUNCIÓN DE CORTE (LA SOLUCIÓN) ---
    window.realizarCorteCaja = async () => {
        if (ventasHoy.length === 0) return alert("La caja ya está en cero.");

        const confirmar = confirm("¿Deseas imprimir el corte y REINICIAR la caja a $0.00?");
        if (!confirmar) return;

        // 1. Imprimir primero
        imprimirTicketCorte();

        // 2. Marcar ventas como 'archivado' en Supabase para que ya no sumen
        try {
            const ids = ventasHoy.map(v => v.id);
            const { error } = await db
                .from('ventas')
                .update({ estado: 'archivado' })
                .in('id', ids);

            if (error) throw error;

            alert("✅ Corte realizado con éxito. Las cuentas han vuelto a cero.");
            cargarEstadisticas(); // Esto pondrá todo en $0 visualmente

        } catch (err) {
            alert("Error al archivar ventas: " + err.message);
        }
    };

    function imprimirTicketCorte() {
        const ventana = window.open("", "_blank", "width=400,height=600");
        ventana.document.write(`
            <html>
            <body style="font-family:monospace; width:300px;">
                <h2 style="text-align:center;">CORTE DE CAJA</h2>
                <hr>
                <p>Restaurante: ${sesion.nombre_restaurante}</p>
                <p>Fecha: ${new Date().toLocaleString()}</p>
                <hr>
                <h3>TOTAL: ${spanTotalDia.innerText}</h3>
                <p>Efectivo: ${spanEfectivo.innerText}</p>
                <p>Tarjeta: ${spanTarjeta.innerText}</p>
                <p>Ventas: ${spanNumVentas.innerText}</p>
                <hr>
                <p style="text-align:center;">Caja Cerrada</p>
                <script>window.onload = () => { window.print(); window.close(); }</script>
            </body>
            </html>
        `);
        ventana.document.close();
    }

    // Realtime
    if (db.channel) {
        db.channel('ventas-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => cargarEstadisticas())
            .subscribe();
    }

    cargarEstadisticas();
});