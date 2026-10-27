/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Entrada do build do SITE PUBLICADO (AGENDZ_API=real → dist/index-real.html): fala com a API real. O Artifact (`main.jsx`) nunca importa este caminho.
import React from 'react';
import { createRoot } from 'react-dom/client';
import AppReal from './ui/real/AppReal.jsx';

createRoot(document.getElementById('raiz')).render(<AppReal />);
