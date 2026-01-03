// js/ordenes.js - MONITOR DE COCINA Y SEGUIMIENTO (KDS) - ACTUALIZADO
document.addEventListener('DOMContentLoaded', () => {
    const tablaBody = document.getElementById('tablaBodyOrdenes');
    const filtroEstado = document.getElementById('filtroEstado');
    const inputBusqueda = document.getElementById('inputBusqueda');
    const audio = document.getElementById('audioNotificacion');
    
    // Variable para controlar el sonido de notificación
    let ultimaCantidadPendientes = 0;

    // --- EXTENSIÓN DE FUNCIONES PARA LA VISTA ---
    // Mapeamos las acciones específicas de esta vista a la lógica central de App
    if (typeof App !== 'undefined') {
        App.aceptarOrdenQR = (id) => App.updateEstado(id, 'pendiente');
        
        // "Eliminar" en realidad cancela para mantener historial, pero lo oculta de la vista activa
        App.eliminarOrden = (id) => App.updateEstado(id, 'cancelado');
        
        App.cambiarEstadoOrden = (id, estado) => App.updateEstado(id, estado);
    }

    // --- RENDERIZADO REACTIVO ---
    function renderizarOrdenes() {
        if (!tablaBody || typeof App === 'undefined') return;
        
        // 1. Obtener datos más recientes desde la memoria de App
        const todasLasOrdenes = App.getOrdenes();

        // 2. Lógica de Notificación de Audio (Solo para nuevas pendientes)
        const ordenesNuevas = todasLasOrdenes.filter(o => o.estado === 'pendiente' || o.estado === 'por_confirmar');
        if (ordenesNuevas.length > ultimaCantidadPendientes) {
            if (audio) { 
                audio.currentTime = 0; 
                audio.play().catch(e => console.log("Interacción requerida para audio")); 
            }
        }
        ultimaCantidadPendientes = ordenesNuevas.length;

        // 3. Filtrar datos según los inputs del usuario
        const estadoSelect = filtroEstado ? filtroEstado.value : 'todos';
        const textoBusqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : "";

        const filtradas = todasLasOrdenes.filter(o => {
            // Regla base: No mostrar pagados ni cancelados en el monitor de cocina
            if (o.estado === 'pagado' || o.estado === 'cancelado') return false;

            // Filtro por Estado (Select)
            const pasaEstado = estadoSelect === 'todos' || o.estado === estadoSelect;
            
            // Filtro por Búsqueda (Input)
            const idStr = o.id.toString().toLowerCase();
            const mesaStr = o.mesa.toLowerCase();
            const pasaTexto = idStr.includes(textoBusqueda) || mesaStr.includes(textoBusqueda);

            return pasaEstado && pasaTexto;
        });

        // 4. Dibujar en el HTML
        tablaBody.innerHTML = ''; 
        
        if (filtradas.length === 0) {
            tablaBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#888;">No hay órdenes activas en este momento.</td></tr>';
            return;
        }

        filtradas.forEach(orden => {
            const esQR = orden.estado === 'por_confirmar';
            let estiloFila = '';
            let claseEstado = '';

            // Estilos visuales según estado
            switch(orden.estado) {
                case 'por_confirmar': 
                    estiloFila = 'background-color: #fff3e0; border-left: 5px solid #f39c12;'; 
                    claseEstado = 'estado-pendiente';
                    break;
                case 'pendiente':
                    estiloFila = 'border-left: 5px solid #c0392b;';
                    claseEstado = 'estado-pendiente';
                    break;
                case 'proceso':
                    estiloFila = 'background-color: #e3f2fd; border-left: 5px solid #2980b9;';
                    claseEstado = 'estado-proceso';
                    break;
                case 'terminado':
                    estiloFila = 'background-color: #e8f5e9; border-left: 5px solid #27ae60;';
                    claseEstado = 'estado-terminado';
                    break;
            }

            // Cálculo de tiempo
            const fechaInicio = new Date(orden.created_at).getTime(); // Usamos created_at de Supabase
            const celdaTiempo = orden.estado === 'terminado' 
                ? `<td style="color:#27ae60; font-weight:bold;">Listo para entregar</td>`
                : `<td class="tiempo-transcurrido" data-inicio="${fechaInicio}" style="font-weight:bold; color:#555;">...</td>`;

            const idCorto = orden.id.toString().slice(-6).toUpperCase(); 

            // Lógica de botones de acción
            let botonesAccion = '';
            
            if (esQR) {
                botonesAccion = `
                    <div role="group">
                        <button onclick="App.aceptarOrdenQR('${orden.id}')" style="background:#f39c12; border-color:#f39c12; color:white; padding:4px 10px;">✅ Aceptar</button>
                        <button onclick="App.eliminarOrden('${orden.id}')" class="outline secondary" style="padding:4px 10px;">❌</button>
                    </div>`;
            } else if (orden.estado === 'pendiente') {
                botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'proceso')" class="contrast">👨‍🍳 Cocinar</button>`;
            } else if (orden.estado === 'proceso') {
                botonesAccion = `<button onclick="App.cambiarEstadoOrden('${orden.id}', 'terminado')" class="primary">🛎️ Terminar</button>`;
            } else {
                botonesAccion = `<small style="color:#7f8c8d;">Esperando cobro...</small>`;
            }

            const tr = document.createElement('tr');
            tr.style = estiloFila;
            tr.innerHTML = `
                <td><small style="color:#888;">#${idCorto}</small></td>
                <td><strong>${orden.mesa}</strong></td>
                <td>
                    ${orden.productos.split(',').map(p => `<div>• ${p.trim()}</div>`).join('')}
                    ${orden.comentarios ? `<div style="margin-top:5px; background:#ffffcc; padding:2px 5px; border-radius:4px; font-size:0.85rem;">📝 ${orden.comentarios}</div>` : ''}
                </td>
                <td><strong>$${parseFloat(orden.total).toFixed(2)}</strong></td>
                <td><span class="${claseEstado}">${orden.estado.toUpperCase()}</span></td>
                ${celdaTiempo}
                <td>
                    <div style="display:flex; gap:10px; align-items:center;">
                        ${botonesAccion}
                        <button class="secondary outline" onclick="abrirTicketVisual('${orden.id}')" style="padding:5px 10px;" title="Ver detalle">👁️</button>
                    </div>
                </td>
            `;
            tablaBody.appendChild(tr);
        });
        actualizarTiempos(); 
    }

    // Cronómetro en vivo
    function actualizarTiempos() {
        document.querySelectorAll('.tiempo-transcurrido').forEach(td => {
            const inicio = parseInt(td.dataset.inicio);
            if (!inicio) return;
            
            const ahora = Date.now();
            const diff = Math.floor((ahora - inicio) / 1000);
            
            // Si la fecha es inválida o futura (error de reloj), corregir
            if(diff < 0) return;

            const min = Math.floor(diff / 60);
            const sec = diff % 60;
            
            td.textContent = `${min}m ${sec}s`;
            
            // Alerta visual si tarda más de 20 mins
            if (min >= 20) td.classList.add('tiempo-alerta-rojo');
            else td.classList.remove('tiempo-alerta-rojo');
        });
    }

    // --- MODAL DE TICKET ---
    window.abrirTicketVisual = (id) => {
        const o = App.getOrdenes().find(item => item.id === id);
        if (!o) return;
        
        const modal = document.getElementById('modalTicket');
        document.getElementById('t-folio').textContent = o.id.toString().slice(-6).toUpperCase();
        document.getElementById('t-mesa').textContent = o.mesa;
        document.getElementById('t-total').textContent = parseFloat(o.total).toFixed(2);
        document.getElementById('t-fecha').textContent = new Date(o.created_at).toLocaleString();
        
        const tbody = document.getElementById('t-items');
        tbody.innerHTML = '';
        o.productos.split(',').forEach(p => {
            tbody.innerHTML += `<tr><td style="padding:5px 0; border-bottom:1px dashed #ccc;">${p.trim()}</td></tr>`;
        });
        
        if(o.comentarios) {
            tbody.innerHTML += `<tr><td style="background:#eee; padding:5px; font-style:italic; margin-top:5px; display:block;">Nota: ${o.comentarios}</td></tr>`;
        }

        modal.style.display = 'flex';
    };

    // Event Listeners
    if (inputBusqueda) inputBusqueda.oninput = () => renderizarOrdenes();
    if (filtroEstado) filtroEstado.onchange = () => renderizarOrdenes();

    // Actualizar reloj cada segundo
    setInterval(actualizarTiempos, 1000);

    // REGISTRO EN APP.JS (Esto conecta la actualización en tiempo real)
    if (typeof App !== 'undefined') {
        // Registramos esta función para que App.js la llame cuando haya cambios en DB
        App.registerRender('ordenes', renderizarOrdenes);
        
        // Forzamos un render inicial por si los datos ya estaban cargados
        renderizarOrdenes();
    }
});