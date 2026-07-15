// js/ajustes.js - VERSIÓN MEJORADA CON ROLES Y CARRUSEL
document.addEventListener('DOMContentLoaded', async () => {
    
    // =====================================================
    // 1. VERIFICAR SESIÓN Y ROL (SEGURIDAD)
    // =====================================================
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    
    // Si no hay sesión o NO es dueño, lo sacamos de aquí
    if (!sesion || !sesion.restaurante_id) {
        window.location.href = 'index.html';
        return;
    }
    
    if (sesion.rol !== 'dueño') {
        alert("⛔ Acceso denegado: Esta sección es exclusiva para el Dueño.");
        window.location.href = 'menu.html'; // Lo redirigimos al menú
        return;
    }

    const restoId = sesion.restaurante_id;
    let menuGaleriaActual = []; // Array para manejar las urls del carrusel

    // =====================================================
    // 2. REFERENCIAS AL DOM
    // =====================================================
    
    // Campos básicos existentes
    const inDir = document.getElementById('inputDireccion');
    const inTel = document.getElementById('inputTelefono');
    const inHor = document.getElementById('inputHorarios');
    const inBanco = document.getElementById('inputDatosBanco');
    // 🆕 NUEVO: Datos para el Ticket
    const inNombre = document.getElementById('inputNombre');
    const inMensajeTicket = document.getElementById('inputMensajeTicket');
    const inWifi = document.getElementById('inputWifi');
    const inInstagram = document.getElementById('inputInstagram');
    
    // 🆕 NUEVO: Inputs para los 3 posts interactivos
    const filePostIg1 = document.getElementById('filePostIg1');
    const previewPostIg1 = document.getElementById('previewPostIg1');
    const filePostIg2 = document.getElementById('filePostIg2');
    const previewPostIg2 = document.getElementById('previewPostIg2');
    const filePostIg3 = document.getElementById('filePostIg3');
    const previewPostIg3 = document.getElementById('previewPostIg3');
    
    // 🆕 NUEVO: Categoría del restaurante
    const inCategoria = document.getElementById('inputCategoria'); 

    // Ubicación GPS
    const inLat = document.getElementById('inputLat');
    const inLong = document.getElementById('inputLong');
    const btnUbicacion = document.getElementById('btnUbicacion');

    // Imágenes Simples (Logo y QR)
    const fileLogo = document.getElementById('fileLogo');
    const imgLogo = document.getElementById('previewLogo');
    
    const fileQR = document.getElementById('fileQR');
    const imgQR = document.getElementById('previewQR');

    // 🆕 NUEVO: Imagen del Lugar (Fachada/Interior)
    const fileLugar = document.getElementById('fileLugar');
    const imgLugar = document.getElementById('previewLugar');

    // 🆕 NUEVO: Carrusel de Menú (Multiples Imágenes)
    const fileGaleria = document.getElementById('fileGaleria'); // Input multiple
    const contenedorGaleria = document.getElementById('contenedorGaleria'); // Div donde se ven las fotos
    // 📲 NUEVO: Redes Sociales
    const inFacebook = document.getElementById('inputFacebook');
    const fileGaleriaRedes = document.getElementById('fileGaleriaRedes');
    const contenedorGaleriaRedes = document.getElementById('contenedorGaleriaRedes');
    let redesGaleriaActual = []; // Array de fotos para la tarjeta de redes
    const btnGuardar = document.getElementById('btnGuardarTodo');

    // =====================================================
    // 3. CARGAR DATOS EXISTENTES
    // =====================================================
    async function cargarDatos() {
        try {
            const { data, error } = await db
                .from('restaurantes')
                .select('*')
                .eq('id', restoId)
                .single();

            if (error) throw error;

            if (data) {
                // Textos básicos
                inDir.value = data.direccion || '';
                inTel.value = data.telefono || '';
                inHor.value = data.horarios || '';
                inBanco.value = data.datos_bancarios || '';
                inCategoria.value = data.categoria || 'Restaurante'; // Default
                inLat.value = data.lat || '';
                inLong.value = data.longitud || '';
                // Nuevos campos del ticket
                inNombre.value = data.nombre || '';
                inMensajeTicket.value = data.mensaje_ticket || '¡GRACIAS POR SU COMPRA!';
                inWifi.value = data.wifi || '';
                inInstagram.value = data.instagram || '';
                document.getElementById('inputWhatsappDueno').value = data.whatsapp_dueno || '';

                // Imágenes simples
                mostrarImagenDesdeUrl(data.logo_url, imgLogo);
                mostrarImagenDesdeUrl(data.qr_pago_url, imgQR);
                mostrarImagenDesdeUrl(data.foto_lugar_url, imgLugar);

                // Cargar Galería (Array de fotos)
                // Nota: Asumimos que en la BD guardaremos un JSON array en la columna 'galeria_menu'
                // Si la columna no existe aún, usaremos un array vacío.
                if (data.galeria_menu && Array.isArray(data.galeria_menu)) {
                    menuGaleriaActual = data.galeria_menu;
                } else if (data.menu_digital_url) {
                    // Migración: Si antes tenías una sola foto, la metemos al array
                    menuGaleriaActual = [data.menu_digital_url];
                }
                
                renderizarGaleria();
                 // 📲 NUEVO: Cargar redes sociales
                inFacebook.value = data.facebook_url || '';
                redesGaleriaActual = Array.isArray(data.galeria_redes) ? data.galeria_redes : [];
                renderizarGaleriaRedes();

                // 🆕 NUEVO: Cargar los 3 posts (link + foto)
                const postsGuardados = Array.isArray(data.posts_instagram) ? data.posts_instagram : [];
                const normalizarPost = (p) => (typeof p === 'string') ? { link: p, foto: '' } : (p || { link: '', foto: '' });
                const post1 = normalizarPost(postsGuardados[0]);
                const post2 = normalizarPost(postsGuardados[1]);
                const post3 = normalizarPost(postsGuardados[2]);

                if (inPostIg1) inPostIg1.value = post1.link || '';
                mostrarImagenDesdeUrl(post1.foto, previewPostIg1);
                if (inPostIg2) inPostIg2.value = post2.link || '';
                mostrarImagenDesdeUrl(post2.foto, previewPostIg2);
                if (inPostIg3) inPostIg3.value = post3.link || '';
                mostrarImagenDesdeUrl(post3.foto, previewPostIg3);
            }

        } catch (e) {
            console.error("Error cargando ajustes:", e);
        }
    }

    // Helper para mostrar img si existe URL
    function mostrarImagenDesdeUrl(url, imgElement) {
        if (url) {
            imgElement.src = url;
            imgElement.style.display = 'block';
        } else {
            imgElement.style.display = 'none';
        }
    }

    // =====================================================
    // 4. LÓGICA DEL CARRUSEL (GALERÍA)
    // =====================================================
    
    // Función para dibujar las miniaturas de la galería
    function renderizarGaleria() {
        contenedorGaleria.innerHTML = ''; // Limpiar
        
        menuGaleriaActual.forEach((url, index) => {
            const div = document.createElement('div');
            div.style = "position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid #ccc;";
            
            div.innerHTML = `
                <img src="${url}" style="width:100%; height:100%; object-fit:cover;">
                <button onclick="eliminarFotoGaleria(${index})" 
                    style="position:absolute; top:0; right:0; background:red; color:white; border:none; width:20px; height:20px; cursor:pointer; font-size:12px; line-height:1;">
                    &times;
                </button>
            `;
            contenedorGaleria.appendChild(div);
        });
    }

    // Hacemos esta función global para que el botón HTML la encuentre
    window.eliminarFotoGaleria = (index) => {
        if(confirm("¿Quitar esta imagen de la lista?")) {
            menuGaleriaActual.splice(index, 1);
            renderizarGaleria();
        }
    };
    // 📲 NUEVO: Renderizar miniaturas de la galería de redes
    function renderizarGaleriaRedes() {
        contenedorGaleriaRedes.innerHTML = '';
        redesGaleriaActual.forEach((url, index) => {
            const div = document.createElement('div');
            div.style = "position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid #ccc;";
            div.innerHTML = `
                <img src="${url}" style="width:100%; height:100%; object-fit:cover;">
                <button onclick="eliminarFotoRedes(${index})" 
                    style="position:absolute; top:0; right:0; background:red; color:white; border:none; width:20px; height:20px; cursor:pointer; font-size:12px; line-height:1;">
                    &times;
                </button>
            `;
            contenedorGaleriaRedes.appendChild(div);
        });
    }

    window.eliminarFotoRedes = (index) => {
        if(confirm("¿Quitar esta imagen de la lista?")) {
            redesGaleriaActual.splice(index, 1);
            renderizarGaleriaRedes();
        }
    };

    // Previsualizar nuevas fotos seleccionadas para la galería (solo visual, aun no subidas)
    fileGaleria?.addEventListener('change', (e) => {
        // Nota: Las subiremos al darle "Guardar", aquí solo podríamos mostrar un texto de "X archivos seleccionados"
        // Opcional: Podríamos mostrar previsualización local, pero por simplicidad dejaremos que se suban al guardar.
        alert(`Has seleccionado ${e.target.files.length} nuevas imágenes para agregar al menú.`);
    });


    // =====================================================
    // 5. UBICACIÓN y PREVIEWS LOCALES
    // =====================================================
    
    // Geolocalización
    btnUbicacion?.addEventListener('click', () => {
        if (!navigator.geolocation) return alert("Navegador no soporta Geo.");
        btnUbicacion.textContent = "📡 Buscando...";
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                inLat.value = pos.coords.latitude.toFixed(6);
                inLong.value = pos.coords.longitude.toFixed(6);
                btnUbicacion.textContent = "📍 Actualizar Ubicación";
            },
            (err) => { alert("Error: " + err.message); btnUbicacion.textContent = "📍 Reintentar"; }
        );
    });

    // Previews para inputs simples
    const setupPreview = (input, img) => {
        input.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (evt) => { img.src = evt.target.result; img.style.display='block'; };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    };setupPreview(fileLogo, imgLogo);
    setupPreview(fileQR, imgQR);
    setupPreview(fileLugar, imgLugar);
    setupPreview(filePostIg1, previewPostIg1);
    setupPreview(filePostIg2, previewPostIg2);
    setupPreview(filePostIg3, previewPostIg3);


    // =====================================================
    // 6. FUNCIÓN DE SUBIDA (STORAGE)
    // =====================================================
    async function subirImagen(file, carpeta) {
        if (!file) return null;
        const ext = file.name.split('.').pop();
        // Usamos timestamp random para evitar cache
        const nombreArchivo = `${restoId}/${carpeta}_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
        
        const { error } = await db.storage
            .from('restaurante_assets')
            .upload(nombreArchivo, file, { upsert: true });

        if (error) throw error;

        const { data } = db.storage.from('restaurante_assets').getPublicUrl(nombreArchivo);
        return data.publicUrl;
    }


    // =====================================================
    // 7. GUARDAR TODO
    // =====================================================
    btnGuardar.onclick = async () => {
        btnGuardar.disabled = true;
        btnGuardar.textContent = "⏳ Subiendo archivos y guardando...";

        try {
            // 1. Subir imágenes únicas si cambiaron
            // (Si el usuario no selecciona archivo, mantenemos la URL que ya tiene la imagen preview, a menos que sea base64 local)
            
            const procesarImagenUnica = async (fileInput, imgElement, carpeta) => {
                if (fileInput.files.length > 0) {
                    return await subirImagen(fileInput.files[0], carpeta);
                } else if (imgElement.src && !imgElement.src.startsWith('data:')) {
                    return imgElement.src; // Mantiene la URL vieja
                }
                return null;
            };

            const urlLogo = await procesarImagenUnica(fileLogo, imgLogo, 'logo');
            const urlQR = await procesarImagenUnica(fileQR, imgQR, 'qr_pago');
            const urlLugar = await procesarImagenUnica(fileLugar, imgLugar, 'foto_lugar'); // 🆕

            // 2. Procesar Galería (Carrusel)
            // Subimos los NUEVOS archivos seleccionados y los agregamos al array existente
            if (fileGaleria.files.length > 0) {
                for (let i = 0; i < fileGaleria.files.length; i++) {
                    const urlNueva = await subirImagen(fileGaleria.files[i], 'menu_slide');
                    if(urlNueva) menuGaleriaActual.push(urlNueva);
                }
            }
            // 📲 NUEVO: Procesar Galería de Redes Sociales
            if (fileGaleriaRedes.files.length > 0) {
                for (let i = 0; i < fileGaleriaRedes.files.length; i++) {
                    const urlNueva = await subirImagen(fileGaleriaRedes.files[i], 'redes_social');
                    if(urlNueva) redesGaleriaActual.push(urlNueva);
                }
            }

           // 🆕 NUEVO: Recolectar los 3 posts (link + foto), subiendo fotos nuevas si las hay
            const construirPost = async (inputLink, fileInput, imgPreview, carpeta) => {
                const link = inputLink && inputLink.value.trim();
                if (!link) return null;
                const foto = await procesarImagenUnica(fileInput, imgPreview, carpeta);
                return { link, foto: foto || '' };
            };

            const nuevosPostsIg = [];
            const p1 = await construirPost(inPostIg1, filePostIg1, previewPostIg1, 'post_ig_1');
            const p2 = await construirPost(inPostIg2, filePostIg2, previewPostIg2, 'post_ig_2');
            const p3 = await construirPost(inPostIg3, filePostIg3, previewPostIg3, 'post_ig_3');
            if (p1) nuevosPostsIg.push(p1);
            if (p2) nuevosPostsIg.push(p2);
            if (p3) nuevosPostsIg.push(p3);

            // 3. Preparar objeto para BD
            const datosActualizados = {
                // (Tus datos existentes...)
                direccion: inDir.value,
                telefono: inTel.value,
                horarios: inHor.value,
                datos_bancarios: inBanco.value,
                categoria: inCategoria.value, 
                lat: parseFloat(inLat.value) || null,
                longitud: parseFloat(inLong.value) || null,
                logo_url: urlLogo,
                qr_pago_url: urlQR,
                foto_lugar_url: urlLugar, 
                nombre: inNombre.value,
                mensaje_ticket: inMensajeTicket.value,
                wifi: inWifi.value,
                instagram: inInstagram.value,
                whatsapp_dueno: document.getElementById('inputWhatsappDueno').value.replace(/\D/g, ''),
                galeria_menu: menuGaleriaActual,
                facebook_url: inFacebook.value,
                galeria_redes: redesGaleriaActual,
                
                // 🆕 NUEVO: Enviamos el arreglo a la BD
                posts_instagram: nuevosPostsIg
            };
            // 4. Actualizar en Supabase
            const { error } = await db
                .from('restaurantes')
                .update(datosActualizados)
                .eq('id', restoId);

            if (error) throw error;

            alert("✅ ¡Ajustes actualizados correctamente!");
            // Recargamos para ver cambios limpios (y limpiar inputs de archivos)
            window.location.reload();

        } catch (e) {
            console.error(e);
            alert("❌ Error al guardar: " + e.message);
            btnGuardar.disabled = false;
            btnGuardar.textContent = "💾 Guardar Todos los Cambios";
        }
    };

    // Iniciar
    cargarDatos();
});