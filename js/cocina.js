// js/cocina.js - MONITOR DE COCINA PROFESIONAL (V7.1 - FIX ARCHIVADO SIN CIERRE DE MESA)
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
        let esParaLlevar = orden.mesa?.toUpperCase().includes('LLEVAR') || orden.mesa?.toUpperCase().includes('LLEV');

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

        const itemsList = (orden.productos || '').split(',').filter(p => p.trim() !== "");
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
        
        const ordenes = App.getOrdenes(); 
        
        // Limpiar contenedores
        Object.values(estadosContainer).forEach(c => { if (c) c.innerHTML = ''; });
        
        // Filtrar órdenes relevantes (Solo las que están en proceso de cocina)
        const ordenesCocina = ordenes.filter(o => ['pendiente', 'preparando', 'proceso', 'terminado'].includes(o.estado));

        ordenesCocina.forEach(orden => {
            let estadoKey = orden.estado;
            if (estadoKey === 'proceso') estadoKey = 'preparando';
            if (estadosContainer[estadoKey]) {
                const html = crearTarjetaOrden(orden);
                estadosContainer[estadoKey].insertAdjacentHTML('beforeend', html);
            }
        });

        // Mostrar mensaje si no hay pedidos
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
        const textoOriginal = button.innerText;
        button.innerText = "⌛...";

        try {
            if (action === 'iniciar') {
                await App.updateEstado(ordenId, 'preparando');
            } 
            else if (action === 'finalizar') {
                await App.updateEstado(ordenId, 'terminado');
            }
            else if (action === 'quitar') {
                // --- PUNTO 1 CORREGIDO ---
                const orden = App.getOrdenes().find(o => o.id == ordenId);
                const esParaLlevar = orden?.mesa?.toUpperCase().includes('LLEVAR') || orden?.mesa?.toUpperCase().includes('LLEV');

                if (esParaLlevar) {
                    // Para llevar: Cerramos la orden completamente
                    await App.updateEstado(ordenId, 'entregado'); 
                } else {
                    // Para mesa: La quitamos de cocina pero la dejamos activa en el sistema de mesas
                    await App.updateEstado(ordenId, 'archivado_cocina'); 
                }
            }
        } catch (err) {
            console.error("Error en acción de cocina:", err);
            button.disabled = false;
            button.innerText = textoOriginal;
        }
    }

    // Delegación de eventos
    const mainCocina = document.querySelector('main') || document.body;
    mainCocina.addEventListener('click', manejarClickPanel);

    // --- MONTAJE FINAL Y SINCRONIZACIÓN ---
    const iniciarModuloCocina = () => {
        if (typeof App === 'undefined' || !App.getOrdenes) {
            console.warn("⏳ App aún no está listo, reintentando...");
            setTimeout(iniciarModuloCocina, 800);
            return;
        }

        App.registerRender('cocina', renderizarCocina);
        renderizarCocina(); // Render inicial

        console.log("👨‍🍳 Cocina conectada al sistema en tiempo real ✅");
    };

    iniciarModuloCocina();
});