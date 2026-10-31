/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estrela do atendimento concluído no site real: pede a avaliação ao cliente pelo WhatsApp (aba nova com a mensagem e o link prontos; o link também é copiado).
// Quem decide se pode pedir é o servidor (`GET /api/agendamentos/{id}/avaliacao`): sem telefone, sem cadastro ou cliente que não quer mensagens a tela diz o motivo (nunca silêncio).
// O token pessoal nasce no toque em "Preparar" (POST …/avaliacao/pedido) e só existe neste aparelho; o navegador só abre a aba nova direto de um toque, então são dois toques:
// Preparar (chama o servidor) e Abrir no WhatsApp (sem await antes). Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes próprias terminam em `-real`.
import React, { useEffect, useRef, useState } from 'react';
import { avaliacoes as api } from '../../services/api-real.js';
import { MODELO_AVALIACAO_PADRAO, aplicarModelo } from '../../domain/avaliacoes.js';
import { montarLinkAvaliar } from '../../domain/link-publico.js';
import { fmtDateShort } from '../../domain/time.js';
import { copiarTexto } from '../clipboard.js';
import { abrirWhatsapp } from '../whatsapp.js';
import { Aviso, Btn, Icone } from '../leve/mini.jsx';

const linkDe = (token) => montarLinkAvaliar({ base: `${globalThis.location.origin}${globalThis.location.pathname}`, token });
const TITULO_SEM = { sem_telefone: 'Cliente sem telefone', sem_cadastro: 'Atendimento sem cadastro', sem_mensagens: 'Cliente não quer mensagens', sem_servico: 'Atendimento sem serviço', nao_concluido: 'Atendimento não concluído' };

// Botão de estrela do cartão (o painel abre logo abaixo do cartão). `avaliada` e `pedidaEm` vêm da lista da agenda quando o servidor os informa.
export function EstrelaAvaliar({ aberto, aoAlternar, pedidaEm = null, avaliada = false }) {
  const rotulo = avaliada ? 'Cliente já avaliou' : pedidaEm ? `Avaliação pedida em ${fmtDateShort(pedidaEm)}. Pedir de novo` : 'Pedir avaliação ao cliente';
  return (
    <button type="button" className={`cartao-estrela ${avaliada ? 'avaliada' : pedidaEm ? 'pedida' : ''}`} onClick={aoAlternar} aria-label={rotulo} title={rotulo} aria-expanded={aberto} data-testid="cartao-avaliar">
      <Icone n="star" size={18} />
    </button>
  );
}

export default function PedirAvaliacao({ a, quem, aoFechar }) {
  const [sit, setSit] = useState(undefined); // undefined = carregando
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(null); // { texto, numero, link }
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const trava = useRef(false);
  useEffect(() => {
    let vivo = true;
    api.situacao(a.id).then((r) => { if (!vivo) return; if (r.ok) setSit(r.situacao); else { setErro(r.erro); setSit(null); } });
    return () => { vivo = false; };
  }, [a.id]);
  const preparar = async () => {
    if (trava.current) return;
    trava.current = true; setOcupado(true); setErro('');
    const r = await api.pedir(a.id);
    trava.current = false; setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    const link = linkDe(r.pedido.token);
    setPronto({ texto: aplicarModelo(MODELO_AVALIACAO_PADRAO, { nome: r.pedido.nome, loja: r.pedido.loja, link }), numero: r.pedido.numero, link });
  };
  // Chamado direto do toque (sem await antes): o navegador só deixa abrir a aba nova nesse momento. O link também vai para a área de transferência como reserva.
  const abrir = () => {
    if (!pronto) return;
    const abriu = abrirWhatsapp(pronto.texto, pronto.numero);
    copiarTexto(pronto.link).then((ok) => setCopiado(ok));
    if (!abriu) setErro('Não consegui abrir o WhatsApp. O link foi copiado: cole na conversa.');
  };
  return (
    <div className="subcartao pedir-av-real" data-testid="pedir-av-real">
      <b>Pedir avaliação{quem ? ` · ${quem}` : ''}</b>
      {sit === undefined && <p className="muted" role="status">Verificando…</p>}
      {sit && sit.jaAvaliou && <Aviso><span data-testid="pedir-av-ja">O cliente já avaliou este atendimento.</span></Aviso>}
      {sit && !sit.jaAvaliou && sit.motivo !== 'ok' && <Aviso tipo="erro"><span data-testid={`pedir-av-sem-${sit.motivo}`}><b>{TITULO_SEM[sit.motivo] || 'Não dá para pedir'}.</b> {sit.aviso}</span></Aviso>}
      {sit && !sit.jaAvaliou && sit.motivo === 'ok' && !pronto && (
        <>
          <p className="muted">{sit.pedidaEm ? `Já foi pedida em ${fmtDateShort(sit.pedidaEm)}. Pedir de novo troca o link anterior.` : 'Prepara a mensagem com o link pessoal do cliente. Você revisa e toca em enviar no WhatsApp.'}</p>
          <div className="acoes"><Btn variante="primario" onClick={preparar} disabled={ocupado} data-testid="pedir-av-preparar"><Icone n="star" size={15} />{ocupado ? 'Preparando…' : 'Preparar mensagem'}</Btn></div>
        </>
      )}
      {pronto && (
        <>
          <p className="muted" data-testid="pedir-av-texto">{pronto.texto}</p>
          <div className="acoes"><Btn variante="primario" onClick={abrir} data-testid="pedir-av-abrir"><Icone n="send" size={15} />Abrir no WhatsApp</Btn></div>
          {copiado && <p className="muted" data-testid="pedir-av-copiado">Link copiado.</p>}
        </>
      )}
      {erro && <Aviso tipo="erro"><span data-testid="pedir-av-erro">{erro}</span></Aviso>}
      <div className="acoes"><Btn tamanho="sm" onClick={aoFechar} data-testid="pedir-av-fechar">Fechar</Btn></div>
    </div>
  );
}
