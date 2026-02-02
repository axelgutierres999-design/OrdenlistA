// js/estadisticas.js - VERSION CORREGIDA PARA MÓVIL (V9.5)
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

    // 🔹 1. OBTENER CORTE
    async function obtenerUltimoCorte() {
        try {
            const { data, error } = await db
                .from('restaurantes')
                .select('corte_actual')
                .eq('id', sesion.restaurante_id)
                .single();

            if (!error && data?.corte_actual) {
                ultimaHoraCorte = new Date(data.corte_actual);
                localStorage.setItem(`ultimo_corte_${sesion.restaurante_id}`, data.corte_actual);
            } else {
                const local = localStorage.getItem(`ultimo_corte_${sesion.restaurante_id}`);
                if (local) {
                    ultimaHoraCorte = new Date(local);
                } else {
                    ultimaHoraCorte = new Date();
                    ultimaHoraCorte.setHours(0, 0, 0, 0);
                }
            }
        } catch (e) {
            console.error("Error obteniendo corte:", e);
            ultimaHoraCorte = new Date();
            ultimaHoraCorte.setHours(0, 0, 0, 0);
        }
    }

    // 🔹 2. CARGAR VENTAS
    async function cargarEstadisticas() {
        await obtenerUltimoCorte();

        const desde = ultimaHoraCorte ? ultimaHoraCorte : new Date();
        if (!ultimaHoraCorte) desde.setHours(0, 0, 0, 0);

        console.log("Cargando ventas desde:", desde.toLocaleString());

        const { data, error } = await db
            .from('ventas')
            .select('*')
            .eq('restaurante_id', sesion.restaurante_id)
            .gte('created_at', desde.toISOString())
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
            if (metodo.includes('tarjeta') || metodo.includes('transferencia') || metodo.includes('qr')) {
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
            listaVentas.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">No hay ventas registradas desde el último corte.</td></tr>`;
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

    // 🔹 6. IMPRIMIR CORTE (CORREGIDO PARA MÓVIL)
    window.imprimirCorteCaja = () => {
        if (ventasHoy.length === 0) return; // No alertar aquí para no interrumpir flujo

        const fecha = new Date().toLocaleDateString();
        const hora = new Date().toLocaleTimeString();
        
        const total = spanTotalDia ? spanTotalDia.textContent : "$0.00";
        const efectivo = spanEfectivo ? spanEfectivo.textContent : "$0.00";
        const tarjeta = spanTarjeta ? spanTarjeta.textContent : "$0.00";

        // INTENTO DE ABRIR VENTANA
        const ventana = window.open("", "_blank", "width=300,height=600");

        // ✅ VALIDACIÓN CRÍTICA: Si el móvil bloquea la ventana, 'ventana' es null
        if (!ventana) {
            console.warn("Bloqueo de pop-up detectado. No se puede imprimir ticket automáticamente.");
            alert("⚠️ El corte se realizó correctamente, pero el navegador bloqueó la impresión del ticket.\n\nPara la próxima, habilita 'Ventanas Emergentes'.");
            return;
        }

        try {
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
                            // Damos tiempo al móvil antes de cerrar
                            setTimeout(() => window.close(), 1000); 
                        </script>
                    </body>
                </html>
            `);
            ventana.document.close(); // Importante para terminar la carga
        } catch (e) {
            console.error("Error al generar ticket:", e);
        }
    };

    // 🔹 7. REALIZAR CORTE (Función Principal BLINDADA)
    window.realizarCorteCaja = async () => {
        if (ventasHoy.length === 0) return alert("No hay ventas nuevas para cortar.");
        if (!confirm("¿Seguro que deseas realizar el CORTE DE CAJA?\nEsto reiniciará los contadores a $0.")) return;

        try {
            // 1. Calcular totales matemáticos
            const total = ventasHoy.reduce((a, v) => a + parseFloat(v.total || 0), 0);
            const efectivo = ventasHoy
                .filter(v => !(v.metodo_pago || '').toLowerCase().includes('tarjeta') && !(v.metodo_pago || '').toLowerCase().includes('qr') && !(v.metodo_pago || '').toLowerCase().includes('transferencia'))
                .reduce((a, v) => a + parseFloat(v.total || 0), 0);
            
            // Tarjeta incluye QR y Transferencia para contabilidad simple
            const tarjeta = total - efectivo; 

            const fechaCorte = new Date().toISOString();

            // 2. Insertar historial
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

            // 3. Actualizar restaurante (EL CORTE REAL)
            const { error: errorUpdate } = await db.from('restaurantes')
                .update({ corte_actual: fechaCorte })
                .eq('id', sesion.restaurante_id);

            if (errorUpdate) throw new Error("Error actualizando restaurante: " + errorUpdate.message);

            // 4. Éxito en Base de Datos
            localStorage.setItem(`ultimo_corte_${sesion.restaurante_id}`, fechaCorte);
            
            // 5. INTENTO DE IMPRESIÓN (Separado para que si falla no muestre error de corte)
            try {
                window.imprimirCorteCaja();
            } catch (printErr) {
                console.warn("Error interno de impresión:", printErr);
            }

            alert("✅ Corte realizado exitosamente.");
            
            // Recargar para limpiar pantalla
            cargarEstadisticas();

        } catch (err) {
            console.error(err);
            alert("❌ Falló el corte: " + err.message);
        }
    };

    // 🔹 8. Escucha Realtime
    if (db.channel) {
        db.channel('ventas-realtime')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ventas' }, () => {
              cargarEstadisticas();
          })
          .subscribe();
    }

    // Inicio
    cargarEstadisticas();
});