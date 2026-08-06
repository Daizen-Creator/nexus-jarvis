import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { HudApp } from './components/HudApp';
import { uiMode } from './desktop/bridge';
import './styles/globals.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('NEXUS: elemento #root não encontrado no documento.');
}

// Duas caras do mesmo bundle: a sobreposição transparente do app de desktop
// (`?mode=hud`) e o NEXUS completo com dashboard e terminal.
const mode = uiMode();
if (mode === 'hud') {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

createRoot(container).render(
  <StrictMode>{mode === 'hud' ? <HudApp /> : <App />}</StrictMode>,
);
