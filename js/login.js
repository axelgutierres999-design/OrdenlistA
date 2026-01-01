// js/login.js - CORREGIDO PARA IDENTIFICACIÓN ROBUSTA
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
        mostrarPasoLogin(restGuardado);
    }

    // 2. Configurar Restaurante (Paso 1)
    const formRest = document.getElementById('formRestaurante');
    if (formRest) {
        formRest.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombreBusqueda = document.getElementById('nombreRestaurante').value.trim();
            
            if (!nombreBusqueda) return alert("Escribe el nombre de tu negocio");

            // BUSQUEDA MEJORADA: ilike permite encontrar "Cafe" aunque escribas "cafe"
            const { data, error } = await db.from('restaurantes')
                .select('*')
                .ilike('nombre', nombreBusqueda) 
                .maybeSingle();

            if (error) {
                console.error("Error Supabase:", error);
                return alert("Error de conexión con la base de datos.");
            }

            if (data) {
                // Guardamos en LocalStorage para que la terminal quede "vinculada"
                localStorage.setItem('config_restaurante', JSON.stringify(data));
                mostrarPasoLogin(data);
            } else {
                alert("❌ Este restaurante no está registrado. Verifica el nombre exactamente como lo creaste.");
            }
        });
    }

    function mostrarPasoLogin(rest) {
        pasoRestaurante.classList.add('hidden');
        pasoLogin.classList.remove('hidden');
        tituloRestaurante.textContent = rest.nombre;
        cargarUsuarios(rest.id);
    }

    async function cargarUsuarios(restId) {
        userSelect.innerHTML = '<option disabled selected>Cargando personal...</option>';
        
        const { data, error } = await db.from('perfiles')
            .select('*')
            .eq('restaurante_id', restId);

        if (error || !data) {
            userSelect.innerHTML = '<option disabled>Error al cargar usuarios</option>';
            return;
        }

        userSelect.innerHTML = '<option value="" disabled selected>Selecciona tu nombre</option>';
        data.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.nombre} (${u.rol})`;
            // Guardamos el PIN en un atributo de datos para validar rápido (u oculto según prefieras)
            opt.dataset.pin = u.pin; 
            userSelect.appendChild(opt);
        });
    }

    // 3. Login Final (Validar PIN)
    const formLogin = document.getElementById('formLogin');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const pinIngresado = userPinInput.value;
            const optionSeleccionada = userSelect.options[userSelect.selectedIndex];
            const pinReal = optionSeleccionada.dataset.pin;

            if (pinIngresado === pinReal) {
                const restData = JSON.parse(localStorage.getItem('config_restaurante'));
                
                // CREAR SESIÓN ACTIVA (Regla de Oro)
                const sesion = {
                    id: userId,
                    nombre: optionSeleccionada.text.split('(')[0].trim(),
                    rol: optionSeleccionada.text.match(/\(([^)]+)\)/)[1].toLowerCase(),
                    restaurante_id: restData.id,
                    nombre_restaurante: restData.nombre,
                    horaEntrada: new Date().toLocaleTimeString()
                };

                localStorage.setItem('sesion_activa', JSON.stringify(sesion));

                // Registrar en tabla asistencia
                await db.from('asistencia').insert([{
                    empleado_id: userId,
                    nombre_empleado: sesion.nombre,
                    restaurante_id: restData.id,
                    hora_entrada: new Date().toISOString()
                }]);

                window.location.href = redirigirPorRol(sesion.rol);
            } else {
                alert("❌ PIN Incorrecto");
                userPinInput.value = "";
            }
        });
    }

    function redirigirPorRol(rol) {
        const rutas = {
            'dueño': 'ventas.html',
            'cocinero': 'cocina.html',
            'mesero': 'mesas.html'
        };
        return rutas[rol] || 'mesas.html';
    }

    // Botón para desvincular restaurante
    document.getElementById('btnCambiarRestaurante').onclick = (e) => {
        e.preventDefault();
        if(confirm("¿Quieres desvincular esta terminal del restaurante actual?")) {
            localStorage.clear();
            window.location.reload();
        }
    };
});