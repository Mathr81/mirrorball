import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root introuvable');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
