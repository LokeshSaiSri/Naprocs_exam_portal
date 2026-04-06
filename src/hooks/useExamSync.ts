import { useState, useEffect, useRef, useCallback } from 'react';

export function useExamSync(candidateId: string, sessionId: string) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [internalSessionId, setInternalSessionId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const responsesRef = useRef(responses);

  // Sync internal refs securely tracking active component re-renders
  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  // Initial Data Hydration
  useEffect(() => {
    if (!candidateId) return;
    const initializeBank = async () => {
      try {
        const res = await fetch(`/api/exam/questions?candidateId=${candidateId}`);
        const data = await res.json();
        if (data.success) {
           setQuestions(data.questions);
           if (data.settings) setSettings(data.settings);
           if (data.sessionId) setInternalSessionId(data.sessionId);
           if (data.existingResponses) setResponses(data.existingResponses);
        }
      } catch (e) {
        console.error("Hydration Error:", e);
      }
    };
    initializeBank();
  }, [candidateId]);

  const pingSync = useCallback(async () => {
    const activeSession = internalSessionId || sessionId;
    if (!candidateId || !activeSession || Object.keys(responsesRef.current).length === 0) return;
    
    setIsSyncing(true);
    try {
      const res = await fetch('/api/exam/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession,
          candidateId,
          incomingResponses: responsesRef.current
        })
      });
      if (res.ok) {
        setLastSyncTime(new Date());
      }
    } catch (error) {
       console.error("Silent Sync Failure:", error);
    } finally {
       setIsSyncing(false);
    }
  }, [candidateId, sessionId, internalSessionId]);

  // Generic interval ping every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      pingSync();
    }, 60000);

    return () => clearInterval(timer);
  }, [pingSync]);

  const updateResponse = (questionId: string, payload: any) => {
    setResponses((prev: any) => ({ ...prev, [questionId]: { ...prev[questionId], ...payload } }));
  };

  const manualSync = () => {
    pingSync();
  };

  return { 
    questions, 
    settings, 
    responses, 
    updateResponse, 
    manualSync, 
    isSyncing, 
    lastSyncTime,
    recoveredSessionId: internalSessionId 
  };
}
