// js/mesas.js - GESTIÓN DE MESAS, COBROS (QR/TRANSFERENCIA/TERMINAL), CONFIGURACIÓN
document.addEventListener('DOMContentLoaded', async () => {
  const gridMesas = document.getElementById('gridMesas');
  const modalCobro = document.getElementById('modalCobro');

  let mesaActualCobro = null;
  let totalActualCobro = 0;
  let ordenesIdsCobro = [];
  let configRestaurante = {}; // Guardará datos bancarios y URL del QR
  let planoActual = null;
  let stageMonitor = null;
  // =====================================================
  // 1️⃣ INICIALIZACIÓN Y CARGA DE CONFIG
  // =====================================================
  async function esperarAppYRenderizar() {
    if (typeof App !== 'undefined' && App.getOrdenes) {
        await cargarConfigRestaurante(); // Ahora esta función carga TODO
        
        const inputMesas = document.getElementById('inputNumMesas');
        if(inputMesas && configRestaurante.num_mesas) {
            inputMesas.value = configRestaurante.num_mesas;
        }
        const inputWhatsapp = document.getElementById('inputNumWhatsapp');
       if(inputWhatsapp && configRestaurante.whatsapp_numero) {
          inputWhatsapp.value = configRestaurante.whatsapp_numero;
        }

        App.registerRender('mesas', renderizarMesas);
        await renderizarMesas();
    } else {
        setTimeout(esperarAppYRenderizar, 300);
    }
  }

async function cargarConfigRestaurante() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if(!sesion) return;

    try {
        // 1. Cargar Configuración General (para saber num_mesas)
        const { data: configData } = await db.from('restaurantes').select('*').eq('id', sesion.restaurante_id).single();
        if(configData) configRestaurante = configData;

        // 2. Cargar el Plano del Restaurante
        const { data: planoData, error } = await db
            .from('planos')
            .select('estructura')
            .eq('restaurante_id', sesion.restaurante_id)
            .maybeSingle();
        
        // 3. EVALUADOR DE VISTA (¿Usamos Mapa Visual o Cuadrícula Básica?)
        let usarMapaVisual = false;

        if (planoData && planoData.estructura && planoData.estructura.visual) {
            planoActual = planoData.estructura;
            usarMapaVisual = true; // Todo en orden, encendemos el mapa
        }

        if (usarMapaVisual) {
            // ==========================================
            // VISTA 1: INICIAR MAPA VISUAL CON KONVA
            // ==========================================
            document.getElementById('contenedorPlanoVisual').style.display = 'flex'; // ← mostrar solo si hay plano
            if (stageMonitor) stageMonitor.destroy();
            
            stageMonitor = Konva.Node.create(planoActual.visual, 'canvasMesas');

            setTimeout(() => {
                const container = document.getElementById('contenedorPlanoVisual');
                if (!container || !stageMonitor) return;

                const rect = container.getBoundingClientRect();
                stageMonitor.width(rect.width);
                stageMonitor.height(rect.height);

                const dataBox = stageMonitor.getClientRect({ skipTransform: true });
                const contentW = dataBox.width || 800;
                const contentH = dataBox.height || 600;
                const contentX = dataBox.x || 0;
                const contentY = dataBox.y || 0;

                const padding = 40; 
                const scaleX = (rect.width - padding) / contentW;
                const scaleY = (rect.height - padding) / contentH;
                const escala = Math.min(scaleX, scaleY);

                stageMonitor.scale({ x: escala, y: escala });

                const xCentrado = (rect.width - contentW * escala) / 2 - (contentX * escala);
                const yCentrado = (rect.height - contentH * escala) / 2 - (contentY * escala);

                stageMonitor.position({ x: xCentrado, y: yCentrado });

                let mesasDetectadas = stageMonitor.find('.mesa-interactiva');
                if (mesasDetectadas.length === 0) {
                    stageMonitor.find('Group').forEach(g => {
                        if (g.id()) g.name('mesa-interactiva');
                    });
                    mesasDetectadas = stageMonitor.find('.mesa-interactiva');
                }

                mesasDetectadas.forEach(mesaGroup => {
                    mesaGroup.listening(true);
                    mesaGroup.setAttr('cursor', 'pointer');
                    mesaGroup.draggable(false);
                    mesaGroup.getChildren().forEach(child => {
                        child.listening(true);
                        child.draggable(false);
                    });
                });

                stageMonitor.draggable(false);
                stageMonitor.find('Layer').forEach(layer => layer.draggable(false));
                stageMonitor.find('Group').forEach(group => group.draggable(false));

                // Ocultar cuadrícula antigua por si acaso
                const gridAntiguo = document.getElementById('gridMesas');
                if(gridAntiguo) gridAntiguo.style.display = 'none';
                document.getElementById('canvasMesas').style.display = 'block';

                stageMonitor.batchDraw();
                renderizarMesas(); // Llamar de nuevo para pintar colores — esto internamente llama verificarMesasConRetraso

            }, 150);

            // Clic en el fondo del mapa cierra el panel
            stageMonitor.on('click tap', (e) => {
                if (e.target === stageMonitor) {
                    document.getElementById('panelAccionesMesa').style.display = 'none';
                    stageMonitor.find('.mesa-interactiva').forEach(m => {
                        m.to({ scaleX: 1, scaleY: 1, duration: 0.2 });
                    });
                }
            });
            

        } else {
            // ==========================================
            // VISTA 2: FALLBACK A CUADRÍCULA BÁSICA
            // ==========================================
            console.warn("No se encontró plano visual. Activando vista de cuadrícula por defecto.");
            
            document.getElementById('canvasMesas').style.display = 'none';
            const gridAntiguo = document.getElementById('gridMesas');
            if(gridAntiguo) gridAntiguo.style.display = 'grid';
            
            stageMonitor = null; // 🚨 ESTO ES CLAVE: Le dice a renderizarMesas que use el CASO B
        }

    } catch(e) { 
        console.error("Error cargando configuración o plano:", e); 
        // Si hay un error crítico de red, también disparamos la vista por defecto
        stageMonitor = null; 
    }
}

  esperarAppYRenderizar();
 // =====================================================
  // 2️⃣ RENDERIZAR MESAS EN EL PLANO
  // =====================================================
async function renderizarMesas() {
    if (typeof App === 'undefined') return;
    const ordenes = App.getOrdenes();

    const grid = document.getElementById('gridMesas');
    const canvasMesas = document.getElementById('canvasMesas');

    // =====================================================
    // CASO A: SI EXISTE UN PLANO CONFIGURADO (KONVA)
    // =====================================================
    if (stageMonitor) {
        // Mostramos el mapa, ocultamos la cuadrícula de bloques
        if (canvasMesas) canvasMesas.style.display = 'block';
        if (grid) grid.style.display = 'none';

        // 🚨 ASEGURAR BLOQUEO DE MOVIMIENTO DEL MAPA COMPLETO 🚨
        stageMonitor.draggable(false);
        stageMonitor.find('Layer').forEach(layer => layer.draggable(false));
        stageMonitor.find('Group').forEach(group => group.draggable(false));

        // Buscamos las mesas en el plano
        const mesasShapes = stageMonitor.find(node => node.name() === 'mesa-interactiva');

        mesasShapes.forEach(mesaGroup => {
            // Aseguramos que la mesa individual tampoco se mueva
            mesaGroup.draggable(false); 
            
            const idMesa = mesaGroup.id(); 
            const nombreMesaCompleto = `Mesa ${idMesa}`; 
            
           const ESTADOS_ACTIVOS = [
                'por_confirmar',   // desde QR, sin aceptar
                'pendiente',       // aceptada, en cocina
                'preparando',      // en proceso de cocción
                'proceso',         // alias que puede usar cocina.js
                'terminado',       // cocina terminó, mesero debe entregar
                'archivado_cocina',// cocina la marcó como entregada, mesa sigue activa
                'listo',           // alias de terminado en algunas versiones
                'en_mesa'          // entregada físicamente, pendiente de cobro
            ];
            const ordenesMesa = ordenes.filter(o =>
                o.mesa === nombreMesaCompleto && ESTADOS_ACTIVOS.includes(o.estado)
            );

            const ocupada = ordenesMesa.length > 0;
            const totalMesa = ordenesMesa.reduce((acc, orden) => acc + parseFloat(orden.total), 0);

            // Estados por prioridad (una mesa puede tener órdenes en distintos estados)
            const hayPorConfirmar  = ordenesMesa.some(o => o.estado === 'por_confirmar');
            const hayEnCocina      = ordenesMesa.some(o => ['pendiente', 'preparando', 'proceso'].includes(o.estado));
            const hayListasCocina = ordenesMesa.some(o => ['terminado', 'archivado_cocina', 'listo', 'en_mesa'].includes(o.estado));
            const masaDe30Min      = ocupada && ordenesMesa.some(o => {
                const minutos = (Date.now() - new Date(o.created_at).getTime()) / 60000;
                return minutos > 30 && !['terminado', 'archivado_cocina', 'pagado'].includes(o.estado);
            });

            const shapeBase = mesaGroup.findOne('Rect') || mesaGroup.findOne('Circle') || mesaGroup.findOne('Line');
            if (shapeBase) {
                // Morado: cualquier orden lleva más de 30 min SIN importar su estado actual
                // — tiene máxima prioridad para que el encargado actúe
                const masaDe30MinV2 = ocupada && ordenesMesa.some(o => {
                    const minutos = (Date.now() - new Date(o.created_at).getTime()) / 60000;
                    return minutos > 30;
                });

                if (masaDe30MinV2) {
                    shapeBase.fill('#8e44ad');  // 🟣 MORADO: +30 min — máxima prioridad
                    shapeBase.stroke('#6c3483');
                } else if (hayPorConfirmar) {
                    shapeBase.fill('#e74c3c');  // 🔴 ROJO: Esperando confirmación desde QR
                    shapeBase.stroke('#c0392b');
                } else if (hayListasCocina) {
                    shapeBase.fill('#27ae60');  // 🟢 VERDE: Comida lista/entregada, comiendo
                    shapeBase.stroke('#1e8449');
                } else if (hayEnCocina) {
                    shapeBase.fill('#f1c40f');  // 🟡 AMARILLO: En preparación
                    shapeBase.stroke('#d4ac0d');
                } else {
                    shapeBase.fill('#ffffff');  // ⚪ BLANCO: Libre
                    shapeBase.stroke('#10ad93');
                }
                shapeBase.strokeWidth(3);
            }

            // --- EVENTOS DE CLIC PARA ABRIR PANEL ---
            mesaGroup.off('click tap'); // Limpiar eventos previos
            mesaGroup.on('click tap', (e) => {
                e.cancelBubble = true; // Evita que el clic pase al fondo del mapa
                
                // 🛠️ AQUÍ ABRIMOS EL PANEL
                window.mostrarPanelMesa(idMesa, nombreMesaCompleto, ocupada, totalMesa);
                
                // Efecto visual de selección (pequeño zoom)
                mesasShapes.forEach(m => m.to({ scaleX: 1, scaleY: 1, duration: 0.2 })); // Resetea las demás
                mesaGroup.to({ scaleX: 1.08, scaleY: 1.08, duration: 0.2 }); // Agranda la seleccionada
            });

            // Cambiar el cursor a manita
            mesaGroup.on('mouseenter', () => {
                document.body.style.cursor = 'pointer';
            });
            mesaGroup.on('mouseleave', () => {
                document.body.style.cursor = 'default';
            });
        });

        // Refrescar el lienzo para aplicar los cambios de color
        stageMonitor.batchDraw();

        // ← AQUÍ sí existe 'ordenes' porque estamos dentro de renderizarMesas()
        verificarMesasConRetraso(ordenes);
    } 
    // =====================================================
    // CASO B: NO HAY PLANO (SISTEMA DE BLOQUES PROVISIONAL)
    // =====================================================
    else {
        // Ocultamos el canvas vacío y mostramos la cuadrícula
        if (canvasMesas) canvasMesas.style.display = 'none';
        if (!grid) return;
        
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
        grid.style.gap = '20px';
        grid.style.padding = '20px';
        grid.innerHTML = ''; // Limpiar bloques anteriores

        // Tomar el número de mesas de la configuración
        const numMesas = configRestaurante.num_mesas || 10;

        for (let i = 1; i <= numMesas; i++) {
            const nombreMesaCompleto = `Mesa ${i}`;
            
            // Filtrar órdenes
            const ESTADOS_ACTIVOS = [
                'por_confirmar',   // desde QR, sin aceptar
                'pendiente',       // aceptada, en cocina
                'preparando',      // en proceso de cocción
                'proceso',         // alias que puede usar cocina.js
                'terminado',       // cocina terminó, mesero debe entregar
                'archivado_cocina',// cocina la marcó como entregada, mesa sigue activa
                'listo',           // alias de terminado en algunas versiones
                'en_mesa'          // entregada físicamente, pendiente de cobro
            ];
            const ordenesMesa = ordenes.filter(o =>
                o.mesa === nombreMesaCompleto && ESTADOS_ACTIVOS.includes(o.estado)
            );

            const ocupada = ordenesMesa.length > 0;
            const totalMesa = ordenesMesa.reduce((acc, orden) => acc + parseFloat(orden.total), 0);
            const hayListas = ordenesMesa.some(o => o.estado === 'terminado');


            // Colores unificados (igual que en el plano Konva)
            // Mismos estados que en el plano Konva
            const hayPorConfirmar  = ordenesMesa.some(o => o.estado === 'por_confirmar');
            const hayEnCocina      = ordenesMesa.some(o => ['pendiente', 'preparando', 'proceso'].includes(o.estado));
            const hayListasCocina = ordenesMesa.some(o => ['terminado', 'archivado_cocina', 'listo', 'en_mesa'].includes(o.estado));
            // Morado evalúa todos los estados, sin excluir terminado
            const masaDe30MinV2 = ocupada && ordenesMesa.some(o => {
                const minutos = (Date.now() - new Date(o.created_at).getTime()) / 60000;
                return minutos > 30;
            });

            let bgColor = '#ffffff', textColor = '#333', borderColor = '#10ad93';
            if (masaDe30MinV2) {
                bgColor = '#8e44ad'; textColor = '#fff'; borderColor = '#6c3483';
            } else if (hayPorConfirmar) {
                bgColor = '#e74c3c'; textColor = '#fff'; borderColor = '#c0392b';
            } else if (hayListasCocina) {
                bgColor = '#27ae60'; textColor = '#fff'; borderColor = '#1e8449';
            } else if (hayEnCocina) {
                bgColor = '#f1c40f'; textColor = '#000'; borderColor = '#d4ac0d';
            }
            // Crear el bloque HTML
            const mesaDiv = document.createElement('div');
            mesaDiv.className = 'mesa-bloque';
            mesaDiv.style = `
                background: ${bgColor}; 
                color: ${textColor}; 
                border: 3px solid ${borderColor};
                border-radius: 12px; 
                padding: 25px 10px; 
                text-align: center; 
                cursor: pointer; 
                transition: transform 0.2s, box-shadow 0.2s; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            `;
            mesaDiv.innerHTML = `<span style="font-size: 0.9rem; opacity: 0.8;">Mesa</span><strong style="font-size: 2rem;">${i}</strong>`;

            // Efectos Hover
            mesaDiv.onmouseenter = () => { mesaDiv.style.transform = 'translateY(-5px)'; mesaDiv.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)'; };
            mesaDiv.onmouseleave = () => { mesaDiv.style.transform = 'translateY(0)'; mesaDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; };

            // 🛠️ AQUÍ ABRIMOS EL PANEL AL HACER CLIC
            mesaDiv.onclick = (e) => {
                e.stopPropagation(); // Evita que el clic cierre el panel por error
                window.mostrarPanelMesa(i.toString(), nombreMesaCompleto, ocupada, totalMesa);
            };

            grid.appendChild(mesaDiv);
        }

        // Alerta para mesas con retraso en vista de cuadrícula
        verificarMesasConRetraso(ordenes);

        // Clic fuera de los bloques para cerrar el panel
        document.body.onclick = (e) => {
            if (!e.target.closest('#gridMesas') && !e.target.closest('#panelAccionesMesa')) {
                const panel = document.getElementById('panelAccionesMesa');
                if(panel) panel.style.display = 'none';
            }
        };
    }
}
  // =====================================================
  // 3️⃣ LÓGICA DE COBRO (ACTUALIZADA V9.0)
  // =====================================================
  window.abrirModalCobro = (mesa, total) => {
    mesaActualCobro = mesa;
    totalActualCobro = total;

    const ordenes = App.getOrdenes().filter(o =>
      o.mesa === mesa && !['pagado', 'cancelado'].includes(o.estado)
    );
    ordenesIdsCobro = ordenes.map(o => o.id);

    document.getElementById('cobroMesaTitulo').textContent = mesa;
    document.getElementById('cobroTotal').textContent = total.toFixed(2);
    
    // Si tienes un input de efectivo en el HTML, límpialo
    const inputEfec = document.getElementById('inputEfectivo'); 
    if(inputEfec) inputEfec.value = '';

    modalCobro.showModal();
  };

  // Función principal llamada por los botones del HTML (Efectivo / Tarjeta)
  window.procesarPago = async (metodoInicial) => {
    if (!mesaActualCobro || ordenesIdsCobro.length === 0) return;

    // 1. PAGO EFECTIVO (Flujo normal)
    if (metodoInicial === 'efectivo') {
      const entregado = parseFloat(prompt(`💵 Total: $${totalActualCobro.toFixed(2)}\nIngrese monto entregado:`));
      if (isNaN(entregado)) return alert("⚠️ Monto no válido.");
      if (entregado < totalActualCobro) return alert("❌ Falta dinero.");
      
      const cambio = entregado - totalActualCobro;
      alert(`✅ Cambio: $${cambio.toFixed(2)}`);
      await ejecutarTransaccionDB('efectivo');
      return;
    }

    // 2. PAGO TARJETA/DIGITAL (Muestra sub-menú)
    if (metodoInicial === 'tarjeta') {
      mostrarOpcionesDigitales();
    }
  };

  // =====================================================
  // 4️⃣ MENÚ SELECCIÓN PAGO DIGITAL (QR / TRANSF / TERMINAL)
  // =====================================================
  function mostrarOpcionesDigitales() {
    // Cerramos temporalmente el modal de cobro principal si es necesario, 
    // o sobreponemos este nuevo modal.
    
    const div = document.createElement('dialog');
    div.style = "padding:20px; border-radius:15px; border:none; box-shadow:0 10px 30px rgba(0,0,0,0.5); max-width:400px; width:90%";
    div.innerHTML = `
      <header style="text-align:center; margin-bottom:15px;">
        <h3>💳 Tipo de Pago Digital</h3>
        <p>Selecciona la opción para la <b>${mesaActualCobro}</b></p>
      </header>
      <div style="display:flex; flex-direction:column; gap:10px;">
        
        <button id="btnPagoQR" style="padding:15px; background:#fff; border:2px solid #10ad93; color:#10ad93; border-radius:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
          📱 Código QR (CoDi / App)
        </button>

        <button id="btnPagoTransf" style="padding:15px; background:#fff; border:2px solid #3b82f6; color:#3b82f6; border-radius:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
          🏦 Transferencia
        </button>

        <button id="btnPagoTerminal" style="padding:15px; background:#333; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
          📟 Terminal Bancaria
        </button>

      </div>
      <footer style="margin-top:15px; text-align:center;">
        <button id="btnCancelarSel" style="background:transparent; border:none; color:grey; text-decoration:underline; cursor:pointer;">Cancelar</button>
      </footer>
    `;
    document.body.appendChild(div);
    div.showModal();

    // -- LOGICA BOTONES --

    // 1. TERMINAL: Cobro directo y ticket
    div.querySelector('#btnPagoTerminal').onclick = () => {
      div.close();
      ejecutarTransaccionDB('tarjeta'); // Guarda como 'tarjeta' en BD
    };

    // 2. QR: Muestra imagen del QR configurada
    div.querySelector('#btnPagoQR').onclick = () => {
      div.close();
      mostrarModalInfoPago('qr');
    };

    // 3. TRANSFERENCIA: Muestra datos bancarios
    div.querySelector('#btnPagoTransf').onclick = () => {
      div.close();
      mostrarModalInfoPago('transferencia');
    };

    div.querySelector('#btnCancelarSel').onclick = () => div.close();
  }

  // Muestra el detalle (Imagen QR o Texto Banco) y espera confirmación
  function mostrarModalInfoPago(tipo) {
    const dialogInfo = document.createElement('dialog');
    dialogInfo.style = "padding:0; border-radius:15px; border:none; max-width:350px; width:90%; overflow:hidden;";
    
    let contenido = '';
    let titulo = '';

    if (tipo === 'qr') {
      titulo = 'Escanea para Pagar';
      const imgUrl = configRestaurante.qr_pago_url 
        ? configRestaurante.qr_pago_url 
        : 'https://via.placeholder.com/200?text=QR+No+Configurado';
      contenido = `<img src="${imgUrl}" style="width:100%; display:block;">`;
    } else {
      titulo = 'Datos Bancarios';
      const texto = configRestaurante.datos_bancarios 
        ? configRestaurante.datos_bancarios.replace(/\n/g, '<br>') 
        : 'Sin datos configurados.';
      contenido = `<div style="padding:20px; font-size:1.1rem; color:#333; background:#f9f9f9;">${texto}</div>`;
    }

    dialogInfo.innerHTML = `
      <div style="background:#10ad93; color:white; padding:15px; text-align:center;">
        <h3 style="margin:0;">${titulo}</h3>
        <small>Total: $${totalActualCobro.toFixed(2)}</small>
      </div>
      ${contenido}
      <div style="padding:15px; display:flex; gap:10px;">
        <button id="btnConfirmarPago" style="flex:1; background:#10ad93; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold;">✅ Ya Pagaron</button>
        <button onclick="this.closest('dialog').close()" style="flex:1; background:#ccc; border:none; padding:12px; border-radius:8px;">Cerrar</button>
      </div>
    `;

    document.body.appendChild(dialogInfo);
    dialogInfo.showModal();

    dialogInfo.querySelector('#btnConfirmarPago').onclick = async () => {
      dialogInfo.close();
      await ejecutarTransaccionDB(tipo); // Guarda como 'qr' o 'transferencia'
    };
  }

  // =====================================================
  // 5️⃣ EJECUCIÓN REAL DEL COBRO (BASE DE DATOS)
  // =====================================================
  async function ejecutarTransaccionDB(metodo) {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion?.restaurante_id) return alert("Error de sesión.");

    try {
      let todosProductos = [];
      let folio = Date.now();

      // Recopilar productos y actualizar estado
      for (const id of ordenesIdsCobro) {
        const ordenData = App.getOrdenes().find(o => o.id === id);
        if (ordenData) {
          todosProductos = todosProductos.concat(
            typeof ordenData.productos === 'string'
              ? ordenData.productos.split(',')
              : ordenData.productos
          );
          
          // Registrar Venta
          await db.from('ventas').insert([{
            restaurante_id: sesion.restaurante_id,
            mesa: ordenData.mesa,
            productos: ordenData.productos,
            total: ordenData.total,
            metodo_pago: metodo
          }]);
          
          // Cerrar Orden
          await db.from('ordenes').update({ estado: 'pagado' }).eq('id', id);
        }
      }

      // Éxito — cerrar modal y ocultar panel inmediatamente
      alert("✅ Pago registrado correctamente.");
      if(modalCobro.open) modalCobro.close();

      // Ocultar panel de acciones
      const panelAcciones = document.getElementById('panelAccionesMesa');
      if (panelAcciones) panelAcciones.style.display = 'none';

      // Forzar recarga de datos en app.js para que getOrdenes() esté actualizado
      // antes de redibujar — sin esto el mapa sigue mostrando la mesa ocupada
      if (typeof App !== 'undefined') {
          // Esperar 1 segundo para que Supabase haya replicado completamente
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Llamar a cargarDatosIniciales DIRECTAMENTE (que es más agresivo)
          if (App.cargarDatosIniciales) {
              await App.cargarDatosIniciales();
          } else {
              // Fallback si no está expuesto
              App.notifyUpdate();
          }
      } else {
          renderizarMesas();
      }

      // GENERAR TICKET AUTOMÁTICO
      mostrarTicket({
        id: folio,
        mesa: mesaActualCobro,
        total: totalActualCobro,
        productos: todosProductos,
        metodo: metodo // Pasamos el método para que salga en el ticket si quieres
      });

    } catch (error) {
      console.error(error);
      alert("❌ Error al procesar el pago en base de datos.");
    }
  }

  // =====================================================
  // 6️⃣ MOSTRAR TICKET (Resto del código igual)
  // =====================================================
async function mostrarTicket(orden) {
    const modal = document.getElementById('modalTicket');
    
    // 1. LLENADO DE DATOS
    document.getElementById('t-nombre-rest').textContent = configRestaurante.nombre || "Mi Restaurante";
    document.getElementById('t-direccion').textContent = configRestaurante.direccion || "Dirección no registrada";
    document.getElementById('t-telefono').textContent = "Tel: " + (configRestaurante.telefono || "00000000");
    document.getElementById('t-mensaje-agradecimiento').textContent = configRestaurante.mensaje_ticket || "¡GRACIAS POR SU COMPRA!";
    document.getElementById('t-wifi').textContent = configRestaurante.wifi ? `WiFi: ${configRestaurante.wifi}` : "";
    document.getElementById('t-redes').textContent = configRestaurante.instagram ? `@${configRestaurante.instagram}` : "";

    document.getElementById('t-mesa').textContent = orden.mesa;
    document.getElementById('t-fecha').textContent = new Date().toLocaleString();
    document.getElementById('t-folio').textContent = orden.id;
    document.getElementById('t-metodo').textContent = (orden.metodo || 'Efectivo').toUpperCase();

    const total = parseFloat(orden.total);
    const subtotal = total / 1.16;
    const iva = total - subtotal;

    document.getElementById('t-subtotal').textContent = subtotal.toFixed(2);
    document.getElementById('t-iva').textContent = iva.toFixed(2);
    document.getElementById('t-total').textContent = total.toFixed(2);

    const listaProductos = Array.isArray(orden.productos) ? orden.productos : orden.productos.split(',');
    const tbody = document.getElementById('t-items');
    tbody.innerHTML = listaProductos.map(p => `
        <tr>
            <td>1x</td>
            <td>${p.trim()}</td>
            <td style="text-align:right;">—</td>
        </tr>`).join('');

    // 2. BOTÓN WHATSAPP: ENVÍA A NÚMERO PRECONFIGURADO AUTOMÁTICAMENTE
    const btnWhatsapp = document.getElementById('btnWhatsapp');
    btnWhatsapp.onclick = async () => {
        // Obtener número de WhatsApp desde configuración
        const numeroWhatsapp = configRestaurante.whatsapp_numero 
            ? configRestaurante.whatsapp_numero.replace(/\D/g, '') // Solo dígitos
            : null;

        if (!numeroWhatsapp) {
            alert("⚠️ No hay número de WhatsApp configurado en el restaurante.");
            return;
        }

        const areaTicket = document.getElementById('areaImpresion');
        
        // Feedback visual
        const originalText = btnWhatsapp.innerHTML;
        btnWhatsapp.disabled = true;
        btnWhatsapp.innerHTML = "⌛ Generando...";

        try {
            // Convertir ticket a imagen
            const canvas = await html2canvas(areaTicket, {
                scale: 2, // Menor escala para que sea más rápido
                backgroundColor: "#f9f9f9",
                logging: false
            });

            // Convertir canvas a blob
            canvas.toBlob(async (blob) => {
                // Crear FormData para subir a servicio temporal (si lo tienes)
                // O simplemente mostrar la URL como data: URL
                
                const file = new File([blob], `Ticket_${orden.mesa}.png`, { type: "image/png" });
                
                // OPCIÓN 1: Si es móvil, intentar compartir
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: `Ticket ${orden.mesa}`,
                            text: `Ticket del restaurante ${configRestaurante.nombre}`
                        });
                    } catch(e) {
                        console.log('Compartir cancelado');
                    }
                } 
                // OPCIÓN 2: Si es PC, convertir a data URL y abrir WhatsApp Web
                else {
                    // Convertir blob a data URL
                    const reader = new FileReader();
                    reader.onload = () => {
                        const dataUrl = reader.result;
                        
                        // Crear mensaje para WhatsApp
                        const mensaje = `Ticket: ${orden.mesa} | Total: $${total.toFixed(2)}`;
                        
                        // Abrir WhatsApp Web con enlace
                        // Nota: para enviar imagen automática necesitarías un backend
                        // Por ahora, abrimos WhatsApp con un mensaje
                        const urlWhatsapp = `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensaje)}`;
                        window.open(urlWhatsapp, '_blank');
                        
                        alert("Se abrió WhatsApp. Por favor, adjunta manualmente la imagen descargada.");
                    };
                    reader.readAsDataURL(blob);
                }

                btnWhatsapp.disabled = false;
                btnWhatsapp.innerHTML = originalText;
            }, "image/png");

        } catch (error) {
            console.error("Error:", error);
            alert("Error al generar imagen del ticket.");
            btnWhatsapp.disabled = false;
            btnWhatsapp.innerHTML = originalText;
        }
    };

    modal.showModal();
}

  // =====================================================
  // 7️⃣ CONFIGURACIÓN DE MESAS Y QR MÓVIL
  // =====================================================
 window.guardarConfiguracionMesas = async () => {
    // 1. Obtener sesión y validar
    const sesionRaw = localStorage.getItem('sesion_activa');
    if (!sesionRaw) return alert("❌ No hay sesión activa. Reingresa al sistema.");
    
    const sesion = JSON.parse(sesionRaw);
    const restauranteId = sesion.restaurante_id;

    if (!restauranteId) {
        console.error("Sesión detectada pero sin ID de restaurante:", sesion);
        return alert("❌ Error de configuración: ID de restaurante no encontrado.");
    }

    // 2. Validar Input
    const input = document.getElementById('inputNumMesas');
    const n = parseInt(input.value);

    if (isNaN(n) || n <= 0 || n > 100) {
        return alert("⚠️ Por favor, ingresa un número de mesas válido (1-100).");
    }

    try {
        // 3. Ejecutar Update en Supabase/PostgreSQL
        const { data, error } = await db.from('restaurantes')
            .update({ num_mesas: n })
            .eq('id', restauranteId)
            .select(); // El .select() ayuda a confirmar que se cambió

        if (error) throw error;

        // 4. Actualizar estado local y UI
        configRestaurante.num_mesas = n; 
        alert(`✅ ¡Configuración guardada! Ahora tienes ${n} mesas.`);
        
        await renderizarMesas(); 

    } catch (err) { 
        console.error("Error completo:", err); 
        alert("❌ Error al guardar en la base de datos: " + err.message); 
    }
};

  window.agregarPedido = (numMesa) => {
    window.location.href = `menu.html?mesa=Mesa ${numMesa}`;
  };

  window.generarQR = (mesaLabel) => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion?.restaurante_id) return alert("Error sesión.");
    const urlMesa = `${window.location.origin}/pedido.html?rid=${sesion.restaurante_id}&mesa=${encodeURIComponent(mesaLabel)}`;
    
    // Crear modal dinámico para el QR
    const modal = document.createElement('dialog');
    modal.innerHTML = `
      <article style="text-align:center;">
        <h3>📱 QR - ${mesaLabel}</h3>
        <div id="qrCanvas" style="margin:1rem auto;"></div>
        <p style="font-size:0.8rem; color:#555;">Escanea para pedir</p>
        <footer><button onclick="this.closest('dialog').close()">Cerrar</button></footer>
      </article>
    `;
    document.body.appendChild(modal);
    modal.showModal();

    if (typeof QRCode === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js";
      script.onload = () => new QRCode(document.getElementById("qrCanvas"), { text: urlMesa, width: 200, height: 200 });
      document.head.appendChild(script);
    } else {
      new QRCode(document.getElementById("qrCanvas"), { text: urlMesa, width: 200, height: 200 });
    }
  };

  window.guardarNumeroWhatsapp = async () => {
    const sesionRaw = localStorage.getItem('sesion_activa');
    if (!sesionRaw) return alert("❌ No hay sesión activa.");
    
    const sesion = JSON.parse(sesionRaw);
    const restauranteId = sesion.restaurante_id;
    const numero = document.getElementById('inputNumWhatsapp').value.trim();

    if (!numero) {
        return alert("⚠️ Por favor ingresa un número de WhatsApp válido.");
    }

    try {
        const { error } = await db.from('restaurantes')
            .update({ whatsapp_numero: numero })
            .eq('id', restauranteId);

        if (error) throw error;

        configRestaurante.whatsapp_numero = numero;
        alert(`✅ Número de WhatsApp actualizado: ${numero}`);

    } catch (err) { 
        console.error("Error:", err); 
        alert("❌ Error al guardar el número: " + err.message); 
    }
  };
  // =====================================================
  // 8️⃣ PANEL DE CONTROL INFERIOR Y MOVER MESA
  // =====================================================
  
  window.mostrarPanelMesa = (idMesa, nombreMesaCompleto, ocupada, totalMesa) => {
    const panel = document.getElementById('panelAccionesMesa');
    document.getElementById('panelTituloMesa').textContent = nombreMesaCompleto;

    const btnAgregar = document.getElementById('btnPanelAgregar');
    const btnCobrar = document.getElementById('btnPanelCobrar');
    const btnMover = document.getElementById('btnPanelMover');
    const btnTicket = document.getElementById('btnPanelTicket'); // NUEVO
    const btnTotal = document.getElementById('panelTotalMesa');

    if (ocupada) {
        btnTotal.textContent = `Cuenta: $${totalMesa.toFixed(2)}`;
        btnAgregar.textContent = "➕ Agregar más";
        btnCobrar.style.display = "inline-block";
        btnMover.style.display = "inline-block";
        btnTicket.style.display = "inline-block"; // NUEVO
        
        // NUEVO: Lógica para generar un "Pre-Ticket"
        btnTicket.onclick = () => {
            const ordenesMesa = App.getOrdenes().filter(o => o.mesa === nombreMesaCompleto && !['pagado', 'cancelado'].includes(o.estado));
            let todosProductos = [];
            ordenesMesa.forEach(o => {
                todosProductos = todosProductos.concat(typeof o.productos === 'string' ? o.productos.split(',') : o.productos);
            });
            
            // Reutilizamos tu modal de ticket existente
            mostrarTicket({
                id: "PREVIO",
                mesa: nombreMesaCompleto,
                total: totalMesa,
                productos: todosProductos,
                metodo: "Pendiente"
            });
        };

    } else {
        btnTotal.textContent = "Mesa Libre";
        btnAgregar.textContent = "📝 Iniciar Pedido";
        btnCobrar.style.display = "none";
        btnMover.style.display = "none";
        btnTicket.style.display = "none"; // NUEVO
    }

    panel.style.display = "flex";
    btnAgregar.onclick = () => window.agregarPedido(idMesa);
    btnCobrar.onclick = () => window.abrirModalCobro(nombreMesaCompleto, totalMesa);
    document.getElementById('btnPanelQR').onclick = () => window.generarQR(nombreMesaCompleto);
    btnMover.onclick = () => window.cambiarMesa(nombreMesaCompleto);
};

  // Función para transferir la orden a otra mesa
  window.cambiarMesa = async (mesaActual) => {
      const nuevaMesa = prompt(`Vas a mover la orden de ${mesaActual}.\nEscribe el número de la nueva mesa (Ej: 5):`);
      
      if (!nuevaMesa || nuevaMesa.trim() === "") return;

      // Asegurarnos de que tenga el formato "Mesa X"
      const nombreNuevaMesa = nuevaMesa.toLowerCase().includes('mesa') ? nuevaMesa : `Mesa ${nuevaMesa}`;

      try {
          // Buscamos todas las órdenes activas de la mesa vieja y les cambiamos el nombre a la mesa nueva
          const { error } = await db.from('ordenes')
              .update({ mesa: nombreNuevaMesa })
              .eq('mesa', mesaActual)
              .not('estado', 'in', '("pagado","cancelado")'); // Solo movemos lo que no está pagado

          if (error) throw error;

          alert(`✅ Orden transferida con éxito a ${nombreNuevaMesa}`);
          document.getElementById('panelAccionesMesa').style.display = 'none'; // Ocultamos el panel
          
          // Recargamos la página para que el mapa y los datos se refresquen
          window.location.reload(); 
          
      } catch (err) {
          console.error("Error al mover mesa:", err);
          alert("❌ Hubo un error al intentar cambiar la mesa.");
      }
  };
  // Canal propio para mesas — detecta cambios sin depender solo de app.js
  function iniciarRealtimeMesas() {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion?.restaurante_id || typeof db === 'undefined') return;
 
    db.channel(`mesas-monitor-${sesion.restaurante_id}`)
      .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'ordenes',
          filter: `restaurante_id=eq.${sesion.restaurante_id}`
        },
        payload => {
          console.log('[Realtime Mesas] Cambio detectado:', payload.eventType);
          
          // ────────────────────────────────────────────────────────
          // PASO 1: Si App está disponible, pedimos que recargue TODOS
          // sus datos desde Supabase (esto es lo importante)
          // ────────────────────────────────────────────────────────
          if (typeof App !== 'undefined') {
              // Esperar 400ms para que Supabase haya replicado el cambio
              // LUEGO llamar a App.notifyUpdate() que:
              // 1. Dispara todos los callbacks (incluyendo renderizarMesas)
              // 2. Actualiza los badges
              setTimeout(() => {
                  if (App.notifyUpdate) {
                      App.notifyUpdate();
                  }
              }, 400);
          } else {
              // Fallback si App no está inicializado aún
              setTimeout(() => renderizarMesas(), 400);
          }
        }
      )
      .subscribe(status => {
        console.log(`[Realtime Mesas] ${status}`);
      });
  }

  // ────────────────────────────────────────────────────────────────
  // BONUS: Polling cada 3 segundos como respaldo (por si el realtime
  // falla o hay delays de Supabase)
  // ────────────────────────────────────────────────────────────────
  setInterval(() => {
    if (typeof App !== 'undefined' && App.getOrdenes) {
        // Solo refrescar si la página está visible
        if (!document.hidden) {
            renderizarMesas();
        }
    }
  }, 1000); // Cada 3 segundos
         // ─── Alerta de mesas sin cobrar más de 30 minutos ───────────────────
       const alertasMesasDisparadas = new Set();

        function verificarMesasConRetraso(ordenes) {
        ordenes.forEach(o => {
            if (['pagado', 'cancelado', 'entregado'].includes(o.estado)) return;
            const minutos = (Date.now() - new Date(o.created_at).getTime()) / 60000;
            const clave = `alerta_30_${o.id}`;

            if (minutos > 30 && !alertasMesasDisparadas.has(clave)) {
                alertasMesasDisparadas.add(clave);

                // Sonido de alerta
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    [440, 550, 440].forEach((freq, i) => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.frequency.value = freq;
                        osc.type = 'triangle';
                        gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.3);
                        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.25);
                        osc.start(ctx.currentTime + i * 0.3);
                        osc.stop(ctx.currentTime + i * 0.3 + 0.25);
                    });
                } catch(e) {}

                // Toast visual
                if (typeof App !== 'undefined' && App.mostrarToast) {
                    App.mostrarToast('listo',
                        `⏰ ${o.mesa} lleva más de 30 min`,
                        'Considera cobrar o revisar la mesa',
                        'mesas.html'
                    );
                }
            }
        });
    }
 
  iniciarRealtimeMesas();
});