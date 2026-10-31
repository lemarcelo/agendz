/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Portes de veículo do site real (estética, só o proprietário): nome, exemplos, situação e ordem. A regra (1 a 12, nome 2–20 sem repetir, o Médio fica e ativo,
// porte usado só se desativa) é do servidor (PUT /api/estabelecimento/portes); a tela mostra a mensagem dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS próprias terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { portes as api, servicos as apiServicos } from '../../services/api-real.js';
import { LIMITE_PORTES, PORTE_PADRAO, definirPortes } from '../../domain/veiculos.js';
import { fatorDeTexto, fatorEmTexto } from '../../domain/previa-portes.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import PreviaPortes from '../leve/PreviaPortes.jsx';

const comChave = (l) => l.map((x) => ({ chave: x.id, ...x, fator: fatorEmTexto(x.fator ?? 1) })); // o fator fica como texto enquanto se digita (1,25)

export default function Portes() {
  const [lista, setLista] = useState(null); // [{ chave, id?, nome, exemplo, ativo }]
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [seq, setSeq] = useState(0);
  const [servicos, setServicos] = useState([]); // só para a prévia de preços; se falhar, a prévia fica vazia

  useEffect(() => {
    api.listar().then((r) => { if (!r.ok) { setErro(r.erro); setLista([]); return; } setLista(comChave(r.portes)); });
    apiServicos.listar().then((r) => { if (r.ok) setServicos(r.servicos); });
  }, []);

  const mudar = (chave, patch) => { setLista((l) => l.map((x) => (x.chave === chave ? { ...x, ...patch } : x))); setErro(''); setOk(''); };
  const mover = (i, d) => { setLista((l) => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; }); setOk(''); };
  const novo = () => { setLista((l) => [...l, { chave: `novo-${seq}`, nome: '', exemplo: '', ativo: true, fator: '1' }]); setSeq(seq + 1); setErro(''); setOk(''); };
  const tirar = (chave) => { setLista((l) => l.filter((x) => x.chave !== chave)); setErro(''); setOk(''); };
  const salvar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    const ruim = lista.find((x) => x.id !== PORTE_PADRAO && fatorDeTexto(x.fator) === null);
    if (ruim) { setErro(`O fator do porte ${ruim.nome || 'novo'} vai de 0,10 a 10.`); return; }
    setSalvando(true); setErro(''); setOk('');
    const r = await api.gravar(lista.map((x) => ({ id: x.id, nome: x.nome, exemplo: x.exemplo, ativo: x.ativo, fator: x.id === PORTE_PADRAO ? 1 : fatorDeTexto(x.fator) })));
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    definirPortes(r.portes); // as outras telas passam a usar a lista nova
    setLista(comChave(r.portes));
    setOk('Portes salvos.');
  };

  return (
    <section className="portes-real" data-testid="portes-real">
      <p className="muted">O porte do veículo muda o preço do serviço: <b>preço do serviço (Médio) × fator do porte</b>. Para um valor diferente num porte, use <b>Preço específico por porte</b> no serviço. Quem não escolhe fica no <b>Médio</b>.</p>
      {lista === null && <p className="muted" role="status">Carregando…</p>}
      {lista !== null && (
        <form className="portes-real-form" onSubmit={salvar} data-testid="portes-form">
          <ul className="portes-real-lista" data-testid="portes-lista">
            {lista.map((x, i) => (
              <li key={x.chave} className="portes-real-linha" data-testid={`porte-linha-${i}`}>
                <input value={x.nome} maxLength={20} autoComplete="off" onChange={(e) => mudar(x.chave, { nome: e.target.value })} aria-label={`Nome do porte ${i + 1}`} data-testid={`porte-nome-${i}`} />
                <input value={x.exemplo} maxLength={60} autoComplete="off" placeholder="Ex.: Onix, HB20" onChange={(e) => mudar(x.chave, { exemplo: e.target.value })} aria-label={`Exemplos do porte ${i + 1}`} data-testid={`porte-exemplo-${i}`} />
                <Campo rotulo="Fator"><input className="porte-fator" inputMode="decimal" value={x.id === PORTE_PADRAO ? '1' : x.fator ?? ''} disabled={x.id === PORTE_PADRAO} maxLength={5} autoComplete="off" onChange={(e) => mudar(x.chave, { fator: e.target.value })} data-testid={`porte-fator-${i}`} /></Campo>
                <label className="check-linha"><input type="checkbox" checked={x.ativo} disabled={x.id === PORTE_PADRAO} onChange={(e) => mudar(x.chave, { ativo: e.target.checked })} data-testid={`porte-ativo-${i}`} /><span>Ativo</span></label>
                <button type="button" className="icone-btn" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${x.nome || `porte ${i + 1}`}`} data-testid={`porte-sobe-${i}`}><Icone n="up" size={16} /></button>
                <button type="button" className="icone-btn" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${x.nome || `porte ${i + 1}`}`} data-testid={`porte-desce-${i}`}><Icone n="down" size={16} /></button>
                {!x.id && <button type="button" className="icone-btn" onClick={() => tirar(x.chave)} aria-label={`Remover porte ${i + 1}`} data-testid={`porte-remover-${i}`}><Icone n="trash" size={16} /></button>}
              </li>
            ))}
          </ul>
          {erro && <Aviso tipo="erro" data-testid="portes-erro">{erro}</Aviso>}
          {ok && <Aviso data-testid="portes-ok">{ok}</Aviso>}
          <div className="acoes">
            <Btn tamanho="sm" onClick={novo} disabled={lista.length >= LIMITE_PORTES} data-testid="porte-novo"><Icone n="plus" size={15} /> Novo porte</Btn>
            <Btn variante="primario" tamanho="sm" type="submit" disabled={salvando} data-testid="portes-salvar">{salvando ? 'Salvando…' : 'Salvar'}</Btn>
          </div>
          <PreviaPortes servicos={servicos.map((s) => ({ ...s, ativo: s.ativo }))} portes={lista} />
          <p className="muted">Porte já usado em veículo ou atendimento não é removido: desative.</p>
        </form>
      )}
    </section>
  );
}
