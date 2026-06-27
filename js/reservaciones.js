// js/reservaciones.js - MONITOR DE RESERVACIONES 
document.addEventListener('DOMContentLoaded', () => {
  const tablaBody = document.getElementById('tablaBodyReservas');
  const filtroEstado = document.getElementById('filtroEstado');
  const inputBusqueda = document.getElementById('inputBusqueda');
  const audio = document.getElementById('audioNotificacion');

  let reservacionesLocal = [];
  let ultimaCantidadPendientes = 0;

  // =====================================================
  // 1️⃣ CARGA INICIAL DE DATOS
  // =====================================================
  async function cargarReservaciones() {
    // Limpiar badge al entrar a la página
    if (typeof App !== 'undefined' && App.limpiarBadgeReservas) {
        App.limpiarBadgeReservas();
    }

    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || !db) return;

    try {
      // Filtrar solo las reservas de HOY en adelante (puedes ajustar esto)
      const { data, error } = await db
        .from('reservaciones')
        .select('*')
        .eq('restaurante_id', sesion.restaurante_id)
        .order('fecha_reserva', { ascending: true })
        .order('hora_reserva', { ascending: true });

      if (error) throw error;
      reservacionesLocal = data;
      renderizarReservaciones();
    } catch (err) {
      console.error("Error cargando reservas:", err);
    }
  }

  // =====================================================
  // 2️⃣ RENDERIZADO PRINCIPAL
  // =====================================================
  function renderizarReservaciones() {
    if (!tablaBody) return;

    // 🔔 SISTEMA DE NOTIFICACIÓN SONORA
    const reservasNuevas = reservacionesLocal.filter(r => r.estado === 'pendiente');
    if (reservasNuevas.length > ultimaCantidadPendientes) {
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => console.log('Interacción requerida para audio'));
      }
    }
    ultimaCantidadPendientes = reservasNuevas.length;

    // 🔍 FILTROS
    const estadoSelect = filtroEstado ? filtroEstado.value : 'todos';
    const textoBusqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : '';

    const filtradas = reservacionesLocal.filter((r) => {
      // Ocultar canceladas por defecto a menos que se busquen
      if (r.estado === 'cancelada' && estadoSelect !== 'todos') return false;
      
      const pasaEstado = estadoSelect === 'todos' || r.estado === estadoSelect;
      const pasaTexto = r.nombre_cliente.toLowerCase().includes(textoBusqueda);
      return pasaEstado && pasaTexto;
    });

    tablaBody.innerHTML = '';

    if (filtradas.length === 0) {
      tablaBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:#888;">No hay reservaciones para mostrar.</td></tr>`;
      return;
    }

    filtradas.forEach((reserva) => {
      let claseFila = reserva.estado === 'pendiente' ? 'fila-pendiente' : (reserva.estado === 'cancelada' ? 'fila-cancelada' : '');
      let botonesAccion = '';

      // Formatear Fecha
      const fechaObj = new Date(reserva.fecha_reserva + 'T00:00:00');
      const fechaStr = fechaObj.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

      // 🔁 Flujo por estado
      switch (reserva.estado) {
        case 'pendiente':
          botonesAccion = `
            <button onclick="cambiarEstadoReserva('${reserva.id}', 'confirmada')" style="background:#10ad93; border:none; color:white;" title="Aprobar">✅</button>
            <button onclick="cambiarEstadoReserva('${reserva.id}', 'cancelada')" class="secondary outline" title="Rechazar">❌</button>
          `;
          break;
        case 'confirmada':
          botonesAccion = `
            <button onclick="cambiarEstadoReserva('${reserva.id}', 'completada')" class="contrast" title="Marcar como Completada">🍽️ Llegaron</button>
            <button onclick="cambiarEstadoReserva('${reserva.id}', 'cancelada')" class="secondary outline" title="No show (No llegaron)">🚫</button>
          `;
          break;
        case 'completada':
        case 'cancelada':
          botonesAccion = `<span style="color:#888; font-size: 0.8rem;">Sin acciones</span>`;
          break;
      }

      // 🔹 Render fila
      const tr = document.createElement('tr');
      tr.className = claseFila;
      tr.innerHTML = `
        <td><strong>${fechaStr}</strong> <br> <small style="color:#666;">🕒 ${reserva.hora_reserva.slice(0,5)}</small></td>
        <td><strong>${reserva.nombre_cliente}</strong></td>
        <td><a href="https://wa.me/${reserva.telefono?.replace(/\D/g,'')}" target="_blank" style="text-decoration:none; color:#25D366;">💬 ${reserva.telefono || 'N/A'}</a></td>
        <td><strong>${reserva.mesa}</strong> <br><small>(${reserva.personas} personas)</small></td>
        <td><span class="badge-estado state-${reserva.estado}">${reserva.estado}</span></td>
        <td>
          <div style="display:flex; gap:5px; justify-content:center;">
            ${botonesAccion}
          </div>
        </td>
      `;
      tablaBody.appendChild(tr);
    });
  }

  // =====================================================
  // 3️⃣ ACCIONES DE LA BASE DE DATOS
  // =====================================================
  window.cambiarEstadoReserva = async (id, nuevoEstado) => {
    if (nuevoEstado === 'cancelada' && !confirm('¿Seguro que deseas rechazar/cancelar esta reserva?')) return;
    
    try {
      const { error } = await db
        .from('reservaciones')
        .update({ estado: nuevoEstado })
        .eq('id', id);

      if (error) throw error;
      // No necesitamos llamar a renderizar aquí porque el Realtime lo hará automáticamente
    } catch (err) {
      alert('Error al actualizar reserva: ' + err.message);
    }
  };

// =====================================================
  // 4️⃣ EVENTOS Y REAL-TIME
  // =====================================================
  if (inputBusqueda) inputBusqueda.oninput = () => renderizarReservaciones();
  if (filtroEstado) filtroEstado.onchange = () => renderizarReservaciones();

  // Carga inicial
  cargarReservaciones();

  // --- CONFIGURACIÓN TIEMPO REAL (CORREGIDA) ---
  const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
  
  if (sesion && typeof db !== 'undefined') {
    console.log("🛰️ Conectando Monitor de Reservas en Tiempo Real...");
    
    // Usamos un nombre de canal fresco para evitar conflictos en caché
    db.channel('reservaciones_activas')
      .on(
        'postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'reservaciones' 
          // ⚠️ Quitamos el filtro del socket para evitar el bug del UUID.
          // El filtrado por restaurante_id ya lo hace la función cargarReservaciones().
        }, 
        (payload) => {
          console.log('🔔 Cambio en reservas detectado:', payload.eventType);
          cargarReservaciones(); // Refrescar los datos de manera segura
        }
      )
      .subscribe((status) => {
          console.log("Estado de conexión Reservas:", status);
      });
  }
});