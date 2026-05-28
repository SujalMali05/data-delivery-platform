'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
}

/**
 * Custom hook for Server-Sent Events with auto-reconnect
 */
export function useSSE({ url, enabled = true, onMessage, onError }: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;

    const token = localStorage.getItem('ddp_token');
    const fullUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}${url}${
      url.includes('?') ? '&' : '?'
    }token=${token}`;

    const eventSource = new EventSource(fullUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = (error) => {
      setIsConnected(false);
      onError?.(error);
      eventSource.close();

      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [url, enabled, onMessage, onError]);

  useEffect(() => {
    connect();

    return () => {
      eventSourceRef.current?.close();
      setIsConnected(false);
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    setIsConnected(false);
  }, []);

  return { isConnected, disconnect };
}
