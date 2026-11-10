import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource/young-serif';
import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource-variable/noto-naskh-arabic';
import '@fontsource/amiri/400.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
