// js/ordenes.js - MONITOR DE COCINA, KDS Y TICKETS (VERSIÓN PROFESIONAL)
document.addEventListener('DOMContentLoaded', () => {
    const tablaBody = document.getElementById('tablaBodyOrdenes');
    const filtroEstado = document.getElementById('filtroEstado');
    const inputBusqueda = document.getElementById('inputBusqueda');
    const audio = document.getElementById('audioNotificacion');
    
    let ultimaCantidadPendientes = 0;

    // 1. EXTENSIÓN DE FUNCIONES App.js
    if (typeof App !== 'undefined') {
        // Función para aceptar órdenes que vienen desde QR (Estado inicial: por_confirmar)
        App.aceptarOrdenQR = (id) => App.updateEstado(id, 'pendiente');
        
        App.eliminarOrden = (id) => {
            if(confirm("¿Seguro que deseas cancelar esta orden?")) {
                App.updateEstado(id, 'cancelado');
            }
        };

        // Centralizar cambio de estados para el monitor
        App.cambiarEstadoOrden = (id, nuevoEstado) => {
            // Nota: El backend/SQL Trigger descuenta stock automáticamente al pasar a 'terminado'
            App.updateEstado(id, nuevoEstado);
        };
    }

    // 2. RENDERIZADO REACTIVO
    function renderizarOrdenes() {
        if (!tablaBody || typeof App === 'undefined') return;
        
        const todasLasOrdenes = App.getOrdenes();

        // --- SISTEMA DE NOTIFICACIONES ---
        // Contamos órdenes en 'pendiente' o 'por_confirmar' para sonar la alerta
        const ordenesNuevas = todasLasOrdenes.filter(o => o.estado === 'pendiente' || o.estado === 'por_confirmar');
        if (ordenesNuevas.length > ultimaCantidadPendientes) {
            if (audio) { 
                audio.currentTime = 0; 
                audio.play().catch(e => console.log("Audio bloqueado por navegador hasta interacción.")); 
            }
        }
        ultimaCantidadPendientes = ordenesNuevas.length;

        // --- FILTRADO ---
        const estadoSelect = filtroEstado ? filtroEstado.value : 'todos';
        const textoBusqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : "";

        const filtradas = todasLasOrdenes.filter(o => {
            // Regla: No mostrar pagados ni cancelados en el monitor de producción
            if (o.estado === 'pagado' || o.estado === 'cancelado') return false;

            const pasaEstado = estadoSelect === 'todos' || o.estado === estadoSelect;
            const idStr = o.id.toString().toLowerCase();
            const mesaStr = o.mesa.toLowerCase();
            const pasaTexto = idStr.includes(textoBusqueda) || mesaStr.includes(textoBusqueda);

            return pasaEstado && pasaTexto;
        });

        // Limpiar tabla antes de re-renderizar
        tablaBody.innerHTML = ''; 
        
        if (filtradas.length === 0) {
            tablaBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:3rem; color:#888;">
                        <div style="font-size:2rem; opacity:0.3;">📋</div>
                        No hay órdenes activas en este momento.
                    </td>
                </tr>`;
            return;
        }

        filtradas.forEach(orden => {
            let claseFila = '';
            let claseEstado = '';
            let botonesAccion = '';

            // Mapeo de estilos y lógica por estado
            // Importante: Usamos 'preparando' para ser consistentes con cocina.js y el Trigger SQL
            switch(orden.estado) {
                case 'por_confirmar': 
                    claseFila = 'fila-urgente'; 
                    claseEstado = 'estado-pendiente';
                    botonesAccion = `
                        <div role="group">
                            <button onclick="App.aceptarOrdenQR('${orden.id}')" style="background:#f39c12; border:none; padding:4px 10px;">Aceptar</button>
                            <button onclick="App.eliminarOrden('${orden.id}')" class="outline secondary" style="padding:4px 10px;">❌</button>
                        </div>`;
                    break;
                case 'pendiente': 
                    claseFila = 'fila-pendiente'; 
                    claseEstado = 'estado-pendiente';
                    botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'preparando')" class="contrast">👨‍🍳 Cocinar</button>`;
                    break;
                case 'preparando': 
                case 'proceso': // Compatibilidad por si algún registro quedó con el nombre antiguo
                    claseFila = 'fila-proceso'; 
                    claseEstado = 'estado-proceso';
                    botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'terminado')" class="primary">🛎️ Terminar</button>`;
                    break;
                case 'terminado': 
                    claseFila = 'fila-terminado'; 
                    claseEstado = 'estado-terminado';
                    botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'entregado')" class="secondary outline">✅ Entregar</button>`;
                    break;
            }

            const fechaInicio = new Date(orden.created_at).getTime();
            const celdaTiempo = (orden.estado === 'terminado' || orden.estado === 'entregado')
                ? `<td style="color:#27ae60; font-weight:bold;">¡Listo!</td>`
                : `<td class="tiempo-transcurrido" data-inicio="${fechaInicio}">...</td>`;

            const idCorto = orden.id.toString().slice(-6).toUpperCase(); 

            const tr = document.createElement('tr');
            tr.className = claseFila;
            tr.innerHTML = `
                <td><small style="color:#888;">#${idCorto}</small></td>
                <td><strong>${orden.mesa}</strong></td>
                <td>
                    <div class="lista-productos" style="font-size:0.95rem;">
                        ${orden.productos.split(',').map(p => `<div style="margin-bottom:2px;">• ${p.trim()}</div>`).join('')}
                    </div>
                    ${orden.comentarios ? `<div class="nota-pedido" style="background:#fff9c4; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin-top:5px; border-left:3px solid #f1c40f;">📝 ${orden.comentarios}</div>` : ''}
                </td>
                <td><strong>$${parseFloat(orden.total).toFixed(2)}</strong></td>
                <td><span class="badge-estado ${claseEstado}">${orden.estado.toUpperCase()}</span></td>
                ${celdaTiempo}
                <td>
                    <div style="display:flex; gap:5px; align-items:center;">
                        ${botonesAccion}
                        <button class="secondary outline" onclick="abrirTicketVisual('${orden.id}')" title="Ver Comanda">👁️</button>
                    </div>
                </td>
            `;
            tablaBody.appendChild(tr);
        });

        // 3. DETECTOR DE REDIRECCIÓN (Ver Ticket desde el Mapa de Mesas)
        const params = new URLSearchParams(window.location.search);
        if (params.get('verTicket') === 'true') {
            const mesaNum = params.get('mesa');
            const ordenMesa = todasLasOrdenes.find(o => o.mesa === `Mesa ${mesaNum}` && o.estado !== 'pagado');
            if (ordenMesa) {
                abrirTicketVisual(ordenMesa.id);
                // Limpiar URL para evitar que el modal se abra solo al recargar
                window.history.replaceState({}, document.title, "ordenes.html");
            }
        }
    }

    // Función que corre cada segundo para actualizar los contadores
    function actualizarTiempos() {
        document.querySelectorAll('.tiempo-transcurrido').forEach(td => {
            const inicio = parseInt(td.dataset.inicio);
            if (!inicio) return;
            
            const diff = Math.floor((Date.now() - inicio) / 1000);
            if(diff < 0) return;

            const min = Math.floor(diff / 60);
            const sec = diff % 60;
            
            td.textContent = `${min}m ${sec < 10 ? '0' + sec : sec}s`;
            
            // Alerta visual si la orden lleva más de 15 minutos
            if (min >= 15) {
                td.style.color = "#e74c3c";
                td.style.fontWeight = "bold";
            }
        });
    }

    // 4. MODAL DE TICKET / COMANDA
    window.abrirTicketVisual = (id) => {
        const o = App.getOrdenes().find(item => item.id === id);
        if (!o) return;
        
        const modal = document.getElementById('modalTicket');
        if (!modal) return;

        document.getElementById('t-folio').textContent = o.id.toString().slice(-6).toUpperCase();
        document.getElementById('t-mesa').textContent = o.mesa;
        document.getElementById('t-total').textContent = parseFloat(o.total).toFixed(2);
        document.getElementById('t-fecha').textContent = new Date(o.created_at).toLocaleString();
        
        const tbody = document.getElementById('t-items');
        tbody.innerHTML = o.productos.split(',').map(p => `
            <tr>
                <td style="padding:8px 0; border-bottom:1px dashed #eee; color:black;">${p.trim()}</td>
            </tr>
        `).join('');
        
        if(o.comentarios) {
            tbody.innerHTML += `
                <tr>
                    <td style="background:#fff9c4; padding:10px; font-size:0.9rem; margin-top:10px; display:block; border-radius:5px; color:black;">
                        <strong>Nota:</strong> ${o.comentarios}
                    </td>
                </tr>`;
        }

        modal.showModal();
    };

    // Eventos de Filtros
    if (inputBusqueda) inputBusqueda.oninput = () => renderizarOrdenes();
    if (filtroEstado) filtroEstado.onchange = () => renderizarOrdenes();

    // Timers y Registro en el App Core
    setInterval(actualizarTiempos, 1000);

    if (typeof App !== 'undefined') {
        App.registerRender('ordenes', renderizarOrdenes);
        renderizarOrdenes();
    }
});