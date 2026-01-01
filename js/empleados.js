// js/empleados.js - GESTIÓN EN LA NUBE (VERSIÓN MULTINEGOCIO)

document.addEventListener('DOMContentLoaded', async () => {
    // Validar conexión
    if (typeof db === 'undefined') {
        console.error("Falta db connection en empleados.js");
        return;
    }

    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    
    // UI Elements
    const miNombre = document.getElementById('miNombre');
    const miRol = document.getElementById('miRol');
    const miEntrada = document.getElementById('miEntrada');
    const miAvatar = document.getElementById('miAvatar');

    // --- 1. RENDERIZAR MI PERFIL (Datos de sesión) ---
    if (sesion) {
        const restoId = sesion.restaurante_id; // REGLA DE ORO

        if(miNombre) miNombre.innerText = sesion.nombre;
        if(miRol) miRol.innerText = sesion.rol.toUpperCase();
        if(miEntrada) miEntrada.innerText = sesion.horaEntrada || "Recién llegado";
        
        // Traer foto fresca desde Supabase por si cambió
        const { data: usuarioFresco } = await db
            .from('perfiles')
            .select('foto')
            .eq('id', sesion.id)
            .eq('restaurante_id', restoId) // Filtro de seguridad
            .single();
            
        if(miAvatar) miAvatar.src = (usuarioFresco && usuarioFresco.foto) ? usuarioFresco.foto : sesion.foto;

        // --- 2. LÓGICA SOLO PARA DUEÑO ---
        if (sesion.rol === 'dueño' || sesion.rol === 'admin') {
            cargarPanelDueño(restoId);
        }
    }

    // --- FUNCIONES DEL DUEÑO ---
    async function cargarPanelDueño(restoId) {
        const panel = document.getElementById('panelDueño');
        if(!panel) return;
        panel.classList.remove('hidden');

        // A) Obtener Empleados (Perfiles) FILTRADOS por negocio
        const { data: empleados } = await db
            .from('perfiles')
            .select('*')
            .eq('restaurante_id', restoId) // REGLA DE ORO
            .order('nombre');
        
        // B) Obtener Asistencia de HOY FILTRADA por negocio
        const hoyISO = new Date().toISOString().split('T')[0];
        const { data: asistenciaHoy } = await db
            .from('asistencia')
            .select('*')
            .eq('fecha', hoyISO)
            .eq('restaurante_id', restoId); // REGLA DE ORO

        renderizarDueño(empleados || [], asistenciaHoy || []);
    }

    function renderizarDueño(empleados, asistencia) {
        const grid = document.getElementById('gridEmpleados');
        const tabla = document.getElementById('tablaAsistenciaCompleta');

        // 1. Grid de Tarjetas
        if(grid) {
            grid.innerHTML = empleados.map(u => `
                <div class="card-mini">
                    <img src="${u.foto || 'https://ui-avatars.com/api/?name=User'}" alt="${u.nombre}">
                    <h5 style="margin-bottom:0; font-size:1rem;">${u.nombre}</h5>
                    <small style="color:#666;">${u.rol.toUpperCase()}</small>
                    <div style="margin-top:10px; font-size:0.8rem;">
                        PIN: <strong>${u.pin}</strong>
                    </div>
                    ${u.rol !== 'dueño' ? `<button onclick="borrarEmpleado('${u.id}')" style="background:none; border:none; color:red; font-size:0.8rem; cursor:pointer; margin-top:5px;">Eliminar</button>` : ''}
                </div>
            `).join('');
        }

        // 2. Tabla de Asistencia
        if(tabla) {
            tabla.innerHTML = asistencia.map(a => `
                <tr>
                    <td><strong>${a.nombre_empleado}</strong></td>
                    <td>${a.hora_entrada}</td>
                    <td>${a.hora_salida || '--:--'}</td>
                    <td>${a.hora_salida !== '--:--' ? '<span style="color:grey;">Finalizado</span>' : '<span style="color:#2ecc71;">● En turno</span>'}</td>
                </tr>
            `).join('');
            
            if(asistencia.length === 0) {
                tabla.innerHTML = '<tr><td colspan="4" style="text-align:center">Nadie ha marcado entrada hoy aún.</td></tr>';
            }
        }
    }

    // --- AGREGAR EMPLEADO (INSERT con restaurante_id) ---
    const modal = document.getElementById('modalNuevoEmpleado');
    const form = document.getElementById('formNuevoEmpleado');

    window.abrirModalEmpleado = () => modal.showModal();
    window.cerrarModalEmpleado = () => modal.close();

    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const restoId = sesion.restaurante_id;
            
            const nombre = document.getElementById('nombreEmp').value;
            const rol = document.getElementById('rolEmp').value;
            const pin = document.getElementById('pinEmp').value;
            const foto = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=random`;

            const { error } = await db.from('perfiles').insert([{
                restaurante_id: restoId, // REGLA DE ORO
                nombre: nombre,
                rol: rol,
                pin: pin,
                foto: foto
            }]);

            if (!error) {
                alert(`✅ ${nombre} contratado exitosamente.`);
                form.reset();
                cerrarModalEmpleado();
                cargarPanelDueño(restoId);
            } else {
                alert("Error creando empleado: " + error.message);
            }
        };
    }

    // --- BORRAR EMPLEADO (DELETE con filtro de seguridad) ---
    window.borrarEmpleado = async (id) => {
        const restoId = sesion.restaurante_id;
        if(confirm("¿Estás seguro de despedir a este empleado?")) {
            const { error } = await db
                .from('perfiles')
                .delete()
                .eq('id', id)
                .eq('restaurante_id', restoId); // REGLA DE ORO
            
            if(!error) {
                cargarPanelDueño(restoId);
            } else {
                alert("Error al borrar: " + error.message);
            }
        }
    };
});