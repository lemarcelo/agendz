/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:2fd656eeec */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { store } from './services/api.js';
import App from './ui/App.jsx';
import { MARCA, verificarAmbiente } from './domain/autoria.js';

// Se alguma tela falhar ao desenhar, mostra um aviso com saída em vez de deixar a página em branco.
class LimiteDeErro extends React.Component {
  constructor(p) { super(p); this.state = { falhou: false }; }
  static getDerivedStateFromError() { return { falhou: true }; }
  render() {
    if (!this.state.falhou) return this.props.children;
    return (
      <div role="alert" style={{ padding: '2rem 1rem', maxWidth: 480, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Algo deu errado nesta tela</h1>
        <p>Seus dados foram mantidos. Recarregue a página para continuar.</p>
        <button type="button" onClick={() => this.setState({ falhou: false })} style={{ padding: '0.5rem 1rem' }}>Tentar de novo</button>
      </div>
    );
  }
}

// Cópia rodando fora dos endereços licenciados: só registra (log da aba "Chamadas à API" e console), sem avisar na tela e sem mudar nada no app.
{ const amb = verificarAmbiente(window.location); if (!amb.ok) { store.alertaLicenca(amb); console.debug('[licença]', amb.motivo, MARCA.id); } }
store.iniciarRelogio();
createRoot(document.getElementById('raiz')).render(<LimiteDeErro><App /></LimiteDeErro>);
