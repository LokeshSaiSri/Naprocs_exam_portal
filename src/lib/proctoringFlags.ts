import { Eye, EyeOff, Users as UsersIcon, Volume2, type LucideIcon } from "lucide-react";

// Single source of truth for the four violation types -- previously
// duplicated across the admin Proctoring Overview page and the per-candidate
// Proctoring tab. Drives table columns, gallery badges, and the lightbox.
export interface ProctoringFlagMeta {
  key: "noFace" | "multipleFaces" | "lookingAway" | "highNoise";
  eventType: "NO_FACE" | "MULTIPLE_FACES" | "LOOKING_AWAY" | "HIGH_NOISE";
  label: string;
  icon: LucideIcon;
}

export const PROCTORING_FLAG_TYPES: ProctoringFlagMeta[] = [
  { key: "noFace", eventType: "NO_FACE", label: "No Face", icon: EyeOff },
  { key: "multipleFaces", eventType: "MULTIPLE_FACES", label: "Multi-Face", icon: UsersIcon },
  { key: "lookingAway", eventType: "LOOKING_AWAY", label: "Looking Away", icon: Eye },
  { key: "highNoise", eventType: "HIGH_NOISE", label: "High Noise", icon: Volume2 },
];

export const PROCTORING_FLAG_BY_EVENT_TYPE: Record<string, ProctoringFlagMeta> = Object.fromEntries(
  PROCTORING_FLAG_TYPES.map((f) => [f.eventType, f])
);
