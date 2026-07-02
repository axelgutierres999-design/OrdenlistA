// js/estadisticas.js - VERSION CORREGIDA V10.0
// FIXES:
//   1. enviarCorteWhatsApp movida al scope correcto (fuera de imprimirTicketIndividual)
//   2. Card de Transferencias separada en KPIs
//   3. Columna "Recoger/Llevar" con badge visual en tabla de ventas
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') {
        console.warn("Sesión no válida o base de datos no conectada.");
        return;
    }

    // --- ELEMENTOS UI ---
    const spanTotalDia       = document.getElementById('totalDia');
    const spanEfectivo       = document.getElementById('totalEfectivo');
    const spanTarjeta        = document.getElementById('totalTarjeta');
    const spanTransferencia  = document.getElementById('totalTransferencia'); // 🆕
    const spanNumVentas      = document.getElementById('numVentasDia');
    const spanTicketPromedio = document.getElementById('ticketPromedio');
    const listaVentas        = document.getElementById('listaUltimasVentas');

    let chartInstancia   = null;
    let ventasHoy        = [];
    let ultimaHoraCorte  = null;

    // ══════════════════════════════════════════════════════
    // 1. OBTENER ÚLTIMO CORTE
    // ══════════════════════════════════════════════════════
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

    // ══════════════════════════════════════════════════════
    // 2. CARGAR VENTAS
    // ══════════════════════════════════════════════════════
    async function cargarEstadisticas() {
        await obtenerUltimoCorte();
        const desde = ultimaHoraCorte || new Date();

        const { data, error } = await db
            .from('ventas')
            .select('*')
            .eq('restaurante_id', sesion.restaurante_id)
            .gte('created_at', desde.toISOString())
            .order('created_at', { ascending: false });

        if (error) { console.error("Error cargando ventas:", error.message); return; }

        ventasHoy = data || [];
        actualizarKPIs();
        renderizarTabla();
        dibujarGrafico();
    }

    // ══════════════════════════════════════════════════════
    // 3. KPIs — ahora con Transferencia separada
    // ══════════════════════════════════════════════════════
    function actualizarKPIs() {
        let total = 0, efectivo = 0, tarjeta = 0, transferencia = 0;

        ventasHoy.forEach(v => {
            const monto  = parseFloat(v.total) || 0;
            const metodo = (v.metodo_pago || '').toLowerCase();
            total += monto;

            if (metodo.includes('transferencia')) {
                transferencia += monto;
            } else if (metodo.includes('tarjeta') || metodo.includes('qr')) {
                tarjeta += monto;
            } else {
                efectivo += monto;
            }
        });

        const n       = ventasHoy.length;
        const promedio = n ? total / n : 0;
        const fmt      = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

        if (spanTotalDia)       spanTotalDia.textContent       = fmt.format(total);
        if (spanEfectivo)       spanEfectivo.textContent       = fmt.format(efectivo);
        if (spanTarjeta)        spanTarjeta.textContent        = fmt.format(tarjeta);
        if (spanTransferencia)  spanTransferencia.textContent  = fmt.format(transferencia); // 🆕
        if (spanNumVentas)      spanNumVentas.textContent      = n;
        if (spanTicketPromedio) spanTicketPromedio.textContent = fmt.format(promedio);
    }

    // ══════════════════════════════════════════════════════
    // 4. TABLA DE VENTAS — badge de origen (llevar/recoger)
    // ══════════════════════════════════════════════════════
    function renderizarTabla(listaDatos = ventasHoy) {
        if (!listaVentas) return;

        if (listaDatos.length === 0) {
            listaVentas.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;">No se encontraron ventas.</td></tr>`;
            return;
        }

        listaVentas.innerHTML = listaDatos.map(v => {
            const mesa       = v.mesa || 'LLEVAR';
            const esRecoger  = mesa.toUpperCase().includes('LLEVAR') || mesa.toUpperCase().includes('RECOGER');
            const badgeMesa  = esRecoger
                ? `<span style="background:#3498db;color:white;border-radius:10px;padding:2px 7px;font-size:0.7rem;font-weight:700;display:inline-block;margin-top:3px;">🚶 RECOGER</span>`
                : '';
            const metodo     = (v.metodo_pago || 'EFECTIVO').toLowerCase();
            const badgeMetodo = metodo.includes('transferencia')
                ? `<span style="background:#9b59b6;color:white;border-radius:10px;padding:2px 7px;font-size:0.7rem;font-weight:700;">TRANSF.</span>`
                : metodo.includes('tarjeta') || metodo.includes('qr')
                    ? `<span style="background:#3498db;color:white;border-radius:10px;padding:2px 7px;font-size:0.7rem;font-weight:700;">${metodo.toUpperCase()}</span>`
                    : `<span style="background:#27ae60;color:white;border-radius:10px;padding:2px 7px;font-size:0.7rem;font-weight:700;">EFECTIVO</span>`;

            return `
            <tr>
                <td>#${v.id.toString().slice(-5).toUpperCase()}</td>
                <td>${mesa}<br>${badgeMesa}</td>
                <td><strong>$${parseFloat(v.total).toFixed(2)}</strong></td>
                <td>${badgeMetodo}</td>
                <td>${new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>
                    <button class="outline secondary"
                            style="padding:5px 10px;font-size:0.8rem;border-radius:8px;"
                            onclick="imprimirTicketIndividual('${v.id}')">
                        📄 Ver
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // Buscador
    window.filtrarVentas = () => {
        const texto = document.getElementById('buscadorVentas').value.toLowerCase();
        const filtradas = ventasHoy.filter(v => {
            const folio = v.id.toString().slice(-5).toLowerCase();
            const mesa  = (v.mesa || '').toLowerCase();
            return folio.includes(texto) || mesa.includes(texto);
        });
        renderizarTabla(filtradas);
    };

    // ══════════════════════════════════════════════════════
    // 5. GRÁFICO
    // ══════════════════════════════════════════════════════
    function dibujarGrafico() {
        const canvas = document.getElementById('graficoCategorias');
        if (!canvas) return;
        if (chartInstancia) chartInstancia.destroy();

        const resumen = {};
        ventasHoy.forEach(v => {
            if (!v.productos) return;
            v.productos.split(',').forEach(p => {
                const match    = p.trim().match(/^(\d+)x\s+(.+)$/);
                const cantidad = match ? parseInt(match[1]) : 1;
                const nombre   = match ? match[2] : p.trim();
                resumen[nombre] = (resumen[nombre] || 0) + cantidad;
            });
        });

        const labels = Object.keys(resumen).slice(0, 5);
        const data   = labels.map(l => resumen[l]);

        chartInstancia = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: ['#10ad93', '#3498db', '#9b59b6', '#f1c40f', '#e67e22'] }]
            },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    }

    // ══════════════════════════════════════════════════════
    // 6. IMPRIMIR CORTE (pop-up)
    // ══════════════════════════════════════════════════════
    window.imprimirCorteCaja = () => {
        if (ventasHoy.length === 0) return;
        const fecha    = new Date().toLocaleDateString();
        const hora     = new Date().toLocaleTimeString();
        const total    = spanTotalDia    ? spanTotalDia.textContent    : '$0.00';
        const efectivo = spanEfectivo   ? spanEfectivo.textContent   : '$0.00';
        const tarjeta  = spanTarjeta    ? spanTarjeta.textContent    : '$0.00';
        const transf   = spanTransferencia ? spanTransferencia.textContent : '$0.00';

        const ventana = window.open('', '_blank', 'width=300,height=650');
        if (!ventana) {
            alert('⚠️ El corte se realizó, pero el navegador bloqueó la ventana de impresión.\nHabilita "Ventanas emergentes" e intenta de nuevo.');
            return;
        }
        try {
            ventana.document.write(`
                <html><head><title>Corte de Caja</title>
                <style>
                    body { font-family:'Courier New',monospace; text-align:center; margin:0; padding:10px; }
                    hr   { border:1px dashed #000; }
                    .f   { display:flex; justify-content:space-between; }
                </style></head>
                <body>
                    <h2>CORTE DE CAJA</h2>
                    <p>${fecha} - ${hora}</p>
                    <hr>
                    <div class="f"><b>TOTAL:</b><span>${total}</span></div>
                    <div class="f">Efectivo:<span>${efectivo}</span></div>
                    <div class="f">Tarjeta/QR:<span>${tarjeta}</span></div>
                    <div class="f">Transferencia:<span>${transf}</span></div>
                    <div class="f">Ventas:<span>${ventasHoy.length}</span></div>
                    <hr>
                    <p>Firma Cajero:</p><br><br>
                    <p>__________________</p>
                    <script>window.print(); setTimeout(()=>window.close(),1000);<\/script>
                </body></html>`);
            ventana.document.close();
        } catch (e) { console.error('Error al generar ticket:', e); }
    };

    // ══════════════════════════════════════════════════════
    // 7. ENVIAR CORTE POR WHATSAPP
    //    ⚠️  FIX PRINCIPAL: función en el scope correcto,
    //    no dentro de imprimirTicketIndividual
    // ══════════════════════════════════════════════════════
    async function enviarCorteWhatsApp({ total, efectivo, tarjeta, transferencia, numVentas, fechaCorte }) {
        try {
            const { data: resto } = await db
                .from('restaurantes')
                .select('telefono, nombre, whatsapp_dueno')
                .eq('id', sesion.restaurante_id)
                .single();

            const telefono = (resto?.whatsapp_dueno || resto?.telefono || '').replace(/\D/g, '');
            if (!telefono) {
                alert('⚠️ Corte realizado, pero sin número de WhatsApp configurado.\nVe a Ajustes → "WhatsApp del Dueño" para configurarlo.');
                return;
            }

            const fmt     = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
            const fechaStr = new Date(fechaCorte).toLocaleString('es-MX', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            // --- Crear ticket visual para html2canvas ---
            const ticketDiv = document.createElement('div');
            ticketDiv.style.cssText = `
                position:fixed; top:-9999px; left:-9999px;
                width:300px; background:white; padding:20px;
                font-family:'Courier New',monospace; color:black; font-size:13px;
            `;
            ticketDiv.innerHTML = `
                <div style="text-align:center;margin-bottom:10px;">
                    <h2 style="margin:0;font-size:16px;text-transform:uppercase;">${resto?.nombre || 'Mi Restaurante'}</h2>
                    <p style="margin:4px 0;font-size:11px;">CORTE DE CAJA</p>
                    <p style="margin:4px 0;font-size:11px;">${fechaStr}</p>
                </div>
                <hr style="border:1px dashed #000;margin:10px 0;">
                <div style="display:flex;justify-content:space-between;margin:4px 0;">
                    <span>TOTAL:</span><strong>${fmt.format(total)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin:4px 0;">
                    <span>Efectivo:</span><span>${fmt.format(efectivo)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin:4px 0;">
                    <span>Tarjeta/QR:</span><span>${fmt.format(tarjeta)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin:4px 0;">
                    <span>Transferencia:</span><span>${fmt.format(transferencia)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin:4px 0;">
                    <span>Núm. ventas:</span><span>${numVentas}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin:4px 0;">
                    <span>Ticket prom.:</span><span>${fmt.format(numVentas ? total / numVentas : 0)}</span>
                </div>
                <hr style="border:1px dashed #000;margin:10px 0;">
                <p style="text-align:center;font-size:10px;margin:0;">OrdenLista · orden-list.vercel.app</p>
            `;
            document.body.appendChild(ticketDiv);

            const mensaje = encodeURIComponent(
                `🧾 *CORTE DE CAJA — ${fechaStr}*\n` +
                `📍 ${resto?.nombre || 'Mi Restaurante'}\n\n` +
                `💰 Total: ${fmt.format(total)}\n` +
                `💵 Efectivo: ${fmt.format(efectivo)}\n` +
                `💳 Tarjeta/QR: ${fmt.format(tarjeta)}\n` +
                `🏦 Transferencia: ${fmt.format(transferencia)}\n` +
                `🧾 Ventas: ${numVentas}\n` +
                `📊 Ticket prom.: ${fmt.format(numVentas ? total / numVentas : 0)}`
            );

            // En móvil: intentar compartir imagen
            if (typeof html2canvas !== 'undefined') {
                try {
                    const canvas = await html2canvas(ticketDiv, { scale: 3, backgroundColor: '#ffffff' });
                    document.body.removeChild(ticketDiv);

                    canvas.toBlob(async (blob) => {
                        const file = new File(
                            [blob],
                            `Corte_${fechaStr.replace(/[/:, ]/g, '_')}.png`,
                            { type: 'image/png' }
                        );

                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            // Móvil: compartir imagen directamente
                            await navigator.share({
                                files: [file],
                                title: `Corte de caja — ${fechaStr}`,
                                text: `Corte de ${resto?.nombre || 'Mi Restaurante'}: ${fmt.format(total)}`
                            });
                        } else {
                            // PC: descargar imagen + abrir WhatsApp Web
                            const link = document.createElement('a');
                            link.download = `Corte_${fechaStr.replace(/[/:, ]/g, '_')}.png`;
                            link.href = canvas.toDataURL('image/png');
                            link.click();
                            window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
                        }
                    }, 'image/png');
                } catch (e) {
                    document.body.removeChild(ticketDiv);
                    // Fallback solo texto
                    window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
                }
            } else {
                // Sin html2canvas: solo texto
                document.body.removeChild(ticketDiv);
                window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
            }
        } catch (err) {
            console.warn('Error al enviar WhatsApp:', err);
        }
    }

    // ══════════════════════════════════════════════════════
    // 8. REALIZAR CORTE
    // ══════════════════════════════════════════════════════
    window.realizarCorteCaja = async () => {
        if (ventasHoy.length === 0) return alert('No hay ventas nuevas para cortar.');
        if (!confirm('¿Realizar CORTE DE CAJA?\nEsto reiniciará los contadores a $0.')) return;

        try {
            const total = ventasHoy.reduce((a, v) => a + parseFloat(v.total || 0), 0);

            let efectivo = 0, tarjeta = 0, transferencia = 0;
            ventasHoy.forEach(v => {
                const monto  = parseFloat(v.total || 0);
                const metodo = (v.metodo_pago || '').toLowerCase();
                if (metodo.includes('transferencia'))          transferencia += monto;
                else if (metodo.includes('tarjeta') || metodo.includes('qr')) tarjeta += monto;
                else                                                           efectivo += monto;
            });

            const fechaCorte = new Date().toISOString();

            // Guardar historial
            const { error: errH } = await db.from('cortes_caja').insert({
                restaurante_id: sesion.restaurante_id,
                fecha_corte:    fechaCorte,
                total,
                total_efectivo: efectivo,
                total_tarjeta:  tarjeta + transferencia, // columna única en BD
                num_ventas:     ventasHoy.length,
                usuario:        sesion?.nombre || 'Admin'
            });
            if (errH) throw new Error('Error guardando historial: ' + errH.message);

            // Actualizar marca de corte
            const { error: errU } = await db.from('restaurantes')
                .update({ corte_actual: fechaCorte })
                .eq('id', sesion.restaurante_id);
            if (errU) throw new Error('Error actualizando restaurante: ' + errU.message);

            localStorage.setItem(`ultimo_corte_${sesion.restaurante_id}`, fechaCorte);

            // Imprimir ticket (tolerante a fallos)
            try { window.imprimirCorteCaja(); } catch (e) { console.warn('Impresión bloqueada:', e); }

            // 🔑 ENVIAR WHATSAPP — ahora sí llama la función en scope correcto
            try {
                await enviarCorteWhatsApp({ total, efectivo, tarjeta, transferencia, numVentas: ventasHoy.length, fechaCorte });
            } catch (e) { console.warn('WhatsApp no enviado:', e); }

            alert('✅ Corte realizado correctamente.');
            cargarEstadisticas();

        } catch (err) {
            console.error(err);
            alert('❌ Error en el corte: ' + err.message);
        }
    };

    // ══════════════════════════════════════════════════════
    // 9. TICKET INDIVIDUAL (ventana pop-up)
    // ══════════════════════════════════════════════════════
    window.imprimirTicketIndividual = (idVenta) => {
        const venta = ventasHoy.find(v => v.id == idVenta);
        if (!venta) return alert('No se encontró la venta.');

        let productosHtml = '';
        if (venta.productos) {
            venta.productos.split(',').forEach(p => {
                productosHtml += `<div style="text-align:left;">• ${p.trim()}</div>`;
            });
        }

        const ventana = window.open('', '_blank', 'width=350,height=600');
        if (!ventana) return alert('Habilita las ventanas emergentes para imprimir.');

        try {
            ventana.document.write(`
                <html><head><title>Ticket</title>
                <style>
                    body { font-family:'Courier New',monospace; margin:0; padding:10px; font-size:12px; }
                    h3,p { text-align:center; margin:5px 0; }
                    hr   { border:1px dashed #000; }
                    .f   { display:flex; justify-content:space-between; }
                    @media print { .no-print { display:none; } }
                    .btn { width:100%; padding:10px; background:black; color:white; border:none; margin-top:10px; cursor:pointer; border-radius:5px; }
                </style></head>
                <body>
                    <h3>ORDEN LISTA</h3>
                    <p>Folio: #${venta.id.toString().slice(-5).toUpperCase()}</p>
                    <p>${new Date(venta.created_at).toLocaleString()}</p>
                    <p>Mesa: ${venta.mesa || 'Llevar'}</p>
                    <hr>
                    ${productosHtml}
                    <hr>
                    <div class="f" style="font-weight:bold;">
                        <span>TOTAL:</span>
                        <span>$${parseFloat(venta.total).toFixed(2)}</span>
                    </div>
                    <div class="f">
                        <span>Pago:</span>
                        <span>${(venta.metodo_pago || 'EFECTIVO').toUpperCase()}</span>
                    </div>
                    <br>
                    <p style="font-size:10px;">¡Gracias por su preferencia!</p>
                    <button class="no-print btn" onclick="window.print()">🖨️ Imprimir</button>
                    <script>setTimeout(()=>window.print(), 500);<\/script>
                </body></html>`);
            ventana.document.close();
        } catch (e) { console.error(e); }
    };

    // ══════════════════════════════════════════════════════
    // 10. REALTIME
    // ══════════════════════════════════════════════════════
    if (db.channel) {
        db.channel(`ventas-realtime-${sesion.restaurante_id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ventas',
              filter: `restaurante_id=eq.${sesion.restaurante_id}` }, () => {
              cargarEstadisticas();
          })
          .subscribe();
    }

    cargarEstadisticas();
});