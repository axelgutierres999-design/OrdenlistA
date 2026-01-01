// js/login.js - AUTENTICACIÓN Y ASISTENCIA

document.addEventListener('DOMContentLoaded', async () => {
    const btnEntrar = document.getElementById('btnEntrar');
    const userPinInput = document.getElementById('userPin');
    const userSelect = document.getElementById('userSelect');
    const pasoRestaurante = document.getElementById('pasoRestaurante');
    const pasoLogin = document.getElementById('pasoLogin');
    const tituloRestaurante = document.getElementById('tituloRestaurante');

    // 1. Verificar si ya hay un restaurante configurado localmente
    const restGuardado = JSON.parse(localStorage.getItem('config_restaurante'));

    if (restGuardado) {
        pasoRestaurante.classList.add('hidden');
        pasoLogin.classList.remove('hidden');
        tituloRestaurante.textContent = restGuardado.nombre;
        cargarUsuarios(restGuardado.id);
    }

    // 2. Configurar Restaurante (Paso 1)
    const formRest = document.getElementById('formRestaurante');
    if (formRest) {
        formRest.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombreBusqueda = document.getElementById('nombreRestaurante').value;
            
            // Buscar el restaurante en la base de datos para obtener su ID real
            const { data, error } = await db.from('restaurantes')
                .select('*')
                .ilike('nombre', `%${nombreBusqueda}%`)
                .single();

            if (error || !data) {
                return alert("No se encontró un restaurante con ese nombre. Verifica la ortografía.");
            }

            localStorage.setItem('config_restaurante', JSON.stringify({
                id: data.id,
                nombre: data.nombre
            }));
            location.reload();
        });
    }

    // 3. Cargar Usuarios del Restaurante seleccionado
    async function cargarUsuarios(restauranteId) {
        const { data, error } = await db.from('perfiles')
            .select('id, nombre, rol')
            .eq('restaurante_id', restauranteId);

        if (data && userSelect) {
            userSelect.innerHTML = '<option value="" disabled selected>Selecciona tu nombre</option>';
            data.forEach(u => {
                userSelect.innerHTML += `<option value="${u.id}">${u.nombre} (${u.rol})</option>`;
            });
        }
    }

    // 4. Login y Registro de Asistencia
    if (btnEntrar) {
        btnEntrar.addEventListener('click', async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const pin = userPinInput.value;
            
            if (!userId) return alert("Selecciona un usuario");
            if (pin.length !== 4) return alert("PIN debe ser de 4 dígitos");

            btnEntrar.disabled = true;
            btnEntrar.innerText = "Verificando...";

            try {
                // Verificar PIN y Usuario
                const { data: usuario, error } = await db
                    .from('perfiles')
                    .select('*')
                    .eq('id', userId)
                    .eq('pin', pin)
                    .single();

                if (error || !usuario) {
                    alert("⛔ PIN incorrecto para este usuario");
                    userPinInput.value = "";
                } else {
                    // Guardar sesión activa con info del restaurante
                    const sesion = {
                        id: usuario.id,
                        nombre: usuario.nombre,
                        rol: usuario.rol,
                        restaurante_id: restGuardado.id,
                        nombre_restaurante: restGuardado.nombre
                    };
                    localStorage.setItem('sesion_activa', JSON.stringify(sesion));

                    // Registrar Asistencia
                    await db.from('asistencia').insert([{
                        empleado_id: usuario.id,
                        nombre_empleado: usuario.nombre,
                        restaurante_id: restGuardado.id,
                        hora_entrada: new Date().toISOString()
                    }]);

                    // Redirección inteligente
                    redirigirUsuario(usuario.rol);
                }
            } catch (err) {
                alert("Error de conexión: " + err.message);
            } finally {
                btnEntrar.disabled = false;
                btnEntrar.innerText = "Registrar Entrada";
            }
        });
    }

    function redirigirUsuario(rol) {
        const rutas = {
            'cocinero': 'ordenes.html',
            'dueño': 'ventas.html',
            'mesero': 'mesas.html'
        };
        window.location.href = rutas[rol] || 'mesas.html';
    }

    // Reloj en pantalla
    setInterval(() => {
        const reloj = document.getElementById('relojActual');
        if(reloj) reloj.textContent = new Date().toLocaleTimeString();
    }, 1000);

    // Cambiar de negocio
    document.getElementById('btnCambiarRestaurante').onclick = (e) => {
        e.preventDefault();
        if(confirm("¿Vincular esta terminal a otro restaurante?")) {
            localStorage.clear();
            location.reload();
        }
    };
});