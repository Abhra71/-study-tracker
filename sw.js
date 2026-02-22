// ============================================================
//  sw.js — Service Worker for Study Tracker
//  Handles background push notifications (future/server-triggered)
// ============================================================

const CACHE_NAME = "study-tracker-v2";

// Install
self.addEventListener("install", function (e) {
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", function (e) {
  e.waitUntil(clients.claim());
});

// Show notification when pushed from server (future use)
self.addEventListener("push", function (e) {
  let data = { title: "📚 Study Tracker", body: "You have revisions due today!" };
  try {
    if (e.data) data = e.data.json();
  } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title || "📚 Study Tracker", {
      body: data.body || "You have revisions due today!",
      icon: "icon.png",
      badge: "icon.png",
      tag: "study-tracker",
      vibrate: [200, 100, 200],
    })
  );
});

// Handle notification click — focus existing app tab or open app
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if ("focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});
