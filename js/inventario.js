// js/inventario.js - GESTIÓN DE SUMINISTROS (CORREGIDO MULTINEGOCIO)

document.addEventListener('DOMContentLoaded', () => {
    
    // Obtener sesión para la REGLA DE ORO
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion) return;
    const restoId = sesion.restaurante_id;

    // Elementos del DOM
    const tablaBody = document.getElementById('tablaInventario');
    const inputBusqueda = document.getElementById('busquedaInventario');
    const modal = document.getElementById('modalEditarStock');
    
    // Elementos del Formulario
    const inputId = document.getElementById('stockId');
    const inputNombre = document.getElementById('stockNombre');
    const inputCantidad = document.getElementById('stockCantidad');
    const inputUnidad = document.getElementById('stockUnidad');
    const formStock = document.getElementById('formStock');

    // --- RENDERIZADO ---
    function renderizarInventario(filtro = "") {
        if (!tablaBody || typeof App === 'undefined') return;
        
        // App.getSuministros() ya debería venir filtrado por app.js
        const suministros = App.getSuministros();
        const textoFiltro = filtro.toLowerCase();

        const filtrados = suministros.filter(s => 
            s.nombre.toLowerCase().includes(textoFiltro) || 
            (s.categoria && s.categoria.toLowerCase().includes(textoFiltro))
        );

        tablaBody.innerHTML = filtrados.map(s => {
            const estiloAlerta = s.cantidad < 5 ? 'color: #d93526; font-weight: bold;' : '';
            const badgeClase = s.cantidad <= 0 ? 'agotado' : (s.cantidad < 5 ? 'bajo' : 'suficiente');
            
            return `
            <tr>
                <td><strong>${s.nombre}</strong></td>
                <td><mark>${s.categoria || 'General'}</mark></td>
                <td style="${estiloAlerta}">
                    <span class="estado-inv ${badgeClase}">${s.cantidad} ${s.unidad || ''}</span>
                </td>
                <td><button class="outline" onclick="abrirModalEditar('${s.id}')">✏️</button></td>
                <td><button class="outline secondary" onclick="eliminarProducto('${s.id}')">🗑️</button></td>
            </tr>
            `;
        }).join('');
    }

    // --- FUNCIONES GLOBALES ---
    
    window.abrirModalEditar = (id) => {
        const item = App.getSuministros().find(s => s.id == id);
        if (item && modal) {
            document.getElementById('modalTitulo').innerText = "Editar Insumo";
            inputId.value = item.id;
            inputNombre.value = item.nombre;
            inputCantidad.value = item.cantidad;
            inputUnidad.value = item.unidad || '';
            modal.showModal();
        }
    };

    window.abrirNuevoInsumo = () => {
        if (formStock) formStock.reset();
        document.getElementById('modalTitulo').innerText = "Nuevo Insumo";
        inputId.value = ""; // ID vacío significa "Nuevo"
        modal.showModal();
    };

    window.cerrarModalStock = () => {
        if (modal) modal.close();
    };

    // --- GUARDAR (CREAR O EDITAR) ---
    if (formStock) {
        formStock.onsubmit = async (e) => {
            e.preventDefault();
            const id = inputId.value;
            const datos = {
                nombre: inputNombre.value,
                cantidad: parseFloat(inputCantidad.value),
                unidad: inputUnidad.value,
                restaurante_id: restoId // REGLA DE ORO
            };

            let resultado;
            if (id) {
                // UPDATE con filtro de seguridad
                resultado = await db.from('suministros').update(datos).eq('id', id).eq('restaurante_id', restoId);
            } else {
                // INSERT
                resultado = await db.from('suministros').insert([datos]);
            }

            if (!resultado.error) {
                await App.init(); // Recarga datos de Supabase
                cerrarModalStock();
            } else {
                alert("Error: " + resultado.error.message);
            }
        };
    }

    // --- ELIMINAR ---
    window.eliminarProducto = async (id) => {
        if(confirm("¿Eliminar este insumo del inventario?")) {
            const { error } = await db.from('suministros')
                .delete()
                .eq('id', id)
                .eq('restaurante_id', restoId); // REGLA DE ORO
            
            if (!error) {
                await App.init();
            } else {
                alert("Error: " + error.message);
            }
        }
    };

    // Búsqueda
    if (inputBusqueda) {
        inputBusqueda.addEventListener('input', (e) => renderizarInventario(e.target.value));
    }

    // Registro en el sistema central
    if (typeof App !== 'undefined') {
        App.registerRender('inventario', () => renderizarInventario(inputBusqueda?.value || ""));
        renderizarInventario();
    }
});