import type { AgentMessage, AgentMetadata } from '@shared/types';
import { create } from 'zustand';

interface AgentState {
  agents: AgentMetadata[];
  currentAgentId: string | null;
  sessionId: string | null;
  messages: AgentMessage[];
  isConnected: boolean;
  isLoading: boolean;

  setAgents: (agents: AgentMetadata[]) => void;
  setCurrentAgent: (agentId: string | null) => void;
  setSessionId: (sessionId: string | null) => void;
  addMessage: (message: AgentMessage) => void;
  clearMessages: () => void;
  setConnected: (connected: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  currentAgentId: null,
  sessionId: null,
  messages: [],
  isConnected: false,
  isLoading: false,

  setAgents: (agents) => set({ agents }),
  setCurrentAgent: (agentId) => set({ currentAgentId: agentId }),
  setSessionId: (sessionId) => set({ sessionId }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  setConnected: (isConnected) => set({ isConnected }),
  setLoading: (isLoading) => set({ isLoading }),
}));
