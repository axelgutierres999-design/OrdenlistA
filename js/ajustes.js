// js/ajustes.js
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. VERIFICAR SESIÓN
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || !sesion.restaurante_id) {
        window.location.href = 'index.html'; // O login
        return;
    }
    const restoId = sesion.restaurante_id;

    // --- REFERENCIAS AL DOM ---
    const inDir = document.getElementById('inputDireccion');
    const inTel = document.getElementById('inputTelefono');
    const inHor = document.getElementById('inputHorarios');
    const inBanco = document.getElementById('inputDatosBanco');

    const fileQR = document.getElementById('fileQR');
    const imgQR = document.getElementById('previewQR');

    const fileMenu = document.getElementById('fileMenu');
    const imgMenu = document.getElementById('previewMenu');

    // 🆕 NUEVO: Imagen del restaurante (logo)
    const fileLogo = document.getElementById('fileLogo');
    const imgLogo = document.getElementById('previewLogo');

    const btnGuardar = document.getElementById('btnGuardarTodo');

    // 🆕 CAMPOS DE UBICACIÓN
    const inLat = document.getElementById('inputLat');
    const inLong = document.getElementById('inputLong');
    const btnUbicacion = document.getElementById('btnUbicacion');

    // 2. CARGAR DATOS EXISTENTES DESDE SUPABASE
    async function cargarDatos() {
        try {
            const { data, error } = await db
                .from('restaurantes')
                .select('*')
                .eq('id', restoId)
                .single();

            if (error) throw error;

            if (data) {
                inDir.value = data.direccion || '';
                inTel.value = data.telefono || '';
                inHor.value = data.horarios || '';
                inBanco.value = data.datos_bancarios || '';

                // Coordenadas
                inLat.value = data.lat || '';
                inLong.value = data.longitud || '';

                // Mostrar imágenes existentes si hay
                if (data.qr_pago_url) {
                    imgQR.src = data.qr_pago_url;
                    imgQR.style.display = 'block';
                } else imgQR.style.display = 'none';

                if (data.menu_digital_url) {
                    imgMenu.src = data.menu_digital_url;
                    imgMenu.style.display = 'block';
                } else imgMenu.style.display = 'none';

                if (data.logo_url) {
                    imgLogo.src = data.logo_url;
                    imgLogo.style.display = 'block';
                } else imgLogo.style.display = 'none';
            }

        } catch (e) {
            console.error("Error cargando ajustes:", e);
        }
    }

    // 3. UBICACIÓN AUTOMÁTICA
    btnUbicacion?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Tu navegador no soporta geolocalización.");
            return;
        }

        btnUbicacion.textContent = "📡 Obteniendo...";
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                inLat.value = latitude.toFixed(6);
                inLong.value = longitude.toFixed(6);
                btnUbicacion.textContent = "📍 Obtener mi ubicación actual";
            },
            (err) => {
                alert("Error obteniendo ubicación: " + err.message);
                btnUbicacion.textContent = "📍 Obtener mi ubicación actual";
            }
        );
    });

    // 4. SUBIR IMAGEN A SUPABASE STORAGE
    async function subirImagen(file, carpeta) {
        if (!file) return null;

        const ext = file.name.split('.').pop();
        const nombreArchivo = `${restoId}/${carpeta}_${Date.now()}.${ext}`;

        const { data, error } = await db.storage
            .from('restaurante_assets') // 👈 asegúrate de tener este bucket creado
            .upload(nombreArchivo, file, { upsert: true });

        if (error) throw error;

        const { data: publicData } = db.storage
            .from('restaurante_assets')
            .getPublicUrl(nombreArchivo);

        return publicData.publicUrl;
    }

    // 5. PREVISUALIZAR IMÁGENES LOCALES
    function mostrarPreview(input, imgElement) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imgElement.src = e.target.result;
                imgElement.style.display = 'block';
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    fileQR.addEventListener('change', (e) => mostrarPreview(e.target, imgQR));
    fileMenu.addEventListener('change', (e) => mostrarPreview(e.target, imgMenu));
    fileLogo.addEventListener('change', (e) => mostrarPreview(e.target, imgLogo));

    // 6. GUARDAR TODO
    btnGuardar.onclick = async () => {
        btnGuardar.disabled = true;
        btnGuardar.textContent = "⏳ Guardando...";

        try {
            let urlQR = imgQR.src.startsWith('data:') ? null : imgQR.src;
            let urlMenu = imgMenu.src.startsWith('data:') ? null : imgMenu.src;
            let urlLogo = imgLogo.src.startsWith('data:') ? null : imgLogo.src;

            // Subir nuevas imágenes si se seleccionaron
            if (fileQR.files.length > 0) urlQR = await subirImagen(fileQR.files[0], 'qr_pago');
            if (fileMenu.files.length > 0) urlMenu = await subirImagen(fileMenu.files[0], 'menu_full');
            if (fileLogo.files.length > 0) urlLogo = await subirImagen(fileLogo.files[0], 'logo_restaurante');

            // Datos a actualizar
            const datosActualizados = {
                direccion: inDir.value,
                telefono: inTel.value,
                horarios: inHor.value,
                datos_bancarios: inBanco.value,
                qr_pago_url: urlQR,
                menu_digital_url: urlMenu,
                logo_url: urlLogo,
                lat: parseFloat(inLat.value) || null,
                longitud: parseFloat(inLong.value) || null
            };

            const { error } = await db
                .from('restaurantes')
                .update(datosActualizados)
                .eq('id', restoId);

            if (error) throw error;

            alert("✅ ¡Ajustes guardados correctamente!");
        } catch (e) {
            console.error(e);
            alert("❌ Error al guardar: " + e.message);
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.textContent = "💾 Guardar Todos los Cambios";
        }
    };

    // 7. INICIAR
    cargarDatos();
});