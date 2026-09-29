"use client";

import { useState, useTransition } from "react";
import { createScannerLinkAction } from "@/actions/scanner";

interface Props {
  eventId: string;
  organizationId: string;
  userName: string;
  scannerUrl: string;
}

export function OpenScannerButton({ eventId, organizationId, userName, scannerUrl }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createScannerLinkAction(
        eventId,
        organizationId,
        userName,
        24 // 24 hours
      );
      if (!result.success || !result.link) {
        setError(result.error ?? "Erreur");
        return;
      }
      // Open scanner in a new tab with the generated token
      window.open(`${scannerUrl}/scan/${result.link.token}`, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-2"
      >
        {isPending && (
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        Ouvrir le scanner →
      </button>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
