// js/ordenes.js - MONITOR DE CONTROL V7.3
// FIXES:
//   1. Botón "Dar al Cliente" renombrado a "✅ Mesa Lista — Cerrar" con modal de confirmación
//   2. Filtro: excluye órdenes LLEVAR/RECOGER (esas van a pedidosrecoger.html)
//   3. El botón 🗑️ bloquea borrado de órdenes en_mesa/pagado
document.addEventListener('DOMContentLoaded', () => {
  const tablaBody       = document.getElementById('tablaBodyOrdenes');
  const filtroEstado    = document.getElementById('filtroEstado');
  const inputBusqueda   = document.getElementById('inputBusqueda');
  const audio           = document.getElementById('audioNotificacion');

  let ordenesLocales           = [];
  let ultimaCantidadPendientes = 0;

  // ════════════════════════════════════════════════════════
  // 1️⃣  SESIÓN
  // ════════════════════════════════════════════════════════
  const sesion  = JSON.parse(localStorage.getItem('sesion_activa'));
  const restoId = sesion?.restaurante_id;

  // ════════════════════════════════════════════════════════
  // 2️⃣  EXTENSIONES DE App
  // ════════════════════════════════════════════════════════
  if (typeof App !== 'undefined') {

    App.aceptarOrdenQR = async (id) => {
      await App.updateEstado(id, 'pendiente');
      cargarOrdenesLocales();
    };

    App.cambiarEstadoOrden = async (id, estado) => {
      await App.updateEstado(id, estado);
      cargarOrdenesLocales();
    };

    // 🔑 FIX: bloquear borrado de órdenes en_mesa / pagado
    App.eliminarOrden = async (id) => {
  const orden = ordenesLocales.find(o => o.id === id);
  if (orden && ['en_mesa', 'pagado'].includes(orden.estado)) {
    alert('⚠️ Esta orden ya está en mesa o pagada. Para no perder la cuenta, ciérrala desde "Mesas → Cobrar" en lugar de eliminarla aquí.');
    return;
  }
  if (!confirm('¿Seguro que deseas eliminar esta orden?')) return;
  try {
    await db.from('ordenes').delete().eq('id', id);
    alert('🗑️ Orden eliminada');
    cargarOrdenesLocales();
  } catch (err) { alert('Error al eliminar: ' + err.message); }
};
  }

  // ════════════════════════════════════════════════════════
  // 3️⃣  CARGA — SOLO órdenes de MESA (excluye LLEVAR/RECOGER)
  // ════════════════════════════════════════════════════════
  async function cargarOrdenesLocales() {
    if (!restoId || typeof db === 'undefined') return;
    try {
      const { data, error } = await db
        .from('ordenes')
        .select('*')
        .eq('restaurante_id', restoId)
        .not('estado', 'in', '("entregado","cancelado")')
        .order('created_at', { ascending: true });

      if (error) throw error;

      // 🔑 FIX: filtrar en JS para excluir pedidos para llevar/recoger
      // (Supabase no tiene ILIKE en .not, así que filtramos en cliente)
      ordenesLocales = (data || []).filter(o => {
        const mesa = (o.mesa || '').toUpperCase();
        return !mesa.includes('LLEVAR') && !mesa.includes('RECOGER') && !mesa.includes('PARA LLEVAR');
      });

      renderizarOrdenes();
    } catch (err) {
      console.error('Error cargando órdenes:', err.message);
    }
  }

  // ════════════════════════════════════════════════════════
  // 4️⃣  RENDERIZADO
  // ════════════════════════════════════════════════════════
  function renderizarOrdenes() {
    if (!tablaBody) return;

    // Notificación sonora solo para órdenes de mesa
    const nuevas = ordenesLocales.filter(
      o => o.estado === 'pendiente' || o.estado === 'por_confirmar'
    );
    if (nuevas.length > ultimaCantidadPendientes) {
      if (typeof App !== 'undefined' && App.mostrarToast) {
        const nueva = nuevas[nuevas.length - 1];
        App.mostrarToast('orden',
          'Nueva orden recibida',
          nueva?.mesa ? `${nueva.mesa}` : 'Orden nueva',
          'ordenes.html'
        );
      } else if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    }
    ultimaCantidadPendientes = nuevas.length;

    // Filtros de UI
    const estadoSel = filtroEstado?.value || 'todos';
    const texto     = inputBusqueda?.value.toLowerCase() || '';

    const filtradas = ordenesLocales.filter(o => {
      if (['entregado', 'cancelado'].includes(o.estado)) return false;
      const pasaEstado = estadoSel === 'todos' || o.estado === estadoSel;
      const pasaTexto  = (o.mesa || '').toLowerCase().includes(texto);
      return pasaEstado && pasaTexto;
    });

    tablaBody.innerHTML = '';

    if (filtradas.length === 0) {
      tablaBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:3rem;color:#888;">
          No hay órdenes activas en mesas.
        </td></tr>`;
      return;
    }

    filtradas.forEach(orden => {
      let claseFila     = '';
      let botonesAccion = '';

      switch (orden.estado) {

        case 'por_confirmar':
          claseFila     = 'fila-urgente';
          botonesAccion = `
            <button onclick="App.aceptarOrdenQR('${orden.id}')"
                    style="background:#f39c12;border:none;color:white;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;">
              🔔 Confirmar QR
            </button>`;
          break;

        case 'pendiente':
          claseFila     = 'fila-pendiente';
          botonesAccion = `
            <button onclick="App.cambiarEstadoOrden('${orden.id}','preparando')"
                    class="contrast" style="padding:8px 12px;">
              👨‍🍳 A Cocina
            </button>`;
          break;

        case 'preparando':
        case 'proceso':
          claseFila     = 'fila-proceso';
          botonesAccion = `
            <button onclick="App.cambiarEstadoOrden('${orden.id}','terminado')"
                    class="primary" style="padding:8px 12px;">
              🛎️ Terminado
            </button>`;
          break;

        case 'terminado':
          claseFila     = 'fila-terminado';
          botonesAccion = `
            <button onclick="App.cambiarEstadoOrden('${orden.id}','en_mesa')"
                    class="secondary" style="padding:8px 12px;">
              ✅ Entregar a Mesa
            </button>`;
          break;

        case 'en_mesa':
          // Comida en mesa, esperando cobro desde mesas.html
          claseFila     = 'fila-terminado';
          botonesAccion = `
            <span style="color:#27ae60;font-weight:700;font-size:0.85rem;">
              🍽️ En mesa — pendiente cobro
            </span>`;
          break;

        case 'pagado':
          // 🔑 FIX: Cambio de "Dar al Cliente" por botón claro con confirmación
          claseFila     = 'fila-pagado';
          botonesAccion = `
            <button onclick="cerrarOrdenPagada('${orden.id}', '${orden.mesa}')"
                    style="background:#10ad93;color:white;border:none;padding:8px 12px;
                           border-radius:6px;cursor:pointer;font-weight:bold;">
              🏁 Cerrar Mesa
            </button>`;
          break;
      }

      const fechaInicio = new Date(orden.created_at).getTime();
      const celdaTiempo = (['terminado', 'entregado'].includes(orden.estado))
        ? `<td style="color:#27ae60;font-weight:bold;">Listo</td>`
        : `<td class="tiempo-transcurrido" data-inicio="${fechaInicio}">...</td>`;

      const idCorto = orden.id.toString().slice(-4).toUpperCase();

      const tr = document.createElement('tr');
      tr.className = claseFila;
      tr.innerHTML = `
        <td><small style="color:#888;">#${idCorto}</small></td>
        <td>
          <strong>${orden.mesa}</strong>
          ${orden.estado === 'pagado'
            ? '<br><span style="font-size:0.7rem;background:#2ecc71;color:white;padding:2px 6px;border-radius:3px;">PAGADO</span>'
            : ''}
        </td>
        <td>
          <div style="font-size:0.9rem;">
            ${(orden.productos || '').split(',').map(p => `• ${p.trim()}`).join('<br>')}
          </div>
        </td>
        <td><strong>$${parseFloat(orden.total).toFixed(2)}</strong></td>
        <td><span class="badge-estado state-${orden.estado}">${orden.estado.toUpperCase()}</span></td>
        ${celdaTiempo}
        <td>
          <div style="display:flex;gap:5px;align-items:center;">
            ${botonesAccion}
            ${['en_mesa','pagado'].includes(orden.estado)
              ? '' // No mostrar basura en estados finales — solo se cierra desde Mesas o con Cerrar Mesa
              : `<button onclick="App.eliminarOrden('${orden.id}')"
                         class="secondary outline" title="Eliminar" style="padding:6px 10px;">🗑️</button>`
            }
          </div>
        </td>`;
      tablaBody.appendChild(tr);
    });
  }

  // ════════════════════════════════════════════════════════
  // 5️⃣  CERRAR ORDEN PAGADA — reemplaza "Dar al Cliente"
  //      Muestra mini-confirmación y archiva la orden
  // ════════════════════════════════════════════════════════
  window.cerrarOrdenPagada = async (id, mesa) => {
    // Mini-diálogo de confirmación más claro que el botón anterior
    const ok = confirm(
      `🏁 Cerrar ${mesa}\n\n` +
      `¿El cliente ya recibió su pedido y todo está en orden?\n\n` +
      `Al confirmar, la orden se archivará y desaparecerá del panel.`
    );
    if (!ok) return;

    try {
      await db.from('ordenes').update({ estado: 'entregado' }).eq('id', id);
      // cargarOrdenesLocales se dispara vía realtime, pero forzamos por si acaso
      cargarOrdenesLocales();
    } catch (err) {
      alert('Error al cerrar la orden: ' + err.message);
    }
  };

  // ════════════════════════════════════════════════════════
  // 6️⃣  RELOJ
  // ════════════════════════════════════════════════════════
  function actualizarTiempos() {
    document.querySelectorAll('.tiempo-transcurrido').forEach(td => {
      const inicio = parseInt(td.dataset.inicio);
      if (!inicio) return;
      const diff = Math.floor((Date.now() - inicio) / 1000);
      const min  = Math.floor(diff / 60);
      const sec  = diff % 60;
      td.textContent = `${min}m ${sec < 10 ? '0' + sec : sec}s`;
      if (min >= 15) td.style.color = '#e74c3c';
    });
  }

  // ════════════════════════════════════════════════════════
  // 7️⃣  EVENTOS DE FILTROS
  // ════════════════════════════════════════════════════════
  if (inputBusqueda) inputBusqueda.oninput  = renderizarOrdenes;
  if (filtroEstado)  filtroEstado.onchange  = renderizarOrdenes;
  setInterval(actualizarTiempos, 1000);

  // ════════════════════════════════════════════════════════
  // 8️⃣  REALTIME — canal propio 'ordenes-monitor-{restoId}'
  // ════════════════════════════════════════════════════════
  function iniciarRealtime() {
    if (!restoId || typeof db === 'undefined') {
      console.warn('Realtime órdenes: sin sesión o DB');
      return;
    }
    db.channel(`ordenes-monitor-${restoId}`)
      .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'ordenes',
          filter: `restaurante_id=eq.${restoId}`
        },
        payload => {
          console.log('📋 Cambio en órdenes:', payload.eventType);
          cargarOrdenesLocales();
        }
      )
      .subscribe(status => {
        console.log(`[Realtime Órdenes] ${status}`);
      });
  }

  // ════════════════════════════════════════════════════════
  // 9️⃣  ARRANQUE
  // ════════════════════════════════════════════════════════
  cargarOrdenesLocales();
  iniciarRealtime();

  if (typeof App !== 'undefined') {
    App.registerRender('ordenes', () => cargarOrdenesLocales());
  }

  console.log('📋 Monitor de órdenes (solo mesas) V7.3 iniciado ✅');
});