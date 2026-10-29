/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Relatórios do proprietário no site real: faturamento do período (concluídos: serviços com o desconto do cupom abatido + produtos), previsto, ticket médio, por
// profissional, serviço, produto, forma de pagamento e por dia. Toda a conta está no servidor (RelatorioService); a tela só mostra o que ele devolve.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useRef, useState } from 'react';
import { relatorios as api } from '../../services/api-real.js';
import { fmtMoney } from '../../domain/time.js';
import { mesDe } from '../../domain/periodo-comissao.js';
import { Aviso } from '../leve/mini.jsx';
import Periodo from './Periodo.jsx';

const completo = (p) => !!(p.mes || (p.de && p.ate));
const FORMA = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', nao_informada: 'Não informada' };
const dia = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);

function Bloco({ titulo, testid, vazio, children }) {
  return (
    <section className="rel-bloco-real" data-testid={testid}>
      <h2>{titulo}</h2>
      {children || <p className="muted">{vazio}</p>}
    </section>
  );
}

function Linhas({ itens, rotulo, detalhe, valor }) {
  if (!itens.length) return null;
  return (
    <ul className="rel-lista-real">
      {itens.map((x, i) => (
        <li key={`${rotulo(x)}-${i}`}><span className="rel-nome-real"><b>{rotulo(x)}</b><small className="muted">{detalhe(x)}</small></span><strong>{fmtMoney(valor(x))}</strong></li>
      ))}
    </ul>
  );
}

export default function Relatorios() {
  const [per, setPer] = useState(() => ({ mes: mesDe(Date.now()) }));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const ultima = useRef(0);

  useEffect(() => {
    if (!completo(per)) { setDados(null); return undefined; }
    const n = ++ultima.current;
    (async () => {
      const r = await api.obter(per);
      if (n !== ultima.current) return; // chegou resposta de uma consulta antiga
      if (!r.ok) { setErro(r.erro); setDados(null); return; }
      setErro(''); setDados(r);
    })();
    return () => { ultima.current += 1; };
  }, [per]);

  const t = dados && dados.totais;
  return (
    <section className="tela relatorios-real" data-testid="relatorios">
      <header className="tela-topo"><h1>Relatórios</h1></header>
      <Periodo valor={per} aoMudar={(p) => { setPer(p); }} />
      {erro && <Aviso tipo="erro" data-testid="rel-erro">{erro}</Aviso>}
      {!dados && !erro && <p className="muted" role="status" data-testid="rel-carregando">Carregando…</p>}
      {dados && (
        <>
          <div className="rel-cartoes-real" data-testid="rel-totais">
            <div className="rel-cartao-real"><small>Faturamento</small><strong data-testid="rel-total">{fmtMoney(t.total)}</strong></div>
            <div className="rel-cartao-real"><small>Atendimentos</small><strong data-testid="rel-atendimentos">{t.atendimentos}</strong></div>
            <div className="rel-cartao-real"><small>Ticket médio</small><strong data-testid="rel-ticket">{fmtMoney(t.ticketMedio)}</strong></div>
            <div className="rel-cartao-real"><small>Serviços</small><strong data-testid="rel-servicos">{fmtMoney(t.servicos)}</strong></div>
            <div className="rel-cartao-real"><small>Produtos</small><strong data-testid="rel-produtos">{fmtMoney(t.produtos)}</strong></div>
            <div className="rel-cartao-real"><small>Descontos (cupom)</small><strong data-testid="rel-descontos">{fmtMoney(t.descontos)}</strong></div>
          </div>
          <p className="muted" data-testid="rel-previsto">Previsto (a confirmar e confirmados no período): {dados.previsto.atendimentos} {dados.previsto.atendimentos === 1 ? 'atendimento' : 'atendimentos'}, {fmtMoney(dados.previsto.total)}.</p>
          <Bloco titulo="Por profissional" testid="rel-por-profissional" vazio="Nenhum atendimento concluído no período.">
            <Linhas itens={dados.porProfissional} rotulo={(x) => x.nome} detalhe={(x) => `${x.atendimentos} atend. · serviços ${fmtMoney(x.servicos)} · produtos ${fmtMoney(x.produtos)}`} valor={(x) => x.total} />
          </Bloco>
          <Bloco titulo="Por serviço" testid="rel-por-servico" vazio="Nenhum serviço no período.">
            <Linhas itens={dados.porServico} rotulo={(x) => x.nome} detalhe={(x) => `${x.qtd}×`} valor={(x) => x.valor} />
          </Bloco>
          <Bloco titulo="Produtos vendidos" testid="rel-por-produto" vazio="Nenhum produto vendido no período.">
            <Linhas itens={dados.porProduto} rotulo={(x) => x.nome} detalhe={(x) => `${x.qtd} un.`} valor={(x) => x.valor} />
          </Bloco>
          <Bloco titulo="Forma de pagamento" testid="rel-por-forma" vazio="Sem atendimentos no período.">
            <Linhas itens={dados.porForma} rotulo={(x) => FORMA[x.forma] || x.forma} detalhe={(x) => `${x.atendimentos} atend.`} valor={(x) => x.total} />
          </Bloco>
          <Bloco titulo="Por dia" testid="rel-por-dia" vazio="Sem atendimentos no período.">
            <Linhas itens={dados.porDia} rotulo={(x) => dia(x.dia)} detalhe={(x) => `${x.atendimentos} atend.`} valor={(x) => x.total} />
          </Bloco>
        </>
      )}
    </section>
  );
}
