// js/ajustes.js
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. VERIFICAR SESIÓN
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || !sesion.restaurante_id) {
        window.location.href = 'index.html'; // O login
        return;
    }
    const restoId = sesion.restaurante_id;

    // Referencias al DOM
    const inDir = document.getElementById('inputDireccion');
    const inTel = document.getElementById('inputTelefono');
    const inHor = document.getElementById('inputHorarios');
    const inBanco = document.getElementById('inputDatosBanco');
    
    const fileQR = document.getElementById('fileQR');
    const imgQR = document.getElementById('previewQR');
    
    const fileMenu = document.getElementById('fileMenu');
    const imgMenu = document.getElementById('previewMenu');

    const btnGuardar = document.getElementById('btnGuardarTodo');

    // 2. CARGAR DATOS EXISTENTES
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
                inBanco.value = data.datos_pancarios || '';
                
                if (data.qr_pago_url) {
                    imgQR.src = data.qr_pago_url;
                    imgQR.style.display = 'block';
                } else { imgQR.style.display = 'none'; }

                if (data.menu_digital_url) {
                    imgMenu.src = data.menu_digital_url;
                    imgMenu.style.display = 'block';
                } else { imgMenu.style.display = 'none'; }
            }
        } catch (e) {
            console.error("Error cargando ajustes:", e);
        }
    }

    // 3. FUNCIÓN PARA SUBIR IMAGEN A STORAGE
    async function subirImagen(file, carpeta) {
        if (!file) return null;
        
        const ext = file.name.split('.').pop();
        const nombreArchivo = `${restoId}/${carpeta}_${Date.now()}.${ext}`;
        
        // Sube al bucket 'restaurante_assets' (CRÉALO EN SUPABASE)
        const { data, error } = await db.storage
            .from('restaurante_assets')
            .upload(nombreArchivo, file, { upsert: true });

        if (error) throw error;

        // Obtener URL pública
        const { data: publicData } = db.storage
            .from('restaurante_assets')
            .getPublicUrl(nombreArchivo);
            
        return publicData.publicUrl;
    }

    // 4. PREVISUALIZACIÓN DE IMÁGENES LOCALES
    fileQR.addEventListener('change', (e) => mostrarPreview(e.target, imgQR));
    fileMenu.addEventListener('change', (e) => mostrarPreview(e.target, imgMenu));

    function mostrarPreview(input, imgElement) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imgElement.src = e.target.result;
                imgElement.style.display = 'block';
            }
            reader.readAsDataURL(input.files[0]);
        }
    }

    // 5. GUARDAR TODO
    btnGuardar.onclick = async () => {
        btnGuardar.disabled = true;
        btnGuardar.textContent = "⏳ Guardando...";

        try {
            let urlQR = imgQR.src.startsWith('data:') ? null : imgQR.src; 
            let urlMenu = imgMenu.src.startsWith('data:') ? null : imgMenu.src;

            // Si hay nuevos archivos seleccionados, subirlos
            if (fileQR.files.length > 0) {
                urlQR = await subirImagen(fileQR.files[0], 'qr_pago');
            }
            if (fileMenu.files.length > 0) {
                urlMenu = await subirImagen(fileMenu.files[0], 'menu_full');
            }

            const datosActualizados = {
                direccion: inDir.value,
                telefono: inTel.value,
                horarios: inHor.value,
                datos_pancarios: inBanco.value,
                qr_pago_url: urlQR,
                menu_digital_url: urlMenu
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

    cargarDatos();
});