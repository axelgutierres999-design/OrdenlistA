// sw.js — Service Worker de OrdenLista
// Corre en segundo plano independiente de qué página esté abierta.
// Recibe mensajes de la app y dispara notificaciones nativas del navegador.

const SW_VERSION = 'v1';

// ── Instalación inmediata ──────────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Instalado', SW_VERSION);
    self.skipWaiting(); // Activa inmediatamente sin esperar recarga
});

// ── Activación: toma control de todas las pestañas ────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activado', SW_VERSION);
    event.waitUntil(self.clients.claim());
});

// ── Recibir mensajes desde la app (app.js) ────────────────────────
// La app le envía { tipo, titulo, subtitulo, url } al SW
self.addEventListener('message', event => {
    const { tipo, titulo, subtitulo, url } = event.data || {};
    if (!tipo) return;

    const iconos = {
        orden:   '🔔',
        reserva: '📅',
        listo:   '🛎️',
        recoger: '🚶'
    };

    const colores = {
        orden:   '#e53935',
        reserva: '#f39c12',
        listo:   '#10ad93',
        recoger: '#3498db'
    };

    // Disparar notificación nativa del sistema operativo
    self.registration.showNotification(`${iconos[tipo] || '🔔'} ${titulo}`, {
        body:    subtitulo || '',
        icon:    '/favicon.ico',   // usa tu favicon, o cambia la ruta
        badge:   '/favicon.ico',
        tag:     tipo,             // agrupa notificaciones del mismo tipo
        renotify: true,            // suena aunque ya haya una del mismo tag
        data:    { url: url || '/' },
        vibrate: [200, 100, 200],  // patrón de vibración en móvil
        requireInteraction: false  // se cierra sola después de unos segundos
    });
});

// ── Click en la notificación: abrir/enfocar la página correcta ────
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const destino = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Si ya hay una pestaña abierta del sitio, enfócala
                for (const client of clientList) {
                    if (client.url.includes(destino) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Si no, abre una pestaña nueva
                if (self.clients.openWindow) {
                    return self.clients.openWindow(destino);
                }
            })
    );
});