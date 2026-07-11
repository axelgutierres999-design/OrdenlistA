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

    // ================================================================
// 🎙️ SISTEMA DE VOZ — Configuración
// ================================================================
let vozActiva   = false;
let vozOcupada  = false;
const colaVoz   = [];          // Cola de mensajes pendientes
const ordenesPreviamenteLeidas = new Set(); // IDs ya anunciados

// Registro de cuándo se leyó cada orden por última vez
const ultimaLecturaPorId = {};   // { id: timestamp }

// Repetir órdenes en preparación cada 12 min
// Repetir órdenes listas para entrega cada 8 min
const REPETIR_PREPARANDO_MS = 12 * 60 * 1000;
const REPETIR_TERMINADO_MS  =  8 * 60 * 1000;

setInterval(() => {
    if (!vozActiva || vozOcupada) return;
    const ahora = Date.now();

    ordenesLocales.forEach(o => {
        const ultima = ultimaLecturaPorId[o.id] || 0;

        if (o.estado === 'preparando') {
            const limite = ultima
                ? REPETIR_PREPARANDO_MS
                : 5 * 60 * 1000;   // primera repetición a los 5 min
            if (ahora - ultima >= limite) {
                ultimaLecturaPorId[o.id] = ahora;
                hablar(textoOrdenPorEstado(o));
            }
        }

        if (o.estado === 'terminado') {
            const limite = ultima
                ? REPETIR_TERMINADO_MS
                : 2 * 60 * 1000;   // primera alerta a los 2 min sin entrega
            if (ahora - ultima >= limite) {
                ultimaLecturaPorId[o.id] = ahora;
                hablar(textoOrdenPorEstado(o));
            }
        }
    });

    // Limpiar IDs de órdenes que ya no existen
    const idsActivos = new Set(ordenesLocales.map(o => String(o.id)));
    Object.keys(ultimaLecturaPorId).forEach(id => {
        if (!idsActivos.has(id)) delete ultimaLecturaPorId[id];
    });
}, 30_000); // Revisa cada 30 segundos

function hablar(texto, esNota = false) {
    if (!vozActiva) return;
    colaVoz.push({ texto, esNota });
    if (!vozOcupada) procesarColaVoz();
}

function procesarColaVoz() {
    if (colaVoz.length === 0) {
        vozOcupada = false;
        document.getElementById('indicadorVoz').style.display = 'none';
        return;
    }
    vozOcupada = true;
    document.getElementById('indicadorVoz').style.display = 'block';

    const { texto, esNota } = colaVoz.shift();

    const u    = new SpeechSynthesisUtterance(texto);
    u.lang     = 'es-MX';
    u.rate     = esNota ? 0.78 : 0.88;   // notas más lentas
    u.pitch    = esNota ? 0.95 : 1.05;
    u.volume   = 1.0;

    // Preferir voz femenina en español (más clara en cocinas ruidosas)
    const voces   = window.speechSynthesis.getVoices();
    const prioridad = [
        v => v.name.includes('Paulina'),      // macOS México
        v => v.name.includes('Monica'),       // macOS español
        v => v.lang === 'es-MX',
        v => v.lang === 'es-ES',
        v => v.lang.startsWith('es'),
    ];
    for (const fn of prioridad) {
        const voz = voces.find(fn);
        if (voz) { u.voice = voz; break; }
    }

    u.onend   = procesarColaVoz;
    u.onerror = procesarColaVoz;
    window.speechSynthesis.speak(u);
}

// Construir el texto hablado de una orden
function textoOrdenPorEstado(orden) {
    const mesa = orden.mesa || 'sin mesa';
    const mins = Math.round(
        (Date.now() - new Date(orden.created_at).getTime()) / 60000
    );

    // Limpiar productos: "1x Pan" → "un Pan", "2x Tacos" → "dos Tacos"
    // y eliminar el rombo y corchetes de las notas inline
    const numerosALetras = { 1:'un', 2:'dos', 3:'tres', 4:'cuatro',
                             5:'cinco', 6:'seis', 7:'siete', 8:'ocho',
                             9:'nueve', 10:'diez' };

    const items = (orden.productos || '').split(',').map(p => {
        const limpio = p.trim();
        // Extraer cantidad y nombre, quitar [notas]
        const match  = limpio.match(/^(\d+)x\s+(.+?)(?:\s*\[.*?\]\s*)*$/);
        if (match) {
            const cant  = parseInt(match[1]);
            const nombre = match[2].trim();
            const cantStr = numerosALetras[cant] || cant.toString();
            return `${cantStr} ${nombre}`;
        }
        // Si no hay patrón, limpiar corchetes y rombos
        return limpio.replace(/\[.*?\]/g, '').replace(/[◆♦►•]/g, '').trim();
    }).filter(Boolean);

    // Extraer notas especiales de los corchetes (limpias, sin rombos)
    const notasRaw = (orden.productos || '').match(/\[(.+?)\]/g) || [];
    const notasLimpias = notasRaw.map(n =>
        n.replace(/[\[\]◆♦►•]/g, '').trim()
    ).filter(Boolean);

    // Comentario general (quitar "---", "GENERAL:", rombos)
    const comentario = (orden.comentarios || '')
        .replace(/---/g, '')
        .replace(/GENERAL:/gi, '')
        .replace(/[◆♦►•]/g, '')
        .replace(/\|/g, ', ')
        .trim();

    // Construir el mensaje según el estado
    let texto = '';

    if (orden.estado === 'pendiente') {
        texto = `Nueva orden. ${mesa}. `;
        texto += items.join(', ') + '. ';
        // Notas: pausa antes para que el cocinero las escuche bien
        if (notasLimpias.length > 0) {
    texto += 'Atención, tiene notas especiales. ';
    // Encolar las notas por separado con velocidad reducida
    setTimeout(() => {
        hablar('Notas: ' + notasLimpias.join('. '), true);
    }, 100);
}
        if (comentario) texto += `Nota general: ${comentario}. `;
        texto += mins > 0
            ? `El cliente lleva ${mins} ${mins === 1 ? 'minuto' : 'minutos'} esperando.`
            : 'Acaba de llegar.';

    } else if (orden.estado === 'preparando') {
        texto = `Recordatorio. ${mesa} lleva ${mins} ${mins === 1 ? 'minuto' : 'minutos'} en preparación. `;
        texto += items.join(', ') + '. ';
        if (notasLimpias.length > 0) texto += 'Notas: ' + notasLimpias.join('. ') + '. ';

    } else if (orden.estado === 'terminado') {
        texto = `Atención. La orden de ${mesa} está lista para entregar. `;
        texto += items.join(', ') + '. ';
        texto += mins > 0
            ? `Lleva ${mins} ${mins === 1 ? 'minuto' : 'minutos'} esperando entrega.`
            : '';
    }

    return texto;
}

// Cargar voces al inicio (Chrome las carga de forma asíncrona)
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
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
        // ── Detectar órdenes nuevas y anunciarlas por voz ──────────
    if (vozActiva) {
       // Anunciar nuevas órdenes entrantes (pendiente/preparando/terminado)
ordenesLocales
  .filter(o => ['pendiente','preparando','terminado'].includes(o.estado)
               && !ordenesPreviamenteLeidas.has(o.id))
  .forEach(o => {
      ordenesPreviamenteLeidas.add(o.id);
      ultimaLecturaPorId[o.id] = Date.now();
      hablar(textoOrdenPorEstado(o));
  });
    }
    // Limpiar IDs de órdenes que ya no existen (ya entregadas)
    const idsActivos = new Set(ordenesLocales.map(o => o.id));
    ordenesPreviamenteLeidas.forEach(id => {
        if (!idsActivos.has(id)) ordenesPreviamenteLeidas.delete(id);
    });
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
    
    // ================================================================
// 🎙️ TOGGLE DEL BOTÓN DE VOZ
// ================================================================
const btnVoz = document.getElementById('btnVoz');

if (btnVoz) {
    btnVoz.addEventListener('click', () => {
        vozActiva = !vozActiva;

        if (vozActiva) {
            btnVoz.innerHTML = '🔊 Voz: ON';
            btnVoz.style.background = '#10ad93';

            // Truco para "despertar" el motor de voz en Chrome
            // (a veces la primera vez no suena si no hay interacción previa)
            const test = new SpeechSynthesisUtterance('');
            window.speechSynthesis.speak(test);

        } else {
            btnVoz.innerHTML = '🔇 Voz: OFF';
            btnVoz.style.background = '#6c3483';

            // Cancelar cualquier lectura en curso y vaciar la cola
            window.speechSynthesis.cancel();
            colaVoz.length = 0;
            vozOcupada = false;
            document.getElementById('indicadorVoz').style.display = 'none';
        }
    });
}

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