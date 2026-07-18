// Subscribes to the live status WebSocket and returns the latest snapshot,
// reconnecting automatically. Owner auth uses the cookie; operators pass ?token=.
import { useEffect, useRef, useState } from "react";
import type { StatusSnapshot } from "./types";
import { getBearer } from "./api";

export function useStatus(): { status: StatusSnapshot | null; connected: boolean } {
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const token = getBearer();
      const url = `${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          setStatus(JSON.parse(ev.data) as StatusSnapshot);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  return { status, connected };
}
