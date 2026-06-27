// js/ordenes.js - MONITOR DE CONTROL V7.2 - Canal propio independiente
document.addEventListener('DOMContentLoaded', () => {
  const tablaBody       = document.getElementById('tablaBodyOrdenes');
  const filtroEstado    = document.getElementById('filtroEstado');
  const inputBusqueda   = document.getElementById('inputBusqueda');
  const audio           = document.getElementById('audioNotificacion');

  let ordenesLocales          = [];   // Datos propios de este módulo
  let ultimaCantidadPendientes = 0;

  // ================================================================
  // 1️⃣  SESIÓN
  // ================================================================
  const sesion    = JSON.parse(localStorage.getItem('sesion_activa'));
  const restoId   = sesion?.restaurante_id;

  // ================================================================
  // 2️⃣  EXTENSIONES DE App (siguen funcionando normalmente)
  // ================================================================
  if (typeof App !== 'undefined') {
    // Aceptar QR: cambia estado Y recarga inmediatamente
    App.aceptarOrdenQR = async (id) => {
      await App.updateEstado(id, 'pendiente');
      cargarOrdenesLocales();
    };

    // Cambiar estado: actualiza BD Y recarga local de inmediato
    App.cambiarEstadoOrden = async (id, estado) => {
      await App.updateEstado(id, estado);
      cargarOrdenesLocales();
    };

    App.eliminarOrden = async (id) => {
      if (!confirm('¿Seguro que deseas eliminar esta orden?')) return;
      try {
        await db.from('ordenes').delete().eq('id', id);
        alert('🗑️ Orden eliminada');
        cargarOrdenesLocales();
      } catch (err) { alert('Error al eliminar: ' + err.message); }
    };
  }

  // ================================================================
  // 3️⃣  CARGA DIRECTA DESDE SUPABASE (no depende de App)
  // ================================================================
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
      ordenesLocales = data || [];
      renderizarOrdenes();
    } catch (err) {
      console.error('Error cargando órdenes:', err.message);
    }
  }

  // ================================================================
  // 4️⃣  RENDERIZADO — usa ordenesLocales (datos propios)
  // ================================================================
  function renderizarOrdenes() {
    if (!tablaBody) return;

    // Notificación sonora
    const nuevas = ordenesLocales.filter(
    o => o.estado === 'pendiente' || o.estado === 'por_confirmar'
    );
    if (nuevas.length > ultimaCantidadPendientes) {
        // Toast visual (que también dispara el sonido Web Audio de app.js)
        if (typeof App !== 'undefined' && App.mostrarToast) {
            const nueva = nuevas[nuevas.length - 1];
            App.mostrarToast('orden',
                'Nueva orden recibida',
                nueva?.mesa ? `Mesa ${nueva.mesa}` : 'Para llevar',
                'ordenes.html'
            );
        } else if (audio) {
            // Fallback solo si App no está disponible
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }
ultimaCantidadPendientes = nuevas.length;

    // Filtros
    const estadoSel = filtroEstado?.value || 'todos';
    const texto     = inputBusqueda?.value.toLowerCase() || '';

    const filtradas = ordenesLocales.filter(o => {
      if (o.estado === 'entregado' || o.estado === 'cancelado') return false;
      const pasaEstado = estadoSel === 'todos' || o.estado === estadoSel;
      const pasaTexto  = o.mesa.toLowerCase().includes(texto);
      return pasaEstado && pasaTexto;
    });

    tablaBody.innerHTML = '';

    if (filtradas.length === 0) {
      tablaBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:3rem;color:#888;">
          No hay órdenes activas.
        </td></tr>`;
      return;
    }

    filtradas.forEach(orden => {
      let claseFila     = '';
      let botonesAccion = '';

      switch (orden.estado) {
        case 'por_confirmar':
          claseFila     = 'fila-urgente';
          botonesAccion = `<button onclick="App.aceptarOrdenQR('${orden.id}')"
                            style="background:#f39c12;border:none;color:white;">
                            Confirmar QR</button>`;
          break;
        case 'pendiente':
          claseFila     = 'fila-pendiente';
          botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}','preparando')"
                            class="contrast">👨‍🍳 A Cocina</button>`;
          break;
        case 'preparando':
        case 'proceso':
          claseFila     = 'fila-proceso';
          botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}','terminado')"
                            class="primary">🛎️ Terminado</button>`;
          break;
        case 'terminado':
          claseFila     = 'fila-terminado';
          botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}','entregado')"
                            class="secondary">✅ Entregar</button>`;
          break;
        case 'pagado':
          claseFila     = 'fila-pagado';
          botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}','entregado')"
                            style="background:#10ad93;color:white;border:none;">
                            🥡 Dar al Cliente</button>`;
          break;
      }

      const fechaInicio = new Date(orden.created_at).getTime();
      const celdaTiempo = (orden.estado === 'terminado' || orden.estado === 'entregado')
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
            ? '<br><span style="font-size:0.7rem;background:#2ecc71;color:white;padding:1px 4px;border-radius:3px;">PAGADO</span>'
            : ''}
        </td>
        <td>
          <div style="font-size:0.9rem;">
            ${orden.productos.split(',').map(p => `• ${p.trim()}`).join('<br>')}
          </div>
        </td>
        <td><strong>$${parseFloat(orden.total).toFixed(2)}</strong></td>
        <td><span class="badge-estado state-${orden.estado}">${orden.estado.toUpperCase()}</span></td>
        ${celdaTiempo}
        <td>
          <div style="display:flex;gap:5px;">
            ${botonesAccion}
            <button onclick="App.eliminarOrden('${orden.id}')"
                    class="secondary outline" title="Eliminar">🗑️</button>
          </div>
        </td>`;
      tablaBody.appendChild(tr);
    });
  }

  // ================================================================
  // 5️⃣  RELOJ DE TIEMPO TRANSCURRIDO
  // ================================================================
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

  // ================================================================
  // 6️⃣  EVENTOS DE FILTROS
  // ================================================================
  if (inputBusqueda) inputBusqueda.oninput  = renderizarOrdenes;
  if (filtroEstado)  filtroEstado.onchange  = renderizarOrdenes;
  setInterval(actualizarTiempos, 1000);

  // ================================================================
  // 7️⃣  CANAL REALTIME PROPIO — nombre único para este módulo
  //      No interfiere con app.js (canal 'resto-ID')
  //      ni con reservaciones.js (canal 'reservas-ID')
  // ================================================================
  function iniciarRealtime() {
    if (!restoId || typeof db === 'undefined') {
      console.warn('Realtime órdenes: sin sesión o DB');
      return;
    }

    // Nombre único: 'ordenes-monitor-{restoId}'
    // app.js usa 'resto-{restoId}' → nombres distintos, sin colisión
    db.channel(`ordenes-monitor-${restoId}`)
      .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'ordenes',
          filter: `restaurante_id=eq.${restoId}`  // filtro en servidor, eficiente
        },
        payload => {
          console.log('📋 Cambio en órdenes:', payload.eventType, payload.new?.id || payload.old?.id);
          cargarOrdenesLocales(); // recarga y redibuja
        }
      )
      .subscribe(status => {
        console.log(`[Realtime Órdenes] ${status}`);
      });
  }

  // ================================================================
  // 8️⃣  ARRANQUE
  // ================================================================
  cargarOrdenesLocales(); // Primera carga al abrir la página
  iniciarRealtime();      // Escucha cambios en tiempo real

  // También registramos en App por si otro módulo llama notifyUpdate()
  // Usamos App.getOrdenes() solo como fallback — los datos propios
  // ya vienen de cargarOrdenesLocales()
  if (typeof App !== 'undefined') {
    App.registerRender('ordenes', () => {
      // Cuando app.js detecte un cambio y llame notifyUpdate,
      // también refrescamos desde la BD para estar seguros
      cargarOrdenesLocales();
    });
  }

  console.log('📋 Monitor de órdenes iniciado con canal propio ✅');
});