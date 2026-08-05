import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

const MAX_RECORDING_SECONDS = 5 * 60;
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

const recorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const extensionForMime = (mimeType) => {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
};

const microphoneErrorMessage = (error) => {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Microphone access was denied. Allow microphone permission and try again.";
  }
  if (error?.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  return error?.message || "Could not start the microphone.";
};

export default function VoiceMessageRecorder({
  disabled = false,
  compact = false,
  onSend,
  onError,
}) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const actionRef = useRef("cancel");
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const mountedRef = useRef(true);

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const finishRecording = (action) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    actionRef.current = action;
    recorder.stop();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      actionRef.current = "cancel";
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopStream();
    };
  }, []);

  const startRecording = async () => {
    if (disabled || uploading || recording) return;
    onError?.("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError?.("Voice recording is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || disabled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const selectedMime = recorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        selectedMime ? { mimeType: selectedMime } : undefined
      );
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      actionRef.current = "cancel";

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", async () => {
        clearTimer();
        stopStream();
        if (mountedRef.current) setRecording(false);

        const shouldSend = actionRef.current === "send";
        actionRef.current = "cancel";
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (!shouldSend || !chunks.length) return;

        const mimeType = String(recorder.mimeType || selectedMime || chunks[0]?.type || "audio/webm")
          .split(";")[0]
          .toLowerCase();
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) {
          onError?.("The voice recording was empty. Please try again.");
          return;
        }

        const file = new File(
          [blob],
          `voice-message-${Date.now()}.${extensionForMime(mimeType)}`,
          { type: mimeType, lastModified: Date.now() }
        );
        if (mountedRef.current) setUploading(true);
        try {
          await onSend?.(file);
        } catch (error) {
          onError?.(error?.message || "Could not send the voice message.");
        } finally {
          if (mountedRef.current) {
            setUploading(false);
            setSeconds(0);
          }
        }
      });
      recorder.addEventListener("error", () => {
        clearTimer();
        stopStream();
        if (mountedRef.current) setRecording(false);
        onError?.("The voice recording stopped unexpectedly.");
      });

      recorder.start(250);
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        if (mountedRef.current) setSeconds(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS) finishRecording("send");
      }, 250);
    } catch (error) {
      clearTimer();
      stopStream();
      onError?.(microphoneErrorMessage(error));
    }
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={recording ? undefined : startRecording}
        className={`inline-flex items-center justify-center rounded-lg transition disabled:opacity-40 ${
          compact ? "h-9 w-9" : "h-9 w-9"
        } ${
          recording
            ? "animate-pulse bg-red-100 text-red-600"
            : "text-indigo-600 hover:bg-indigo-100"
        }`}
        title={recording ? "Recording voice message" : "Record voice message"}
        aria-label={recording ? "Recording voice message" : "Record voice message"}
        aria-pressed={recording}
      >
        <Icon name="microphone" className="h-4 w-4" />
      </button>

      {recording ? (
        <span className="absolute bottom-11 left-0 z-30 flex items-center gap-2 whitespace-nowrap rounded-xl border border-red-200 bg-white p-2 shadow-xl">
          <span className="inline-flex items-center gap-1.5 px-1 text-xs font-bold tabular-nums text-red-600" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {formatDuration(seconds)}
          </span>
          <button
            type="button"
            onClick={() => finishRecording("cancel")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
            title="Cancel recording"
            aria-label="Cancel recording"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => finishRecording("send")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            title="Stop and send voice message"
            aria-label="Stop and send voice message"
          >
            <Icon name="check" className="h-4 w-4" />
          </button>
        </span>
      ) : null}

      {uploading ? (
        <span className="absolute bottom-11 left-0 z-30 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-[10px] font-semibold text-indigo-700 shadow-lg">
          Sending voice message…
        </span>
      ) : null}
    </span>
  );
}
