// js/cocina.js - KDS CON DESCUENTO DE STOCK SELECTIVO (SOLO PLATILLOS)

document.addEventListener('DOMContentLoaded', () => {
    const pendientes = document.getElementById('tareasPendientes');
    const enProceso = document.getElementById('tareasEnProceso');
    const terminadas = document.getElementById('tareasTerminadas');

    const estadosContainer = {
        'pendiente': pendientes,
        'proceso': enProceso,
        'terminado': terminadas
    };
    
    // 1. FUNCIÓN PARA DESCONTAR STOCK (SOLO PLATILLOS)
    async function procesarDescuentoStock(productosTexto) {
        const restoId = JSON.parse(localStorage.getItem('sesion_activa'))?.restaurante_id;
        if (!restoId) return;

        // Separar productos (ej: "2x Tacos, 1x Soda")
        const items = productosTexto.split(',').map(p => p.trim());

        for (const item of items) {
            const partes = item.split('x ');
            const cantidad = parseInt(partes[0]) || 1;
            const nombreProducto = partes[1];

            // 1.1 Verificar si es "Platillo" en la tabla productos
            const { data: productoInfo } = await db
                .from('productos')
                .select('categoria')
                .eq('nombre', nombreProducto)
                .eq('restaurante_id', restoId)
                .single();

            // 1.2 SOLO descontar si la categoría es "Platillo"
            if (productoInfo && productoInfo.categoria === 'Platillo') {
                // Buscamos el insumo/producto en suministros para restar la cantidad
                const { data: insumo } = await db
                    .from('suministros')
                    .select('id, cantidad')
                    .eq('nombre', nombreProducto)
                    .eq('restaurante_id', restoId)
                    .single();

                if (insumo) {
                    const nuevaCantidad = Math.max(0, insumo.cantidad - cantidad);
                    await db.from('suministros')
                        .update({ cantidad: nuevaCantidad })
                        .eq('id', insumo.id);
                    console.log(`Inventario: Se restaron ${cantidad} de ${nombreProducto}`);
                }
            }
        }
    }

    function crearTarjetaOrden(orden) {
        let botonHTML = '';
        let colorBorde = '#10ad93'; 

        if (orden.estado === 'pendiente') {
            colorBorde = '#e53935'; 
            botonHTML = `<button class="contrast" data-id="${orden.id}" data-next-status="proceso">Iniciar Tarea</button>`;
        } else if (orden.estado === 'proceso') {
            colorBorde = '#ffb300'; 
            botonHTML = `<button class="secondary" data-id="${orden.id}" data-action="finalizar">Finalizar (Restar Platillos)</button>`;
        } else if (orden.estado === 'terminado') {
            colorBorde = '#10ad93'; 
            botonHTML = `<button style="background: #c62828; border:none; color:white;" data-id="${orden.id}" data-action="eliminar">Quitar de Pantalla</button>`;
        }

        const itemsList = orden.productos.split(',').filter(p => p.trim() !== "");
        const productosHTML = itemsList.map(item => `<li>${item.trim()}</li>`).join('');
        
        return `
            <article class="tarjeta-orden" style="border-left: 5px solid ${colorBorde}; margin-bottom:1rem; padding:10px; background:white; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                <header style="border-bottom:1px solid #eee; padding-bottom:5px;">
                    <h6 style="margin:0;">${orden.mesa}</h6>
                    <small style="color:#888;">ID: ${orden.id.toString().slice(-5)}</small>
                </header>
                <ul style="font-size: 0.9rem; padding-left: 1.2rem; margin: 10px 0;">
                    ${productosHTML}
                </ul>
                ${orden.comentarios ? `<div style="background:#fff3cd; padding:5px; font-size:0.8rem; border-radius:4px;">📝 ${orden.comentarios}</div>` : ''}
                <footer style="margin-top: 10px;">
                    ${botonHTML}
                </footer>
            </article>`;
    }

    function renderizarCocina() {
        if (typeof App === 'undefined') return;
        const ordenes = App.getOrdenes(); 
        Object.values(estadosContainer).forEach(c => { if(c) c.innerHTML = ''; });
        
        ordenes.forEach(orden => {
            if (['pendiente', 'proceso', 'terminado'].includes(orden.estado)) {
                const html = crearTarjetaOrden(orden);
                if (estadosContainer[orden.estado]) {
                    estadosContainer[orden.estado].insertAdjacentHTML('beforeend', html);
                }
            }
        });
    }

    async function manejarClickPanel(event) {
        const target = event.target;
        const ordenId = target.getAttribute('data-id');
        if (!ordenId) return;

        // Acción: Pasar de Pendiente a Proceso
        if (target.getAttribute('data-next-status') === 'proceso') {
            App.updateEstado(ordenId, 'proceso');
        } 
        
        // Acción: Finalizar (Aquí ocurre la magia del stock)
        else if (target.getAttribute('data-action') === 'finalizar') {
            const orden = App.getOrdenes().find(o => o.id === ordenId);
            if (orden) {
                target.disabled = true;
                target.innerText = "Procesando...";
                
                // Restar solo los que sean categoría "Platillo"
                await procesarDescuentoStock(orden.productos);
                
                // Actualizar estado a terminado
                App.updateEstado(ordenId, 'terminado');
            }
        }
        
        // Acción: Eliminar de pantalla
        else if (target.getAttribute('data-action') === 'eliminar') {
            if(confirm('¿Quitar orden de la vista?')) {
                // Solo ocultamos de cocina cambiando el estado interno o eliminando si lo deseas
                App.updateEstado(ordenId, 'completado_oculto'); 
            }
        }
    }

    const panelCocina = document.querySelector('.panel-cocina');
    if (panelCocina) panelCocina.addEventListener('click', manejarClickPanel);
    
    if (typeof App !== 'undefined') {
        App.registerRender('cocina', renderizarCocina);
        renderizarCocina();
    }
});