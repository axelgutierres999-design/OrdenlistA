// js/inventario.js - GESTIÓN DE STOCK Y RECETAS (SOLUCIÓN DEFINITIVA)

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
    const modalRecetas = document.getElementById('modalRecetas'); // Necesitas agregar este HTML
    const selectProductoReceta = document.getElementById('selectProductoReceta');
    const selectInsumoReceta = document.getElementById('selectInsumoReceta');
    const listaIngredientes = document.getElementById('listaIngredientes');
    
    // ========================================================================
    // PARTE A: GESTIÓN DE INVENTARIO (CORREGIDO)
    // ========================================================================

    async function cargarInventario(filtro = "") {
        if (!tablaBody) return;

        const { data: suministros, error } = await window.db
            .from('suministros')
            .select('*')
            .eq('restaurante_id', restoId) // SIEMPRE FILTRAR POR RESTAURANTE
            .ilike('nombre', `%${filtro}%`)
            .order('nombre');

        if (error) return console.error(error);

        tablaBody.innerHTML = suministros.map(s => {
            const alerta = s.cantidad < 5 ? 'color:red; font-weight:bold;' : 'color:green;';
            return `
            <tr>
                <td>${s.nombre}</td>
                <td><small>${s.categoria || 'Gral.'}</small></td>
                <td style="${alerta}">${parseFloat(s.cantidad).toFixed(3)} ${s.unidad}</td>
                <td>
                    <button class="outline" onclick="editarInsumo('${s.id}')">✏️</button>
                    <button class="outline secondary" onclick="borrarInsumo('${s.id}')">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    }

    // --- ABRIR MODAL STOCK ---
    window.editarInsumo = async (id) => {
        const { data } = await window.db.from('suministros').select('*').eq('id', id).single();
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
        formStock.reset();
        document.getElementById('stockId').value = "";
        modalStock.showModal();
    };

    // --- GUARDAR STOCK (CORRECCIÓN CRÍTICA AQUI) ---
    if (formStock) {
        formStock.onsubmit = async (e) => {
            e.preventDefault();
            
            // LEEMOS LA SESIÓN JUSTO ANTES DE GUARDAR PARA EVITAR ERRORES
            const sesionActual = JSON.parse(localStorage.getItem('sesion_activa'));
            if (!sesionActual) return alert("Error de sesión");

            const id = document.getElementById('stockId').value;
            const datos = {
                nombre: document.getElementById('stockNombre').value.trim(),
                cantidad: parseFloat(document.getElementById('stockCantidad').value),
                unidad: document.getElementById('stockUnidad').value,
                categoria: document.getElementById('stockCategoria').value,
                restaurante_id: sesionActual.restaurante_id // <--- LA CLAVE DEL ÉXITO
            };

            const query = id 
                ? window.db.from('suministros').update(datos).eq('id', id)
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
        if (confirm("¿Borrar este insumo? Si es parte de una receta, afectará el cálculo.")) {
            await window.db.from('suministros').delete().eq('id', id);
            cargarInventario();
        }
    };

    // ========================================================================
    // PARTE B: GESTIÓN DE RECETAS (NUEVA FUNCIÓN)
    // ========================================================================

    // 1. Abrir el Panel de Recetas
    window.abrirGestorRecetas = async () => {
        if (!modalRecetas) return alert("Falta agregar el HTML del modal de recetas.");
        
        // Cargar Productos en el Select
        const { data: productos } = await window.db.from('productos').select('id, nombre').eq('restaurante_id', restoId);
        selectProductoReceta.innerHTML = '<option value="" disabled selected>Selecciona un Platillo</option>';
        productos.forEach(p => {
            selectProductoReceta.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        });

        // Cargar Insumos en el Select
        const { data: insumos } = await window.db.from('suministros').select('id, nombre, unidad').eq('restaurante_id', restoId);
        selectInsumoReceta.innerHTML = '<option value="" disabled selected>Selecciona un Ingrediente</option>';
        insumos.forEach(i => {
            selectInsumoReceta.innerHTML += `<option value="${i.id}" data-unidad="${i.unidad}">${i.nombre} (${i.unidad})</option>`;
        });

        modalRecetas.showModal();
    };

    // 2. Cuando seleccionas un producto, cargar sus ingredientes actuales
    if (selectProductoReceta) {
        selectProductoReceta.addEventListener('change', async (e) => {
            cargarIngredientesDeReceta(e.target.value);
        });
    }

    async function cargarIngredientesDeReceta(productoId) {
        listaIngredientes.innerHTML = 'Cargando...';
        
        const { data: receta, error } = await window.db
            .from('recetas')
            .select(`
                id,
                cantidad_necesaria,
                suministros ( nombre, unidad )
            `)
            .eq('producto_id', productoId)
            .eq('restaurante_id', restoId); // Seguridad

        listaIngredientes.innerHTML = '';
        
        if (receta && receta.length > 0) {
            receta.forEach(r => {
                const nombreInsumo = r.suministros ? r.suministros.nombre : 'Insumo borrado';
                const unidad = r.suministros ? r.suministros.unidad : '';
                
                listaIngredientes.innerHTML += `
                    <li style="display:flex; justify-content:space-between; margin-bottom:0.5rem; padding:0.5rem; background:#f4f4f4; border-radius:5px;">
                        <span>${nombreInsumo}: <strong>${r.cantidad_necesaria} ${unidad}</strong></span>
                        <a href="#" onclick="quitarIngrediente('${r.id}', '${productoId}')" style="color:red; text-decoration:none;">❌</a>
                    </li>
                `;
            });
        } else {
            listaIngredientes.innerHTML = '<small>Este producto aún no tiene receta configurada.</small>';
        }
    }

    // 3. Agregar Ingrediente a la Receta
    document.getElementById('btnAgregarIngrediente').onclick = async (e) => {
        e.preventDefault();
        const prodId = selectProductoReceta.value;
        const insumoId = selectInsumoReceta.value;
        const cantidad = parseFloat(document.getElementById('cantidadReceta').value);

        if (!prodId || !insumoId || isNaN(cantidad)) return alert("Completa los datos de la receta");

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
            alert("Error al agregar ingrediente: " + error.message);
        }
    };

    // 4. Eliminar Ingrediente
    window.quitarIngrediente = async (recetaId, prodId) => {
        await window.db.from('recetas').delete().eq('id', recetaId);
        cargarIngredientesDeReceta(prodId);
    };

    // --- INICIALIZACIÓN ---
    if (inputBusqueda) {
        inputBusqueda.addEventListener('input', (e) => cargarInventario(e.target.value));
    }
    
    cargarInventario();
});