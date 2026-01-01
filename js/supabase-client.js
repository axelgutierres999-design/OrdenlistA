// js/supabase-client.js

// 1. Tus credenciales (NO LAS CAMBIES, ESTÁN BIEN)
const SUPABASE_URL = "https://cpveuexgxwxjejurtwro.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc";

// 2. Verificación de Seguridad
if (typeof supabase === 'undefined') {
    console.error("❌ ERROR CRÍTICO: La librería de Supabase no se cargó. Revisa el index.html");
} else {
    // 3. Creación de la conexión GLOBAL llamada 'window.db'
    // Usamos 'window.db' para que login.js y app.js puedan verla
    window.db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ CONEXIÓN EXITOSA: Variable 'db' creada y lista para usar.");
}