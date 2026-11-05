/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
// Único acesso externo da homologação: túneis TLS para provedores de Web Push conhecidos.
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

const provedores=['fcm.googleapis.com','push.services.mozilla.com','push.apple.com','notify.windows.com'];
export function destinoPermitido(host, porta) {
  const h=String(host || '').toLowerCase();
  return porta===443 && provedores.some((p) => h===p || h.endsWith('.'+p));
}
export function ipPublico(ip) {
  if (net.isIP(ip)!==4) return false;
  const p=ip.split('.').map(Number);
  const n=(((p[0]*256+p[1])*256+p[2])*256+p[3])>>>0;
  const redes=[['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]];
  return !redes.some(([base,bits]) => { const a=base.split('.').map(Number); const b=(((a[0]*256+a[1])*256+a[2])*256+a[3])>>>0; const mask=(0xffffffff << (32-bits))>>>0; return (n&mask)===(b&mask); });
}
export function criarProxy() {
  const servidor=http.createServer({ maxHeaderSize:8192 }, (_req,res) => { res.writeHead(405); res.end(); });
  servidor.maxConnections=100;
  servidor.on('connect', async (req, cliente, inicio) => {
    const recusar=() => { if (!cliente.destroyed) cliente.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); };
    cliente.setTimeout(30000, () => cliente.destroy());
    try {
      if (!/^[a-zA-Z0-9.-]+:443$/.test(req.url || '')) return recusar();
      const host=req.url.slice(0,-4).toLowerCase();
      if (!destinoPermitido(host,443)) return recusar();
      const ips=await dns.lookup(host,{all:true,family:4});
      const ip=ips.map((x) => x.address).find(ipPublico);
      if (!ip || cliente.destroyed) return recusar();
      const externo=net.connect({host:ip,port:443});
      externo.setTimeout(30000, () => externo.destroy());
      externo.once('connect', () => {
        cliente.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (inicio.length) externo.write(inicio);
        cliente.pipe(externo); externo.pipe(cliente);
      });
      externo.on('error', () => cliente.destroy());
      cliente.on('error', () => externo.destroy());
      cliente.on('close', () => externo.destroy());
      externo.on('close', () => cliente.destroy());
    } catch { recusar(); }
  });
  return servidor;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) criarProxy().listen(3128,'0.0.0.0');
