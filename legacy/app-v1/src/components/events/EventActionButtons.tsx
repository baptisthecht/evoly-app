"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishEventAction, unpublishEventAction, cancelEventAction, duplicateEventAction } from "@/actions/events";

interface Props {
  event: { id: string; status: string; slug: string };
  organizationId: string;
  orgSlug: string;
  permissions: string[];
}

export function EventActionButtons({ event, organizationId, orgSlug, permissions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const canPublish = permissions.includes("EVENTS_PUBLISH");
  const canDelete = permissions.includes("EVENTS_DELETE");

  function handlePublish() {
    startTransition(async () => {
      const result = event.status === "PUBLISHED"
        ? await unpublishEventAction(event.id, organizationId)
        : await publishEventAction(event.id, organizationId);
      if (result.error) setError(result.error);
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateEventAction(event.id, organizationId);
      if (result.error) { setError(result.error); return; }
      if (result.eventSlug) router.push(`/dashboard/${orgSlug}/events/${result.eventSlug}`);
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelEventAction(event.id, organizationId);
      if (result.error) { setError(result.error); return; }
      setShowCancelConfirm(false);
    });
  }

  if (event.status === "CANCELLED") return null;

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {error && (
        <span className="text-xs text-red-500 max-w-[200px] text-right">{error}</span>
      )}

      {/* Copy public link */}
      {event.status === "PUBLISHED" && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/e/${event.slug}`);
          }}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Copier le lien public"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      )}

      {/* Duplicate */}
      <button
        type="button"
        onClick={handleDuplicate}
        disabled={isPending}
        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        title="Dupliquer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Cancel */}
      {canDelete && event.status !== "CANCELLED" && (
        <>
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            disabled={isPending}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Annuler l'événement"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {showCancelConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
                <h3 className="text-base font-semibold text-gray-900 mb-2">Annuler cet événement ?</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Les acheteurs seront remboursés automatiquement. Cette action est irréversible.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isPending}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Publish / Unpublish */}
      {canPublish && (
        <button
          type="button"
          onClick={handlePublish}
          disabled={isPending}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
            event.status === "PUBLISHED"
              ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
              : "bg-violet-600 hover:bg-violet-700 text-white"
          }`}
        >
          {isPending ? "..." : event.status === "PUBLISHED" ? "Dépublier" : "Publier"}
        </button>
      )}
    </div>
  );
}
