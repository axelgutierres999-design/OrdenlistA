// js/login.js - AUTENTICACIÓN Y ASISTENCIA CON FILTRO DE SEGURIDAD

document.addEventListener('DOMContentLoaded', async () => {
    const btnEntrar = document.getElementById('btnEntrar');
    const userPinInput = document.getElementById('userPin');
    const userSelect = document.getElementById('userSelect');
    const pasoRestaurante = document.getElementById('pasoRestaurante');
    const pasoLogin = document.getElementById('pasoLogin');
    const tituloRestaurante = document.getElementById('tituloRestaurante');
    const formRest = document.getElementById('formRestaurante');
    const formLogin = document.getElementById('formLogin');

    // 1. Verificar configuración previa
    const restGuardado = JSON.parse(localStorage.getItem('config_restaurante'));
    if (restGuardado) {
        pasoRestaurante.classList.add('hidden');
        pasoLogin.classList.remove('hidden');
        tituloRestaurante.textContent = restGuardado.nombre;
        cargarUsuarios(restGuardado.id);
    }

    // 2. Paso 1: Vincular con Nombre + Correo (EVITA DUPLICADOS)
    if (formRest) {
        formRest.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombreBusqueda = document.getElementById('nombreRestaurante').value.trim();
            const correoBusqueda = document.getElementById('correoAdmin').value.trim();
            
            if (!window.db) return alert("Sin conexión a DB");

            // Buscamos el perfil del dueño que coincida con el nombre del negocio y correo
            // En tu lógica SQL, el nombre del dueño suele ser el correo o nombre completo
            const { data: perfilDueño, error: errPerfil } = await window.db
                .from('perfiles')
                .select('restaurante_id, nombre')
                .eq('rol', 'dueño')
                .ilike('nombre', `%${correoBusqueda}%`) 
                .maybeSingle();

            if (errPerfil || !perfilDueño) {
                return alert("No se encontró un administrador con ese correo. Verifica tus datos.");
            }

            // Ahora verificamos que el restaurante con ese ID coincida con el nombre escrito
            const { data: restaurante, error: errRest } = await window.db
                .from('restaurantes')
                .select('id, nombre')
                .eq('id', perfilDueño.restaurante_id)
                .ilike('nombre', nombreBusqueda)
                .maybeSingle();

            if (errRest || !restaurante) {
                return alert("El nombre del restaurante no coincide con el registrado para ese correo.");
            }

            // Éxito: Guardamos la vinculación
            localStorage.setItem('config_restaurante', JSON.stringify({
                id: restaurante.id,
                nombre: restaurante.nombre
            }));
            
            location.reload();
        });
    }

    // 3. Cargar Usuarios
    async function cargarUsuarios(restauranteId) {
        const { data, error } = await window.db
            .from('perfiles')
            .select('id, nombre, rol')
            .eq('restaurante_id', restauranteId)
            .order('nombre', { ascending: true });

        if (data && userSelect) {
            userSelect.innerHTML = '<option value="" disabled selected>Selecciona tu nombre</option>';
            data.forEach(u => {
                userSelect.innerHTML += `<option value="${u.id}">${u.nombre} (${u.rol})</option>`;
            });
        }
    }

    // 4. Login de Empleado (Paso 2)
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const pin = userPinInput.value;
            const configRest = JSON.parse(localStorage.getItem('config_restaurante'));

            if (!userId || pin.length !== 4) return alert("Datos incompletos");

            btnEntrar.disabled = true;
            btnEntrar.innerText = "Verificando...";

            try {
                const { data: usuario, error } = await window.db
                    .from('perfiles')
                    .select('*')
                    .eq('id', userId)
                    .eq('pin', pin)
                    .eq('restaurante_id', configRest.id)
                    .single();

                if (error || !usuario) {
                    alert("⛔ PIN incorrecto");
                    userPinInput.value = "";
                } else {
                    const sesion = {
                        id: usuario.id,
                        nombre: usuario.nombre,
                        rol: usuario.rol.toLowerCase(),
                        restaurante_id: configRest.id,
                        nombre_restaurante: configRest.nombre
                    };
                    localStorage.setItem('sesion_activa', JSON.stringify(sesion));

                    // Asistencia
                    await window.db.from('asistencia').insert([{
                        empleado_id: usuario.id,
                        nombre_empleado: usuario.nombre,
                        restaurante_id: configRest.id,
                        hora_entrada: new Date().toISOString()
                    }]);

                    redirigirUsuario(sesion.rol);
                }
            } catch (err) {
                alert("Error: " + err.message);
            } finally {
                btnEntrar.disabled = false;
                btnEntrar.innerText = "Registrar Entrada";
            }
        });
    }

    function redirigirUsuario(rol) {
        const rutas = { 'cocinero': 'cocina.html', 'dueño': 'ventas.html', 'mesero': 'mesas.html' };
        window.location.href = rutas[rol] || 'mesas.html';
    }

    setInterval(() => {
        const reloj = document.getElementById('relojActual');
        if(reloj) reloj.textContent = new Date().toLocaleTimeString();
    }, 1000);

    document.getElementById('btnCambiarRestaurante').onclick = (e) => {
        e.preventDefault();
        if(confirm("¿Vincular a otro restaurante?")) {
            localStorage.clear();
            location.reload();
        }
    };
});