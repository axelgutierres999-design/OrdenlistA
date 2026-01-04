// js/cocina.js - MONITOR DE COCINA PROFESIONAL (V6 - TRIGGER SYNC)
document.addEventListener('DOMContentLoaded', () => {
    const pendientes = document.getElementById('tareasPendientes');
    const enProceso = document.getElementById('tareasEnProceso');
    const terminadas = document.getElementById('tareasTerminadas');

    const estadosContainer = {
        'pendiente': pendientes,
        'preparando': enProceso, // Cambiado 'proceso' por 'preparando' para ser fiel al SQL
        'terminado': terminadas
    };

    // NOTA: Ya no necesitamos "procesarDescuentoStock" aquí. 
    // Tu SQL Trigger lo hace automáticamente cuando el estado cambia a 'terminado'.

    function crearTarjetaOrden(orden) {
        let botonHTML = '';
        let colorBorde = '#10ad93'; 

        // Definición de botones y colores según el estado
        if (orden.estado === 'pendiente') {
            colorBorde = '#e53935'; 
            botonHTML = `<button class="contrast" data-id="${orden.id}" data-action="iniciar">👨‍🍳 Iniciar Tarea</button>`;
        } else if (orden.estado === 'preparando') {
            colorBorde = '#ffb300'; 
            botonHTML = `<button class="secondary" data-id="${orden.id}" data-action="finalizar">✅ Terminar y Descontar</button>`;
        } else if (orden.estado === 'terminado') {
            colorBorde = '#10ad93'; 
            botonHTML = `<button style="background: #c62828; border:none; color:white;" data-id="${orden.id}" data-action="quitar">🗑️ Quitar de Pantalla</button>`;
        }

        const itemsList = orden.productos.split(',').filter(p => p.trim() !== "");
        const productosHTML = itemsList.map(item => `<li>${item.trim()}</li>`).join('');
        
        // ID Visual corto
        const idVisual = orden.id.toString().slice(-4);
        
        return `
            <article class="tarjeta-orden" style="border-left: 5px solid ${colorBorde}; margin-bottom:1.2rem; padding:1rem; background:white; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.1); color: #333;">
                <header style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom: 10px; display:flex; justify-content:space-between;">
                    <strong style="font-size:1.1rem;">${orden.mesa}</strong>
                    <small style="color:#888;">#${idVisual}</small>
                </header>
                <ul style="font-size: 1rem; padding-left: 1.2rem; margin-bottom: 10px; font-weight: 500;">
                    ${productosHTML}
                </ul>
                ${orden.comentarios ? `<div style="background:#fff3cd; color:#856404; padding:8px; font-size:0.85rem; border-radius:4px; border: 1px dashed #ffeeba; margin-bottom:10px;">📝 <strong>Nota:</strong> ${orden.comentarios}</div>` : ''}
                <footer style="margin-top: 10px;">
                    ${botonHTML}
                </footer>
            </article>`;
    }

    function renderizarCocina() {
        if (typeof App === 'undefined') return;
        const ordenes = App.getOrdenes(); 
        
        // Limpiar contenedores
        Object.values(estadosContainer).forEach(c => { if(c) c.innerHTML = ''; });
        
        ordenes.forEach(orden => {
            // Mapeo de estados para asegurar que caigan en el contenedor correcto
            let estadoKey = orden.estado;
            if (estadoKey === 'preparando' || estadoKey === 'proceso') estadoKey = 'preparando';

            if (estadosContainer[estadoKey]) {
                const html = crearTarjetaOrden(orden);
                estadosContainer[estadoKey].insertAdjacentHTML('beforeend', html);
            }
        });
    }

    async function manejarClickPanel(event) {
        const button = event.target.closest('button');
        if (!button) return;

        const ordenId = button.getAttribute('data-id');
        const action = button.getAttribute('data-action');
        if (!ordenId) return;

        button.disabled = true;

        try {
            if (action === 'iniciar') {
                await App.updateEstado(ordenId, 'preparando');
            } 
            else if (action === 'finalizar') {
                // Al cambiar a 'terminado', el TRIGGER de SQL descuenta el stock automáticamente
                await App.updateEstado(ordenId, 'terminado');
                console.log("Orden terminada. El SQL se encarga del stock.");
            }
            else if (action === 'quitar') {
                // Solo quitamos de pantalla (no eliminamos de DB para no perder historial de cocina)
                // O si prefieres borrarla: await App.eliminarOrden(ordenId);
                await App.updateEstado(ordenId, 'entregado'); 
            }
        } catch (err) {
            console.error("Error en acción de cocina:", err);
            button.disabled = false;
        }
    }

    // Delegación de eventos en los contenedores
    const mainCocina = document.querySelector('main') || document.body;
    mainCocina.addEventListener('click', manejarClickPanel);
    
    // Registro en el núcleo App para Realtime
    if (typeof App !== 'undefined') {
        App.registerRender('cocina', renderizarCocina);
    }
});