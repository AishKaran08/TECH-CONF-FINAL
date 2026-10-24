import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { APP_NAME } from '@runway/shared';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>{APP_NAME}</h1>
  </StrictMode>,
);
