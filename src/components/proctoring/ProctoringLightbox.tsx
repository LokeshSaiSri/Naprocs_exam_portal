"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Camera } from "lucide-react";
import { PROCTORING_FLAG_BY_EVENT_TYPE } from "@/lib/proctoringFlags";

export interface ProctoringLightboxEvent {
  _id: string;
  eventType: string;
  snapshotUrl?: string | null;
  createdAt: string;
}

interface ProctoringLightboxProps {
  events: ProctoringLightboxEvent[];
  startIndex: number;
  onClose: () => void;
}

// Full-screen viewer for one proctoring snapshot at a time, with Prev/Next
// through the same event list the caller already fetched -- no data-fetching
// of its own. Used by both admin surfaces that show a snapshot grid.
export function ProctoringLightbox({ events, startIndex, onClose }: ProctoringLightboxProps) {
  const [index, setIndex] = useState(startIndex);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(events.length - 1, i + 1)), [events.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture phase + stopPropagation: this lightbox stacks on top of
        // the admin gallery Dialog, which has its own Escape-to-close
        // handling. Without this, Escape either gets consumed by the
        // Dialog before this listener ever runs, or closes both layers at
        // once -- neither matches "Escape backs out one layer at a time."
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, goPrev, goNext]);

  const event = events[index];
  if (!event) return null;

  const flag = PROCTORING_FLAG_BY_EVENT_TYPE[event.eventType];
  const isFlag = !!flag;
  const Icon = flag?.icon || Camera;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6" onClick={onClose}>
      <button
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {index > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < events.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div className="max-w-4xl max-h-[85vh] w-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        {event.snapshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.snapshotUrl}
            alt={flag?.label || "Snapshot"}
            className="max-w-full max-h-[75vh] rounded-xl object-contain border border-white/10"
          />
        ) : (
          <div className="w-full aspect-video rounded-xl border border-white/10 flex items-center justify-center text-white/40">
            <Camera className="h-10 w-10" />
          </div>
        )}
        <div className="flex items-center gap-3 text-white">
          <span
            className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full ${
              isFlag ? "bg-destructive/20 text-destructive" : "bg-white/10 text-white/70"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {flag?.label || "Snapshot"}
          </span>
          <span className="text-xs font-mono text-white/50">{new Date(event.createdAt).toLocaleString()}</span>
          <span className="text-xs font-mono text-white/30">
            {index + 1} / {events.length}
          </span>
        </div>
      </div>
    </div>
  );
}
