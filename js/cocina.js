// js/cocina.js - MONITOR DE COCINA V7.2 - Canal propio independiente
document.addEventListener('DOMContentLoaded', () => {

    // ================================================================
    // 1️⃣  SESIÓN Y REFERENCIAS AL DOM
    // ================================================================
    const sesion  = JSON.parse(localStorage.getItem('sesion_activa'));
    const restoId = sesion?.restaurante_id;

    const pendientes          = document.getElementById('tareasPendientes');
    const enProceso           = document.getElementById('tareasEnProceso');
    const terminadas          = document.getElementById('tareasTerminadas');
    const pendiente_aceptacion = document.getElementById('tareaspendiente_aceptacion');
    const por_pagar           = document.getElementById('tareaspor_pagar');

    const estadosContainer = {
        'pendiente':            pendientes,
        'preparando':           enProceso,
        'terminado':            terminadas,
        'pendiente_aceptacion': pendiente_aceptacion,
        'por_pagar':            por_pagar
    };

    // ================================================================
    // 2️⃣  DATOS PROPIOS — no depende de App.getOrdenes()
    // ================================================================
    let ordenesLocales = [];

    async function cargarOrdenesLocales() {
        if (!restoId || typeof db === 'undefined') return;
        try {
            const { data, error } = await db
                .from('ordenes')
                .select('*')
                .eq('restaurante_id', restoId)
                .not('estado', 'in', '("entregado","cancelado","pagado","archivado_cocina")')
                .order('created_at', { ascending: true });

            if (error) throw error;
            ordenesLocales = data || [];
            renderizarCocina();
        } catch (err) {
            console.error('Error cargando cocina:', err.message);
        }
    }

    // ================================================================
    // 3️⃣  TARJETA DE ORDEN
    // ================================================================
    function crearTarjetaOrden(orden) {
        let botonHTML  = '';
        let colorBorde = '#10ad93';
        const esParaLlevar = orden.mesa?.toUpperCase().includes('LLEVAR') || orden.mesa?.toUpperCase().includes('LLEV');

        if (orden.estado === 'pendiente_aceptacion') {
            colorBorde = '#f39c12';
            return `
                <article class="tarjeta-orden" style="border-left:8px solid ${colorBorde};margin-bottom:1.2rem;padding:1.2rem;background:white;border-radius:12px;box-shadow:0 4px 10px rgba(0,0,0,0.1);color:#333;">
                    <strong>🛍️ Nuevo Pedido: ${orden.cliente_nombre || 'Cliente'}</strong>
                    <p>Productos: ${orden.productos}</p>
                    <button style="background:#27ae60;color:white;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;margin-right:6px;" onclick="aceptarOrden('${orden.id}')">✅ Aceptar</button>
                    <button style="background:#c0392b;color:white;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;" onclick="cancelarOrden('${orden.id}')">❌ Cancelar</button>
                </article>`;
        }

        if (orden.estado === 'por_pagar') {
            colorBorde = '#3498db';
            return `
                <article class="tarjeta-orden" style="border-left:8px solid ${colorBorde};margin-bottom:1.2rem;padding:1.2rem;background:white;border-radius:12px;box-shadow:0 4px 10px rgba(0,0,0,0.1);color:#333;">
                    <strong>⏱️ Esperando Pago: ${orden.cliente_nombre || 'Cliente'}</strong>
                    <p>Total: $${orden.total}</p>
                    <div style="font-weight:bold;">Pendiente de pago...</div>
                </article>`;
        }

        if (orden.estado === 'pendiente') {
            colorBorde = '#e53935';
            botonHTML  = `<button class="contrast" data-id="${orden.id}" data-action="iniciar"
                            style="width:100%;font-weight:bold;">👨‍🍳 Iniciar Preparación</button>`;
        } else if (orden.estado === 'preparando' || orden.estado === 'proceso') {
            colorBorde = '#ffb300';
            botonHTML  = `<button data-id="${orden.id}" data-action="finalizar"
                            style="width:100%;font-weight:bold;background:#ffb300;border:none;color:white;">✅ Marcar como Listo</button>`;
        } else if (orden.estado === 'terminado') {
            colorBorde = '#10ad93';
            botonHTML  = `<button data-id="${orden.id}" data-action="quitar"
                            style="width:100%;background:#455a64;border:none;color:white;">🥡 Entregar / Archivar</button>`;
        }

        const itemsList    = (orden.productos || '').split(',').filter(p => p.trim() !== '');
        const productosHTML = itemsList.map(item => `
            <li style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;">
                <span>${item.trim()}</span>
                <input type="checkbox" style="width:20px;height:20px;cursor:pointer;">
            </li>`).join('');

        const idVisual = orden.id.toString().slice(-4);

        return `
            <article class="tarjeta-orden" style="border-left:8px solid ${colorBorde};margin-bottom:1.2rem;padding:1.2rem;background:white;border-radius:12px;box-shadow:0 4px 10px rgba(0,0,0,0.1);color:#333;">
                <header style="border-bottom:2px solid #f5f5f5;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong style="font-size:1.2rem;color:#2c3e50;">${orden.mesa}</strong>
                        ${esParaLlevar ? '<span style="background:#e53935;color:white;padding:2px 6px;border-radius:4px;font-size:0.7rem;margin-left:8px;vertical-align:middle;">PARA LLEVAR</span>' : ''}
                    </div>
                    <small style="color:#aaa;font-family:monospace;">#${idVisual}</small>
                </header>

                <ul style="list-style:none;padding:0;margin-bottom:15px;font-size:1.1rem;font-weight:500;">
                    ${productosHTML}
                </ul>

                ${orden.comentarios ? `
                    <div style="background:#fff9c4;color:#5d4037;padding:10px;font-size:0.9rem;border-radius:6px;border-left:4px solid #fbc02d;margin-bottom:15px;">
                        <strong>Nota:</strong> ${orden.comentarios}
                    </div>` : ''}

                <footer style="margin-top:10px;">
                    ${botonHTML}
                </footer>
            </article>`;
    }

    // ================================================================
    // 4️⃣  RENDERIZADO — usa ordenesLocales
    // ================================================================
    function renderizarCocina() {
        // Limpiar columnas
        Object.values(estadosContainer).forEach(c => { if (c) c.innerHTML = ''; });

        const estadosVisibles = ['pendiente', 'preparando', 'proceso', 'terminado',
                                  'pendiente_aceptacion', 'por_pagar'];
        const ordenesCocina = ordenesLocales.filter(o => estadosVisibles.includes(o.estado));

        ordenesCocina.forEach(orden => {
            let key = orden.estado;
            if (key === 'proceso') key = 'preparando';
            if (estadosContainer[key]) {
                estadosContainer[key].insertAdjacentHTML('beforeend', crearTarjetaOrden(orden));
            }
        });

        // Mensaje vacío por columna
        Object.keys(estadosContainer).forEach(key => {
            const el = estadosContainer[key];
            if (el && el.innerHTML === '') {
                el.innerHTML = `<p style="text-align:center;color:#ccc;margin-top:20px;font-style:italic;">Sin pedidos</p>`;
            }
        });
    }

    // ================================================================
    // 5️⃣  ACCIONES DE BOTONES (delegación de eventos)
    // ================================================================
    async function manejarClick(event) {
        const button = event.target.closest('button');
        if (!button) return;

        const ordenId = button.getAttribute('data-id');
        const action  = button.getAttribute('data-action');
        if (!ordenId || !action) return;

        button.disabled  = true;
        const textoOrig  = button.innerText;
        button.innerText = '⌛...';

        try {
            if (action === 'iniciar') {
                await db.from('ordenes').update({ estado: 'preparando' }).eq('id', ordenId);

            } else if (action === 'finalizar') {
                await db.from('ordenes').update({ estado: 'terminado' }).eq('id', ordenId);

            } else if (action === 'quitar') {
                const orden = ordenesLocales.find(o => o.id === ordenId);
                const esParaLlevar = orden?.mesa?.toUpperCase().includes('LLEVAR') ||
                                     orden?.mesa?.toUpperCase().includes('LLEV');
                const nuevoEstado  = esParaLlevar ? 'entregado' : 'archivado_cocina';
                await db.from('ordenes').update({ estado: nuevoEstado }).eq('id', ordenId);
            }
            // El canal Realtime detectará el cambio y llamará cargarOrdenesLocales()
            // automáticamente — no hace falta recargar la página.

        } catch (err) {
            console.error('Error en acción de cocina:', err);
            button.disabled  = false;
            button.innerText = textoOrig;
        }
    }

    const mainCocina = document.querySelector('main') || document.body;
    mainCocina.addEventListener('click', manejarClick);

    // ================================================================
    // 6️⃣  CANAL REALTIME PROPIO
    //      Nombre: 'cocina-monitor-{restoId}'
    //      Distinto a app.js ('resto-{ID}') y ordenes.js ('ordenes-monitor-{ID}')
    // ================================================================
    function iniciarRealtime() {
        if (!restoId || typeof db === 'undefined') return;

        db.channel(`cocina-monitor-${restoId}`)
            .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'ordenes',
                    filter: `restaurante_id=eq.${restoId}`
                },
                payload => {
                    console.log('👨‍🍳 Cocina — cambio detectado:', payload.eventType);
                    cargarOrdenesLocales(); // recarga y redibuja sin recargar página
                }
            )
            .subscribe(status => {
                console.log(`[Realtime Cocina] ${status}`);
            });
    }

    // ================================================================
    // 7️⃣  ARRANQUE
    // ================================================================
    cargarOrdenesLocales();
    iniciarRealtime();

    // Registramos en App como respaldo (por si notifyUpdate() es llamado)
    const registrar = () => {
        if (typeof App === 'undefined' || !App.registerRender) {
            setTimeout(registrar, 500);
            return;
        }
        App.registerRender('cocina', cargarOrdenesLocales);
        console.log('👨‍🍳 Cocina conectada con canal propio ✅');
    };
    registrar();
});

// ── Funciones globales para flujo de pedidos por recoger ─────────────
window.aceptarOrden = async (id) => {
    try {
        const limite = new Date();
        limite.setMinutes(limite.getMinutes() + 10);
        await db.from('ordenes').update({
            estado: 'por_pagar',
            tiempo_aceptacion: new Date().toISOString(),
            limite_pago: limite.toISOString()
        }).eq('id', id);
    } catch (err) { alert('Error al aceptar: ' + err.message); }
};

window.cancelarOrden = async (id) => {
    if (!confirm('¿Cancelar este pedido?')) return;
    try {
        await db.from('ordenes').delete().eq('id', id);
    } catch (err) { alert('Error al cancelar: ' + err.message); }
};