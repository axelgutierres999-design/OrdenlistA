// js/ordenes.js - MONITOR DE CONTROL Y DESPACHO (V7.0 - eliminar + entregar final)
document.addEventListener('DOMContentLoaded', () => {
  const tablaBody = document.getElementById('tablaBodyOrdenes');
  const filtroEstado = document.getElementById('filtroEstado');
  const inputBusqueda = document.getElementById('inputBusqueda');
  const audio = document.getElementById('audioNotificacion');

  let ultimaCantidadPendientes = 0;

  // =====================================================
  // 1️⃣ EXTENSIÓN DE FUNCIONES GLOBALES App.js
  // =====================================================
  if (typeof App !== 'undefined') {
    App.aceptarOrdenQR = (id) => App.updateEstado(id, 'pendiente');

    App.cambiarEstadoOrden = (id, nuevoEstado) => {
      // El trigger SQL ya gestiona el stock cuando pasa a 'terminado'
      App.updateEstado(id, nuevoEstado);
    };

    // 🗑️ Eliminar orden completamente
    App.eliminarOrden = async (id) => {
      if (!confirm('¿Seguro que deseas eliminar esta orden?')) return;
      try {
        await db.from('ordenes').delete().eq('id', id);
        alert('🗑️ Orden eliminada correctamente');
        App.notifyUpdate?.();
      } catch (err) {
        alert('Error al eliminar: ' + err.message);
      }
    };
  }

  // =====================================================
  // 2️⃣ RENDERIZADO PRINCIPAL
  // =====================================================
  function renderizarOrdenes() {
    if (!tablaBody || typeof App === 'undefined') return;

    const todasLasOrdenes = App.getOrdenes();

    // 🔔 SISTEMA DE NOTIFICACIÓN SONORA
    const ordenesNuevas = todasLasOrdenes.filter(
      (o) => o.estado === 'pendiente' || o.estado === 'por_confirmar'
    );
    if (ordenesNuevas.length > ultimaCantidadPendientes) {
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => console.log('Interacción requerida para audio'));
      }
    }
    ultimaCantidadPendientes = ordenesNuevas.length;

    // 🔍 FILTROS
    const estadoSelect = filtroEstado ? filtroEstado.value : 'todos';
    const textoBusqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : '';

    const filtradas = todasLasOrdenes.filter((o) => {
      if (o.estado === 'entregado' || o.estado === 'cancelado') return false;
      const pasaEstado = estadoSelect === 'todos' || o.estado === estadoSelect;
      const pasaTexto = o.mesa.toLowerCase().includes(textoBusqueda);
      return pasaEstado && pasaTexto;
    });

    tablaBody.innerHTML = '';

    if (filtradas.length === 0) {
      tablaBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:3rem; color:#888;">
            No hay órdenes activas.
          </td>
        </tr>`;
      return;
    }

    filtradas.forEach((orden) => {
      let claseFila = '';
      let botonesAccion = '';

      // 🔁 Flujo por estado
      switch (orden.estado) {
        case 'por_confirmar':
          claseFila = 'fila-urgente';
          botonesAccion = `
            <button onclick="App.aceptarOrdenQR('${orden.id}')" 
                    style="background:#f39c12; border:none; color:white;">
              Confirmar QR
            </button>`;
          break;

        case 'pendiente':
          claseFila = 'fila-pendiente';
          botonesAccion = `
            <button onclick="App.cambiarEstadoOrden('${orden.id}', 'preparando')" 
                    class="contrast">👨‍🍳 A Cocina</button>`;
          break;

        case 'preparando':
        case 'proceso':
          claseFila = 'fila-proceso';
          botonesAccion = `
            <button onclick="App.cambiarEstadoOrden('${orden.id}', 'terminado')" 
                    class="primary">🛎️ Terminado</button>`;
          break;

        case 'terminado':
          claseFila = 'fila-terminado';
          botonesAccion = `
            <button onclick="App.cambiarEstadoOrden('${orden.id}', 'entregado')" 
                    class="secondary">✅ Entregar</button>`;
          break;

        case 'pagado': // 💵 Pedido ya cobrado, listo para entregar
          claseFila = 'fila-pagado';
          botonesAccion = `
            <button onclick="App.cambiarEstadoOrden('${orden.id}', 'entregado')" 
                    style="background:#10ad93; color:white; border:none;">
              🥡 Dar al Cliente
            </button>`;
          break;
      }

      // Tiempo
      const fechaInicio = new Date(orden.created_at).getTime();
      const celdaTiempo =
        orden.estado === 'terminado' || orden.estado === 'entregado'
          ? `<td style="color:#27ae60; font-weight:bold;">Listo</td>`
          : `<td class="tiempo-transcurrido" data-inicio="${fechaInicio}">...</td>`;

      const idCorto = orden.id.toString().slice(-4).toUpperCase();

      // 🔹 Render fila
      const tr = document.createElement('tr');
      tr.className = claseFila;
      tr.innerHTML = `
        <td><small style="color:#888;">#${idCorto}</small></td>
        <td>
          <strong>${orden.mesa}</strong>
          ${
            orden.estado === 'pagado'
              ? '<br><span style="font-size:0.7rem; background:#2ecc71; color:white; padding:1px 4px; border-radius:3px;">PAGADO</span>'
              : ''
          }
        </td>
        <td>
          <div style="font-size:0.9rem;">
            ${orden.productos
              .split(',')
              .map((p) => `• ${p.trim()}`)
              .join('<br>')}
          </div>
        </td>
        <td><strong>$${parseFloat(orden.total).toFixed(2)}</strong></td>
        <td><span class="badge-estado state-${orden.estado}">${orden.estado.toUpperCase()}</span></td>
        ${celdaTiempo}
        <td>
          <div style="display:flex; gap:5px;">
            ${botonesAccion}
            <button onclick="App.eliminarOrden('${orden.id}')" 
                    class="secondary outline" 
                    title="Eliminar orden">🗑️</button>
          </div>
        </td>
      `;
      tablaBody.appendChild(tr);
    });
  }

  // =====================================================
  // 3️⃣ ACTUALIZADOR DE TIEMPO TRANSCURRIDO
  // =====================================================
  function actualizarTiempos() {
    document.querySelectorAll('.tiempo-transcurrido').forEach((td) => {
      const inicio = parseInt(td.dataset.inicio);
      if (!inicio) return;
      const diff = Math.floor((Date.now() - inicio) / 1000);
      const min = Math.floor(diff / 60);
      const sec = diff % 60;
      td.textContent = `${min}m ${sec < 10 ? '0' + sec : sec}s`;
      if (min >= 15) td.style.color = '#e74c3c';
    });
  }

  // =====================================================
  // 4️⃣ EVENTOS
  // =====================================================
 if (inputBusqueda) inputBusqueda.oninput = () => renderizarOrdenes();
  if (filtroEstado) filtroEstado.onchange = () => renderizarOrdenes();

  // Reloj de segundos
  setInterval(actualizarTiempos, 1000);

  if (typeof App !== 'undefined') {
    App.registerRender('ordenes', renderizarOrdenes);

    // --- CONFIGURACIÓN TIEMPO REAL ---
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    
    if (sesion && db) {
      console.log("🛰️ Conectando Monitor en Tiempo Real...");

      db.channel('monitor-ordenes')
        .on(
          'postgres_changes', 
          { 
            event: '*', // Escucha INSERTS, UPDATES y DELETES
            schema: 'public', 
            table: 'ordenes',
            filter: `restaurante_id=eq.${sesion.restaurante_id}` 
          }, 
          async (payload) => {
            console.log('🔔 Cambio en órdenes detectado:', payload.eventType);
            
            // 1. Forzamos a App.js a traer los datos frescos de la DB
            if (App.cargarDatos) {
                await App.cargarDatos(); 
            }
            
            // 2. Renderizar automáticamente (App.cargarDatos suele disparar los renders registrados)
            renderizarOrdenes();
          }
        )
        .subscribe((status) => {
           console.log("Estado de suscripción:", status);
        });
    }
  }
});