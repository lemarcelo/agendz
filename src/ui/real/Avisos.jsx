/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Avisos do painel no site real (5e-2): o que o cliente fez pelo link (pediu horário, remarcou, cancelou). Lê GET /api/avisos (o profissional vê só os
// do próprio horário; dono e equipe veem todos) e marca como lido com PUT /api/avisos/{id}/lido. Quem não tem acesso à agenda não vê o cartão.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { avisos as api } from '../../services/api-real.js';
import { Aviso, Btn, Icone } from '../leve/mini.jsx';

const quando = (ts) => (ts === null ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts)));
const ICONE = { pedido: 'plus', remarcou: 'calendar', cancelou: 'x' };

export default function Avisos() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [marcando, setMarcando] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.listar().then((r) => { if (!vivo) return; if (r.ok) setLista(r.avisos); else if (r.status === 403) setLista(false); else { setErro(r.erro); setLista([]); } });
    return () => { vivo = false; };
  }, []);

  if (lista === false) return null; // sem acesso à agenda: não há o que mostrar
  if (lista === null) return <section className="avisos-real" data-testid="avisos-real"><p className="muted" role="status">Carregando avisos…</p></section>;
  const novos = lista.filter((a) => !a.lido).length;
  const lido = async (a) => {
    if (marcando) return;
    setMarcando(a.id); setErro('');
    const r = await api.marcarLido(a.id);
    setMarcando(null);
    if (!r.ok) { setErro(r.erro); return; }
    setLista((l) => l.map((x) => (x.id === a.id ? { ...x, lido: true } : x)));
  };
  return (
    <section className="avisos-real" data-testid="avisos-real" aria-label="Avisos">
      <h3>Avisos {novos > 0 && <span className="chip st-roxo" data-testid="avisos-novos">{novos} {novos === 1 ? 'novo' : 'novos'}</span>}</h3>
      {erro && <Aviso tipo="erro"><span data-testid="avisos-erro">{erro}</span></Aviso>}
      {!lista.length && <p className="muted" data-testid="avisos-vazio">Nenhum aviso. Quando um cliente pedir, remarcar ou cancelar pelo link, aparece aqui.</p>}
      <ul className="avisos-lista-real">
        {lista.map((a) => (
          <li key={a.id} className={a.lido ? 'lido' : 'novo'} data-testid={`aviso-${a.id}`}>
            <Icone n={ICONE[a.tipo] || 'bell'} size={16} />
            <div><span>{a.texto}</span><br /><small className="muted">{quando(a.em)}</small></div>
            {!a.lido && <Btn tamanho="sm" onClick={() => lido(a)} disabled={marcando === a.id} data-testid={`aviso-lido-${a.id}`}>Lido</Btn>}
          </li>
        ))}
      </ul>
    </section>
  );
}
