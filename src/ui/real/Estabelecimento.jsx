/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estabelecimento do site real (configurações que se mexem depois de iniciar o uso; o assistente de início não pede nada daqui):
//  1) Endereço e localização (GPS): endereço em campos, latitude/longitude (digitadas, coladas de um link do Google Maps ou pelo GPS deste aparelho) e dois
//     interruptores, desligados de fábrica: mostrar o endereço no link de agendamento e mandar o link da localização junto da mensagem de WhatsApp.
//  2) Comissão geral da loja (vale quando a pessoa e o serviço não têm percentual próprio).
//  3) Horário de funcionamento (`Expediente.jsx`) e logo + cor do tema (`MarcaLoja.jsx`), só do proprietário.
// Toda a regra e o link do mapa vêm do servidor (LocalDaLoja); a tela mostra o que ele devolve e as mensagens dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useState } from 'react';
import { comissaoGeral as apiComissao, local as api } from '../../services/api-real.js';
import { caminhoHttps, coordenadasDeTexto, latitudeValida, longitudeValida } from '../../domain/localizacao.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import { capAtiva } from '../../domain/tipos.js';
import RegrasAtendimento from './RegrasAtendimento.jsx';
import Portes from './Portes.jsx';
import LinkAgendamento from './LinkAgendamento.jsx';
import Expediente from './Expediente.jsx';
import MarcaLoja from './MarcaLoja.jsx';

const txt = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const numero = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const cepFormatado = (c) => (c && c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c || '');

function Interruptor({ marcado, aoMudar, testid, children }) {
  return <label className="pa-check"><input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} data-testid={testid} /> {children}</label>;
}

function LocalDaLoja() {
  const [f, setF] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [colado, setColado] = useState('');
  const [gps, setGps] = useState(''); // mensagem do botão "usar minha localização"
  const [url, setUrl] = useState('');
  useEffect(() => {
    let vivo = true;
    api.obter().then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setF({ vazio: true }); return; }
      const l = r.local;
      setUrl(l.localizacaoUrl);
      setF({ logradouro: l.logradouro, numero: l.numero, complemento: l.complemento, bairro: l.bairro, cidade: l.cidade, uf: l.uf, cep: cepFormatado(l.cep), lat: txt(l.latitude), lng: txt(l.longitude), noLink: l.enderecoNoLink, noWhats: l.localizacaoNoWhatsapp });
    });
    return () => { vivo = false; };
  }, []);
  if (f === null) return <p className="muted" role="status" data-testid="loc-carregando">Carregando…</p>;
  if (f.vazio) return <Aviso tipo="erro" data-testid="loc-erro">{erro}</Aviso>;
  const mudar = (k) => (e) => { setOk(''); setF({ ...f, [k]: e.target.value }); };
  const aplicar = (c) => { setOk(''); setF({ ...f, lat: txt(c.lat), lng: txt(c.lng) }); };
  const colar = (e) => {
    setColado(e.target.value);
    const c = coordenadasDeTexto(e.target.value);
    if (c) { aplicar(c); setGps('Localização lida do que você colou.'); } else setGps(e.target.value.trim() ? 'Não achei coordenadas nesse texto. Cole o link do Google Maps ou “latitude, longitude”.' : '');
  };
  const usarGps = () => {
    if (!globalThis.navigator?.geolocation) { setGps('Este aparelho não informa a localização. Digite ou cole as coordenadas.'); return; }
    setGps('Buscando a localização…');
    globalThis.navigator.geolocation.getCurrentPosition(
      (p) => { const c = { lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }; aplicar(c); setGps('Localização deste aparelho preenchida. Confira se é a da loja e salve.'); },
      () => setGps('Não consegui a localização (permissão negada ou sem sinal). Digite ou cole as coordenadas.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setErro(''); setOk('');
    const lat = numero(f.lat), lng = numero(f.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng) || (lat !== null && !latitudeValida(lat)) || (lng !== null && !longitudeValida(lng))) { setErro('Localização inválida: latitude de -90 a 90 e longitude de -180 a 180.'); return; }
    setEnviando(true);
    const r = await api.gravar({ logradouro: f.logradouro, numero: f.numero, complemento: f.complemento, bairro: f.bairro, cidade: f.cidade, uf: f.uf, cep: f.cep, latitude: lat, longitude: lng, enderecoNoLink: f.noLink, localizacaoNoWhatsapp: f.noWhats });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    const l = r.local;
    setUrl(l.localizacaoUrl);
    setF({ logradouro: l.logradouro, numero: l.numero, complemento: l.complemento, bairro: l.bairro, cidade: l.cidade, uf: l.uf, cep: cepFormatado(l.cep), lat: txt(l.latitude), lng: txt(l.longitude), noLink: l.enderecoNoLink, noWhats: l.localizacaoNoWhatsapp });
    setOk('Endereço e localização salvos.');
  };
  return (
    <form onSubmit={salvar} className="form-grade" data-testid="loc-form">
      <fieldset className="conj">
        <legend>Endereço</legend>
        <Campo rotulo="Rua / avenida"><input value={f.logradouro} maxLength={120} autoComplete="street-address" onChange={mudar('logradouro')} data-testid="loc-logradouro" /></Campo>
        <Campo rotulo="Número"><input value={f.numero} maxLength={20} onChange={mudar('numero')} data-testid="loc-numero" /></Campo>
        <Campo rotulo="Complemento"><input value={f.complemento} maxLength={60} onChange={mudar('complemento')} data-testid="loc-complemento" /></Campo>
        <Campo rotulo="Bairro"><input value={f.bairro} maxLength={60} onChange={mudar('bairro')} data-testid="loc-bairro" /></Campo>
        <Campo rotulo="Cidade"><input value={f.cidade} maxLength={60} onChange={mudar('cidade')} data-testid="loc-cidade" /></Campo>
        <Campo rotulo="UF"><input value={f.uf} maxLength={2} autoCapitalize="characters" onChange={mudar('uf')} data-testid="loc-uf" /></Campo>
        <Campo rotulo="CEP"><input value={f.cep} maxLength={9} inputMode="numeric" autoComplete="postal-code" onChange={mudar('cep')} data-testid="loc-cep" /></Campo>
        <Interruptor marcado={f.noLink} aoMudar={(v) => { setOk(''); setF({ ...f, noLink: v }); }} testid="loc-no-link">Mostrar o endereço na página de agendamento do cliente</Interruptor>
      </fieldset>
      <fieldset className="conj">
        <legend>Localização (GPS)</legend>
        <Campo rotulo="Colar link do Google Maps ou “latitude, longitude”"><input value={colado} maxLength={500} onChange={colar} placeholder="Ex.: -25.428356, -49.273251" data-testid="loc-colar" /></Campo>
        <div className="acoes">
          <Btn tamanho="sm" onClick={usarGps} data-testid="loc-usar-gps"><Icone n="link" size={15} /> Usar a localização deste aparelho</Btn>
        </div>
        <p className="muted">No Google Maps, toque e segure no ponto da loja e copie as coordenadas (ou copie o link completo da barra do navegador). Links curtos (maps.app.goo.gl) não dão para ler.</p>
        {gps && <p className="muted" role="status" data-testid="loc-gps-msg">{gps}</p>}
        <Campo rotulo="Latitude"><input value={f.lat} inputMode="decimal" onChange={mudar('lat')} data-testid="loc-lat" /></Campo>
        <Campo rotulo="Longitude"><input value={f.lng} inputMode="decimal" onChange={mudar('lng')} data-testid="loc-lng" /></Campo>
        {caminhoHttps(url) && <p className="muted"><a href={`https://${caminhoHttps(url)}`} target="_blank" rel="noopener noreferrer" data-testid="loc-ver-mapa">Ver no mapa</a></p>}
        <Interruptor marcado={f.noWhats} aoMudar={(v) => { setOk(''); setF({ ...f, noWhats: v }); }} testid="loc-no-whatsapp">Mandar o link da localização junto da mensagem de WhatsApp com o link de agendamento</Interruptor>
      </fieldset>
      {erro && <Aviso tipo="erro" data-testid="loc-erro">{erro}</Aviso>}
      {ok && <Aviso data-testid="loc-ok"><span role="status">{ok}</span></Aviso>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={enviando} data-testid="loc-salvar">{enviando ? 'Salvando…' : 'Salvar endereço e localização'}</Btn></div>
    </form>
  );
}

function ComissaoGeral() {
  const [v, setV] = useState(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    let vivo = true;
    apiComissao.obter().then((r) => { if (!vivo) return; if (r.ok) setV(txt(r.comissaoPadrao)); else { setErro(r.erro); setV(''); } });
    return () => { vivo = false; };
  }, []);
  if (v === null) return <p className="muted" role="status">Carregando…</p>;
  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setErro(''); setOk(''); setEnviando(true);
    const n = numero(v);
    const r = await apiComissao.gravar(n === null ? NaN : n);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setV(txt(r.comissaoPadrao)); setOk('Comissão geral salva.');
  };
  return (
    <form onSubmit={salvar} className="form-grade" data-testid="com-geral-form">
      <fieldset className="conj">
        <Campo rotulo="Comissão geral da loja (%)"><input value={v} inputMode="decimal" onChange={(e) => { setOk(''); setV(e.target.value); }} data-testid="com-geral" /></Campo>
        <p className="muted">Vale quando nem o serviço nem a pessoa têm percentual próprio. O percentual do serviço vence o da pessoa, que vence este. Atendimentos já feitos não mudam.</p>
      </fieldset>
      {erro && <Aviso tipo="erro" data-testid="com-geral-erro">{erro}</Aviso>}
      {ok && <Aviso data-testid="com-geral-ok"><span role="status">{ok}</span></Aviso>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={enviando} data-testid="com-geral-salvar">{enviando ? 'Salvando…' : 'Salvar comissão'}</Btn></div>
    </form>
  );
}

export default function Estabelecimento({ ehDono, aoReconfigurar, aoMudarMarca }) {
  return (
    <section className="tela estabelecimento-real" data-testid="tela-estabelecimento">
      <header className="tela-topo"><h1>Estabelecimento</h1></header>
      {ehDono && (
        <>
          {aoReconfigurar && <div className="acoes"><Btn onClick={aoReconfigurar} data-testid="reconfigurar-abrir">Reconfigurar estabelecimento</Btn></div>}
          <RegrasAtendimento />
          <LinkAgendamento />
        </>
      )}
      {ehDono && (
        <>
          <h2 className="est-subtitulo-real">Horário de funcionamento</h2>
          <Expediente />
          {capAtiva('precoPorPorte') && (
            <>
              <h2 className="est-subtitulo-real">Portes de veículo</h2>
              <Portes />
            </>
          )}
          <h2 className="est-subtitulo-real">Logo e cor do tema</h2>
          <MarcaLoja aoMudar={aoMudarMarca} />
        </>
      )}
      <h2 className="est-subtitulo-real">Endereço e localização</h2>
      <LocalDaLoja />
      {ehDono && (
        <>
          <h2 className="est-subtitulo-real">Comissão</h2>
          <ComissaoGeral />
        </>
      )}
    </section>
  );
}
