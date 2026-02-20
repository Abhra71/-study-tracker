// ============================================================
//  sw.js — Service Worker for Study Tracker
//  Handles background push notifications
// ============================================================

const CACHE_NAME = "study-tracker-v1";

// Install
self.addEventListener("install", function(e) {
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", function(e) {
  e.waitUntil(clients.claim());
});

// Show notification when pushed from server (future use)
self.addEventListener("push", function(e) {
  const data = e.data ? e.data.json() : { title: "📚 Study Tracker", body: "You have revisions due today!" };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icon.png",
      badge: "icon.png",
      tag: "study-tracker",
      vibrate: [200, 100, 200]
    })
  );
});

// Handle notification click — open the app
self.addEventListener("notificationclick", function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url && "focus" in clientList[i]) {
          return clientList[i].focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("./");
      }
    })
  );
});
