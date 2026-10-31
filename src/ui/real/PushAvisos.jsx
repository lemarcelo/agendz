/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// "Aviso com o app fechado" em Meu perfil (site real, v130): a pessoa liga neste aparelho (pede permissão do navegador num toque dela), manda um teste,
// desliga e remove aparelhos. O servidor decide quem recebe qual aviso (mesma visibilidade da lista de avisos). Remover confirma na tela (sem confirm do navegador).
// Limite honesto: no iPhone/iPad só funciona com o site instalado na tela de início (o navegador não oferece push fora disso).
import React, { useCallback, useEffect, useState } from 'react';
import { push } from '../../services/api-real.js';
import { chaveEmBytes, corpoDaInscricao, estadoDoPush } from '../../domain/push.js';
import { rotuloDoAparelho } from '../../domain/aparelho.js';
import { fmtDateTime } from '../../domain/time.js';
import { Aviso, Btn } from '../leve/mini.jsx';

const quando = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? fmtDateTime(t) : ''; };

async function inscricaoLocal(j) {
  try {
    const reg = await j.navigator.serviceWorker.getRegistration('/');
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch { return null; }
}

export default function PushAvisos({ janela }) {
  const j = janela || (typeof window !== 'undefined' ? window : {});
  const [estado, setEstado] = useState(() => estadoDoPush(j)); // sem-suporte | bloqueado | desligado
  const [ligado, setLigado] = useState(null); // este aparelho tem inscrição? (null = ainda vendo)
  const [itens, setItens] = useState(null);
  const [fora, setFora] = useState(false); // o servidor não tem o recurso ligado (503)
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [removendo, setRemovendo] = useState('');

  const recarregar = useCallback(async () => {
    const r = await push.listar();
    setItens(r.ok ? r.itens : []);
    if (estadoDoPush(j) !== 'sem-suporte') setLigado(!!(await inscricaoLocal(j)));
    else setLigado(false);
  }, [j]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const k = await push.chave();
      if (!vivo) return;
      if (!k.ok && k.status === 503) setFora(true);
      await recarregar();
    })();
    return () => { vivo = false; };
  }, [recarregar]);

  const ativar = async () => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    try {
      const permissao = await j.Notification.requestPermission(); // primeiro: precisa do toque da pessoa
      if (permissao !== 'granted') { setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado'); setErro(permissao === 'denied' ? 'O navegador bloqueou os avisos. Libere nas configurações do site e tente de novo.' : 'Sem a permissão, não dá para avisar com o app fechado.'); return; }
      const k = await push.chave();
      if (!k.ok) { if (k.status === 503) setFora(true); setErro(k.erro || 'Não foi possível ligar agora.'); return; }
      const chave = chaveEmBytes(k.chave);
      if (!chave) { setErro('Chave do servidor inválida.'); return; }
      await j.navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const reg = await j.navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
      const corpo = corpoDaInscricao(sub, rotuloDoAparelho(j.navigator.userAgent));
      if (!corpo) { setErro('O navegador não devolveu uma inscrição válida.'); return; }
      const r = await push.inscrever(corpo);
      if (!r.ok) { setErro(r.erro); return; }
      setMsg('Pronto: este aparelho vai receber os avisos mesmo com o app fechado.');
      await recarregar();
    } catch {
      setErro('Não foi possível ligar os avisos neste aparelho.');
    } finally { setOcupado(false); }
  };

  const desativar = async () => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    try {
      const sub = await inscricaoLocal(j);
      if (sub) {
        const corpo = corpoDaInscricao(sub, '');
        if (corpo) { // reenviar a mesma inscrição devolve o id dela no servidor (mesmo endpoint = mesma linha)
          const r = await push.inscrever(corpo);
          if (r.ok && r.id) await push.remover(r.id);
        }
        await sub.unsubscribe();
      }
      setMsg('Avisos desligados neste aparelho.');
      await recarregar();
    } catch {
      setErro('Não foi possível desligar agora.');
    } finally { setOcupado(false); }
  };

  const testar = async () => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    const r = await push.testar();
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    if (r.enviados > 0) setMsg(`Teste enviado a ${r.enviados} aparelho${r.enviados > 1 ? 's' : ''}. Se não aparecer em alguns segundos, veja as permissões do navegador.`);
    else setErro('Nenhum aparelho recebeu o teste. Ligue os avisos primeiro.');
    await recarregar();
  };

  const remover = async (item) => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    const r = await push.remover(item.id);
    setOcupado(false); setRemovendo('');
    if (!r.ok) { setErro(r.erro); return; }
    setMsg('Aparelho removido. Ele deixa de receber avisos.');
    await recarregar();
  };

  return (
    <section className="perfil-form-real perfil-push-real" data-testid="push-secao">
      <h3>Aviso com o app fechado</h3>
      <p className="muted perfil-nota-real">Receba no celular ou no computador o aviso de agendamento novo, remarcação e cancelamento, mesmo com o site fechado. Você só recebe o que já vê na lista de avisos.</p>
      {erro && <Aviso tipo="erro"><span data-testid="push-erro">{erro}</span></Aviso>}
      {msg && <Aviso><span data-testid="push-msg">{msg}</span></Aviso>}
      {fora && <p className="muted" data-testid="push-fora">Este recurso ainda não está ligado neste servidor.</p>}
      {!fora && estado === 'sem-suporte' && <p className="muted" data-testid="push-sem-suporte">Este navegador não avisa com o app fechado. No iPhone e no iPad, instale o site na tela de início (Compartilhar &gt; Adicionar à Tela de Início) e abra por lá.</p>}
      {!fora && estado === 'bloqueado' && <p className="muted" data-testid="push-bloqueado">Os avisos estão bloqueados neste navegador. Libere nas configurações do site para ligar.</p>}
      {!fora && estado === 'desligado' && ligado !== null && (
        <div className="perfil-acoes-real">
          {ligado
            ? <>
              <span data-testid="push-estado" className="muted">Ligado neste aparelho.</span>
              <Btn tamanho="sm" disabled={ocupado} onClick={testar} data-testid="push-testar">Enviar teste</Btn>
              <Btn tamanho="sm" disabled={ocupado} onClick={desativar} data-testid="push-desativar">Desligar neste aparelho</Btn>
            </>
            : <>
              <span data-testid="push-estado" className="muted">Desligado neste aparelho.</span>
              <Btn tamanho="sm" variante="primario" disabled={ocupado} onClick={ativar} data-testid="push-ativar">Ligar avisos</Btn>
            </>}
        </div>
      )}
      {itens && itens.length > 0 && (
        <ul className="digital-lista-real" data-testid="push-lista">
          {itens.map((it) => (
            <li key={it.id} data-testid="push-item">
              <span><b>{it.aparelho || 'Aparelho'}</b> · incluído em {quando(it.criadoEm)}{it.ultimoEnvio ? ` · último aviso ${quando(it.ultimoEnvio)}` : ''}</span>
              {removendo === it.id
                ? <span className="confirmar-linha">
                  <Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={() => remover(it)} data-testid="push-remover-sim">Sim, remover</Btn>
                  <Btn tamanho="sm" onClick={() => setRemovendo('')} data-testid="push-remover-nao">Voltar</Btn>
                </span>
                : <Btn tamanho="sm" disabled={ocupado} onClick={() => setRemovendo(it.id)} data-testid="push-remover">Remover</Btn>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
