/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estrela no cartão do atendimento concluído: pede a avaliação ao cliente pelo WhatsApp (aba nova com a mensagem e o link prontos; o link também é copiado).
// Cliente sem telefone, sem cadastro ou que pediu para não receber: a tela diz isso (nunca silêncio). O token nasce no clique de confirmar e aparece uma vez.
import React, { useMemo, useState } from 'react';
import { avaliacoes } from '../services/api.js';
import { textoPedidoAvaliacao, MODELO_AVALIACAO_PADRAO } from '../domain/avaliacoes.js';
import { fmtDateShort } from '../domain/time.js';
import { Aviso, Btn, Icon, Modal } from './common.jsx';
import { linkDaAvaliacao } from './avaliacao-link.js';
import { copiarTexto } from './clipboard.js';
import { nomeCliente } from './format.js';
import { toast, useStore } from './hooks.js';
import { abrirWhatsapp } from './whatsapp.js';

const TESTID_SEM = { sem_telefone: 'avaliar-sem-telefone', sem_cadastro: 'avaliar-sem-cadastro', sem_mensagens: 'avaliar-sem-mensagens' };
const TITULO_SEM = { sem_telefone: 'Cliente sem telefone', sem_cadastro: 'Atendimento sem cadastro', sem_mensagens: 'Cliente não quer mensagens' };

export function EstrelaAvaliar({ a, st }) {
  const [aberto, setAberto] = useState(false);
  const avaliada = (st.avaliacoes || []).some((x) => x.agendamentoId === a.id);
  const pedida = a.avaliacaoPedida && a.avaliacaoPedida.em;
  const rotulo = avaliada ? 'Cliente já avaliou' : pedida ? `Avaliação pedida em ${fmtDateShort(pedida)}. Pedir de novo` : 'Pedir avaliação ao cliente';
  return (
    <>
      <button type="button" className={`cartao-estrela ${avaliada ? 'avaliada' : pedida ? 'pedida' : ''}`} onClick={() => setAberto(true)} aria-label={rotulo} title={rotulo} data-testid="cartao-avaliar">
        <Icon n="star" size={18} />
      </button>
      {aberto && <ModalPedirAvaliacao a={a} st={st} onClose={() => setAberto(false)} />}
    </>
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
