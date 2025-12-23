import { useAgentStore } from '@/stores/agent';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useAgentList() {
  const setAgents = useAgentStore((s) => s.setAgents);

  return useQuery({
    queryKey: ['agent', 'list'],
    queryFn: async () => {
      const agents = await window.electronAPI.agent.list();
      setAgents(agents);
      return agents;
    },
  });
}

export function useAgentSession(workdir: string | null) {
  const { sessionId, setSessionId, addMessage, setConnected, setLoading } = useAgentStore();

  useEffect(() => {
    const unsubscribe = window.electronAPI.agent.onMessage((message) => {
      addMessage(message as any);
    });
    return unsubscribe;
  }, [addMessage]);

  const startSession = useMutation({
    mutationFn: async (agentId: string) => {
      if (!workdir) throw new Error('No workdir');
      setLoading(true);
      const id = await window.electronAPI.agent.start(agentId, workdir);
      setSessionId(id);
      setConnected(true);
      setLoading(false);
      return id;
    },
    onError: () => {
      setLoading(false);
      setConnected(false);
    },
  });

  const stopSession = useMutation({
    mutationFn: async () => {
      if (!sessionId) return;
      await window.electronAPI.agent.stop(sessionId);
      setSessionId(null);
      setConnected(false);
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!sessionId) throw new Error('No session');
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
      });
      await window.electronAPI.agent.send(sessionId, content);
    },
  });

  return { startSession, stopSession, sendMessage };
}
