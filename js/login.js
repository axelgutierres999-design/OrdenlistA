// js/login.js - CORREGIDO PARA VINCULACIÓN DIRECTA POR CORREO ADMIN

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

    // 2. Paso 1: Vincular Negocio (CORRECCIÓN DE LÓGICA)
    if (formRest) {
        formRest.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombreBusqueda = document.getElementById('nombreRestaurante').value.trim();
            const correoBusqueda = document.getElementById('correoAdmin').value.trim();
            
            if (!window.db) return alert("Sin conexión a la base de datos");

            // CAMBIO CLAVE: Buscamos directamente en la tabla 'restaurantes' 
            // usando el campo correo_admin que definimos en el SQL
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

            // Validar que el nombre coincida (ignorando mayúsculas/minúsculas)
            if (restaurante.nombre.toLowerCase() !== nombreBusqueda.toLowerCase()) {
                return alert("El nombre del restaurante no coincide con el correo proporcionado.");
            }

            // Éxito: Guardamos la vinculación en el navegador
            localStorage.setItem('config_restaurante', JSON.stringify({
                id: restaurante.id,
                nombre: restaurante.nombre
            }));
            
            alert("¡Vínculo exitoso con " + restaurante.nombre + "!");
            location.reload();
        });
    }

    // 3. Cargar Usuarios del restaurante vinculado
    async function cargarUsuarios(restauranteId) {
        const { data, error } = await window.db
            .from('perfiles')
            .select('id, nombre, rol')
            .eq('restaurante_id', restauranteId)
            .order('nombre', { ascending: true });

        if (error) console.error("Error cargando usuarios:", error);

        if (data && userSelect) {
            userSelect.innerHTML = '<option value="" disabled selected>Selecciona tu nombre</option>';
            data.forEach(u => {
                userSelect.innerHTML += `<option value="${u.id}">${u.nombre} (${u.rol})</option>`;
            });
        }
    }

    // 4. Login de Empleado (PIN)
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const pin = userPinInput.value;
            const configRest = JSON.parse(localStorage.getItem('config_restaurante'));

            if (!userId || pin.length < 4) return alert("Por favor selecciona un usuario e ingresa tu PIN de 4 dígitos");

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
                    alert("⛔ PIN incorrecto o usuario no válido");
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

                    // Registro de Asistencia
                    await window.db.from('asistencia').insert([{
                        empleado_id: usuario.id,
                        nombre_empleado: usuario.nombre,
                        restaurante_id: configRest.id,
                        hora_entrada: new Date().toISOString()
                    }]);

                    redirigirUsuario(sesion.rol);
                }
            } catch (err) {
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
            if(confirm("¿Deseas desvincular esta terminal? Se borrarán los datos de sesión.")) {
                localStorage.clear();
                location.reload();
            }
        };
    }
});