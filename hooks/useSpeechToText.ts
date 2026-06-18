"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  abort?: () => void;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event?: any) => void) | null;
  onend: (() => void) | null;
};

export function useSpeechToText({
  onFinalText,
  lang = "en-US",
}: {
  onFinalText: (text: string) => void;
  lang?: string;
}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalTextRef = useRef(onFinalText);
  const streamRef = useRef<MediaStream | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<"ready" | "requesting" | "denied" | "unsupported">("unsupported");

  useEffect(() => {
    onFinalTextRef.current = onFinalText;
  }, [onFinalText]);

  useEffect(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? ((window as typeof window & {
            SpeechRecognition?: new () => SpeechRecognitionLike;
            webkitSpeechRecognition?: new () => SpeechRecognitionLike;
          }).SpeechRecognition ??
            (window as typeof window & {
              SpeechRecognition?: new () => SpeechRecognitionLike;
              webkitSpeechRecognition?: new () => SpeechRecognitionLike;
            }).webkitSpeechRecognition ??
            null)
        : null;

    if (!SpeechRecognitionCtor) {
      setSupported(false);
      setPermissionState("unsupported");
      return;
    }

    setSupported(true);
    setPermissionState("ready");
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) {
          finalText += `${transcript} `;
        } else {
          interimText += `${transcript} `;
        }
      }

      if (finalText.trim()) {
        onFinalTextRef.current(finalText.trim());
        setPreview("");
        setError(null);
      } else if (interimText.trim()) {
        setPreview(interimText.trim());
      }
    };

    recognition.onerror = (event?: any) => {
      setListening(false);
      setPreview("");
      const errorName = typeof event?.error === "string" ? event.error : "";
      if (errorName === "not-allowed" || errorName === "service-not-allowed") {
        setPermissionState("denied");
      }
      setError(
        errorName === "not-allowed" || errorName === "service-not-allowed"
          ? "Microphone access is blocked. Allow microphone permission to use voice input."
          : "Voice input is unavailable right now.",
      );
    };

    recognition.onend = () => {
      setListening(false);
      setPreview("");
    };

    recognitionRef.current = recognition;
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recognition.abort?.();
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [lang]);

  const startListening = async () => {
    if (!supported || !recognitionRef.current) {
      setError("Voice input is not supported in this browser.");
      setPermissionState("unsupported");
      return;
    }

    if (listening) return;

    setError(null);
    setPreview("");
    setPermissionState("requesting");

    try {
      if (!streamRef.current && navigator.mediaDevices?.getUserMedia) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      setPermissionState("ready");
    } catch {
      setPermissionState("denied");
      setError("Microphone access is blocked. Allow microphone permission to use voice input.");
      setListening(false);
      return;
    }

    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      setError("Could not start voice input. Check microphone permissions.");
      setListening(false);
    }
  };

  const stopListening = () => {
    if (!listening || !recognitionRef.current) return;
    recognitionRef.current.stop();
    setListening(false);
  };

  return {
    supported,
    listening,
    preview,
    error,
    permissionState,
    startListening,
    stopListening,
  };
}
