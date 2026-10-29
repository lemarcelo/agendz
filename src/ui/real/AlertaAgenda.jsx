/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso de agendamento novo no site real: consulta os avisos do servidor a cada 15 s (aba visível), e quando aparece um que este aparelho ainda não viu
// mostra a faixa no topo, toca 3 bipes sutis e vibra (cada um só se a pessoa deixou ligado em "Meu perfil"), e manda o Painel fazer o cartão pulsar na agenda.
// Tocar na faixa leva à agenda, abre o cartão e marca o aviso como lido. A primeira consulta só aprende o que já existe (não apita por histórico).
// Quem não tem acesso à agenda (o servidor responde 403) não recebe nada. Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { avisos as api } from '../../services/api-real.js';
import { FAIXA_MS, alvoDaFaixa, avisosNovos, idsParaDestacar, textoDaFaixa } from '../../domain/notificacao.js';
import { Icone } from '../leve/mini.jsx';
import { liberarSom, tocarBipe, vibrar } from './alerta.js';
import { useAtualizacaoAutomatica } from './atualizar.js';

export const INTERVALO_AVISO_MS = 15000;

export default function AlertaAgenda({ prefs, aoIr, aoDestacar }) {
  const vistos = useRef(null); // null = ainda não fez a primeira consulta
  const consultando = useRef(false);
  const ultimos = useRef({});
  ultimos.current = { prefs, aoIr, aoDestacar };
  const [faixa, setFaixa] = useState(null); // { novos }

  useEffect(() => { liberarSom(); }, []);

  const consultar = useCallback(async () => {
    if (consultando.current) return;
    consultando.current = true;
    try {
      const r = await api.listar();
      if (!r.ok) return; // sem acesso ou sem rede: tenta de novo na próxima
      if (vistos.current === null) { vistos.current = new Set(r.avisos.map((a) => a.id)); return; }
      const novos = avisosNovos(r.avisos, vistos.current);
      for (const a of r.avisos) vistos.current.add(a.id);
      if (!novos.length) return;
      const { prefs: p, aoDestacar: destacar } = ultimos.current;
      destacar(idsParaDestacar(novos));
      if (p.aviso) setFaixa({ novos });
      if (p.som) tocarBipe();
      if (p.vibracao) vibrar();
    } finally { consultando.current = false; }
  }, []);

  useEffect(() => { consultar(); }, [consultar]);
  useAtualizacaoAutomatica(consultar, INTERVALO_AVISO_MS);

  useEffect(() => {
    if (!faixa) return undefined;
    const t = setTimeout(() => setFaixa(null), FAIXA_MS);
    return () => clearTimeout(t);
  }, [faixa]);
  // Desligou a faixa em "Meu perfil" com ela aberta: some na hora.
  useEffect(() => { if (!prefs.aviso) setFaixa(null); }, [prefs.aviso]);

  if (!faixa) return null;
  const ir = () => {
    const alvo = alvoDaFaixa(faixa.novos);
    for (const a of faixa.novos) api.marcarLido(a.id); // se falhar, o aviso continua na lista do Início como "novo"
    setFaixa(null);
    ultimos.current.aoIr(alvo);
  };
  return (
    <div className="faixa-aviso-real" role="status" aria-live="polite" data-testid="faixa-aviso">
      <button type="button" className="faixa-aviso-ir-real" onClick={ir} data-testid="faixa-aviso-ir">
        <Icone n="bell" size={20} />
        <span className="faixa-aviso-texto-real"><b data-testid="faixa-aviso-texto">{textoDaFaixa(faixa.novos)}</b><small>Toque para ver na agenda</small></span>
      </button>
      <button type="button" className="icone-btn faixa-aviso-fechar-real" onClick={() => setFaixa(null)} aria-label="Fechar aviso" title="Fechar" data-testid="faixa-aviso-fechar"><Icone n="x" size={16} /></button>
    </div>
  );
}
