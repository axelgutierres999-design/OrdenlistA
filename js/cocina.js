// js/cocina.js - KDS CON DESCUENTO DE INVENTARIO AUTOMÁTICO

document.addEventListener('DOMContentLoaded', () => {
    
    const pendientes = document.getElementById('tareasPendientes');
    const enProceso = document.getElementById('tareasEnProceso');
    const terminadas = document.getElementById('tareasTerminadas');

    const estadosContainer = {
        'pendiente': pendientes,
        'proceso': enProceso,
        'terminado': terminadas
    };
    
    function crearTarjetaOrden(orden) {
        let botonHTML = '';
        let colorBorde = '#10ad93'; 

        if (orden.estado === 'pendiente') {
            colorBorde = '#e53935'; 
            botonHTML = `<button class="contrast" data-id="${orden.id}" data-next-status="proceso">Iniciar Tarea</button>`;
        } else if (orden.estado === 'proceso') {
            colorBorde = '#ffb300'; 
            botonHTML = `<button class="secondary" data-id="${orden.id}" data-next-status="terminado">Finalizar (Descontar Stock)</button>`;
        } else if (orden.estado === 'terminado') {
            colorBorde = '#10ad93'; 
            botonHTML = `<button style="background: #c62828; border:none; color:white;" data-id="${orden.id}" data-action="eliminar">Quitar de Pantalla</button>`;
        }

        const textoProductos = orden.productos;
        const itemsList = textoProductos.split(/,|\n/).filter(p => p.trim() !== "");
        const productosHTML = itemsList.map(item => `<li>${item.trim()}</li>`).join('');
        const idVisual = orden.id.replace('ORD-', '').replace('LLEVAR-', 'LL-');
        
        let bloqueNotas = '';
        if (orden.comentarios && orden.comentarios.trim() !== "") {
            bloqueNotas = `
                <div style="background: #fff3cd; color: #856404; padding: 5px; border-radius: 4px; font-size: 0.85rem; margin-top: 5px; border: 1px dashed #ffeeba;">
                    <strong>📝 Nota:</strong> ${orden.comentarios}
                </div>`;
        }

        return `
            <article class="tarjeta-orden" data-orden-id="${orden.id}" style="border-left: 5px solid ${colorBorde};">
                <header style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                    <h6 style="margin:0;">#${idVisual} | ${orden.mesa}</h6>
                </header>
                <ul style="font-size: 0.9rem; list-style-type: disc; padding-left: 1.2rem; margin-bottom: 10px;">
                    ${productosHTML}
                </ul>
                ${bloqueNotas}
                <footer style="margin-top: 15px;">
                    ${botonHTML}
                </footer>
            </article>`;
    }

    function renderizarCocina() {
        if (typeof App === 'undefined') return;
        const ordenes = App.getOrdenes(); 
        
        Object.values(estadosContainer).forEach(container => { if(container) container.innerHTML = ''; });
        
        ordenes.forEach(orden => {
            if (orden.estado === 'por_confirmar' || orden.estado === 'pagado') return;

            const html = crearTarjetaOrden(orden);
            if (estadosContainer[orden.estado]) {
                estadosContainer[orden.estado].insertAdjacentHTML('beforeend', html);
            }
        });
    }

    function manejarClickPanel(event) {
        const target = event.target;
        const ordenId = target.getAttribute('data-id');
        if (!ordenId) return;

        if (target.matches('[data-next-status]')) {
            const nextStatus = target.getAttribute('data-next-status');
            // Al cambiar a "terminado", el SQL activará el descuento
            App.updateEstado(ordenId, nextStatus);
        } 
        else if (target.getAttribute('data-action') === 'eliminar') {
            if(confirm('¿Borrar de la pantalla?')) {
                App.eliminarOrden(ordenId);
            }
        }
    }

    const panelCocina = document.querySelector('.panel-cocina');
    if (panelCocina) {
        panelCocina.addEventListener('click', manejarClickPanel);
    }
    
    if (typeof App !== 'undefined') {
        App.registerRender('cocina', renderizarCocina);
        renderizarCocina();
    }
});