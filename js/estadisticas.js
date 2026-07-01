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

    // 🔹 4. RENDERIZAR TABLA (ACTUALIZADA)
function renderizarTabla(listaDatos = ventasHoy) { // Ahora acepta un argumento
    if (!listaVentas) return;
    
    if (listaDatos.length === 0) {
        listaVentas.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">No se encontraron ventas.</td></tr>`;
        return;
    }

    listaVentas.innerHTML = listaDatos.map(v => `
        <tr>
            <td>#${v.id.toString().slice(-5).toUpperCase()}</td>
            <td>${v.mesa || 'LLEVAR'}</td>
            <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
            <td>${(v.metodo_pago || 'EFECTIVO').toUpperCase()}</td>
            <td>${new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td>
                <button class="outline secondary" 
                        style="padding: 5px 10px; font-size: 0.8rem; border-radius: 8px;"
                        onclick="imprimirTicketIndividual('${v.id}')">
                    📄 Ver
                </button>
            </td>
        </tr>
    `).join('');
}
// 🔹 NUEVO: FUNCIÓN BUSCADOR
window.filtrarVentas = () => {
    const texto = document.getElementById('buscadorVentas').value.toLowerCase();
    
    const filtradas = ventasHoy.filter(v => {
        const folio = v.id.toString().slice(-5).toLowerCase();
        const mesa = (v.mesa || '').toLowerCase();
        // Busca coincidencias en Folio O Mesa
        return folio.includes(texto) || mesa.includes(texto);
    });

    renderizarTabla(filtradas);
};
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
            
            // 5. INTENTO DE IMPRESIÓN
            try {
                window.imprimirCorteCaja();
            } catch (printErr) {
                console.warn("Error interno de impresión:", printErr);
            }

            // 6. ENVIAR RESUMEN AL WHATSAPP DEL DUEÑO
            try {
                await enviarCorteWhatsApp({ total, efectivo, tarjeta, numVentas: ventasHoy.length, fechaCorte });
            } catch (waErr) {
                console.warn("WhatsApp no disponible:", waErr);
            }

            alert("✅ Corte realizado. Se ha enviado el resumen por WhatsApp.");
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

// 🔹 NUEVO: IMPRIMIR TICKET INDIVIDUAL
window.imprimirTicketIndividual = (idVenta) => {
    const venta = ventasHoy.find(v => v.id == idVenta);
    if (!venta) return alert("Error: No se encontró la información de la venta.");

    let productosHtml = "";
    if (venta.productos) {
        venta.productos.split(',').forEach(p => {
            productosHtml += `<div class="fila" style="justify-content: flex-start;"><span>• ${p.trim()}</span></div>`;
        });
    }

    // Aumentamos el tamaño de la ventana para asegurar visibilidad
    const ventana = window.open("", "_blank", "width=350,height=600");
    if (!ventana) return alert("Habilita las ventanas emergentes para imprimir.");

    try {
        ventana.document.write(`
            <html>
                <head>
                    <title>Ticket #${venta.id.toString().slice(-5)}</title>
                    <style>
                        body { font-family: 'Courier New', monospace; margin: 0; padding: 10px; font-size: 12px; }
                        h3, p { text-align: center; margin: 5px 0; }
                        hr { border: 1px dashed #000; }
                        .fila { display: flex; justify-content: space-between; }
                        .total { font-size: 14px; font-weight: bold; margin-top: 10px; }
                        /* Ocultar botón de impresión al imprimir */
                        @media print { .no-print { display: none; } }
                        .btn-imprimir { 
                            width: 100%; padding: 10px; background: black; color: white; 
                            border: none; margin-top: 10px; cursor: pointer; border-radius: 5px;
                        }
                    </style>
                </head>
                <body>
                    <h3>ORDEN LISTA</h3>
                    <p>Folio: #${venta.id.toString().slice(-5).toUpperCase()}</p>
                    <p>${new Date(venta.created_at).toLocaleString()}</p>
                    <p>Mesa: ${venta.mesa || 'Llevar'}</p>
                    <hr>
                    ${productosHtml}
                    <hr>
                    <div class="fila total"><span>TOTAL:</span> <span>$${parseFloat(venta.total).toFixed(2)}</span></div>
                    <div class="fila"><span>Pago:</span> <span>${(venta.metodo_pago || 'EFECTIVO').toUpperCase()}</span></div>
                    <br>
                    <p style="font-size: 10px;">¡Gracias por su preferencia!</p>
                    
                    <button class="no-print btn-imprimir" onclick="window.print()">🖨️ Imprimir</button>

                    <script>
                        // Intentar imprimir automáticamente
                        setTimeout(() => {
                            window.print();
                            // NO cerramos automáticamente para dar tiempo al usuario
                        }, 500);
                    </script>
                </body>
            </html>
        `);
        ventana.document.close();
    } catch (e) {
        console.error(e);
    }
    // ─── Enviar resumen de corte por WhatsApp ───────────────────────────
    async function enviarCorteWhatsApp({ total, efectivo, tarjeta, numVentas, fechaCorte }) {
        // 1. Obtener el teléfono del dueño desde la tabla restaurantes
        const { data: resto } = await db
            .from('restaurantes')
            .select('telefono, nombre')
            .eq('id', sesion.restaurante_id)
            .single();

        const telefono = (resto?.telefono || '').replace(/\D/g, '');
        if (!telefono) {
            console.warn('No hay teléfono configurado para el dueño.');
            return;
        }

        // 2. Generar imagen del ticket de corte para compartir
        const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
        const fechaStr = new Date(fechaCorte).toLocaleString('es-MX', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // Crear div temporal con el ticket visual
        const ticketDiv = document.createElement('div');
        ticketDiv.style = `
            position:fixed; top:-9999px; left:-9999px;
            width:300px; background:white; padding:20px;
            font-family:'Courier New',monospace; color:black; font-size:13px;
        `;
        ticketDiv.innerHTML = `
            <div style="text-align:center; margin-bottom:10px;">
                <h2 style="margin:0; font-size:16px; text-transform:uppercase;">${resto?.nombre || 'Mi Restaurante'}</h2>
                <p style="margin:4px 0; font-size:11px;">CORTE DE CAJA</p>
                <p style="margin:4px 0; font-size:11px;">${fechaStr}</p>
            </div>
            <hr style="border:1px dashed #000; margin:10px 0;">
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
                <span>TOTAL:</span><strong>${fmt.format(total)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
                <span>Efectivo:</span><span>${fmt.format(efectivo)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
                <span>Tarjeta/Digital:</span><span>${fmt.format(tarjeta)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
                <span>Núm. ventas:</span><span>${numVentas}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:4px 0;">
                <span>Ticket promedio:</span><span>${fmt.format(numVentas ? total / numVentas : 0)}</span>
            </div>
            <hr style="border:1px dashed #000; margin:10px 0;">
            <p style="text-align:center; font-size:10px; margin:0;">OrdenLista · orden-list.vercel.app</p>
        `;
        document.body.appendChild(ticketDiv);

        // 3. Convertir a imagen con html2canvas (si está disponible)
        if (typeof html2canvas !== 'undefined') {
            try {
                const canvas = await html2canvas(ticketDiv, { scale: 3, backgroundColor: '#ffffff' });
                document.body.removeChild(ticketDiv);

                canvas.toBlob(async (blob) => {
                    const file = new File([blob], `Corte_${fechaStr.replace(/[/:, ]/g,'_')}.png`, { type: 'image/png' });

                    // En móvil: compartir imagen directamente
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: `Corte de caja — ${fechaStr}`,
                            text: `Corte de caja de ${resto?.nombre || 'Mi Restaurante'}: ${fmt.format(total)}`
                        });
                    } else {
                        // En PC: descargar imagen Y abrir WhatsApp Web con texto
                        const link = document.createElement('a');
                        link.download = `Corte_${fechaStr.replace(/[/:, ]/g,'_')}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();

                        const mensaje = encodeURIComponent(
                            `🧾 *CORTE DE CAJA — ${fechaStr}*\n` +
                            `📍 ${resto?.nombre || 'Mi Restaurante'}\n\n` +
                            `💰 Total: ${fmt.format(total)}\n` +
                            `💵 Efectivo: ${fmt.format(efectivo)}\n` +
                            `💳 Tarjeta/Digital: ${fmt.format(tarjeta)}\n` +
                            `🧾 Ventas: ${numVentas}\n` +
                            `📊 Ticket prom.: ${fmt.format(numVentas ? total/numVentas : 0)}\n\n` +
                            `_(Imagen del ticket descargada en tu dispositivo)_`
                        );
                        window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
                    }
                }, 'image/png');
            } catch (e) {
                document.body.removeChild(ticketDiv);
                throw e;
            }
        } else {
            // Sin html2canvas: solo mensaje de texto por WhatsApp
            document.body.removeChild(ticketDiv);
            const mensaje = encodeURIComponent(
                `🧾 *CORTE DE CAJA — ${fechaStr}*\n` +
                `💰 Total: ${fmt.format(total)}\n` +
                `💵 Efectivo: ${fmt.format(efectivo)}\n` +
                `💳 Tarjeta: ${fmt.format(tarjeta)}\n` +
                `🧾 Ventas: ${numVentas}`
            );
            window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
        }
    }
};
});