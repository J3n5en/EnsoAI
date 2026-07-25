import * as pty from 'node-pty';
import { formatPtyHelperError, isPtyHelperCommand, type PtyHelperEvent } from './ptyHelperProtocol';
import { createPtyHelperRuntime } from './ptyHelperRuntime';

function send(event: PtyHelperEvent): void {
  if (process.connected) {
    process.send?.(event);
  }
}

const runtime = createPtyHelperRuntime({
  spawn: (shell, args, options) => pty.spawn(shell, args, options),
  send,
  exit: (code) => process.exit(code),
});

process.on('message', (message: unknown) => {
  if (!isPtyHelperCommand(message)) {
    send({ type: 'error', message: 'Invalid PTY helper command' });
    return;
  }
  void runtime.handle(message);
});

process.once('disconnect', () => {
  void runtime.handle({ type: 'destroy' });
});

function reportFatalError(error: unknown): void {
  send({ type: 'error', message: formatPtyHelperError(error) });
  process.exit(1);
}

process.once('uncaughtException', reportFatalError);
process.once('unhandledRejection', reportFatalError);
