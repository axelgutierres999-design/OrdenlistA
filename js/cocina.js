// js/cocina.js - KDS FUNCIONAL CON DESCUENTO SELECTIVO

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
        const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
        const restoId = sesion?.restaurante_id;
        if (!restoId || !productosTexto) return;

        const items = productosTexto.split(',').map(p => p.trim());

        for (const item of items) {
            try {
                const partes = item.split('x ');
                if (partes.length < 2) continue;
                
                const cantidad = parseInt(partes[0]) || 1;
                const nombreProducto = partes[1];

                // Verificar si es "Platillo"
                const { data: productoInfo } = await db
                    .from('productos')
                    .select('categoria')
                    .eq('nombre', nombreProducto)
                    .eq('restaurante_id', restoId)
                    .single();

                if (productoInfo && productoInfo.categoria === 'Platillo') {
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
                        console.log(`✅ Stock descontado: ${nombreProducto}`);
                    }
                }
            } catch (err) {
                console.error("Error al descontar stock de item:", item, err);
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

        const itemsList = orden.productos.split(/,|\n/).filter(p => p.trim() !== "");
        const productosHTML = itemsList.map(item => `<li>${item.trim()}</li>`).join('');
        const idVisual = orden.id.toString().includes('-') ? orden.id.split('-')[1] : orden.id.toString().slice(-4);
        
        return `
            <article class="tarjeta-orden" style="border-left: 5px solid ${colorBorde}; margin-bottom:1.2rem; padding:1rem; background:white; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                <header style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom: 10px;">
                    <h6 style="margin:0;">#${idVisual} | ${orden.mesa}</h6>
                </header>
                <ul style="font-size: 0.9rem; padding-left: 1.2rem; margin-bottom: 10px;">
                    ${productosHTML}
                </ul>
                ${orden.comentarios ? `<div style="background:#fff3cd; color:#856404; padding:5px; font-size:0.8rem; border-radius:4px; border: 1px dashed #ffeeba;">📝 ${orden.comentarios}</div>` : ''}
                <footer style="margin-top: 15px;">
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
            // Solo mostrar estados de cocina
            if (['pendiente', 'proceso', 'terminado'].includes(orden.estado)) {
                const html = crearTarjetaOrden(orden);
                if (estadosContainer[orden.estado]) {
                    estadosContainer[orden.estado].insertAdjacentHTML('beforeend', html);
                }
            }
        });
    }

    // --- CORRECCIÓN EN EL MANEJO DE CLICS ---
    async function manejarClickPanel(event) {
        const target = event.target;
        const ordenId = target.getAttribute('data-id');
        if (!ordenId) return;

        // 1. Iniciar Tarea (De Pendiente a Proceso)
        const nextStatus = target.getAttribute('data-next-status');
        if (nextStatus === 'proceso') {
            await App.updateEstado(ordenId, 'proceso');
        } 
        
        // 2. Finalizar (Descuenta stock y pasa a Terminado)
        else if (target.getAttribute('data-action') === 'finalizar') {
            const orden = App.getOrdenes().find(o => o.id.toString() === ordenId.toString());
            if (orden) {
                target.disabled = true;
                target.innerText = "Procesando...";
                await procesarDescuentoStock(orden.productos);
                await App.updateEstado(ordenId, 'terminado');
            }
        }
        
        // 3. Eliminar de pantalla
        else if (target.getAttribute('data-action') === 'eliminar') {
            if(confirm('¿Quitar orden de la pantalla?')) {
                // Usamos eliminarOrden para que desaparezca totalmente
                await App.eliminarOrden(ordenId);
            }
        }
    }

    // Escuchar clics en todo el MAIN para que no falle la delegación
    const mainCocina = document.querySelector('main.panel-cocina');
    if (mainCocina) {
        mainCocina.addEventListener('click', manejarClickPanel);
    }
    
    if (typeof App !== 'undefined') {
        App.registerRender('cocina', renderizarCocina);
        renderizarCocina();
    }
});