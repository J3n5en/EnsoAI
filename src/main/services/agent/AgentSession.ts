import { type ChildProcess, spawn } from 'node:child_process';
import type { AgentMessage, AgentMetadata } from '@shared/types';

interface Session {
  id: string;
  process: ChildProcess;
  agent: AgentMetadata;
  workdir: string;
  onMessage: (message: AgentMessage) => void;
}

export class AgentSessionManager {
  private sessions = new Map<string, Session>();
  private counter = 0;

  async create(
    agent: AgentMetadata,
    workdir: string,
    onMessage: (message: AgentMessage) => void
  ): Promise<{ id: string }> {
    const id = `agent-${++this.counter}`;

    // Spawn agent process using ACP protocol
    const proc = spawn('npx', ['claude-code-acp'], {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    const session: Session = {
      id,
      process: proc,
      agent,
      workdir,
      onMessage,
    };

    // Handle stdout (NDJSON messages)
    let buffer = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(session, message);
          } catch {
            // Ignore non-JSON lines
          }
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[${id}] stderr:`, chunk.toString());
    });

    proc.on('exit', (code) => {
      console.log(`[${id}] exited with code ${code}`);
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);
    return { id };
  }

  private handleMessage(session: Session, rawMessage: unknown): void {
    // Convert ACP message to AgentMessage format
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: JSON.stringify(rawMessage),
      timestamp: Date.now(),
    };
    session.onMessage(message);
  }

  async send(sessionId: string, content: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Send ACP PromptRequest
    const request = {
      jsonrpc: '2.0',
      method: 'prompt',
      id: crypto.randomUUID(),
      params: {
        prompt: [{ type: 'text', text: content }],
      },
    };

    session.process.stdin?.write(`${JSON.stringify(request)}\n`);
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.kill();
      this.sessions.delete(sessionId);
    }
  }

  stopAll(): void {
    for (const session of this.sessions.values()) {
      session.process.kill();
    }
    this.sessions.clear();
  }
}
