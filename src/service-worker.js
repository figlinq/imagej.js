/**
 * ImageJ.js Service Worker
 * Version: 0.6.0
 * 
 * Simple, upgrade-friendly service worker that:
 * - Caches essential static assets for performance
 * - Always fetches HTML fresh (network-first)
 * - Automatically cleans up old caches
 * - Bypasses cache for iframe contexts
 */

const CACHE_VERSION = 'imagej-v0.6.0';
const PREVIOUS_CACHES = [
  'imagej-v0.5.9',
  'imagej-v0.5.8',
  'offline' // Old cache name
];

// Assets that are safe to cache and rarely change
const STATIC_ASSETS = [
  '/style.css',
  '/assets/img/imagej-js-splash.jpg',
  '/assets/img/imagej-js-loading.gif',
  '/assets/icons/chrome/chrome-favicon-16-16.png',
  '/manifest.webmanifest'
];

// File types that are safe to cache
const CACHEABLE_TYPES = [
  '.css',
  '.js',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf'
];

// Install event - cache essential assets
self.addEventListener('install', function(event) {
  console.log('[ServiceWorker] Installing version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      console.log('[ServiceWorker] Caching essential assets');
      // Only cache the most essential assets on install
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('[ServiceWorker] Failed to cache some assets:', err);
        // Don't fail installation if some assets can't be cached
        return Promise.resolve();
      });
    }).then(function() {
      // Skip waiting to become active immediately
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  console.log('[ServiceWorker] Activating version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // Delete old caches and any cache not matching current version
          if (cacheName !== CACHE_VERSION) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - smart caching strategy
self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Check if this is an iframe context (has hash parameters from hypha-rpc)
  const isIframeContext = url.hash.includes('client_id=') || 
                         url.hash.includes('workspace=') ||
                         url.search.includes('iframe=true');
  
  // Bypass cache completely for iframe contexts
  if (isIframeContext) {
    console.log('[ServiceWorker] Bypassing cache for iframe context:', url.pathname);
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip external requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Skip service worker updates (important!)
  if (url.pathname === '/service-worker.js') {
    return;
  }
  
  // Determine caching strategy based on request type
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    // HTML: Network first, fall back to cache
    event.respondWith(
      fetch(request).then(function(response) {
        // Update cache with fresh HTML
        if (response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_VERSION).then(function(cache) {
            cache.put(request, responseToCache);
          });
        }
        return response;
      }).catch(function() {
        // If network fails, try cache
        return caches.match(request);
      })
    );
  } else if (shouldCache(url.pathname)) {
    // Static assets: Cache first, fall back to network
    event.respondWith(
      caches.match(request).then(function(response) {
        if (response) {
          // Found in cache
          return response;
        }
        
        // Not in cache, fetch from network
        return fetch(request).then(function(response) {
          // Cache successful responses
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_VERSION).then(function(cache) {
              cache.put(request, responseToCache);
            });
          }
          return response;
        });
      })
    );
  } else {
    // Everything else: Just fetch from network
    event.respondWith(fetch(request));
  }
});

// Listen for messages from the main thread
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLAIM_CLIENTS') {
    console.log('[ServiceWorker] Received CLAIM_CLIENTS message');
    self.clients.claim();
  }
});

// Helper function to determine if a resource should be cached
function shouldCache(pathname) {
  // Check if it's a known static asset
  if (STATIC_ASSETS.includes(pathname)) {
    return true;
  }
  
  // Check file extension
  for (const ext of CACHEABLE_TYPES) {
    if (pathname.endsWith(ext)) {
      return true;
    }
  }
  
  // Check for specific paths that should be cached
  if (pathname.startsWith('/assets/') || 
      pathname.startsWith('/dist/') && pathname.endsWith('.js')) {
    return true;
  }
  
  return false;
}

// Log service worker info
console.log('[ServiceWorker] Loaded version:', CACHE_VERSION);