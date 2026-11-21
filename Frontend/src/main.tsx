import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initNative } from './lib/native';
import { applyPreferences, readCachedPreferences } from './lib/preferences';
import './styles.css';

// Ajustes de «Personalizar» guardados en este navegador: antes del primer
// pintado, para que no se vea un instante el color por defecto.
applyPreferences(readCachedPreferences());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initNative();
