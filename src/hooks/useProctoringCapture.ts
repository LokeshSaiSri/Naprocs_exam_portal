"use client";

import { useEffect, useRef, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type ProctoringViolationType = "NO_FACE" | "MULTIPLE_FACES" | "LOOKING_AWAY" | "HIGH_NOISE";

// -- The Rule Book (see PROCTORING_RULEBOOK.md — keep both in sync) --------
const FACE_CHECK_INTERVAL_MS = 1_500; // fast local-only detection loop
const SNAPSHOT_INTERVAL_MS = 60_000; // slow evidence loop, always uploads
const NOISE_CHECK_INTERVAL_MS = 500;
const COOLDOWN_MS = 20_000; // shared re-flag cooldown, every signal

const NO_FACE_THRESHOLD_MS = 5_000;
const MULTIPLE_FACES_THRESHOLD_MS = 3_000;
const LOOKING_AWAY_THRESHOLD_MS = 5_000;
const HIGH_NOISE_THRESHOLD_MS = 3_000;

// Coarse yaw proxy, not a precise gaze point -- deliberate, see rule book's
// research citations on webcam gaze-tracking false-positive rates.
const LOOKING_AWAY_NOSE_OFFSET_RATIO = 0.18;
const HIGH_NOISE_RMS_THRESHOLD = 0.15;

// Exported so the pre-exam device-check screen (a one-time "is a face
// visible" gate, not continuous monitoring) loads the identical model --
// one source of truth for both call sites.
export const PROCTORING_WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
export const PROCTORING_MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface UseProctoringCaptureArgs {
  stream: MediaStream | null;
  candidateId: string;
  sessionId: string;
  enabled: boolean;
  onViolation: (type: ProctoringViolationType) => void;
}

// Per-signal "has this condition been continuously true, and when did we
// last flag it" state -- kept in refs so ticking never causes a re-render.
interface SignalState {
  sinceMs: number | null;
  lastFiredAtMs: number | null;
}

function createSignalState(): SignalState {
  return { sinceMs: null, lastFiredAtMs: null };
}

// Shared "sustained-duration + cooldown" state machine every signal below
// uses. Exact numbers per signal live in PROCTORING_RULEBOOK.md.
function evaluateSignal(state: SignalState, conditionNow: boolean, now: number, thresholdMs: number, fire: () => void) {
  if (!conditionNow) {
    state.sinceMs = null;
    return;
  }
  if (state.sinceMs === null) state.sinceMs = now;
  const elapsed = now - state.sinceMs;
  const cooledDown = state.lastFiredAtMs === null || now - state.lastFiredAtMs >= COOLDOWN_MS;
  if (elapsed >= thresholdMs && cooledDown) {
    state.lastFiredAtMs = now;
    fire();
  }
}

export function useProctoringCapture({ stream, candidateId, sessionId, enabled, onViolation }: UseProctoringCaptureArgs) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);

  const noFaceState = useRef(createSignalState());
  const multiFaceState = useRef(createSignalState());
  const lookingAwayState = useRef(createSignalState());
  const highNoiseState = useRef(createSignalState());

  // Change-triggered (not per-tick, to avoid flooding the console over a
  // full exam) diagnostic logging -- what the model actually sees was
  // previously a total black box when a signal "didn't detect" in testing.
  const lastLoggedFaceCountRef = useRef<number | null>(null);
  const lastLoggedLookingAwayRef = useRef<boolean | null>(null);

  // Downscaled JPEG of the current frame -- detection itself reads the
  // full-res <video> element directly; only the uploaded evidence image is
  // shrunk, to keep bandwidth low across hundreds of concurrent candidates.
  const captureFrameBase64 = useCallback((maxWidth = 480): string | null => {
    const video = videoElRef.current;
    if (!video || video.videoWidth === 0) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = canvasElRef.current ?? document.createElement("canvas");
    canvasElRef.current = canvas;
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.6);
  }, []);

  const sendEvent = useCallback(
    async (eventType: ProctoringViolationType | "SNAPSHOT", snapshotBase64: string) => {
      try {
        await fetch("/api/exam/proctoring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, candidateId, eventType, snapshotBase64 }),
        });
      } catch (e) {
        console.error("Proctoring event upload failed:", e);
      }
    },
    [sessionId, candidateId]
  );

  // Offscreen <video> mirroring the granted stream -- never attached to the
  // document; muted so .play() doesn't need a fresh user gesture.
  useEffect(() => {
    if (!enabled || !stream) return;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.play().catch(() => {});
    videoElRef.current = video;
    return () => {
      video.pause();
      video.srcObject = null;
      videoElRef.current = null;
    };
  }, [enabled, stream]);

  // Load the face landmark model once. CPU delegate deliberately, not GPU --
  // this runs at ~0.67Hz, not real-time video overlay, so raw speed doesn't
  // matter; CPU is far more reliable across arbitrary laptop GPU/driver
  // combinations than WebGL-backed GPU inference.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(PROCTORING_WASM_BASE_URL);
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: PROCTORING_MODEL_ASSET_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 3, // candidate + margin for a second/third person in frame
          // A second face sharing one laptop webcam's frame is typically
          // smaller/off-angle/partially cropped vs. a single centered face,
          // which lowers its confidence score under the 0.5 default -- this
          // makes MULTIPLE_FACES detection meaningfully more reliable in
          // practice. Left at the library default for NO_FACE/LOOKING_AWAY
          // purposes since a single well-framed face isn't affected either way.
          minFaceDetectionConfidence: 0.4,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        faceLandmarkerRef.current = landmarker;
      } catch (e) {
        console.error("Failed to load face landmark model:", e);
      }
    })();
    return () => {
      cancelled = true;
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
    };
  }, [enabled]);

  // Fast local loop: face count + coarse looking-away. Purely in-memory --
  // no network call unless a threshold actually trips.
  useEffect(() => {
    if (!enabled || !stream) return;
    const timer = setInterval(() => {
      const video = videoElRef.current;
      const landmarker = faceLandmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      // detectForVideo can throw transiently (e.g. a non-monotonic timestamp
      // if this tick races the model's own load/teardown). This runs for the
      // whole exam duration -- one bad tick must never crash a candidate's
      // live session. Skip this tick and let the next one retry.
      let result;
      try {
        result = landmarker.detectForVideo(video, performance.now());
      } catch (err) {
        console.error("Proctoring detection tick failed, will retry:", err);
        return;
      }
      const faces = result.faceLandmarks || [];
      const now = Date.now();

      if (faces.length !== lastLoggedFaceCountRef.current) {
        console.debug(`[proctoring] face count: ${faces.length}`);
        lastLoggedFaceCountRef.current = faces.length;
      }

      evaluateSignal(noFaceState.current, faces.length === 0, now, NO_FACE_THRESHOLD_MS, () => {
        const frame = captureFrameBase64();
        if (frame) {
          onViolation("NO_FACE");
          sendEvent("NO_FACE", frame);
        }
      });

      evaluateSignal(multiFaceState.current, faces.length >= 2, now, MULTIPLE_FACES_THRESHOLD_MS, () => {
        const frame = captureFrameBase64();
        if (frame) {
          onViolation("MULTIPLE_FACES");
          sendEvent("MULTIPLE_FACES", frame);
        }
      });

      // Coarse on/off-screen classification: nose-tip horizontal offset from
      // the midpoint of the two face-edge landmarks (234/454), normalized by
      // face width -- not a gaze point. Only evaluated with exactly one face
      // in frame (avoids compounding with the no-face/multi-face signals).
      let lookingAway = false;
      let lookingAwayOffsetRatio: number | null = null;
      if (faces.length === 1) {
        const lm = faces[0];
        const left = lm[234];
        const right = lm[454];
        const nose = lm[1];
        if (left && right && nose) {
          const faceWidth = Math.abs(right.x - left.x);
          if (faceWidth > 0.01) {
            const midX = (left.x + right.x) / 2;
            lookingAwayOffsetRatio = Math.abs(nose.x - midX) / faceWidth;
            lookingAway = lookingAwayOffsetRatio > LOOKING_AWAY_NOSE_OFFSET_RATIO;
          }
        }
      }
      if (lookingAway !== lastLoggedLookingAwayRef.current) {
        console.debug(
          `[proctoring] looking-away: ${lookingAway} (offsetRatio=${lookingAwayOffsetRatio?.toFixed(3) ?? "n/a"}, threshold=${LOOKING_AWAY_NOSE_OFFSET_RATIO})`
        );
        lastLoggedLookingAwayRef.current = lookingAway;
      }
      evaluateSignal(lookingAwayState.current, lookingAway, now, LOOKING_AWAY_THRESHOLD_MS, () => {
        const frame = captureFrameBase64();
        if (frame) {
          onViolation("LOOKING_AWAY");
          sendEvent("LOOKING_AWAY", frame);
        }
      });
    }, FACE_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, stream, captureFrameBase64, sendEvent, onViolation]);

  // Slow evidence loop: always uploads a baseline snapshot, independent of
  // whether anything was flagged.
  useEffect(() => {
    if (!enabled || !stream) return;
    const timer = setInterval(() => {
      const frame = captureFrameBase64();
      if (frame) sendEvent("SNAPSHOT", frame);
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, stream, captureFrameBase64, sendEvent]);

  // Ambient noise LEVEL only -- raw audio is never recorded, buffered, or
  // sent anywhere; only this derived RMS-over-threshold boolean is used.
  useEffect(() => {
    if (!enabled || !stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const normalized = (buffer[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);
      const now = Date.now();
      evaluateSignal(highNoiseState.current, rms > HIGH_NOISE_RMS_THRESHOLD, now, HIGH_NOISE_THRESHOLD_MS, () => {
        const frame = captureFrameBase64();
        if (frame) {
          onViolation("HIGH_NOISE");
          sendEvent("HIGH_NOISE", frame);
        }
      });
    }, NOISE_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      audioCtx.close().catch(() => {});
    };
  }, [enabled, stream, captureFrameBase64, sendEvent, onViolation]);
}
