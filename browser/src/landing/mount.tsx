import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Gate } from '../lib/gate';
import Landing from './Landing';
import './landing.css';

export function mountLanding(target: HTMLElement, gate: Exclude<Gate, 'ok'>) {
  createRoot(target).render(
    <StrictMode>
      <Landing gate={gate} />
    </StrictMode>,
  );
}
