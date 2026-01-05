// js/cocina.js - MONITOR DE COCINA PROFESIONAL (V6.8 - FIXED)
document.addEventListener('DOMContentLoaded', () => {
    const pendientes = document.getElementById('tareasPendientes');
    const enProceso = document.getElementById('tareasEnProceso');
    const terminadas = document.getElementById('tareasTerminadas');

    const estadosContainer = {
        'pendiente': pendientes,
        'preparando': enProceso,
        'terminado': terminadas
    };

    function crearTarjetaOrden(orden) {
        let botonHTML = '';
        let colorBorde = '#10ad93'; 
        let esParaLlevar = orden.mesa.toUpperCase().includes('LLEVAR') || orden.mesa.toUpperCase().includes('LLEV');

        // Definición de botones según el estado
        if (orden.estado === 'pendiente') {
            colorBorde = '#e53935'; 
            botonHTML = `<button class="contrast" data-id="${orden.id}" data-action="iniciar" style="width:100%; font-weight:bold;">👨‍🍳 Iniciar Preparación</button>`;
        } else if (orden.estado === 'preparando' || orden.estado === 'proceso') {
            colorBorde = '#ffb300'; 
            botonHTML = `<button class="secondary" data-id="${orden.id}" data-action="finalizar" style="width:100%; font-weight:bold; background:#ffb300; border:none; color:white;">✅ Marcar como Listo</button>`;
        } else if (orden.estado === 'terminado') {
            colorBorde = '#10ad93'; 
            botonHTML = `<button data-id="${orden.id}" data-action="quitar" style="width:100%; background: #455a64; border:none; color:white;">🥡 Entregar / Archivar</button>`;
        }

        const itemsList = orden.productos.split(',').filter(p => p.trim() !== "");
        const productosHTML = itemsList.map(item => `
            <li style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; display:flex; justify-content:space-between;">
                <span>${item.trim()}</span>
                <input type="checkbox" style="width:20px; height:20px; cursor:pointer;">
            </li>`).join('');
        
        const idVisual = orden.id.toString().slice(-4);
        
        return `
            <article class="tarjeta-orden" style="border-left: 8px solid ${colorBorde}; margin-bottom:1.2rem; padding:1.2rem; background:white; border-radius:12px; box-shadow:0 4px 10px rgba(0,0,0,0.1); color: #333;">
                <header style="border-bottom:2px solid #f5f5f5; padding-bottom:8px; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:1.2rem; color:#2c3e50;">${orden.mesa}</strong>
                        ${esParaLlevar ? '<span style="background:#e53935; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:8px; vertical-align:middle;">PARA LLEVAR</span>' : ''}
                    </div>
                    <small style="color:#aaa; font-family:monospace;">#${idVisual}</small>
                </header>
                
                <ul style="list-style:none; padding:0; margin-bottom:15px; font-size: 1.1rem; font-weight: 500;">
                    ${productosHTML}
                </ul>

                ${orden.comentarios ? `
                    <div style="background:#fff9c4; color:#5d4037; padding:10px; font-size:0.9rem; border-radius:6px; border-left: 4px solid #fbc02d; margin-bottom:15px;">
                        <strong>Nota:</strong> ${orden.comentarios}
                    </div>` : ''}

                <footer style="margin-top: 10px;">
                    ${botonHTML}
                </footer>
            </article>`;
    }

    function renderizarCocina() {
        if (typeof App === 'undefined') return;
        
        // Obtenemos todas las órdenes del App (que ya deben venir filtradas por restaurante)
        const ordenes = App.getOrdenes(); 
        
        // Limpiar contenedores
        Object.values(estadosContainer).forEach(c => { if(c) c.innerHTML = ''; });
        
        // Filtrar y renderizar solo las que pertenecen a cocina (no pagadas todavía o en preparación)
        // EXCEPCIÓN: Mostramos 'terminado' para que el cocinero vea qué falta entregar
        const ordenesCocina = ordenes.filter(o => ['pendiente', 'preparando', 'proceso', 'terminado'].includes(o.estado));

        ordenesCocina.forEach(orden => {
            let estadoKey = orden.estado;
            if (estadoKey === 'proceso') estadoKey = 'preparando';

            if (estadosContainer[estadoKey]) {
                const html = crearTarjetaOrden(orden);
                estadosContainer[estadoKey].insertAdjacentHTML('beforeend', html);
            }
        });

        // Mensaje si no hay órdenes
        Object.keys(estadosContainer).forEach(key => {
            if (estadosContainer[key].innerHTML === '') {
                estadosContainer[key].innerHTML = `<p style="text-align:center; color:#ccc; margin-top:20px; font-style:italic;">Sin pedidos en esta sección</p>`;
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
        button.innerText = "⌛...";

        try {
            if (action === 'iniciar') {
                await App.updateEstado(ordenId, 'preparando');
            } 
            else if (action === 'finalizar') {
                // Al cambiar a 'terminado', el TRIGGER de SQL descuenta el stock
                await App.updateEstado(ordenId, 'terminado');
            }
            else if (action === 'quitar') {
                // Si es una mesa física, el estado 'terminado' se queda hasta que se pague en Mesas.js
                // Si ya estaba pagada (como en Para Llevar), la archivamos como 'entregado'
                await App.updateEstado(ordenId, 'entregado'); 
            }
        } catch (err) {
            console.error("Error en acción de cocina:", err);
            button.disabled = false;
        }
    }

    // Delegación de eventos
    const mainCocina = document.querySelector('main') || document.body;
    mainCocina.addEventListener('click', manejarClickPanel);
    
    // Registro para Realtime
    if (typeof App !== 'undefined') {
        App.registerRender('cocina', renderizarCocina);
        // Forzamos un render inicial por si las órdenes ya están cargadas
        renderizarCocina();
    }
});