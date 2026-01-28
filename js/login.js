// js/login.js - VERSIÓN FINAL CORREGIDA
document.addEventListener('DOMContentLoaded', async () => {
    const btnEntrar = document.getElementById('btnEntrar');
    const userPinInput = document.getElementById('userPin');
    const userSelect = document.getElementById('userSelect');
    const pasoRestaurante = document.getElementById('pasoRestaurante');
    const pasoLogin = document.getElementById('pasoLogin');
    const tituloRestaurante = document.getElementById('tituloRestaurante');
    const formRest = document.getElementById('formRestaurante');
    const formLogin = document.getElementById('formLogin');

    // 1. Verificar configuración previa en el navegador
    const restGuardado = JSON.parse(localStorage.getItem('config_restaurante'));
    if (restGuardado) {
        pasoRestaurante.classList.add('hidden');
        pasoLogin.classList.remove('hidden');
        if (tituloRestaurante) tituloRestaurante.textContent = restGuardado.nombre;
        cargarUsuarios(restGuardado.id);
    }

    // 2. Paso 1: Vincular Negocio (Búsqueda por correo_admin)
    if (formRest) {
        formRest.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombreBusqueda = document.getElementById('nombreRestaurante').value.trim();
            const correoBusqueda = document.getElementById('correoAdmin').value.trim().toLowerCase();
            
            if (!window.db) return alert("❌ Sin conexión a la base de datos");

            const { data: restaurante, error: errRest } = await window.db
                .from('restaurantes')
                .select('id, nombre, correo_admin')
                .eq('correo_admin', correoBusqueda)
                .maybeSingle();

            if (errRest) {
                console.error("Error Supabase:", errRest);
                return alert("Error al consultar la base de datos.");
            }

            if (!restaurante) {
                return alert("No existe ningún restaurante registrado con el correo: " + correoBusqueda);
            }

            if (restaurante.nombre.toLowerCase() !== nombreBusqueda.toLowerCase()) {
                return alert("El nombre del restaurante no coincide con el registro oficial.");
            }

            // Éxito: Guardamos la vinculación
            localStorage.setItem('config_restaurante', JSON.stringify({
                id: restaurante.id,
                nombre: restaurante.nombre
            }));
            
            alert("¡Vínculo exitoso con " + restaurante.nombre + "!");
            location.reload();
        });
    }

    // 3. Cargar Usuarios (LLENAR EL SELECTOR)
    async function cargarUsuarios(restauranteId) {
        if (!window.db) return;

        const { data, error } = await window.db
            .from('perfiles')
            .select('id, nombre, rol')
            .eq('restaurante_id', restauranteId)
            .order('nombre', { ascending: true });

        if (error) {
            console.error("Error cargando usuarios:", error);
            return;
        }

        if (userSelect) {
            userSelect.innerHTML = '<option value="" disabled selected>Selecciona tu nombre</option>';
            if (data && data.length > 0) {
                data.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = `${u.nombre} (${u.rol})`;
                    userSelect.appendChild(opt);
                });
            } else {
                userSelect.innerHTML = '<option value="" disabled>No hay usuarios registrados</option>';
            }
        }
    }

    // 4. Login de Empleado (Validación de PIN y Asistencia)
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const pin = userPinInput.value;
            const configRest = JSON.parse(localStorage.getItem('config_restaurante'));

            if (!userId || pin.length < 4) {
                return alert("Selecciona un usuario e ingresa tu PIN de 4 dígitos");
            }

            btnEntrar.disabled = true;
            btnEntrar.innerText = "Verificando...";

            try {
                // A. Validar Usuario y PIN
                const { data: usuario, error } = await window.db
                    .from('perfiles')
                    .select('*')
                    .eq('id', userId)
                    .eq('pin', pin)
                    .single();

                if (error || !usuario) {
                    alert("⛔ PIN incorrecto");
                    userPinInput.value = "";
                } else {
                    // B. 🔒 VERIFICAR SUSCRIPCIÓN ANTES DE CREAR SESIÓN
                    // Consultamos el estado actual del restaurante
                    const { data: resto, error: errPago } = await window.db
                        .from('restaurantes')
                        .select('estado_pago, fecha_vencimiento')
                        .eq('id', configRest.id)
                        .single();

                    if (errPago || !resto) {
                        alert("Error al verificar la suscripción del restaurante");
                        return;
                    }

                    const hoy = new Date();
                    // Normalizamos la fecha de vencimiento para incluir el final del día (23:59:59)
                    const vencimiento = resto.fecha_vencimiento 
                        ? new Date(resto.fecha_vencimiento + "T23:59:59") 
                        : new Date(0); // Si es null, fecha antigua para forzar bloqueo

                    const estado = (resto.estado_pago || '').toLowerCase();

                    // C. 🚫 LÓGICA DE BLOQUEO
                    // Se bloquea si NO está pagado NI en mes gratuito, O si la fecha ya pasó
                    if ((estado !== 'pagado' && estado !== 'mes_gratuito') || hoy > vencimiento) {
                        localStorage.removeItem('sesion_activa');

                        // Guardamos info del bloqueo para usarla en bloqueado.html si quisieras
                        localStorage.setItem('bloqueo_pago', JSON.stringify({
                            restaurante_id: configRest.id,
                            estado: estado
                        }));

                        alert("⚠️ Acceso bloqueado: Suscripción vencida o pago pendiente.");
                        window.location.href = 'bloqueado.html';
                        return; // Detenemos ejecución aquí
                    }

                    // D. ✅ Éxito: Crear Sesión y Registrar Asistencia
                    const sesion = {
                        id: usuario.id,
                        nombre: usuario.nombre,
                        rol: usuario.rol.toLowerCase(),
                        restaurante_id: configRest.id,
                        nombre_restaurante: configRest.nombre
                    };
                    localStorage.setItem('sesion_activa', JSON.stringify(sesion));

                    // Registro de Asistencia en Supabase
                    await window.db.from('asistencia').insert([{
                        empleado_id: usuario.id,
                        nombre_empleado: usuario.nombre,
                        restaurante_id: configRest.id,
                        hora_entrada: new Date().toISOString()
                    }]);

                    redirigirUsuario(sesion.rol);
                }
            } catch (err) {
                console.error(err);
                alert("Error de sistema: " + err.message);
            } finally {
                btnEntrar.disabled = false;
                btnEntrar.innerText = "Registrar Entrada";
            }
        });
    }

    function redirigirUsuario(rol) {
        const rutas = { 
            'cocinero': 'cocina.html', 
            'dueño': 'ventas.html', 
            'mesero': 'mesas.html',
            'administrador': 'ventas.html'
        };
        window.location.href = rutas[rol] || 'mesas.html';
    }

    // Reloj digital
    setInterval(() => {
        const reloj = document.getElementById('relojActual');
        if(reloj) reloj.textContent = new Date().toLocaleTimeString();
    }, 1000);

    // Botón para desvincular
    const btnCambiar = document.getElementById('btnCambiarRestaurante');
    if (btnCambiar) {
        btnCambiar.onclick = (e) => {
            e.preventDefault();
            if(confirm("¿Deseas desvincular esta terminal?")) {
                localStorage.clear();
                location.reload();
            }
        };
    }
});