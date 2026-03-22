import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import log from 'electron-log/renderer.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './components/ui/toast';
import './styles/globals.css';

// Initialize renderer logging with conservative defaults
// Starts with 'error' level to minimize IPC overhead until settings are loaded
log.transports.ipc.level = 'error';
Object.assign(console, log.functions);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

async function startApp(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }
  const { default: App } = await import('./App');

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

startApp().catch((error) => {
  console.error('[renderer] Failed to bootstrap app:', error);
});
