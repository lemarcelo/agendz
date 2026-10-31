/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Service worker do site real (v130): só mostra o aviso que o servidor manda com o app fechado e, ao tocar, abre ou foca o site.
// Não guarda nada em cache, não faz pedido de rede e não conhece senha nem token. Publicado como /sw.js (build --real).
import { lerMensagem } from './domain/push.js';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', (e) => {
  let bruto = '';
  try { bruto = e.data ? e.data.text() : ''; } catch { bruto = ''; }
  const m = lerMensagem(bruto);
  e.waitUntil(self.registration.showNotification(m.titulo, { body: m.texto, tag: m.tag, data: { url: m.url }, icon: '/icone.svg', badge: '/icone.svg', renotify: true }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abertas) { if ('focus' in c) { await c.focus(); return; } }
    await self.clients.openWindow(url);
  })());
});
