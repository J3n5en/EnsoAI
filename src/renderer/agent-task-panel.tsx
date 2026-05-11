import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { AgentTaskPanelWindow } from './components/agent-tasks/AgentTaskPanelWindow';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentTaskPanelWindow />
  </StrictMode>
);
