// js/empleados.js - CORREGIDO (Refresco Automático + Realtime)
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

    // Variable para controlar si el usuario puede ver la tabla
    const esAdmin = sesion && (sesion.rol === 'dueño' || sesion.rol === 'admin');

    // --- 1️⃣ RENDERIZAR PERFIL ACTUAL ---
    if (sesion) {
        const restoId = sesion.restaurante_id;

        if (miNombre) miNombre.innerText = sesion.nombre;
        if (miRol) miRol.innerText = sesion.rol.toUpperCase();
        if (miEntrada) miEntrada.innerText = sesion.horaEntrada || "Recién llegado";

        // Foto actualizada desde Supabase
        const { data: usuarioFresco } = await db
            .from('perfiles')
            .select('foto')
            .eq('id', sesion.id)
            .eq('restaurante_id', restoId)
            .single();

        if (miAvatar) miAvatar.src = (usuarioFresco && usuarioFresco.foto) ? usuarioFresco.foto : sesion.foto;

        // Mostrar panel de dueño SI corresponde
        if (esAdmin) {
            cargarPanelDueño(restoId);
        }
    }

    // =====================================================
    // 2️⃣ FUNCIÓN: REGISTRO DE ASISTENCIA (ENTRADA/SALIDA)
    // =====================================================
    window.registrarAsistencia = async (tipo) => {
        if (!sesion || !sesion.id || !sesion.restaurante_id) {
            alert("⚠️ No hay sesión activa.");
            return;
        }

        const hoyISO = new Date().toISOString().split('T')[0];
        const horaActual = new Date().toLocaleTimeString('es-MX', { hour12: false });
        const restoId = sesion.restaurante_id;

        try {
            // Ver si ya marcó entrada hoy
            const { data: registroExistente } = await db
                .from('asistencia')
                .select('*')
                .eq('empleado_id', sesion.id)
                .eq('fecha', hoyISO)
                .eq('restaurante_id', restoId)
                .maybeSingle();

            let exito = false;

            if (!registroExistente && tipo === 'entrada') {
                // Nuevo registro de entrada
                const { error } = await db.from('asistencia').insert([{
                    restaurante_id: restoId,
                    empleado_id: sesion.id,
                    nombre_empleado: sesion.nombre,
                    fecha: hoyISO,
                    hora_entrada: horaActual,
                    hora_salida: null
                }]);

                if (error) throw error;
                
                alert(`✅ Entrada registrada: ${horaActual}`);
                localStorage.setItem('horaEntrada', horaActual);
                if (miEntrada) miEntrada.innerText = horaActual;
                exito = true;

            } else if (registroExistente && tipo === 'salida' && !registroExistente.hora_salida) {
                // Actualizar salida
                const { error } = await db.from('asistencia')
                    .update({ hora_salida: horaActual })
                    .eq('id', registroExistente.id)
                    .eq('restaurante_id', restoId);
                
                if (error) throw error;

                alert(`👋 Salida registrada: ${horaActual}`);
                exito = true;

            } else if (registroExistente && tipo === 'entrada') {
                alert("⚠️ Ya marcaste tu entrada hoy.");
            } else if (registroExistente && registroExistente.hora_salida && tipo === 'salida') {
                alert("⚠️ Ya marcaste tu salida hoy.");
            } else {
                alert("⚠️ No se puede registrar asistencia. Revisa los datos.");
            }

            // 🔥 AQUÍ ESTÁ LA SOLUCIÓN: SI HUBO ÉXITO, RECARGAMOS LA TABLA
            if (exito && esAdmin) {
                console.log("Recargando tabla...");
                cargarPanelDueño(restoId);
            }

        } catch (err) {
            console.error(err);
            alert("❌ Error registrando asistencia: " + err.message);
        }
    };

    // =====================================================
    // 3️⃣ PANEL DEL DUEÑO (EMPLEADOS + ASISTENCIA)
    // =====================================================
    async function cargarPanelDueño(restoId) {
        const panel = document.getElementById('panelDueño');
        if (!panel) return;
        panel.classList.remove('hidden');

        // A) Empleados filtrados por negocio
        const { data: empleados } = await db
            .from('perfiles')
            .select('*')
            .eq('restaurante_id', restoId)
            .order('nombre');

        // B) Asistencia de hoy filtrada
        const hoyISO = new Date().toISOString().split('T')[0];
        const { data: asistenciaHoy } = await db
            .from('asistencia')
            .select('*')
            .eq('fecha', hoyISO)
            .eq('restaurante_id', restoId)
            .order('hora_entrada', { ascending: false }); // Ordenar por más reciente

        renderizarDueño(empleados || [], asistenciaHoy || []);
    }

    function renderizarDueño(empleados, asistencia) {
        const grid = document.getElementById('gridEmpleados');
        const tabla = document.getElementById('tablaAsistenciaCompleta');

        // 1️⃣ Grid de empleados
        if (grid) {
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

        // 2️⃣ Tabla de asistencia
        if (tabla) {
            if (asistencia.length === 0) {
                tabla.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px;">Nadie ha marcado entrada hoy aún.</td></tr>';
            } else {
                tabla.innerHTML = asistencia.map(a => `
                    <tr>
                        <td><strong>${a.nombre_empleado}</strong></td>
                        <td>${a.hora_entrada || '--:--'}</td>
                        <td>${a.hora_salida || '--:--'}</td>
                        <td>${a.hora_salida ? '<span style="color:grey;">Finalizado</span>' : '<span style="color:#2ecc71;">● En turno</span>'}</td>
                    </tr>
                `).join('');
            }
        }
    }

    // =====================================================
    // 4️⃣ CREAR EMPLEADO
    // =====================================================
    const modal = document.getElementById('modalNuevoEmpleado');
    const form = document.getElementById('formNuevoEmpleado');

    window.abrirModalEmpleado = () => modal.showModal();
    window.cerrarModalEmpleado = () => modal.close();

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const restoId = sesion.restaurante_id;
            const nombre = document.getElementById('nombreEmp').value;
            const rol = document.getElementById('rolEmp').value;
            const pin = document.getElementById('pinEmp').value;
            const foto = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=random`;

            const { error } = await db.from('perfiles').insert([{
                restaurante_id: restoId,
                nombre, rol, pin, foto
            }]);

            if (!error) {
                alert(`✅ ${nombre} contratado exitosamente.`);
                form.reset();
                cerrarModalEmpleado();
                cargarPanelDueño(restoId); // Recargar lista empleados
            } else {
                alert("Error creando empleado: " + error.message);
            }
        };
    }

    // =====================================================
    // 5️⃣ BORRAR EMPLEADO
    // =====================================================
    window.borrarEmpleado = async (id) => {
        const restoId = sesion.restaurante_id;
        if (confirm("¿Estás seguro de despedir a este empleado?")) {
            const { error } = await db
                .from('perfiles')
                .delete()
                .eq('id', id)
                .eq('restaurante_id', restoId);

            if (!error) {
                cargarPanelDueño(restoId); // Recargar lista empleados
            } else {
                alert("Error al borrar: " + error.message);
            }
        }
    };

    // =====================================================
    // 6️⃣ ESCUCHA EN TIEMPO REAL (REALTIME)
    // =====================================================
    // Esto hace que si un empleado marca entrada, aparezca 
    // en la pantalla del dueño INSTANTÁNEAMENTE
    if (db.channel && esAdmin) {
        const restoId = sesion.restaurante_id;
        db.channel('asistencia-realtime')
          .on('postgres_changes', 
              { event: '*', schema: 'public', table: 'asistencia', filter: `restaurante_id=eq.${restoId}` }, 
              (payload) => {
                  console.log("Cambio en asistencia detectado:", payload);
                  cargarPanelDueño(restoId);
              }
          )
          .subscribe();
    }
});