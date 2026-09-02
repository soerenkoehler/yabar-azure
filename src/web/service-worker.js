const CACHE_NAME = 'yabar-pwa-v1';

const CORE_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/auth.js',
    '/api.js',
    '/aes.js',
    '/base64.js',
    '/manifest.webmanifest',
    '/offline.html',
    '/burn-after-reading-small.png',
    '/maytra.regular.woff2',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== CACHE_NAME)
                .map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

const isSameOriginStaticAsset = (request) => {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return false;
    }

    if (url.pathname.startsWith('/api/')) {
        return false;
    }

    return ['script', 'style', 'image', 'font'].includes(request.destination)
        || url.pathname.endsWith('.webmanifest');
};

self.addEventListener('fetch', (event) => {
    // Intercept Google GSI credential POST from redirect-mode sign-in (PWA standalone).
    // When GSI redirects back after authentication it POSTs `credential` as form data to
    // the login_uri (our origin). We extract the credential and convert it into a GET
    // redirect with the token in the URL hash so the SPA can consume it without a server.
    if (event.request.method === 'POST' && event.request.mode === 'navigate') {
        const url = new URL(event.request.url);
        if (url.origin === self.location.origin) {
            event.respondWith((async () => {
                try {
                    const formData = await event.request.formData();
                    const credential = formData.get('credential');
                    if (credential) {
                        const redirectTo = new URL('/', self.location.origin);
                        redirectTo.hash = `gsi_credential=${encodeURIComponent(credential)}`;
                        return Response.redirect(redirectTo.href, 303);
                    }
                } catch {
                    // fall through to network
                }
                return fetch(event.request);
            })());
            return;
        }
    }

    if (event.request.method !== 'GET') {
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(event.request);
                const cache = await caches.open(CACHE_NAME);
                cache.put('/index.html', networkResponse.clone());
                return networkResponse;
            } catch {
                return (await caches.match('/index.html')) || (await caches.match('/offline.html'));
            }
        })());
        return;
    }

    if (!isSameOriginStaticAsset(event.request)) {
        return;
    }

    event.respondWith((async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
            return cachedResponse;
        }

        const networkResponse = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
    })());
});
