/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Boxes do site real (estética, só o proprietário): nome e situação de cada box. A regra (1 a 20, nome até 30 sem repetir, ao menos um ativo, box com histórico
// só se desativa, box com carro agendado não se desativa) é do servidor (PUT /api/estabelecimento/boxes); a tela mostra a mensagem dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS próprias terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { boxes as api } from '../../services/api-real.js';
import { erroDosBoxes } from '../../domain/atender-form.js';
import { Aviso, Btn, Icone } from '../leve/mini.jsx';

export default function Boxes() {
  const [lista, setLista] = useState(null); // [{ chave, id?, nome, ativo }]
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [seq, setSeq] = useState(0);

  const carregar = async () => {
    const r = await api.listar();
    if (!r.ok) { setErro(r.erro); setLista([]); return; }
    setErro(''); setLista(r.boxes.map((b) => ({ chave: b.id, id: b.id, nome: b.nome, ativo: b.ativo })));
  };
  useEffect(() => { carregar(); }, []);

  const mudar = (chave, campo, valor) => { setLista((l) => l.map((b) => (b.chave === chave ? { ...b, [campo]: valor } : b))); setErro(''); setOk(''); };
  const novo = () => { setLista((l) => [...l, { chave: `novo-${seq}`, nome: `Box ${l.length + 1}`, ativo: true }]); setSeq(seq + 1); setErro(''); setOk(''); };
  const tirar = (chave) => { setLista((l) => l.filter((b) => b.chave !== chave)); setErro(''); setOk(''); };
  const salvar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    const aviso = erroDosBoxes(lista);
    if (aviso) { setErro(aviso); return; }
    setSalvando(true); setErro(''); setOk('');
    const r = await api.gravar(lista.map((b) => ({ id: b.id, nome: b.nome, ativo: b.ativo })));
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setLista(r.boxes.map((b) => ({ chave: b.id, id: b.id, nome: b.nome, ativo: b.ativo })));
    setOk('Boxes salvos.');
  };

  return (
    <section className="tela boxes-real" data-testid="boxes-real">
      <h2>Boxes</h2>
      <p className="muted">Cada box atende um carro por vez. O Atender escolhe um box livre sozinho (ou você escolhe) e o carro fica no box até a retirada.</p>
      {lista === null && <p className="muted" role="status">Carregando…</p>}
      {lista !== null && (
        <form className="boxes-real-form" onSubmit={salvar} data-testid="boxes-form">
          <ul className="boxes-real-lista" data-testid="boxes-lista">
            {lista.map((b, i) => (
              <li key={b.chave} className="boxes-real-linha" data-testid={`box-linha-${i}`}>
                <input value={b.nome} maxLength={30} autoComplete="off" onChange={(e) => mudar(b.chave, 'nome', e.target.value)} aria-label={`Nome do box ${i + 1}`} data-testid={`box-nome-${i}`} />
                <label className="check-linha"><input type="checkbox" checked={b.ativo} onChange={(e) => mudar(b.chave, 'ativo', e.target.checked)} data-testid={`box-ativo-${i}`} /><span>Ativo</span></label>
                <button type="button" className="icone-btn" onClick={() => tirar(b.chave)} aria-label={`Remover ${b.nome || `box ${i + 1}`}`} data-testid={`box-remover-${i}`}><Icone n="trash" size={16} /></button>
              </li>
            ))}
          </ul>
          {erro && <Aviso tipo="erro" data-testid="boxes-erro">{erro}</Aviso>}
          {ok && <Aviso data-testid="boxes-ok">{ok}</Aviso>}
          <div className="acoes">
            <Btn tamanho="sm" onClick={novo} disabled={lista.length >= 20} data-testid="box-novo"><Icone n="plus" size={15} /> Novo box</Btn>
            <Btn variante="primario" tamanho="sm" type="submit" disabled={salvando} data-testid="boxes-salvar">{salvando ? 'Salvando…' : 'Salvar'}</Btn>
          </div>
          <p className="muted">Box que já atendeu não é removido: desative. Box com carro agendado só desativa depois de remarcar.</p>
        </form>
      )}
    </section>
  );
}
