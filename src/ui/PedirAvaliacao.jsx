/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estrela no cartão do atendimento concluído: pede a avaliação ao cliente pelo WhatsApp (aba nova com a mensagem e o link prontos; o link também é copiado).
// Cliente sem telefone, sem cadastro ou que pediu para não receber: a tela diz isso (nunca silêncio). O token nasce no clique de confirmar e aparece uma vez.
import React, { useMemo, useState } from 'react';
import { avaliacoes } from '../services/api.js';
import { textoPedidoAvaliacao, MODELO_AVALIACAO_PADRAO, avaliacaoDoCartao, rotuloDaNota, NOTA_MAX } from '../domain/avaliacoes.js';
import { ehDono } from '../domain/rules.js';
import { fmtDateShort } from '../domain/time.js';
import { Aviso, Btn, Icon, Modal } from './common.jsx';
import { linkDaAvaliacao } from './avaliacao-link.js';
import { copiarTexto } from './clipboard.js';
import { nomeCliente } from './format.js';
import { toast, useStore, useUser } from './hooks.js';
import { abrirWhatsapp } from './whatsapp.js';

const TESTID_SEM = { sem_telefone: 'avaliar-sem-telefone', sem_cadastro: 'avaliar-sem-cadastro', sem_mensagens: 'avaliar-sem-mensagens' };
const TITULO_SEM = { sem_telefone: 'Cliente sem telefone', sem_cadastro: 'Atendimento sem cadastro', sem_mensagens: 'Cliente não quer mensagens' };

// Estrelas só de enfeite/leitura (nota 1 a 5): as cheias têm a cor da nota.
export function EstrelasNota({ nota }) {
  return (
    <span className={`estrelas-nota nota-${nota}`} role="img" aria-label={`Nota: ${rotuloDaNota(nota)} de ${NOTA_MAX}`} data-testid="avaliacao-estrelas" data-nota={nota}>
      {Array.from({ length: NOTA_MAX }, (_, i) => <Icon key={i} n="star" size={22} className={i < nota ? 'cheia' : ''} />)}
    </span>
  );
}

// Avaliado com nota visível: o toque mostra a nota e o comentário (em vez de "pedir avaliação"). Anônima/oculta ou sem nota: continua como antes.
export function EstrelaAvaliar({ a, st }) {
  const user = useUser();
  const [aberto, setAberto] = useState(false);
  const info = avaliacaoDoCartao(st, a.id, { verOculta: ehDono(user) });
  const avaliada = !!info;
  const nota = info && !info.escondida ? info.nota : 0;
  const pedida = a.avaliacaoPedida && a.avaliacaoPedida.em;
  const rotulo = nota ? `Avaliado: ${rotuloDaNota(nota)}. Ver comentário` : avaliada ? 'Cliente já avaliou' : pedida ? `Avaliação pedida em ${fmtDateShort(pedida)}. Pedir de novo` : 'Pedir avaliação ao cliente';
  return (
    <>
      <button type="button" className={`cartao-estrela ${nota ? `com-nota nota-${nota}` : avaliada ? 'avaliada' : pedida ? 'pedida' : ''}`} onClick={() => setAberto(true)} aria-label={rotulo} title={rotulo} data-testid="cartao-avaliar" data-nota={nota}>
        <Icon n="star" size={nota ? 28 : 18} />
        {nota > 0 && <span className="estrela-num" data-testid="cartao-avaliar-nota">{nota}</span>}
      </button>
      {aberto && (nota
        ? <ModalNota a={a} st={st} info={info} onClose={() => setAberto(false)} />
        : <ModalPedirAvaliacao a={a} st={st} onClose={() => setAberto(false)} />)}
    </>
  );
}

function ModalNota({ a, st, info, onClose }) {
  return (
    <Modal titulo="Avaliação do atendimento" sub={nomeCliente(st, a)} onClose={onClose} rodape={<Btn variante="primario" onClick={onClose} data-testid="avaliar-ok">Fechar</Btn>}>
      <p><EstrelasNota nota={info.nota} /> <b data-testid="avaliacao-nota-texto">{rotuloDaNota(info.nota)}</b></p>
      {info.em && <p className="muted">Avaliado em {fmtDateShort(info.em)}</p>}
      {info.texto ? <p className="nota-comentario" data-testid="avaliacao-comentario">{info.texto}</p> : <p className="muted" data-testid="avaliacao-sem-comentario">Sem comentário.</p>}
    </Modal>
  );
}

function ModalPedirAvaliacao({ a, st, onClose }) {
  const { loja: lojaSlug } = useStore();
  const sit = useMemo(() => avaliacoes.situacao(a.id), [a.id, st]); // eslint-disable-line react-hooks/exhaustive-deps
  const quem = nomeCliente(st, a);
  if (!sit.ok) {
    return <Modal titulo="Pedir avaliação" sub={quem} onClose={onClose} rodape={<Btn variante="primario" onClick={onClose}>Entendi</Btn>}><Aviso tipo="erro">{sit.erros?.[0] || 'Não foi possível.'}</Aviso></Modal>;
  }
  if (sit.jaAvaliou) {
    return <Modal titulo="Cliente já avaliou" sub={quem} onClose={onClose} rodape={<Btn variante="primario" onClick={onClose} data-testid="avaliar-ok">Entendi</Btn>}><p data-testid="avaliar-ja-avaliou">Este atendimento já foi avaliado. Cada atendimento recebe uma avaliação só. O resultado está no menu Avaliações.</p></Modal>;
  }
  if (sit.motivo !== 'ok') {
    return (
      <Modal titulo={TITULO_SEM[sit.motivo] || 'Não dá para pedir'} sub={quem} onClose={onClose} rodape={<Btn variante="primario" onClick={onClose} data-testid="avaliar-ok">Entendi</Btn>}>
        <p data-testid={TESTID_SEM[sit.motivo] || 'avaliar-indisponivel'}>{sit.aviso}</p>
      </Modal>
    );
  }
  // Chamado direto do clique (sem await antes): o navegador só deixa abrir a aba nova nesse momento.
  const pedir = () => {
    const r = avaliacoes.pedir(a.id);
    if (!r.ok) { toast(r.erros?.[0] || 'Não foi possível pedir a avaliação.', 'erro'); onClose(); return; }
    const link = linkDaAvaliacao(r.token, lojaSlug);
    const copiou = copiarTexto(link);
    const abriu = abrirWhatsapp(textoPedidoAvaliacao({ nomeEstab: r.loja, nomeCliente: r.nome, link }), r.telefone);
    copiou.then((ok) => { if (!abriu) toast(ok ? 'Não consegui abrir o WhatsApp. O link foi copiado: cole na conversa.' : 'Não consegui abrir o WhatsApp nem copiar o link.', 'erro'); });
    onClose();
  };
  const previa = MODELO_AVALIACAO_PADRAO.replace('{nome}', quem.split(' ')[0]).replace('{loja}', st.estabelecimento.nome).replace('{link}', '[link da avaliação]');
  return (
    <Modal titulo="Pedir avaliação ao cliente" sub={quem} onClose={onClose}
      rodape={<><Btn onClick={onClose} data-testid="avaliar-nao">Agora não</Btn><Btn variante="primario" icone="msg" onClick={pedir} data-testid="avaliar-sim">Pedir no WhatsApp</Btn></>}>
      <p data-testid="avaliar-pergunta">Abrimos o WhatsApp com a mensagem e o link de avaliação prontos; você confere e envia. O link também é copiado.</p>
      {sit.pedidaEm && <Aviso>Avaliação já pedida em <b>{fmtDateShort(sit.pedidaEm)}</b>. Pedir de novo troca o link enviado antes.</Aviso>}
      <p className="muted" data-testid="avaliar-previa" style={{ whiteSpace: 'pre-line' }}>{previa}</p>
    </Modal>
  );
}
