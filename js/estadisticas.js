// js/estadisticas.js - REPORTES Y KPIs DE VENTAS (V7.5 - Corte Persistente + LocalStorage)
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') {
        console.warn("Sesión no válida o base de datos no conectada.");
        return;
    }

    // --- ELEMENTOS UI ---
    const spanTotalDia = document.getElementById('totalDia');
    const spanEfectivo = document.getElementById('totalEfectivo');
    const spanTarjeta = document.getElementById('totalTarjeta');
    const spanNumVentas = document.getElementById('numVentasDia');
    const spanTicketPromedio = document.getElementById('ticketPromedio');
    const listaVentas = document.getElementById('listaUltimasVentas');
    let chartInstancia = null;
    let ventasHoy = [];
    let ultimaHoraCorte = null;

    // 🔹 1. Obtener la hora del último corte registrado (persistente)
    async function obtenerUltimoCorte() {
        const claveLocal = `ultimo_corte_${sesion.restaurante_id}`;
        const local = localStorage.getItem(claveLocal);

        if (local) {
            ultimaHoraCorte = new Date(local);
        } else {
            const { data, error } = await db
                .from('restaurantes')
                .select('corte_actual')
                .eq('id', sesion.restaurante_id)
                .single();

            if (!error && data?.corte_actual) {
                ultimaHoraCorte = new Date(data.corte_actual);
                localStorage.setItem(claveLocal, data.corte_actual);
            } else {
                // Si no hay registro, usar inicio del día
                ultimaHoraCorte = new Date();
                ultimaHoraCorte.setHours(0, 0, 0, 0);
            }
        }
    }

    // 🔹 2. Cargar ventas posteriores al último corte
    async function cargarEstadisticas() {
        await obtenerUltimoCorte();

        const desde = ultimaHoraCorte ? ultimaHoraCorte : new Date();
        desde.setHours(0, 0, 0, 0);

        const { data, error } = await db
            .from('ventas')
            .select('*')
            .eq('restaurante_id', sesion.restaurante_id)
            .gte('created_at', ultimaHoraCorte ? ultimaHoraCorte.toISOString() : desde.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error cargando ventas:", error.message);
            return;
        }

        ventasHoy = data || [];
        actualizarKPIs();
        renderizarTabla();
        dibujarGrafico();
    }

    // 🔹 3. Actualizar KPIs
    function actualizarKPIs() {
        let total = 0, efectivo = 0, tarjeta = 0;
        ventasHoy.forEach(v => {
            const monto = parseFloat(v.total) || 0;
            total += monto;
            if ((v.metodo_pago || '').toLowerCase().includes('tarjeta')) tarjeta += monto;
            else efectivo += monto;
        });

        const n = ventasHoy.length;
        const promedio = n ? total / n : 0;
        const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

        spanTotalDia.textContent = fmt.format(total);
        spanEfectivo.textContent = fmt.format(efectivo);
        spanTarjeta.textContent = fmt.format(tarjeta);
        spanNumVentas.textContent = n;
        spanTicketPromedio.textContent = fmt.format(promedio);
    }

    // 🔹 4. Renderizar tabla
    function renderizarTabla() {
        if (!listaVentas) return;
        if (ventasHoy.length === 0) {
            listaVentas.innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay ventas registradas desde el último corte.</td></tr>`;
            return;
        }
        listaVentas.innerHTML = ventasHoy.map(v => `
            <tr>
                <td>#${v.id.toString().slice(-5).toUpperCase()}</td>
                <td>${v.mesa || 'LLEVAR'}</td>
                <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
                <td>${(v.metodo_pago || 'EFECTIVO').toUpperCase()}</td>
                <td>${new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
        `).join('');
    }

    // 🔹 5. Gráfico
    function dibujarGrafico() {
        const canvas = document.getElementById('graficoCategorias');
        if (!canvas) return;
        if (chartInstancia) chartInstancia.destroy();

        const resumen = {};
        ventasHoy.forEach(v => {
            if (!v.productos) return;
            v.productos.split(',').forEach(p => {
                const match = p.trim().match(/^(\d+)x\s+(.+)$/);
                const cantidad = match ? parseInt(match[1]) : 1;
                const nombre = match ? match[2] : p.trim();
                resumen[nombre] = (resumen[nombre] || 0) + cantidad;
            });
        });

        const labels = Object.keys(resumen).slice(0, 5);
        const data = labels.map(l => resumen[l]);
        chartInstancia = new Chart(canvas, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: ['#10ad93', '#3498db', '#9b59b6', '#f1c40f', '#e67e22'] }] },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    }

    // 🔹 6. Imprimir corte
    window.imprimirCorteCaja = () => {
        if (ventasHoy.length === 0) return alert("No hay ventas que imprimir.");
        const fecha = new Date().toLocaleDateString();
        const hora = new Date().toLocaleTimeString();
        const ventana = window.open("", "_blank", "width=400,height=600");
        ventana.document.write(`
            <html><head><title>Corte</title></head><body>
            <h2 style="text-align:center;">CORTE DE CAJA</h2>
            <p><b>Fecha:</b> ${fecha}<br><b>Hora:</b> ${hora}</p>
            <hr>
            <p><b>Total:</b> ${spanTotalDia.textContent}</p>
            <p>Efectivo: ${spanEfectivo.textContent}</p>
            <p>Tarjeta: ${spanTarjeta.textContent}</p>
            <p>Ventas: ${spanNumVentas.textContent}</p>
            <p>Promedio: ${spanTicketPromedio.textContent}</p>
            <hr><p style="text-align:center;">*** FIN ***</p>
            <script>window.print(); setTimeout(()=>window.close(),1000);</script>
            </body></html>
        `);
    };

    // 🔹 7. Realizar corte real y registrar hora (persistente)
    window.realizarCorteCaja = async () => {
        if (ventasHoy.length === 0) return alert("No hay ventas desde el último corte.");
        if (!confirm("¿Confirmar corte de caja e imprimir reporte?")) return;

        window.imprimirCorteCaja();

        const total = ventasHoy.reduce((a, v) => a + parseFloat(v.total || 0), 0);
        const efectivo = ventasHoy.filter(v => (v.metodo_pago || '').toLowerCase().includes('efectivo')).reduce((a, v) => a + parseFloat(v.total || 0), 0);
        const tarjeta = ventasHoy.filter(v => (v.metodo_pago || '').toLowerCase().includes('tarjeta')).reduce((a, v) => a + parseFloat(v.total || 0), 0);

        await db.from('cortes_caja').insert({
            restaurante_id: sesion.restaurante_id,
            fecha_corte: new Date().toISOString(),
            total, total_efectivo: efectivo, total_tarjeta: tarjeta,
            num_ventas: ventasHoy.length,
            usuario: sesion?.nombre || 'Desconocido'
        });

        // 🧩 Actualizar corte persistente
        const fechaCorte = new Date().toISOString();
        await db.from('restaurantes')
            .update({ corte_actual: fechaCorte })
            .eq('id', sesion.restaurante_id);

        // 🧠 Guardar también en localStorage
        localStorage.setItem(`ultimo_corte_${sesion.restaurante_id}`, fechaCorte);

        ventasHoy = [];
        actualizarKPIs();
        renderizarTabla();
        if (chartInstancia) chartInstancia.destroy();

        alert("✅ Corte realizado y guardado correctamente.");
    };

    // 🔹 8. Escucha realtime
    if (db.channel) {
        db.channel('ventas-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => cargarEstadisticas())
          .subscribe();
    }

    // 🔹 9. Inicializar
    cargarEstadisticas();
});