// js/ordenes.js - MONITOR DE COCINA (KDS) - COMPLETO Y CORREGIDO

document.addEventListener('DOMContentLoaded', () => {
    const tablaBody = document.getElementById('tablaBodyOrdenes');
    const filtroEstado = document.getElementById('filtroEstado');
    const inputBusqueda = document.getElementById('inputBusqueda');
    const audio = document.getElementById('audioNotificacion');
    let ultimaCant = 0;

    // --- RENDERIZADO REACTIVO ---
    function renderizarOrdenes(textoFiltro = "") {
        if (!tablaBody || typeof App === 'undefined') return;
        
        // 1. Obtener datos filtrados por negocio desde App.js
        let ordenes = App.getOrdenes();

        // 2. Notificación sonora de nuevas órdenes
        const ordenesActivas = ordenes.filter(o => o.estado !== 'pagado' && o.estado !== 'cancelado');
        if (ordenesActivas.length > ultimaCant && ultimaCant !== 0) {
            if (audio) { 
                audio.currentTime = 0; 
                audio.play().catch(e => console.log("Audio requiere interacción previa", e)); 
            }
        }
        ultimaCant = ordenesActivas.length;

        // 3. Filtrar por estado y búsqueda
        const estadoFiltrado = filtroEstado ? filtroEstado.value : 'todos';
        const filtradas = ordenes.filter(o => {
            const matchEstado = estadoFiltrado === 'todos' || o.estado === estadoFiltrado;
            const term = (textoFiltro || "").toLowerCase();
            const matchTexto = o.id.toLowerCase().includes(term) || o.mesa.toLowerCase().includes(term);
            
            // Regla: No mostrar lo que ya salió del flujo de cocina (pagado/cancelado)
            return matchEstado && matchTexto && o.estado !== 'pagado' && o.estado !== 'cancelado';
        });

        // 4. Dibujar HTML
        tablaBody.innerHTML = ''; 
        
        if (filtradas.length === 0) {
            tablaBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">No hay órdenes activas.</td></tr>';
            return;
        }

        filtradas.forEach(orden => {
            const esQR = orden.estado === 'por_confirmar';
            let estiloFila = '';
            if (esQR) estiloFila = 'background-color: #fff3e0; border-left: 5px solid #f39c12;'; 
            else if (orden.estado === 'terminado') estiloFila = 'background-color: #e8f5e9; border-left: 5px solid #27ae60;';

            const fechaInicio = new Date(orden.fecha || orden.created_at).getTime();
            const celdaTiempo = orden.estado === 'terminado' 
                ? `<td style="color:#27ae60; font-weight:bold;">Listo</td>`
                : `<td class="tiempo-transcurrido" data-inicio="${fechaInicio}" style="font-weight:bold; color:#555;">...</td>`;

            const idLimpio = orden.id.slice(-6).toUpperCase(); 

            // Lógica de botones
            let botonAccion = '';
            if (esQR) {
                botonAccion = `
                    <button onclick="App.aceptarOrdenQR('${orden.id}')" class="primary" style="padding: 4px 8px; font-size:0.75rem;">✅ Aceptar</button>
                    <button onclick="App.eliminarOrden('${orden.id}')" class="secondary outline" style="padding: 4px 8px; font-size:0.75rem;">❌</button>`;
            } else if (orden.estado === 'pendiente') {
                botonAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'proceso')" class="contrast" style="padding: 6px;">👨‍🍳 Cocinar</button>`;
            } else if (orden.estado === 'proceso') {
                botonAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'terminado')" class="primary" style="padding: 6px;">🛎️ Terminar</button>`;
            } else {
                botonAccion = `<span style="font-size:0.8rem; color:gray;">Esperando Pago</span>`;
            }

            const tr = document.createElement('tr');
            tr.style = estiloFila;
            tr.innerHTML = `
                <td><small style="color:#888;">#${idLimpio}</small></td>
                <td><strong>${orden.mesa}</strong> ${orden.comentarios ? '📝' : ''}</td>
                <td><small>${orden.productos}</small></td>
                <td>$${parseFloat(orden.total).toFixed(2)}</td>
                <td><span class="badge" style="background:${getColorEstado(orden.estado)}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${orden.estado.toUpperCase()}</span></td>
                ${celdaTiempo}
                <td>
                    <div style="display:flex; gap:5px; align-items:center;">
                        ${botonAccion}
                        <button class="secondary outline" onclick="abrirTicketVisual('${orden.id}')" style="padding:4px 8px;">👁️</button>
                    </div>
                </td>
            `;
            tablaBody.appendChild(tr);
        });
        actualizarTiempos(); 
    }

    function getColorEstado(estado) {
        const colores = {
            'por_confirmar': '#f39c12',
            'pendiente': '#c0392b',
            'proceso': '#2980b9',
            'terminado': '#27ae60'
        };
        return colores[estado] || '#7f8c8d';
    }

    function actualizarTiempos() {
        document.querySelectorAll('.tiempo-transcurrido').forEach(td => {
            const inicio = parseInt(td.dataset.inicio);
            if (!inicio) return;
            const diff = Math.floor((Date.now() - inicio) / 1000);
            const min = Math.floor(diff / 60);
            const sec = diff % 60;
            td.textContent = `${min}m ${sec}s`;
            if (min >= 15) td.className = 'tiempo-alerta-rojo';
        });
    }

    // --- MODAL DE TICKET ---
    window.abrirTicketVisual = (id) => {
        const o = App.getOrdenes().find(item => item.id === id);
        if (!o) return;
        
        const modal = document.getElementById('modalTicket');
        document.getElementById('t-folio').textContent = o.id.slice(-6).toUpperCase();
        document.getElementById('t-mesa').textContent = o.mesa;
        document.getElementById('t-total').textContent = parseFloat(o.total).toFixed(2);
        document.getElementById('t-fecha').textContent = new Date(o.fecha || o.created_at).toLocaleString();
        
        const tbody = document.getElementById('t-items');
        tbody.innerHTML = '';
        o.productos.split(',').forEach(p => {
            tbody.innerHTML += `<tr><td style="padding:5px 0; border-bottom:1px solid #eee;">${p.trim()}</td></tr>`;
        });
        
        if(o.comentarios) {
            tbody.innerHTML += `<tr><td style="background:#fff3cd; padding:10px;">📝 <strong>Nota:</strong> ${o.comentarios}</td></tr>`;
        }

        modal.style.display = 'flex';
    };

    window.cerrarTicket = () => {
        document.getElementById('modalTicket').style.display = 'none';
    };

    // Listeners
    if (inputBusqueda) inputBusqueda.oninput = (e) => renderizarOrdenes(e.target.value);
    if (filtroEstado) filtroEstado.onchange = () => renderizarOrdenes(inputBusqueda?.value || "");

    setInterval(actualizarTiempos, 1000);

    if (typeof App !== 'undefined') {
        App.registerRender('ordenes', renderizarOrdenes);
        renderizarOrdenes();
    }
});