// js/ordenes.js - MONITOR DE COCINA, KDS Y TICKETS (ACTUALIZADO)
document.addEventListener('DOMContentLoaded', () => {
    const tablaBody = document.getElementById('tablaBodyOrdenes');
    const filtroEstado = document.getElementById('filtroEstado');
    const inputBusqueda = document.getElementById('inputBusqueda');
    const audio = document.getElementById('audioNotificacion');
    
    let ultimaCantidadPendientes = 0;

    // 1. EXTENSIÓN DE FUNCIONES App.js
    if (typeof App !== 'undefined') {
        App.aceptarOrdenQR = (id) => App.updateEstado(id, 'pendiente');
        App.eliminarOrden = (id) => {
            if(confirm("¿Seguro que deseas cancelar esta orden?")) {
                App.updateEstado(id, 'cancelado');
            }
        };
        App.cambiarEstadoOrden = (id, estado) => App.updateEstado(id, estado);
    }

    // 2. RENDERIZADO REACTIVO
    function renderizarOrdenes() {
        if (!tablaBody || typeof App === 'undefined') return;
        
        const todasLasOrdenes = App.getOrdenes();

        // Notificación de Audio
        const ordenesNuevas = todasLasOrdenes.filter(o => o.estado === 'pendiente' || o.estado === 'por_confirmar');
        if (ordenesNuevas.length > ultimaCantidadPendientes) {
            if (audio) { 
                audio.currentTime = 0; 
                audio.play().catch(() => {}); 
            }
        }
        ultimaCantidadPendientes = ordenesNuevas.length;

        const estadoSelect = filtroEstado ? filtroEstado.value : 'todos';
        const textoBusqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : "";

        const filtradas = todasLasOrdenes.filter(o => {
            // Regla: No mostrar pagados ni cancelados en el monitor de cocina principal
            if (o.estado === 'pagado' || o.estado === 'cancelado') return false;

            const pasaEstado = estadoSelect === 'todos' || o.estado === estadoSelect;
            const idStr = o.id.toString().toLowerCase();
            const mesaStr = o.mesa.toLowerCase();
            const pasaTexto = idStr.includes(textoBusqueda) || mesaStr.includes(textoBusqueda);

            return pasaEstado && pasaTexto;
        });

        tablaBody.innerHTML = ''; 
        
        if (filtradas.length === 0) {
            tablaBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#888;">No hay órdenes activas.</td></tr>';
            return;
        }

        filtradas.forEach(orden => {
            const esQR = orden.estado === 'por_confirmar';
            let claseFila = '';
            let claseEstado = '';

            switch(orden.estado) {
                case 'por_confirmar': claseFila = 'fila-urgente'; claseEstado = 'estado-pendiente'; break;
                case 'pendiente': claseFila = 'fila-pendiente'; claseEstado = 'estado-pendiente'; break;
                case 'proceso': claseFila = 'fila-proceso'; claseEstado = 'estado-proceso'; break;
                case 'terminado': claseFila = 'fila-terminado'; claseEstado = 'estado-terminado'; break;
            }

            const fechaInicio = new Date(orden.created_at).getTime();
            const celdaTiempo = orden.estado === 'terminado' 
                ? `<td style="color:#27ae60; font-weight:bold;">¡Listo!</td>`
                : `<td class="tiempo-transcurrido" data-inicio="${fechaInicio}">...</td>`;

            const idCorto = orden.id.toString().slice(-6).toUpperCase(); 

            let botonesAccion = '';
            if (esQR) {
                botonesAccion = `
                    <div role="group">
                        <button onclick="App.aceptarOrdenQR('${orden.id}')" style="background:#f39c12; border:none; padding:4px 10px;">✅</button>
                        <button onclick="App.eliminarOrden('${orden.id}')" class="outline secondary" style="padding:4px 10px;">❌</button>
                    </div>`;
            } else if (orden.estado === 'pendiente') {
                botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'proceso')" class="contrast">👨‍🍳 Cocinar</button>`;
            } else if (orden.estado === 'proceso') {
                botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'terminado')" class="primary">🛎️ Terminar</button>`;
            } else {
                botonesAccion = `<small style="color:#7f8c8d;">Entregando...</small>`;
            }

            const tr = document.createElement('tr');
            tr.className = claseFila;
            tr.innerHTML = `
                <td><small>#${idCorto}</small></td>
                <td><strong>${orden.mesa}</strong></td>
                <td>
                    <div class="lista-productos">
                        ${orden.productos.split(',').map(p => `<div>• ${p.trim()}</div>`).join('')}
                    </div>
                    ${orden.comentarios ? `<div class="nota-pedido">📝 ${orden.comentarios}</div>` : ''}
                </td>
                <td><strong>$${parseFloat(orden.total).toFixed(2)}</strong></td>
                <td><span class="badge-estado ${claseEstado}">${orden.estado.toUpperCase()}</span></td>
                ${celdaTiempo}
                <td>
                    <div style="display:flex; gap:5px;">
                        ${botonesAccion}
                        <button class="secondary outline" onclick="abrirTicketVisual('${orden.id}')">👁️</button>
                    </div>
                </td>
            `;
            tablaBody.appendChild(tr);
        });

        // 3. DETECTOR DE REDIRECCIÓN (Ver Ticket desde Mesas)
        const params = new URLSearchParams(window.location.search);
        if (params.get('verTicket') === 'true') {
            const mesaNum = params.get('mesa');
            const ordenMesa = todasLasOrdenes.find(o => o.mesa === `Mesa ${mesaNum}` && o.estado !== 'pagado');
            if (ordenMesa) {
                abrirTicketVisual(ordenMesa.id);
                // Limpiar URL para no reabrir el modal al recargar
                window.history.replaceState({}, document.title, "ordenes.html");
            }
        }
    }

    function actualizarTiempos() {
        document.querySelectorAll('.tiempo-transcurrido').forEach(td => {
            const inicio = parseInt(td.dataset.inicio);
            if (!inicio) return;
            const diff = Math.floor((Date.now() - inicio) / 1000);
            if(diff < 0) return;
            const min = Math.floor(diff / 60);
            const sec = diff % 60;
            td.textContent = `${min}m ${sec}s`;
            if (min >= 15) td.style.color = "red";
        });
    }

    // 4. MODAL DE TICKET (RESTAURADO)
    window.abrirTicketVisual = (id) => {
        const o = App.getOrdenes().find(item => item.id === id);
        if (!o) return;
        
        const modal = document.getElementById('modalTicket');
        document.getElementById('t-folio').textContent = o.id.toString().slice(-6).toUpperCase();
        document.getElementById('t-mesa').textContent = o.mesa;
        document.getElementById('t-total').textContent = parseFloat(o.total).toFixed(2);
        document.getElementById('t-fecha').textContent = new Date(o.created_at).toLocaleString();
        
        const tbody = document.getElementById('t-items');
        tbody.innerHTML = o.productos.split(',').map(p => `
            <tr><td style="padding:8px 0; border-bottom:1px dashed #eee;">${p.trim()}</td></tr>
        `).join('');
        
        if(o.comentarios) {
            tbody.innerHTML += `<tr><td style="background:#fff9c4; padding:10px; font-size:0.9rem; margin-top:10px; display:block; border-radius:5px;"><strong>Nota:</strong> ${o.comentarios}</td></tr>`;
        }

        modal.showModal();
    };

    if (inputBusqueda) inputBusqueda.oninput = () => renderizarOrdenes();
    if (filtroEstado) filtroEstado.onchange = () => renderizarOrdenes();

    setInterval(actualizarTiempos, 1000);

    if (typeof App !== 'undefined') {
        App.registerRender('ordenes', renderizarOrdenes);
        renderizarOrdenes();
    }
});