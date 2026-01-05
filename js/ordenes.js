// js/ordenes.js - MONITOR DE CONTROL Y DESPACHO (V6.9 - FINAL)
document.addEventListener('DOMContentLoaded', () => {
    const tablaBody = document.getElementById('tablaBodyOrdenes');
    const filtroEstado = document.getElementById('filtroEstado');
    const inputBusqueda = document.getElementById('inputBusqueda');
    const audio = document.getElementById('audioNotificacion');
    
    let ultimaCantidadPendientes = 0;

    // 1. EXTENSIÓN DE FUNCIONES App.js (Lógica de estados unificada)
    if (typeof App !== 'undefined') {
        App.aceptarOrdenQR = (id) => App.updateEstado(id, 'pendiente');
        
        App.cambiarEstadoOrden = (id, nuevoEstado) => {
            // El Trigger SQL ya se encarga del stock cuando el estado pase a 'terminado'
            App.updateEstado(id, nuevoEstado);
        };
    }

    // 2. RENDERIZADO REACTIVO
    function renderizarOrdenes() {
        if (!tablaBody || typeof App === 'undefined') return;
        
        const todasLasOrdenes = App.getOrdenes();

        // --- SISTEMA DE NOTIFICACIONES ---
        const ordenesNuevas = todasLasOrdenes.filter(o => o.estado === 'pendiente' || o.estado === 'por_confirmar');
        if (ordenesNuevas.length > ultimaCantidadPendientes) {
            if (audio) { 
                audio.currentTime = 0; 
                audio.play().catch(() => console.log("Interacción requerida para audio")); 
            }
        }
        ultimaCantidadPendientes = ordenesNuevas.length;

        // --- FILTRADO ---
        const estadoSelect = filtroEstado ? filtroEstado.value : 'todos';
        const textoBusqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : "";

        const filtradas = todasLasOrdenes.filter(o => {
            // Aquí NO filtramos 'pagado' automáticamente, porque una orden pagada (Para Llevar)
            // aún debe aparecer aquí hasta que se entregue físicamente.
            if (o.estado === 'entregado' || o.estado === 'cancelado') return false;

            const pasaEstado = estadoSelect === 'todos' || o.estado === estadoSelect;
            const mesaStr = o.mesa.toLowerCase();
            const pasaTexto = mesaStr.includes(textoBusqueda);

            return pasaEstado && pasaTexto;
        });

        tablaBody.innerHTML = ''; 
        
        if (filtradas.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem; color:#888;">No hay órdenes activas.</td></tr>`;
            return;
        }

        filtradas.forEach(orden => {
            let claseFila = '';
            let claseEstado = '';
            let botonesAccion = '';

            // Lógica de estilos y acciones según el flujo real del restaurante
            switch(orden.estado) {
                case 'por_confirmar': 
                    claseFila = 'fila-urgente'; 
                    claseEstado = 'estado-pendiente';
                    botonesAccion = `<button onclick="App.aceptarOrdenQR('${orden.id}')" style="background:#f39c12; border:none; color:white;">Confirmar QR</button>`;
                    break;
                case 'pendiente': 
                    claseFila = 'fila-pendiente'; 
                    claseEstado = 'estado-pendiente';
                    botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'preparando')" class="contrast">👨‍🍳 A Cocina</button>`;
                    break;
                case 'preparando': 
                case 'proceso':
                    claseFila = 'fila-proceso'; 
                    claseEstado = 'estado-proceso';
                    botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'terminado')" class="primary">🛎️ Terminado</button>`;
                    break;
                case 'terminado': 
                    claseFila = 'fila-terminado'; 
                    claseEstado = 'estado-terminado';
                    botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'entregado')" class="secondary">✅ Entregar</button>`;
                    break;
                case 'pagado': // Caso especial: El cliente ya pagó pero la comida aún no se le da
                    claseFila = 'fila-pagado';
                    claseEstado = 'estado-proceso';
                    botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'entregado')" style="background:#10ad93; color:white; border:none;">🥡 Dar al Cliente</button>`;
                    break;
            }

            const fechaInicio = new Date(orden.created_at).getTime();
            const celdaTiempo = (orden.estado === 'terminado' || orden.estado === 'entregado')
                ? `<td style="color:#27ae60; font-weight:bold;">Listo</td>`
                : `<td class="tiempo-transcurrido" data-inicio="${fechaInicio}">...</td>`;

            const idCorto = orden.id.toString().slice(-4).toUpperCase(); 

            const tr = document.createElement('tr');
            tr.className = claseFila;
            tr.innerHTML = `
                <td><small style="color:#888;">#${idCorto}</small></td>
                <td>
                    <strong>${orden.mesa}</strong>
                    ${orden.estado === 'pagado' ? '<br><span style="font-size:0.7rem; background:#2ecc71; color:white; padding:1px 4px; border-radius:3px;">PAGADO</span>' : ''}
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
                    <div style="display:flex; gap:5px;">
                        ${botonesAccion}
                        <button class="secondary outline" onclick="App.verDetalleMesa('${orden.id}')">👁️</button>
                    </div>
                </td>
            `;
            tablaBody.appendChild(tr);
        });
    }

    // Actualizador de cronómetro
    function actualizarTiempos() {
        document.querySelectorAll('.tiempo-transcurrido').forEach(td => {
            const inicio = parseInt(td.dataset.inicio);
            if (!inicio) return;
            const diff = Math.floor((Date.now() - inicio) / 1000);
            const min = Math.floor(diff / 60);
            const sec = diff % 60;
            td.textContent = `${min}m ${sec < 10 ? '0' + sec : sec}s`;
            if (min >= 15) td.style.color = "#e74c3c";
        });
    }

    // Eventos
    if (inputBusqueda) inputBusqueda.oninput = () => renderizarOrdenes();
    if (filtroEstado) filtroEstado.onchange = () => renderizarOrdenes();

    setInterval(actualizarTiempos, 1000);

    if (typeof App !== 'undefined') {
        App.registerRender('ordenes', renderizarOrdenes);
    }
});