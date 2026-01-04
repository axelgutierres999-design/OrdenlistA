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