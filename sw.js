const CACHE_NAME = 'theo-pro-v2'; // Version incrémentée
const STATIC_ASSETS = [
  '/',
  'index.html',
  'manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// Fichiers qui ne doivent PAS être mis en cache
const NO_CACHE_PATTERNS = [
  /api\.groq\.com/,
  /firebase/,
  /googleapis/,
  /gstatic\.com/,
  /cloudinary\.com/,
  /recognition/,
  /speech/
];

self.addEventListener('install', event => {
  console.log('🔄 Installation du Service Worker v2');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Mise en cache des assets statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('✅ Skip waiting');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', event => {
  console.log('⚡ Activation du Service Worker v2');
  event.waitUntil(
    Promise.all([
      // Nettoyer les anciens caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Suppression du cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Prendre le contrôle immédiatement
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // === STRATÉGIE 1: API - Pas de cache ===
  if (NO_CACHE_PATTERNS.some(pattern => pattern.test(url))) {
    console.log('🌐 API/Externe (pas de cache):', url);
    event.respondWith(fetch(event.request));
    return;
  }

  // === STRATÉGIE 2: Fichiers statiques - Cache puis réseau ===
  if (STATIC_ASSETS.some(asset => url.includes(asset) || url.endsWith(asset))) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Mettre à jour le cache en arrière-plan
            fetch(event.request).then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, networkResponse);
                });
              }
            }).catch(() => {});
            return cachedResponse;
          }
          return fetch(event.request);
        })
    );
    return;
  }

  // === STRATÉGIE 3: Autres ressources - Réseau d'abord avec fallback cache ===
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Mettre en cache si succès
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback vers le cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Fallback vers la page d'accueil
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
            return new Response('Ressource non disponible', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// === GESTION DES MESSAGES POUR MISE À JOUR ===
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Forcer la mise à jour du cache
  if (event.data && event.data.type === 'FORCE_REFRESH') {
    console.log('🔄 Rafraîchissement forcé du cache');
    caches.open(CACHE_NAME).then(cache => {
      cache.addAll(STATIC_ASSETS);
    });
  }
  
  // Nettoyer le cache spécifique
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('🧹 Nettoyage du cache');
    caches.delete(CACHE_NAME);
  }
});

// === GESTION DES NOTIFICATIONS PUSH ===
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nouvelle notification',
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/',
        dateOfArrival: Date.now()
      },
      actions: [
        {
          action: 'open',
          title: '📱 Ouvrir',
          icon: '/icon-72x72.png'
        },
        {
          action: 'close',
          title: '❌ Fermer',
          icon: '/icon-72x72.png'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification('NAC-Business', options)
    );
  } catch (e) {
    // Fallback pour texte simple
    const options = {
      body: event.data.text(),
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png'
    };
    event.waitUntil(
      self.registration.showNotification('NAC-Business', options)
    );
  }
});

// === CLIC SUR NOTIFICATION ===
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(windowClients => {
          // Si une fenêtre est déjà ouverte, la focus
          for (let client of windowClients) {
            if (client.url === urlToOpen && 'focus' in client) {
              return client.focus();
            }
          }
          // Sinon ouvrir une nouvelle fenêtre
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// === GESTION DES ERREURS ===
self.addEventListener('error', event => {
  console.error('❌ Erreur SW:', event.message);
});

self.addEventListener('unhandledrejection', event => {
  console.error('❌ Promesse rejetée SW:', event.reason);
});
