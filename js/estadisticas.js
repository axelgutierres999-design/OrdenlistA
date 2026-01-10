// js/estadisticas.js - CORREGIDO (Prioridad Base de Datos)
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

    // 🔹 1. OBTENER CORTE (CORREGIDO: Prioriza DB sobre LocalStorage)
    async function obtenerUltimoCorte() {
        try {
            // Consultamos SIEMPRE a la base de datos primero para tener la verdad absoluta
            const { data, error } = await db
                .from('restaurantes')
                .select('corte_actual')
                .eq('id', sesion.restaurante_id)
                .single();

            if (!error && data?.corte_actual) {
                ultimaHoraCorte = new Date(data.corte_actual);
                // Actualizamos el local por si acaso, pero confiamos en la DB
                localStorage.setItem(`ultimo_corte_${sesion.restaurante_id}`, data.corte_actual);
            } else {
                // Si no hay corte en DB, intentamos ver si hay algo local (fallback) o iniciamos el día
                const local = localStorage.getItem(`ultimo_corte_${sesion.restaurante_id}`);
                if (local) {
                    ultimaHoraCorte = new Date(local);
                } else {
                    ultimaHoraCorte = new Date();
                    ultimaHoraCorte.setHours(0, 0, 0, 0); // Inicio del día por defecto
                }
            }
        } catch (e) {
            console.error("Error obteniendo corte:", e);
            // Fallback de emergencia
            ultimaHoraCorte = new Date();
            ultimaHoraCorte.setHours(0, 0, 0, 0);
        }
    }

    // 🔹 2. CARGAR VENTAS
    async function cargarEstadisticas() {
        await obtenerUltimoCorte(); // Esperamos a saber la hora exacta

        // Si falló todo, usar inicio del día
        const desde = ultimaHoraCorte ? ultimaHoraCorte : new Date();
        if (!ultimaHoraCorte) desde.setHours(0, 0, 0, 0);

        console.log("Cargando ventas desde:", desde.toLocaleString());

        const { data, error } = await db
            .from('ventas')
            .select('*')
            .eq('restaurante_id', sesion.restaurante_id)
            .gte('created_at', desde.toISOString()) // Trae solo lo creado DESPUÉS del corte
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

    // 🔹 3. ACTUALIZAR INDICADORES VISUALES
    function actualizarKPIs() {
        let total = 0, efectivo = 0, tarjeta = 0;
        ventasHoy.forEach(v => {
            const monto = parseFloat(v.total) || 0;
            total += monto;
            const metodo = (v.metodo_pago || '').toLowerCase();
            if (metodo.includes('tarjeta') || metodo.includes('transferencia')) {
                tarjeta += monto;
            } else {
                efectivo += monto;
            }
        });

        const n = ventasHoy.length;
        const promedio = n ? total / n : 0;
        const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

        if(spanTotalDia) spanTotalDia.textContent = fmt.format(total);
        if(spanEfectivo) spanEfectivo.textContent = fmt.format(efectivo);
        if(spanTarjeta) spanTarjeta.textContent = fmt.format(tarjeta);
        if(spanNumVentas) spanNumVentas.textContent = n;
        if(spanTicketPromedio) spanTicketPromedio.textContent = fmt.format(promedio);
    }

    // 🔹 4. RENDERIZAR TABLA
    function renderizarTabla() {
        if (!listaVentas) return;
        if (ventasHoy.length === 0) {
            listaVentas.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">No hay ventas registradas desde el último corte (${ultimaHoraCorte.toLocaleTimeString()}).</td></tr>`;
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

    // 🔹 5. GRÁFICO
    function dibujarGrafico() {
        const canvas = document.getElementById('graficoCategorias');
        if (!canvas) return;
        if (chartInstancia) chartInstancia.destroy();

        const resumen = {};
        ventasHoy.forEach(v => {
            if (!v.productos) return;
            v.productos.split(',').forEach(p => {
                // Parsea: "2x Coca Cola"
                const match = p.trim().match(/^(\d+)x\s+(.+)$/);
                const cantidad = match ? parseInt(match[1]) : 1;
                const nombre = match ? match[2] : p.trim();
                resumen[nombre] = (resumen[nombre] || 0) + cantidad;
            });
        });

        const labels = Object.keys(resumen).slice(0, 5); // Top 5
        const data = labels.map(l => resumen[l]);
        
        chartInstancia = new Chart(canvas, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: ['#10ad93', '#3498db', '#9b59b6', '#f1c40f', '#e67e22'] }] },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    }

    // 🔹 6. IMPRIMIR CORTE (Pop-up)
    window.imprimirCorteCaja = () => {
        if (ventasHoy.length === 0) return alert("No hay ventas que imprimir.");
        const fecha = new Date().toLocaleDateString();
        const hora = new Date().toLocaleTimeString();
        
        // Calcular totales actuales para el ticket
        const total = spanTotalDia ? spanTotalDia.textContent : "$0.00";
        const efectivo = spanEfectivo ? spanEfectivo.textContent : "$0.00";
        const tarjeta = spanTarjeta ? spanTarjeta.textContent : "$0.00";

        const ventana = window.open("", "_blank", "width=300,height=600");
        ventana.document.write(`
            <html>
                <head>
                    <title>Corte de Caja</title>
                    <style>
                        body { font-family: 'Courier New', monospace; text-align: center; margin: 0; padding: 10px; }
                        hr { border: 1px dashed #000; }
                        .fila { display: flex; justify-content: space-between; }
                    </style>
                </head>
                <body>
                    <h2>CORTE DE CAJA</h2>
                    <p>${fecha} - ${hora}</p>
                    <hr>
                    <div class="fila"><b>TOTAL:</b> <span>${total}</span></div>
                    <div class="fila">Efectivo: <span>${efectivo}</span></div>
                    <div class="fila">Tarjeta: <span>${tarjeta}</span></div>
                    <div class="fila">Ventas: <span>${ventasHoy.length}</span></div>
                    <hr>
                    <p>Firma Cajero:</p>
                    <br><br>
                    <p>__________________</p>
                    <script>
                        window.print();
                        setTimeout(() => window.close(), 500);
                    </script>
                </body>
            </html>
        `);
    };

    // 🔹 7. REALIZAR CORTE (Función Principal)
    window.realizarCorteCaja = async () => {
        if (ventasHoy.length === 0) return alert("No hay ventas nuevas para cortar.");
        if (!confirm("¿Seguro que deseas realizar el CORTE DE CAJA?\nEsto reiniciará los contadores a $0.")) return;

        try {
            // 1. Calcular totales matemáticos
            const total = ventasHoy.reduce((a, v) => a + parseFloat(v.total || 0), 0);
            const efectivo = ventasHoy
                .filter(v => !(v.metodo_pago || '').toLowerCase().includes('tarjeta'))
                .reduce((a, v) => a + parseFloat(v.total || 0), 0);
            const tarjeta = ventasHoy
                .filter(v => (v.metodo_pago || '').toLowerCase().includes('tarjeta'))
                .reduce((a, v) => a + parseFloat(v.total || 0), 0);

            const fechaCorte = new Date().toISOString();

            // 2. Insertar historial en 'cortes_caja'
            const { error: errorHistorial } = await db.from('cortes_caja').insert({
                restaurante_id: sesion.restaurante_id,
                fecha_corte: fechaCorte,
                total, 
                total_efectivo: efectivo, 
                total_tarjeta: tarjeta,
                num_ventas: ventasHoy.length,
                usuario: sesion?.nombre || 'Admin'
            });

            if (errorHistorial) throw new Error("Error guardando historial: " + errorHistorial.message);

            // 3. Actualizar la marca de tiempo en 'restaurantes' (ESTO ES LO QUE HACE EL CORTE REAL)
            const { error: errorUpdate } = await db.from('restaurantes')
                .update({ corte_actual: fechaCorte })
                .eq('id', sesion.restaurante_id);

            if (errorUpdate) throw new Error("Error actualizando restaurante: " + errorUpdate.message);

            // 4. Éxito
            localStorage.setItem(`ultimo_corte_${sesion.restaurante_id}`, fechaCorte);
            
            // Imprimir antes de limpiar
            window.imprimirCorteCaja();

            alert("✅ Corte realizado exitosamente.");
            
            // Recargar para limpiar pantalla
            cargarEstadisticas();

        } catch (err) {
            console.error(err);
            alert("❌ Falló el corte: " + err.message);
        }
    };

    // 🔹 8. Escucha Realtime (Solo recarga si hay nuevas ventas)
    if (db.channel) {
        db.channel('ventas-realtime')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ventas' }, () => {
              console.log("Nueva venta detectada, actualizando...");
              cargarEstadisticas();
          })
          .subscribe();
    }

    // Inicio
    cargarEstadisticas();
});