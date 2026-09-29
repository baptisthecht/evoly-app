"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { enqueue, getQueue, removeEntry, markConflict, QueueEntry } from "@/lib/offlineQueue";

export interface ScanResult {
  result: "VALID" | "ALREADY_SCANNED" | "INVALID" | "WRONG_EVENT" | "INVALID_SCANNER" | "QUEUED";
  message: string;
  ticket?: { holderName: string; holderEmail?: string | null; checkedInAt?: string };
}

interface UseOfflineQueueReturn {
  queue: QueueEntry[];
  pendingCount: number;
  addToQueue: (qrCode: string, token: string) => Promise<void>;
  flushQueue: (onResult: (result: ScanResult) => void) => Promise<void>;
  refreshQueue: () => Promise<void>;
}

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const flushingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      const entries = await getQueue();
      setQueue(entries);
    } catch {
      // IndexedDB unavailable (e.g. private browsing on some browsers)
    }
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const addToQueue = useCallback(
    async (qrCode: string, token: string) => {
      await enqueue(qrCode, token);
      await refreshQueue();
    },
    [refreshQueue]
  );

  const flushQueue = useCallback(
    async (onResult: (result: ScanResult) => void) => {
      if (flushingRef.current) return;
      flushingRef.current = true;
      try {
        const entries = await getQueue();
        const pending = entries.filter((e) => e.status === "pending");
        for (const entry of pending) {
          try {
            const res = await fetch("/api/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ qrCode: entry.qrCode, token: entry.token }),
            });
            const data: ScanResult = await res.json();
            if (data.result === "ALREADY_SCANNED") {
              await markConflict(entry.id!);
              onResult({ ...data, message: `Conflit : ${data.message}` });
            } else {
              await removeEntry(entry.id!);
              onResult(data);
            }
          } catch {
            // Network still down — stop flushing, leave remaining entries
            break;
          }
        }
      } finally {
        flushingRef.current = false;
        await refreshQueue();
      }
    },
    [refreshQueue]
  );

  return {
    queue,
    pendingCount: queue.filter((e) => e.status === "pending").length,
    addToQueue,
    flushQueue,
    refreshQueue,
  };
}
