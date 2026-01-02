// js/login.js - AUTENTICACIÓN Y ASISTENCIA (CORREGIDO)

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Elementos del DOM
    const btnEntrar = document.getElementById('btnEntrar');
    const userPinInput = document.getElementById('userPin');
    const userSelect = document.getElementById('userSelect');
    const pasoRestaurante = document.getElementById('pasoRestaurante');
    const pasoLogin = document.getElementById('pasoLogin');
    const tituloRestaurante = document.getElementById('tituloRestaurante');
    const formRest = document.getElementById('formRestaurante');
    const formLogin = document.getElementById('formLogin');

    // 2. Verificar configuración previa de la terminal
    const restGuardado = JSON.parse(localStorage.getItem('config_restaurante'));

    if (restGuardado) {
        pasoRestaurante.classList.add('hidden');
        pasoLogin.classList.remove('hidden');
        tituloRestaurante.textContent = restGuardado.nombre;
        cargarUsuarios(restGuardado.id);
    }

    // 3. Paso 1: Buscar y Guardar Restaurante
    if (formRest) {
        formRest.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombreBusqueda = document.getElementById('nombreRestaurante').value.trim();
            
            if (!window.db) return alert("Error: No hay conexión con la base de datos.");

            const { data, error } = await window.db
                .from('restaurantes')
                .select('id, nombre')
                .ilike('nombre', nombreBusqueda) // Insensible a mayúsculas
                .maybeSingle();

            if (error) return alert("Error al buscar: " + error.message);
            
            if (!data) {
                return alert("No se encontró el restaurante. Asegúrate de escribir el nombre exacto con el que lo registraste.");
            }

            // Guardar configuración de terminal (persistente)
            localStorage.setItem('config_restaurante', JSON.stringify({
                id: data.id,
                nombre: data.nombre
            }));
            
            location.reload();
        });
    }

    // 4. Cargar Personal del Restaurante
    async function cargarUsuarios(restauranteId) {
        const { data, error } = await window.db
            .from('perfiles')
            .select('id, nombre, rol')
            .eq('restaurante_id', restauranteId)
            .order('nombre', { ascending: true });

        if (error) {
            console.error("Error cargando usuarios:", error);
            return;
        }

        if (data && userSelect) {
            userSelect.innerHTML = '<option value="" disabled selected>Selecciona tu nombre</option>';
            data.forEach(u => {
                const option = document.createElement('option');
                option.value = u.id;
                option.textContent = `${u.nombre} (${u.rol})`;
                userSelect.appendChild(option);
            });
        }
    }

    // 5. Paso 2: Login y Registro de Asistencia
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const userId = userSelect.value;
            const pin = userPinInput.value;
            const configRest = JSON.parse(localStorage.getItem('config_restaurante'));

            if (!userId) return alert("Por favor, selecciona tu nombre.");
            if (pin.length !== 4) return alert("El PIN debe ser de 4 dígitos.");

            btnEntrar.disabled = true;
            btnEntrar.innerText = "Verificando...";

            try {
                // Verificar PIN y Usuario contra Supabase
                const { data: usuario, error } = await window.db
                    .from('perfiles')
                    .select('*')
                    .eq('id', userId)
                    .eq('pin', pin)
                    .eq('restaurante_id', configRest.id)
                    .single();

                if (error || !usuario) {
                    alert("⛔ PIN incorrecto o usuario no válido.");
                    userPinInput.value = "";
                } else {
                    // Crear objeto de sesión (Regla de Oro para el resto de la app)
                    const sesion = {
                        id: usuario.id,
                        nombre: usuario.nombre,
                        rol: usuario.rol.toLowerCase(),
                        restaurante_id: configRest.id,
                        nombre_restaurante: configRest.nombre,
                        horaEntrada: new Date().toLocaleTimeString()
                    };
                    
                    localStorage.setItem('sesion_activa', JSON.stringify(sesion));

                    // Registrar registro histórico de asistencia
                    await window.db.from('asistencia').insert([{
                        empleado_id: usuario.id,
                        nombre_empleado: usuario.nombre,
                        restaurante_id: configRest.id,
                        hora_entrada: new Date().toISOString()
                    }]);

                    // Redirección según rol
                    redirigirUsuario(sesion.rol);
                }
            } catch (err) {
                alert("Error crítico: " + err.message);
            } finally {
                btnEntrar.disabled = false;
                btnEntrar.innerText = "Registrar Entrada";
            }
        });
    }

    // 6. Utilidades
    function redirigirUsuario(rol) {
        const rutas = {
            'cocinero': 'cocina.html', // Corregido a cocina.html según tus archivos
            'dueño': 'ventas.html',
            'mesero': 'mesas.html',
            'encargado': 'mesas.html'
        };
        window.location.href = rutas[rol] || 'mesas.html';
    }

    // Reloj en tiempo real
    setInterval(() => {
        const reloj = document.getElementById('relojActual');
        if(reloj) reloj.textContent = new Date().toLocaleTimeString();
    }, 1000);

    // Botón para resetear terminal
    const btnCambiar = document.getElementById('btnCambiarRestaurante');
    if (btnCambiar) {
        btnCambiar.onclick = (e) => {
            e.preventDefault();
            if(confirm("¿Vincular esta terminal a otro restaurante? Se borrará la configuración actual.")) {
                localStorage.clear();
                location.reload();
            }
        };
    }
});