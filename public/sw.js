// Service worker do Mural QGO — só cuida de mostrar as notificações push.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Mural QGO", body: event.data ? event.data.text() : "Novo aviso no mural" };
  }

  const title = data.title || "Mural QGO";
  const options = {
    body: data.body || "Novo aviso no mural",
    icon: "/icon-192.png",
    badge: "/favicon.png",
    // Padrão de vibração — muda conforme o som escolhido nas Configurações
    // (sino/sirene/bipe), mandado pelo servidor em data.vibrate. Só o
    // Android obedece isso; o iOS ignora tanto vibração quanto qualquer som
    // personalizado em notificação push (limitação do próprio sistema, não
    // dá pra contornar via código: nenhum navegador deixa a página escolher
    // o arquivo de som tocado quando o app está fechado, só o som padrão do
    // aparelho).
    vibrate: Array.isArray(data.vibrate) && data.vibrate.length ? data.vibrate : [200, 100, 200, 100, 400],
    requireInteraction: true,
    data: { url: data.url || "/app" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
