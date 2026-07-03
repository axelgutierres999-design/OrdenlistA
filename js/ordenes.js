// ═══════════════════════════════════════════════════════════════════
// js/ordenes.js  —  MONITOR DE ÓRDENES DE MESA  V8.0
// ───────────────────────────────────────────────────────────────────
// RESPONSABILIDAD DE ESTE ARCHIVO:
//   • Mostrar en tiempo real las órdenes que vienen de MESAS
//     (incluye las que llegan por QR desde la mesa del cliente)
//   • Permitir avanzar el estado de cada orden hasta "en_mesa"
//   • NO maneja cobros (eso es mesas.js)
//   • NO maneja pedidos para llevar (eso es pedidosrecoger.html)
//   • Borrar una orden requiere el PIN del dueño
//   • Las órdenes pagadas/entregadas desaparecen solas del panel
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ─── REFERENCIAS AL DOM ────────────────────────────────────────
  const tablaBody    = document.getElementById('tablaBodyOrdenes');
  const filtroEstado = document.getElementById('filtroEstado');
  const inputBusqueda = document.getElementById('inputBusqueda');
  const audio         = document.getElementById('audioNotificacion');

  // ─── ESTADO INTERNO ────────────────────────────────────────────
  let ordenesLocales           = [];   // Todas las órdenes de mesa activas
  let ultimaCantidadNuevas     = 0;    // Para detectar nuevas y sonar alerta

  // ─── SESIÓN ────────────────────────────────────────────────────
  const sesion  = JSON.parse(localStorage.getItem('sesion_activa'));
  const restoId = sesion?.restaurante_id;

  if (!restoId) {
    console.warn('ordenes.js: sin sesión activa');
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // 1️⃣  CARGA DE DATOS DESDE SUPABASE
  //     Solo mesas activas (excluye pagado, entregado, cancelado)
  //     Solo órdenes de "Mesa X" — excluye LLEVAR / RECOGER
  // ═══════════════════════════════════════════════════════════════
  async function cargarOrdenes() {
    if (typeof db === 'undefined') return;

    try {
      const { data, error } = await db
        .from('ordenes')
        .select('*')
        .eq('restaurante_id', restoId)
        // Las órdenes pagadas y entregadas desaparecen solas aquí:
        .not('estado', 'in', '("pagado","entregado","cancelado","cancelada")')
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filtro adicional en JS: solo órdenes de mesa numerada
      // Excluye cualquier variante de "para llevar" o "para recoger"
      ordenesLocales = (data || []).filter(o => {
        const mesa = (o.mesa || '').toUpperCase().trim();
        return (
          !mesa.includes('LLEVAR') &&
          !mesa.includes('RECOGER') &&
          !mesa.includes('PARA LLEVAR') &&
          !mesa.includes('TAKE OUT') &&
          !mesa.includes('TAKEOUT')
        );
      });

      renderizarTabla();

    } catch (err) {
      console.error('[Órdenes] Error al cargar:', err.message);
      if (tablaBody) {
        tablaBody.innerHTML = `
          <tr><td colspan="7" style="text-align:center;color:#e53935;padding:2rem;">
            Error de conexión: ${err.message}
          </td></tr>`;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 2️⃣  CAMBIAR ESTADO DE UNA ORDEN
  //     ordenes.js SOLO puede avanzar estados, nunca retroceder
  //     y nunca toca tablas de ventas ni otras páginas
  // ═══════════════════════════════════════════════════════════════
  async function cambiarEstado(id, nuevoEstado) {
    if (typeof db === 'undefined') return;
    try {
      const { error } = await db
        .from('ordenes')
        .update({ estado: nuevoEstado })
        .eq('id', id);
      if (error) throw error;
      // El canal realtime recargará automáticamente
    } catch (err) {
      alert('Error al actualizar estado: ' + err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 3️⃣  BORRAR ORDEN CON PIN DEL DUEÑO
  //     Consulta la tabla "perfiles" para verificar el PIN
  //     Solo el rol "dueño" puede borrar
  // ═══════════════════════════════════════════════════════════════
  async function eliminarConPin(id, mesa) {
    // Pedir el PIN
    const pin = prompt(
      `🔒 BORRAR ORDEN — ${mesa}\n\n` +
      `Esta acción es PERMANENTE.\n` +
      `Introduce el PIN del dueño para confirmar:`
    );

    if (pin === null) return;           // Canceló
    if (pin.trim() === '') {
      alert('⚠️ El PIN no puede estar vacío.');
      return;
    }

    try {
      // Verificar el PIN contra la tabla de perfiles
      const { data: perfil, error } = await db
        .from('perfiles')
        .select('id, nombre')
        .eq('restaurante_id', restoId)
        .eq('rol', 'dueño')
        .eq('pin', pin.trim())
        .maybeSingle();   // null si no existe, no lanza error

      if (error) throw error;

      if (!perfil) {
        alert('❌ PIN incorrecto. No tienes permiso para eliminar esta orden.');
        return;
      }

      // PIN correcto — eliminar la orden
      const { error: errDel } = await db
        .from('ordenes')
        .delete()
        .eq('id', id);

      if (errDel) throw errDel;

      // Feedback inmediato (realtime también actualizará, pero por si acaso)
      cargarOrdenes();

    } catch (err) {
      alert('Error al verificar PIN o eliminar: ' + err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 4️⃣  RENDERIZADO DE LA TABLA
  // ═══════════════════════════════════════════════════════════════
  function renderizarTabla() {
    if (!tablaBody) return;

    // ── Alerta sonora para órdenes nuevas ──
    const urgentes = ordenesLocales.filter(o =>
      o.estado === 'pendiente' || o.estado === 'por_confirmar'
    );
    if (urgentes.length > ultimaCantidadNuevas) {
      sonarAlerta();
    }
    ultimaCantidadNuevas = urgentes.length;

    // ── Filtros de la UI ──
    const estadoFiltro = filtroEstado?.value  || 'todos';
    const textoBusq    = inputBusqueda?.value.toLowerCase().trim() || '';

    const visibles = ordenesLocales.filter(o => {
      const pasaEstado = estadoFiltro === 'todos' || o.estado === estadoFiltro;
      const pasaTexto  = (o.mesa || '').toLowerCase().includes(textoBusq);
      return pasaEstado && pasaTexto;
    });

    tablaBody.innerHTML = '';

    if (visibles.length === 0) {
      tablaBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:3rem;color:#aaa;">
          No hay órdenes activas en mesas.
        </td></tr>`;
      return;
    }

    visibles.forEach(orden => {
      const tr       = document.createElement('tr');
      const idCorto  = orden.id.toString().slice(-4).toUpperCase();
      const fechaMs  = new Date(orden.created_at).getTime();

      // ── Color y acción según estado ──
      let claseFila     = '';
      let botonPrincipal = '';
      let etiquetaEstado = '';

      switch (orden.estado) {

        case 'por_confirmar':
          // Llegó por QR desde el celular del cliente — esperando que el mesero la confirme
          claseFila      = 'fila-urgente';
          etiquetaEstado = `<span class="badge-estado state-por_confirmar">🔔 Por Confirmar</span>`;
          botonPrincipal = `
            <button onclick="accionOrden('${orden.id}', 'pendiente')"
                    style="background:#f39c12;border:none;color:white;padding:8px 14px;
                           border-radius:8px;cursor:pointer;font-weight:bold;font-size:0.85rem;">
              ✅ Confirmar QR
            </button>`;
          break;

        case 'pendiente':
          // Confirmada, esperando ir a cocina
          claseFila      = 'fila-pendiente';
          etiquetaEstado = `<span class="badge-estado state-pendiente">🔥 Pendiente</span>`;
          botonPrincipal = `
            <button onclick="accionOrden('${orden.id}', 'preparando')"
                    style="background:#e53935;border:none;color:white;padding:8px 14px;
                           border-radius:8px;cursor:pointer;font-weight:bold;font-size:0.85rem;">
              👨‍🍳 Enviar a Cocina
            </button>`;
          break;

        case 'preparando':
        case 'proceso':
          // Cocina la está preparando
          claseFila      = 'fila-proceso';
          etiquetaEstado = `<span class="badge-estado state-preparando">🍳 Preparando</span>`;
          botonPrincipal = `
            <button onclick="accionOrden('${orden.id}', 'terminado')"
                    style="background:#f39c12;border:none;color:white;padding:8px 14px;
                           border-radius:8px;cursor:pointer;font-weight:bold;font-size:0.85rem;">
              🛎️ Marcar Listo
            </button>`;
          break;

        case 'terminado':
          // Cocina terminó — mesero debe llevarla a la mesa
          claseFila      = 'fila-terminado';
          etiquetaEstado = `<span class="badge-estado state-terminado">✅ Listo</span>`;
          botonPrincipal = `
            <button onclick="accionOrden('${orden.id}', 'en_mesa')"
                    style="background:#10ad93;border:none;color:white;padding:8px 14px;
                           border-radius:8px;cursor:pointer;font-weight:bold;font-size:0.85rem;">
              🍽️ Entregar a Mesa
            </button>`;
          break;

        case 'en_mesa':
          // Ya está en mesa — el cobro se hace desde mesas.html
          // Esta fila se queda visible hasta que mesas.html procese el pago
          // Al pagar → estado='pagado' → desaparece del query automáticamente
          claseFila      = 'fila-en-mesa';
          etiquetaEstado = `<span class="badge-estado state-en_mesa">🍽️ En Mesa</span>`;
          botonPrincipal = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
              <span style="font-size:0.75rem;color:#27ae60;font-weight:700;">Pendiente de cobro</span>
              <small style="color:#888;font-size:0.7rem;">Cobrar desde 🪑 Mesas</small>
            </div>`;
          break;

        default:
          etiquetaEstado = `<span class="badge-estado">${orden.estado}</span>`;
          break;
      }

      // ── Celda de tiempo ──
      const celdaTiempo = (orden.estado === 'en_mesa')
        ? `<td style="color:#27ae60;font-weight:bold;font-size:0.85rem;">En mesa</td>`
        : `<td><span class="tiempo-transcurrido" data-inicio="${fechaMs}">...</span></td>`;

      // ── Botón de borrar (requiere PIN del dueño) ──
      // Se oculta si ya está en_mesa (para no confundir — el cobro cierra la orden)
      const botonBorrar = (orden.estado === 'en_mesa')
        ? ''
        : `<button onclick="window.pedirPinYEliminar('${orden.id}', '${orden.mesa.replace(/'/g, "\\'")}' )"
                   title="Eliminar (requiere PIN del dueño)"
                   style="background:transparent;border:1px solid #e53935;color:#e53935;
                          padding:6px 10px;border-radius:8px;cursor:pointer;font-size:0.85rem;">
             🗑️
           </button>`;

      // ── Productos con comentarios ──
      const productosHtml = (orden.productos || '').split(',').map(p => {
        const trim = p.trim();
        const tieneNota = trim.includes('[') && trim.includes(']');
        if (tieneNota) {
          const nombre = trim.replace(/\[.*?\]/, '').trim();
          const nota   = trim.match(/\[(.+?)\]/)?.[1] || '';
          return `• ${nombre}<br><small style="color:#888;font-style:italic;padding-left:10px;">└ ${nota}</small>`;
        }
        return `• ${trim}`;
      }).join('<br>');

      tr.className = claseFila;
      tr.setAttribute('data-id', orden.id);
      tr.innerHTML = `
        <td>
          <small style="color:#888;font-family:monospace;font-weight:700;">#${idCorto}</small>
        </td>
        <td>
          <strong style="font-size:1rem;">${orden.mesa}</strong>
          ${orden.comentarios
            ? `<br><div style="background:#fff9c4;color:#5d4037;padding:4px 6px;border-radius:4px;
                              font-size:0.72rem;margin-top:4px;border-left:3px solid #fbc02d;">
                 📝 ${orden.comentarios}
               </div>`
            : ''}
        </td>
        <td>
          <div style="font-size:0.88rem;line-height:1.6;">${productosHtml}</div>
        </td>
        <td>
          <strong style="font-size:1rem;">$${parseFloat(orden.total).toFixed(2)}</strong>
        </td>
        <td>${etiquetaEstado}</td>
        ${celdaTiempo}
        <td>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${botonPrincipal}
            ${botonBorrar}
          </div>
        </td>`;

      tablaBody.appendChild(tr);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 5️⃣  FUNCIONES GLOBALES (llamadas desde HTML del botón onclick)
  // ═══════════════════════════════════════════════════════════════

  // Avanzar estado de una orden
  window.accionOrden = (id, nuevoEstado) => {
    cambiarEstado(id, nuevoEstado);
  };

  // Solicitar PIN y borrar
  window.pedirPinYEliminar = (id, mesa) => {
    eliminarConPin(id, mesa);
  };

  // ═══════════════════════════════════════════════════════════════
  // 6️⃣  RELOJ DE TIEMPO TRANSCURRIDO
  //     Se actualiza cada segundo — colorea en rojo si pasa de 15min
  // ═══════════════════════════════════════════════════════════════
  function actualizarTiempos() {
    document.querySelectorAll('.tiempo-transcurrido').forEach(el => {
      const inicio = parseInt(el.dataset.inicio);
      if (!inicio) return;
      const diff = Math.floor((Date.now() - inicio) / 1000);
      const min  = Math.floor(diff / 60);
      const sec  = diff % 60;
      el.textContent = `${min}m ${sec < 10 ? '0' + sec : sec}s`;
      el.style.color  = min >= 15 ? '#e53935' : '#2d3748';
      el.style.fontWeight = min >= 15 ? '800' : 'bold';
    });
  }
  setInterval(actualizarTiempos, 1000);

  // ═══════════════════════════════════════════════════════════════
  // 7️⃣  ALERTA SONORA PARA ÓRDENES NUEVAS
  // ═══════════════════════════════════════════════════════════════
  function sonarAlerta() {
    // Intentar con Web Audio API (más confiable)
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const notas = [880, 660, 880];
      notas.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18);
        osc.start(ctx.currentTime + i * 0.2);
        osc.stop(ctx.currentTime + i * 0.2 + 0.18);
      });
      return;
    } catch (e) {}

    // Fallback: elemento <audio> del HTML
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }

  // Desbloquear AudioContext con la primera interacción del usuario
  const desbloquear = () => {
    try { new (window.AudioContext || window.webkitAudioContext)().resume(); } catch(e) {}
    document.removeEventListener('click', desbloquear);
    document.removeEventListener('touchstart', desbloquear);
  };
  document.addEventListener('click', desbloquear);
  document.addEventListener('touchstart', desbloquear);

  // ═══════════════════════════════════════════════════════════════
  // 8️⃣  FILTROS DE LA INTERFAZ
  // ═══════════════════════════════════════════════════════════════
  if (filtroEstado)  filtroEstado.addEventListener('change', renderizarTabla);
  if (inputBusqueda) inputBusqueda.addEventListener('input', renderizarTabla);

  // ═══════════════════════════════════════════════════════════════
  // 9️⃣  CANAL REALTIME PROPIO
  //     Nombre único: 'ordenes-mesa-{restoId}'
  //     NO colisiona con:
  //       cocina.js     → 'cocina-monitor-{restoId}'
  //       mesas.js      → 'mesas-monitor-{restoId}'
  //       pedidosr.html → 'recoger-monitor-{restoId}'
  // ═══════════════════════════════════════════════════════════════
  function iniciarRealtime() {
    if (typeof db === 'undefined') return;

    db.channel(`ordenes-mesa-${restoId}`)
      .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'ordenes',
          filter: `restaurante_id=eq.${restoId}`
        },
        payload => {
          console.log('[Órdenes Mesa] Cambio:', payload.eventType, payload.new?.id || payload.old?.id);
          cargarOrdenes();
        }
      )
      .subscribe(status => {
        console.log(`[Realtime Órdenes Mesa] ${status}`);
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔟  ARRANQUE
  // ═══════════════════════════════════════════════════════════════
  cargarOrdenes();   // Carga inicial
  iniciarRealtime(); // Suscribe cambios en tiempo real

  console.log('📋 ordenes.js V8.0 — Solo mesas, PIN para borrar ✅');
});