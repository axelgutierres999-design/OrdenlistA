// js/app.js - NÚCLEO CENTRALIZADO (V9.0 - Notificaciones + Badges integrados)
const App = (function() {
   let ordenes = [];
    let suministros = [];
    let config = { num_mesas: 10 };
    let hayReservasPendientes = false;
    // ── SESIÓN ─────────────────────────────────────────────────────
    const getRestoId = () => {
        const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
        return sesion ? sesion.restaurante_id : null;
    };

    const getRol = () => {
        const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
        return sesion ? sesion.rol : null;
    };

    const renderCallbacks = {};
      let sonidoNotificacion = null;

      // Desbloqueo seguro de audio al primer clic del usuario
       const desbloquearAudio = () => {
         if (!sonidoNotificacion) {
              sonidoNotificacion = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_8b3c3b9ad9.mp3?filename=notification-106557.mp3");
          } 
           sonidoNotificacion.play().catch(() => {});
           document.removeEventListener('click', desbloquearAudio);
    };
    document.addEventListener('click', desbloquearAudio);

    // ── CSS GLOBAL (toasts + badges) inyectado una sola vez ────────
    const _inyectarCSS = () => {
        if (document.getElementById('_appEstilos')) return;
        const st = document.createElement('style');
        st.id = '_appEstilos';
        st.textContent = `
            @keyframes aparecerNoti {
                from { opacity:0; transform:translateX(30px); }
                to   { opacity:1; transform:translateX(0);    }
            }
            @keyframes _pulsarBadge {
                0%,100% { transform:scale(1);   opacity:1;   }
                50%      { transform:scale(1.5); opacity:0.6; }
            }
            dialog#modalTicketApp::backdrop {
                background:rgba(0,0,0,0.6);
                backdrop-filter:blur(4px);
            }

            /* ── Contenedor de toasts ── */
            #notifContenedor {
                position:fixed; top:70px; right:16px;
                display:flex; flex-direction:column; gap:10px;
                z-index:99999; max-width:300px;
            }

            /* ── Toast base ── */
            .toast-notif {
                background:#fff;
                border-radius:12px;
                padding:14px 40px 14px 16px;
                box-shadow:0 6px 24px rgba(0,0,0,0.18);
                font-family:system-ui,sans-serif;
                font-size:0.88rem;
                position:relative;
                animation:aparecerNoti 0.3s ease;
                cursor:pointer;
                border-left:5px solid #10ad93;
                color:#333;
            }
            .toast-notif.tipo-orden   { border-left-color:#e53935; }
            .toast-notif.tipo-reserva { border-left-color:#f39c12; }
            .toast-notif.tipo-listo   { border-left-color:#10ad93; }
            .toast-notif.tipo-recoger { border-left-color:#3498db; }

            .toast-notif .t-cerrar {
                position:absolute; top:8px; right:10px;
                background:none; border:none;
                color:#bbb; font-size:1rem;
                cursor:pointer; line-height:1;
            }
            .toast-notif a {
                display:block; margin-top:5px;
                font-size:0.76rem; font-weight:700;
                text-decoration:none; opacity:0.75;
                color:inherit;
            }

            /* ── Punto rojo en menú ── */
            .nav-badge-punto {
                display:inline-block;
                width:8px; height:8px;
                background:#e53935;
                border-radius:50%;
                margin-left:5px;
                vertical-align:middle;
                flex-shrink:0;
                animation:_pulsarBadge 1.5s infinite;
            }
        `;
        document.head.appendChild(st);
    };

    // ── TOAST ──────────────────────────────────────────────────────
    // tipo: 'orden' | 'reserva' | 'listo' | 'recoger'
    const mostrarToast = (tipo, titulo, subtitulo = '', urlDestino = '') => {
        const roles = ["mesero","encargado","dueño","administrador","cocinero"];
        if (!roles.includes(getRol())) return;

        // Sonido
       // Sonido
        try {
            if (sonidoNotificacion) {
                sonidoNotificacion.currentTime = 0;
                sonidoNotificacion.play().catch(() => {});
            }
        } catch(e) {}

        // Contenedor
        let cont = document.getElementById('notifContenedor');
        if (!cont) {
            cont = document.createElement('div');
            cont.id = 'notifContenedor';
            document.body.appendChild(cont);
        }

        const iconos = { orden:'🔔', reserva:'📅', listo:'🛎️', recoger:'🚶' };

        const div = document.createElement('div');
        div.className = `toast-notif tipo-${tipo}`;
        div.innerHTML = `
            <button class="t-cerrar" onclick="event.stopPropagation();this.parentElement.remove()">✕</button>
            <strong>${iconos[tipo] || '🔔'} ${titulo}</strong>
            ${subtitulo ? `<small style="display:block;color:#666;margin-top:3px;">${subtitulo}</small>` : ''}
            ${urlDestino ? `<a href="${urlDestino}">Ver →</a>` : ''}
        `;

        div.addEventListener('click', (e) => {
            if (e.target.classList.contains('t-cerrar')) return;
            if (urlDestino) window.location.href = urlDestino;
        });

        cont.appendChild(div);
        setTimeout(() => { if (div.parentElement) div.remove(); }, 8000);
    };

    // ── BADGES ─────────────────────────────────────────────────────
    const actualizarBadges = () => {
        // Reglas: qué página tiene badge según estado actual de órdenes en memoria
        const reglas = {
            'cocina.html':
                ordenes.some(o => o.estado === 'pendiente'),
            'ordenes.html':
                ordenes.some(o => ['pendiente','por_confirmar','terminado'].includes(o.estado)),
            'mesas.html':
                ordenes.some(o => o.estado === 'terminado'),
            'pedidos_recoger.html':
                ordenes.some(o =>
                    ['pendiente','por_pagar','preparando'].includes(o.estado) &&
                    (o.mesa?.toUpperCase().includes('LLEVAR') ||
                     o.mesa?.toUpperCase().includes('RECOGER'))
                ),
            'reservaciones.html': hayReservasPendientes // NUEVO: Lee el estado real
        };

        Object.entries(reglas).forEach(([href, tieneBadge]) => {
            const link = document.querySelector(`#menuNavegacion a[href="${href}"]`);
            if (!link) return;

            link.querySelector('.nav-badge-punto')?.remove();

            if (tieneBadge) {
                const punto = document.createElement('span');
                punto.className = 'nav-badge-punto';
                link.appendChild(punto);
            }
        });
    };

    // ── CARGA INICIAL ──────────────────────────────────────────────
    const cargarDatosIniciales = async () => {
        if (typeof db === 'undefined') return;
        const restoId = getRestoId();
        if (!restoId) return;

        try {
            const { data: dataResto } = await db.from('restaurantes')
                .select('num_mesas, corte_actual, estado_pago, fecha_vencimiento')
                .eq('id', restoId)
                .single();

            const { data: masterConfig } = await db.from('master_config')
                .select('*').eq('id', 'global_config').single();

            if (dataResto) {
                config = { ...config, ...dataResto };
                if (masterConfig?.fondo_url) {
                    document.body.style.background =
                        `url('${masterConfig.fondo_url}') no-repeat center center fixed`;
                    document.body.style.backgroundSize = "cover";
                }
                verificarBloqueo(dataResto, masterConfig);
            }

            const { data: dataOrdenes } = await db.from('ordenes')
                .select('*')
                .eq('restaurante_id', restoId)
                .not('estado', 'in', '("entregado","cancelado")')
                .order('created_at', { ascending: true });
            if (dataOrdenes) ordenes = dataOrdenes;

            const { data: dataSuministros } = await db.from('suministros')
                .select('*').eq('restaurante_id', restoId);
            if (dataSuministros) suministros = dataSuministros;

            App.notifyUpdate(); // dispara renderCallbacks + actualizarBadges
        } catch (err) {
            console.error("Error global de carga:", err);
        }
    };

    // ── REALTIME ───────────────────────────────────────────────────
    const activarSuscripcionRealtime = () => {
        const restoId = getRestoId();
        if (!restoId || typeof db === 'undefined') return;

        // ── Canal principal: órdenes ──────────────────────────────
        db.channel(`resto-${restoId}`)
            // Nueva orden
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'ordenes',
                filter: `restaurante_id=eq.${restoId}`
            }, payload => {
                const o = payload.new;
                const esRecoger = o.mesa?.toUpperCase().includes('LLEVAR') ||
                                  o.mesa?.toUpperCase().includes('RECOGER');
                if (esRecoger) {
                    mostrarToast('recoger',
                        'Nuevo pedido por recoger',
                        `Cliente: ${o.cliente_nombre || o.mesa || '—'}`,
                        'pedidos_recoger.html'
                    );
                } else {
                    mostrarToast('orden',
                        'Nueva orden recibida',
                        o.mesa ? `Mesa ${o.mesa}` : 'Para llevar',
                        'ordenes.html'
                    );
                }
                cargarDatosIniciales();
            })
            // Orden actualizada
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'ordenes',
                filter: `restaurante_id=eq.${restoId}`
            }, payload => {
                if (payload.new.estado === 'terminado') {
                    mostrarToast('listo',
                        'Orden lista para entregar',
                        payload.new.mesa ? `Mesa ${payload.new.mesa}` : 'Para llevar',
                        'mesas.html'
                    );
                }
                cargarDatosIniciales();
            })
            // Orden eliminada
            .on('postgres_changes', {
                event: 'DELETE', schema: 'public', table: 'ordenes',
                filter: `restaurante_id=eq.${restoId}`
            }, () => cargarDatosIniciales())
            // Suministros
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'suministros',
                filter: `restaurante_id=eq.${restoId}`
            }, () => cargarDatosIniciales())
            // Restaurante
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'restaurantes',
                filter: `id=eq.${restoId}`
            }, () => cargarDatosIniciales())
            .subscribe(status => {
                console.log(`[Realtime App] ${status}`);
                document.querySelectorAll('#indicadorRealtime, #indicadorRealtimeMobile')
                    .forEach(ind => {
                        if (!ind) return;
                        if (status === 'SUBSCRIBED') {
                            ind.textContent = '● Tiempo Real Activo';
                            ind.style.background = '#e6fffa';
                            ind.style.color = '#319795';
                            ind.style.borderColor = '#81e6d9';
                        } else {
                            ind.textContent = '○ Desconectado';
                            ind.style.background = '#fff5f5';
                            ind.style.color = '#c53030';
                            ind.style.borderColor = '#fc8181';
                        }
                    });
            });

        // ── Canal secundario: reservaciones ──────────────────────
        // Nombre distinto al de reservaciones.js ('reservaciones_activas')
        db.channel(`reservas-app-${restoId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'reservaciones',
                filter: `restaurante_id=eq.${restoId}`
            }, payload => {
                hayReservasPendientes = true; // Activa la persistencia
                const r = payload.new;
                mostrarToast('reserva',
                    'Nueva reservación',
                    `${r.nombre_cliente} — ${r.fecha_reserva}`,
                    'reservaciones.html'
                );
                // Badge manual para reservaciones
                const link = document.querySelector(
                    '#menuNavegacion a[href="reservaciones.html"]'
                );
                if (link && !link.querySelector('.nav-badge-punto')) {
                    const punto = document.createElement('span');
                    punto.className = 'nav-badge-punto';
                    link.appendChild(punto);
                }
            })
            .subscribe();
    };

    // ── MODAL DE PAGO ──────────────────────────────────────────────
    const mostrarModalPago = (orden, callbackPago) => {
        const total = parseFloat(orden.total);
        const modal = document.createElement('div');
        modal.id = "modalGlobalPago";
        modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:10000;padding:15px;backdrop-filter:blur(5px);";
        modal.innerHTML = `
          <article style="background:white;padding:1.5rem;border-radius:15px;width:100%;max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.4);color:#333;">
            <header style="text-align:center;border-bottom:1px solid #eee;margin-bottom:1rem;padding-bottom:0.5rem;">
                <h3 style="margin:0;color:#333;">Cobrar ${orden.mesa}</h3>
            </header>
            <div style="text-align:center;margin-bottom:1.5rem;">
                <small style="color:#888;">TOTAL A PAGAR</small>
                <div style="font-size:3rem;font-weight:800;color:#10ad93;">$${total.toFixed(2)}</div>
            </div>
            <div id="seccionMetodos">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                  <button id="btnEfectivoUI" style="background:#2ecc71;color:white;border:none;padding:15px;border-radius:10px;cursor:pointer;font-weight:bold;font-size:1.1rem;">💵 Efectivo</button>
                  <button id="btnTarjetaUI" style="background:#3498db;color:white;border:none;padding:15px;border-radius:10px;cursor:pointer;font-weight:bold;font-size:1.1rem;">💳 Tarjeta</button>
                </div>
                <button id="btnQRUI" style="width:100%;background:#f39c12;color:white;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:bold;margin-bottom:15px;">📱 QR / Transferencia</button>
            </div>
            <div id="panelEfectivo" style="display:none;background:#f9f9f9;padding:15px;border-radius:10px;margin-bottom:15px;">
                <label style="font-weight:bold;">Monto Recibido:</label>
                <input type="number" id="inputRecibido" placeholder="0.00" step="0.01" style="font-size:1.5rem;text-align:center;width:100%;margin:10px 0;border:2px solid #ddd;border-radius:8px;padding:5px;">
                <div id="txtCambio" style="text-align:center;font-weight:bold;margin-top:10px;color:#e74c3c;font-size:1.2rem;">Cambio: $0.00</div>
                <button id="btnConfirmarEfectivo" disabled style="width:100%;margin-top:15px;background:#27ae60;color:white;border:none;padding:12px;border-radius:8px;font-weight:bold;">CONFIRMAR PAGO</button>
            </div>
            <footer style="text-align:center;">
                <button id="btnCancelar" style="background:none;border:none;color:#888;cursor:pointer;font-size:0.9rem;text-decoration:underline;">Cancelar Operación</button>
            </footer>
          </article>`;
        document.body.appendChild(modal);

        document.getElementById('btnEfectivoUI').onclick = () => {
            document.getElementById('seccionMetodos').style.display = 'none';
            document.getElementById('panelEfectivo').style.display = 'block';
            document.getElementById('inputRecibido').focus();
        };

        const input = document.getElementById('inputRecibido');
        input.addEventListener('input', () => {
            const recibido = parseFloat(input.value) || 0;
            const cambio   = recibido - total;
            const txtCambio = document.getElementById('txtCambio');
            const btnConf   = document.getElementById('btnConfirmarEfectivo');
            if (recibido >= total) {
                btnConf.disabled = false;
                txtCambio.textContent = `Cambio: $${cambio.toFixed(2)}`;
                txtCambio.style.color = "#27ae60";
            } else {
                btnConf.disabled = true;
                txtCambio.textContent = "Monto insuficiente";
                txtCambio.style.color = "#c0392b";
            }
        });

        document.getElementById('btnConfirmarEfectivo').onclick = () => {
            generarTicket(orden, 'Efectivo'); callbackPago('efectivo'); modal.remove();
        };
        document.getElementById('btnTarjetaUI').onclick = () => {
            if (confirm("¿Terminal aprobada?")) { generarTicket(orden, 'Tarjeta'); callbackPago('tarjeta'); modal.remove(); }
        };
        document.getElementById('btnQRUI').onclick = () => {
            if (confirm("¿Transferencia recibida?")) { generarTicket(orden, 'QR / Transferencia'); callbackPago('qr'); modal.remove(); }
        };
        document.getElementById('btnCancelar').onclick = () => modal.remove();
    };

    // ── TICKET ─────────────────────────────────────────────────────
    const generarTicket = (orden, metodo) => {
        let modal = document.getElementById("modalTicketApp");
        if (!modal) {
            modal = document.createElement("dialog");
            modal.id = "modalTicketApp";
            modal.innerHTML = `
              <article style="text-align:center;max-width:400px;">
                <h3>🧾 Ticket de Venta</h3>
                <div id="ticketContenido" style="text-align:left;font-family:monospace;margin:1rem 0;background:#f9f9f9;padding:10px;border-radius:8px;"></div>
                <footer style="display:flex;gap:10px;justify-content:center;">
                  <button id="btnImprimirTicket">🖨️ Imprimir</button>
                  <button onclick="document.getElementById('modalTicketApp').close()">Cerrar</button>
                </footer>
              </article>`;
            document.body.appendChild(modal);
            document.getElementById("btnImprimirTicket").onclick = () => {
                const contenido = document.getElementById("ticketContenido").innerHTML;
                const ventana = window.open('', '_blank');
                ventana.document.write(`<html><body>${contenido}</body></html>`);
                ventana.print(); ventana.close();
            };
        }
        document.getElementById("ticketContenido").innerHTML = `
            <p><strong>Mesa:</strong> ${orden.mesa || "Para llevar"}</p>
            <p><strong>Total:</strong> $${orden.total}</p>
            <p><strong>Método:</strong> ${metodo}</p>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
            <hr><p>¡Gracias por su compra!</p>`;
        modal.showModal();
    };

    // ── BLOQUEO SUSCRIPCIÓN ────────────────────────────────────────
    const verificarBloqueo = (datosResto, masterConfig) => {
        if (!datosResto) return;
        const hoy        = new Date();
        const vencimiento = datosResto.fecha_vencimiento
            ? new Date(datosResto.fecha_vencimiento) : new Date(0);
        const estado = (datosResto.estado_pago || '').toLowerCase();
        console.log(`[Seguridad] Estado: ${estado}, Vence: ${vencimiento.toLocaleDateString()}`);
        if (estado === 'pendiente' || estado === 'vencido' || hoy > vencimiento) {
            console.warn("⚠️ BLOQUEO ACTIVADO");
            renderizarPantallaBloqueo(masterConfig);
        } else {
            console.log("✅ Acceso concedido.");
        }
    };

    const renderizarPantallaBloqueo = (mConfig) => {
        if (document.getElementById('modalBloqueoSaaS')) return;
        const overlay = document.createElement('div');
        overlay.id = 'modalBloqueoSaaS';
        overlay.style = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);backdrop-filter:blur(8px);z-index:100000;display:flex;justify-content:center;align-items:center;color:white;padding:20px;`;
        overlay.innerHTML = `
            <div style="background:#111;padding:40px;border-radius:20px;border:1px solid #333;max-width:500px;text-align:center;box-shadow:0 0 50px rgba(0,0,0,0.8);">
                <div style="font-size:50px;margin-bottom:20px;">🔒</div>
                <h2 style="color:white;font-weight:600;">Acceso Restringido</h2>
                <p style="color:#888;">Tu suscripción mensual ha expirado o se encuentra pendiente de pago.</p>
                <div style="background:rgba(255,255,255,0.05);padding:20px;border-radius:12px;margin:25px 0;border:1px solid #444;text-align:left;">
                    <span style="color:#10ad93;font-size:0.7rem;font-weight:bold;text-transform:uppercase;">Instrucciones de Pago:</span>
                    <pre style="background:transparent;border:none;color:#eee;font-family:inherit;margin-top:10px;white-space:pre-wrap;font-size:0.9rem;">${mConfig?.datos_pago || 'Cargando datos...'}</pre>
                </div>
                <p style="font-size:0.8rem;color:#666;margin-bottom:25px;">${mConfig?.mensaje_exito || 'Una vez realizado el pago, el sistema se reactivará automáticamente.'}</p>
                <a href="https://wa.me/TUNUMERO" target="_blank" style="background:#25d366;color:white;padding:12px 25px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">
                    Enviar Comprobante por WhatsApp
                </a>
            </div>`;
        document.body.appendChild(overlay);
        document.body.style.overflow = "hidden";
    };

    // ── API PÚBLICA ────────────────────────────────────────────────
    return {
        init: async () => {
            _inyectarCSS();                 // CSS de toasts y badges
            await cargarDatosIniciales();   // Datos iniciales
            activarSuscripcionRealtime();   // Canales Realtime
        },
        getRestoId, getRol,
        getOrdenes:     () => ordenes,
        getSuministros: () => suministros,
        getConfig:      () => config,

        guardarConfiguracionMesas: async (nuevoNumero) => {
            const restoId = getRestoId();
            if (!restoId) return alert("Restaurante no identificado.");
            if (isNaN(nuevoNumero) || nuevoNumero < 1 || nuevoNumero > 100)
                return alert("⚠️ Ingresa un número entre 1 y 100 mesas.");
            try {
                const { error } = await db.from('restaurantes')
                    .update({ num_mesas: nuevoNumero }).eq('id', restoId);
                if (error) throw error;
                config.num_mesas = nuevoNumero;
                alert("✅ Número de mesas actualizado correctamente.");
                App.notifyUpdate();
            } catch (err) { alert("❌ Error al actualizar número de mesas."); }
        },

        updateEstado: async (id, nuevoEstado) => {
            const { error } = await db.from('ordenes')
                .update({ estado: nuevoEstado }).eq('id', id);
            if (error) console.error("Error al actualizar estado:", error);
        },

        eliminarOrden: async (id) => {
            if (!confirm("¿Cancelar esta orden permanentemente?")) return;
            const { error } = await db.from('ordenes')
                .update({ estado: 'cancelado' }).eq('id', id);
            if (error) console.error("Error al eliminar:", error);
            else cargarDatosIniciales();
        },

        mostrarModalPago,

        registerRender: (name, cb) => { renderCallbacks[name] = cb; cb(); },

        // notifyUpdate dispara renders + recalcula badges
        notifyUpdate: () => {
            Object.values(renderCallbacks).forEach(cb => {
                if (typeof cb === 'function') cb();
            });
            actualizarBadges();
        }
    };
})();

// ── MENÚ DE NAVEGACIÓN Y SEGURIDAD ────────────────────────────────
function renderizarMenuSeguro() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;
    const navContenedor = document.getElementById('menuNavegacion');
    if (!navContenedor) return;

    const rutaActual = window.location.pathname.split("/").pop() || "index.html";
    const rol = sesion.rol;
    let menuItems = [];

    if (rol === "mesero") {
        menuItems = [
            { h: "mesas.html",  i: "🪑", t: "Mesas" },
            { h: "menu.html",   i: "📜", t: "Menú"  }
        ];
    } else if (rol === "cocinero") {
        menuItems = [
            { h: "ordenes.html", i: "📋", t: "Órdenes" },
            { h: "cocina.html",  i: "👨‍🍳", t: "Cocina"  }
        ];
    } else {
        menuItems = [
            { h: "mesas.html",           i: "🪑", t: "Mesas"               },
            { h: "menu.html",            i: "📜", t: "Menú"                },
            { h: "ordenes.html",         i: "📋", t: "Órdenes"             },
            { h: "cocina.html",          i: "👨‍🍳", t: "Cocina"              },
            { h: "stock.html",           i: "📦", t: "Stock"               },
            { h: "reservaciones.html",   i: "📅", t: "Reservaciones"       },
            { h: "pedidos_recoger.html", i: "🚶", t: "Pedidos por recoger" }
        ];
        if (["dueño", "administrador"].includes(rol)) {
            menuItems.push({ h: "ventas.html",    i: "📊", t: "Ventas"   });
            menuItems.push({ h: "empleados.html", i: "👥", t: "Personal" });
        }
    }

    const paginasPublicas = ["index.html", "login.html", ""];
    const accesoPermitido = menuItems.some(item => item.h === rutaActual) ||
                            paginasPublicas.includes(rutaActual);
    if (!accesoPermitido && rutaActual !== 'index.html') {
        window.location.href = menuItems[0].h;
        return;
    }

    // Los badges se agregan después por actualizarBadges() vía notifyUpdate()
    navContenedor.innerHTML = menuItems.map(item => `
        <li>
            <a href="${item.h}" class="${rutaActual === item.h ? 'activo' : ''}"
               style="display:flex;align-items:center;gap:8px;padding:8px 12px;
                      border-radius:8px;text-decoration:none;
                      ${rutaActual === item.h
                          ? 'background:#10ad93;color:white;'
                          : 'color:#555;'}">
                <span>${item.i}</span>
                <span class="nav-text" style="font-weight:600;">${item.t}</span>
            </a>
        </li>`).join('') + `
        <li>
            <button onclick="cerrarSesionApp()" class="outline contrast"
                    style="padding:5px 15px;border-radius:8px;width:100%;">Salir</button>
        </li>`;
}

async function cerrarSesionApp() {
    if (confirm("¿Cerrar sesión?")) {
        if (window.cerrarSesion) await window.cerrarSesion();
        else {
            localStorage.removeItem('sesion_activa');
            window.location.href = 'login.html';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarMenuSeguro();
    App.init();
});