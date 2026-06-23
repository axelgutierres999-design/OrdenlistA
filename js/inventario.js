// js/inventario.js - GESTIÓN DE STOCK Y RECETAS (SOLUCIÓN DEFINITIVA V6)

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. VERIFICACIÓN DE SESIÓN (REGLA DE ORO)
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || !sesion.restaurante_id) {
        alert("Sesión no válida. Redirigiendo...");
        window.location.href = 'index.html';
        return;
    }
    const restoId = sesion.restaurante_id;

    // --- VARIABLES GLOBALES DE INVENTARIO ---
    const tablaBody = document.getElementById('tablaInventario');
    const inputBusqueda = document.getElementById('busquedaInventario');
    const modalStock = document.getElementById('modalEditarStock');
    const formStock = document.getElementById('formStock');
    
    // --- VARIABLES GLOBALES DE RECETAS ---
    const modalRecetas = document.getElementById('modalRecetas');
    const selectProductoReceta = document.getElementById('selectProductoReceta');
    const selectInsumoReceta = document.getElementById('selectInsumoReceta');
    const listaIngredientes = document.getElementById('listaIngredientes');
    
    // ========================================================================
    // PARTE A: GESTIÓN DE INVENTARIO
    // ========================================================================

    async function cargarInventario(filtro = "") {
        if (!tablaBody || typeof window.db === 'undefined') return;

        try {
            const { data: suministros, error } = await window.db
                .from('suministros')
                .select('*')
                .eq('restaurante_id', restoId) 
                .ilike('nombre', `%${filtro}%`)
                .order('nombre');

            if (error) throw error;

            tablaBody.innerHTML = suministros.map(s => {
                const stockNum = parseFloat(s.cantidad) || 0;
                // Lógica de colores por nivel de stock
                let colorClase = 'suficiente'; 
                if (stockNum <= 0) colorClase = 'agotado';
                else if (stockNum < 5) colorClase = 'bajo';

                return `
                <tr>
                    <td><strong>${s.nombre}</strong></td>
                    <td><mark>${s.categoria || 'General'}</mark></td>
                    <td>
                        <span class="estado-inv ${colorClase}">
                            ${stockNum.toFixed(2)} ${s.unidad}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="outline" onclick="editarInsumo('${s.id}')" title="Editar">✏️</button>
                            <button class="outline secondary" onclick="borrarInsumo('${s.id}')" title="Borrar">🗑️</button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        } catch (err) {
            console.error("Error al cargar inventario:", err.message);
        }
    }

    // --- ACCIONES DE INSUMOS ---
    window.editarInsumo = async (id) => {
        const { data, error } = await window.db
            .from('suministros')
            .select('*')
            .eq('id', id)
            .eq('restaurante_id', restoId)
            .single();

        if (data) {
            document.getElementById('stockId').value = data.id;
            document.getElementById('stockNombre').value = data.nombre;
            document.getElementById('stockCantidad').value = data.cantidad;
            document.getElementById('stockUnidad').value = data.unidad;
            document.getElementById('stockCategoria').value = data.categoria || '';
            modalStock.showModal();
        }
    };

    window.nuevoInsumo = () => {
        if (formStock) formStock.reset();
        document.getElementById('stockId').value = "";
        modalStock.showModal();
    };

    if (formStock) {
        formStock.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('stockId').value;
            
            const datos = {
                nombre: document.getElementById('stockNombre').value.trim(),
                cantidad: parseFloat(document.getElementById('stockCantidad').value),
                unidad: document.getElementById('stockUnidad').value,
                categoria: document.getElementById('stockCategoria').value,
                restaurante_id: restoId
            };

            const query = id 
                ? window.db.from('suministros').update(datos).eq('id', id).eq('restaurante_id', restoId)
                : window.db.from('suministros').insert([datos]);

            const { error } = await query;

            if (!error) {
                modalStock.close();
                cargarInventario();
            } else {
                alert("Error al guardar: " + error.message);
            }
        };
    }

    window.borrarInsumo = async (id) => {
        if (confirm("¿Borrar este insumo? Esto no eliminará las recetas, pero dejarán de descontar stock correctamente.")) {
            const { error } = await window.db
                .from('suministros')
                .delete()
                .eq('id', id)
                .eq('restaurante_id', restoId);
            
            if (!error) cargarInventario();
            else alert("Error al eliminar: " + error.message);
        }
    };

    // ========================================================================
    // PARTE B: GESTIÓN DE RECETAS
    // ========================================================================

    window.abrirGestorRecetas = async () => {
        if (!modalRecetas) return alert("Error: El modal de recetas no existe en el HTML.");
        
        // Cargar Productos y Suministros simultáneamente para mayor velocidad
        const [resProd, resSum] = await Promise.all([
            window.db.from('productos').select('id, nombre').eq('restaurante_id', restoId).order('nombre'),
            window.db.from('suministros').select('id, nombre, unidad').eq('restaurante_id', restoId).order('nombre')
        ]);

        if (selectProductoReceta) {
            selectProductoReceta.innerHTML = '<option value="" disabled selected>Selecciona un Platillo</option>';
            resProd.data?.forEach(p => {
                selectProductoReceta.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
            });
        }

        if (selectInsumoReceta) {
            selectInsumoReceta.innerHTML = '<option value="" disabled selected>Selecciona un Ingrediente</option>';
            resSum.data?.forEach(i => {
                selectInsumoReceta.innerHTML += `<option value="${i.id}">${i.nombre} (${i.unidad})</option>`;
            });
        }

        modalRecetas.showModal();
    };

    if (selectProductoReceta) {
        selectProductoReceta.addEventListener('change', (e) => cargarIngredientesDeReceta(e.target.value));
    }

    async function cargarIngredientesDeReceta(productoId) {
        if (!listaIngredientes) return;
        listaIngredientes.innerHTML = '<li>Cargando receta...</li>';
        
        const { data: receta, error } = await window.db
            .from('recetas')
            .select(`id, cantidad_necesaria, suministros ( nombre, unidad )`)
            .eq('producto_id', productoId)
            .eq('restaurante_id', restoId);

        listaIngredientes.innerHTML = '';
        
        if (receta && receta.length > 0) {
            receta.forEach(r => {
                const nombre = r.suministros?.nombre || 'Insumo no encontrado';
                const unidad = r.suministros?.unidad || '';
                
                const li = document.createElement('li');
                li.className = 'item-ingrediente'; // Clase definida en app.css
                li.innerHTML = `
                    <span>${nombre}: <strong>${r.cantidad_necesaria} ${unidad}</strong></span>
                    <button class="outline secondary" onclick="quitarIngrediente('${r.id}', '${productoId}')" style="padding: 2px 8px; margin:0;">❌</button>
                `;
                listaIngredientes.appendChild(li);
            });
        } else {
            listaIngredientes.innerHTML = '<li style="color:#888;">Este producto no tiene ingredientes configurados.</li>';
        }
    }

    document.getElementById('btnAgregarIngrediente').onclick = async (e) => {
        e.preventDefault();
        const prodId = selectProductoReceta.value;
        const insumoId = selectInsumoReceta.value;
        const cantidad = parseFloat(document.getElementById('cantidadReceta').value);

        if (!prodId || !insumoId || isNaN(cantidad)) {
            return alert("Por favor, selecciona producto, ingrediente y cantidad.");
        }

        const { error } = await window.db.from('recetas').insert([{
            restaurante_id: restoId,
            producto_id: prodId,
            suministro_id: insumoId,
            cantidad_necesaria: cantidad
        }]);

        if (!error) {
            cargarIngredientesDeReceta(prodId);
            document.getElementById('cantidadReceta').value = "";
        } else {
            alert("Error: " + error.message);
        }
    };

    window.quitarIngrediente = async (recetaId, prodId) => {
        const { error } = await window.db
            .from('recetas')
            .delete()
            .eq('id', recetaId)
            .eq('restaurante_id', restoId);
            
        if (!error) cargarIngredientesDeReceta(prodId);
    };

    // --- BUSQUEDA Y REALTIME ---
    if (inputBusqueda) {
        inputBusqueda.addEventListener('input', (e) => cargarInventario(e.target.value));
    }

    // Si App.js está presente, nos suscribimos a cambios para actualizar la tabla automáticamente
    if (typeof App !== 'undefined') {
        App.registerRender('inventario', () => cargarInventario(inputBusqueda?.value || ""));
    }
    
    cargarInventario();
});
// ── Ver insumos faltantes (agotados o stock bajo) ──────────────────
window.verFaltantes = async () => {
    const modal = document.getElementById('modalFaltantes');
    const lista = document.getElementById('listaFaltantes');
    if (!modal || !lista) return;

    lista.innerHTML = '<p style="color:#888;">Revisando inventario...</p>';
    modal.showModal();

    try {
        const { data, error } = await window.db
            .from('suministros')
            .select('nombre, cantidad, unidad, categoria')
            .eq('restaurante_id', restoId)
            .order('cantidad', { ascending: true });

        if (error) throw error;

        // Separar en agotados y bajos (menos de 5 unidades)
        const agotados = data.filter(s => parseFloat(s.cantidad) <= 0);
        const bajos    = data.filter(s => parseFloat(s.cantidad) > 0 && parseFloat(s.cantidad) < 5);

        if (agotados.length === 0 && bajos.length === 0) {
            lista.innerHTML = `
                <div style="text-align:center; padding: 2rem; color: #28a745;">
                    <div style="font-size:3rem;">✅</div>
                    <strong>¡Todo en orden!</strong>
                    <p>No hay insumos agotados ni con stock bajo.</p>
                </div>`;
            return;
        }

        const renderFila = (s, tipo) => {
            const color  = tipo === 'agotado' ? '#dc3545' : '#ffc107';
            const texto  = tipo === 'agotado' ? 'AGOTADO' : 'STOCK BAJO';
            const txtCol = tipo === 'agotado' ? 'white' : '#212529';
            return `
                <div style="display:flex; justify-content:space-between; align-items:center;
                            padding:10px 12px; margin-bottom:8px; border-radius:8px;
                            border-left: 5px solid ${color}; background:#f9f9f9;">
                    <div>
                        <strong>${s.nombre}</strong>
                        <small style="display:block; color:#888;">${s.categoria || 'Sin categoría'}</small>
                    </div>
                    <div style="text-align:right;">
                        <span style="background:${color}; color:${txtCol}; padding:3px 10px;
                                     border-radius:20px; font-size:0.75rem; font-weight:700;">
                            ${texto}
                        </span>
                        <small style="display:block; margin-top:4px; color:#555;">
                            ${parseFloat(s.cantidad).toFixed(2)} ${s.unidad}
                        </small>
                    </div>
                </div>`;
        };

        let html = '';

        if (agotados.length > 0) {
            html += `<p style="font-weight:700; color:#dc3545; margin-bottom:8px;">
                        🔴 Agotados (${agotados.length})</p>`;
            html += agotados.map(s => renderFila(s, 'agotado')).join('');
        }

        if (bajos.length > 0) {
            html += `<p style="font-weight:700; color:#e6a817; margin:16px 0 8px;">
                        🟡 Stock Bajo (${bajos.length})</p>`;
            html += bajos.map(s => renderFila(s, 'bajo')).join('');
        }

        lista.innerHTML = html;

    } catch (err) {
        lista.innerHTML = `<p style="color:#dc3545;">❌ Error al cargar: ${err.message}</p>`;
    }
};