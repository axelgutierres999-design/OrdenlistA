// Verifica si el usuario está logueado
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        // Si no hay sesión, mandarlo al login
        window.location.href = "index.html";
    } else {
        // Guardamos el ID del negocio globalmente para que otros JS lo usen
        window.NEGOCIO_ID = session.user.id;
        console.log("Sesión activa para el negocio:", window.NEGOCIO_ID);
    }
}

checkSession();