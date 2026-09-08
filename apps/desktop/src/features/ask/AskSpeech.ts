import { useEffect, useRef, useState } from "react";
import {
  extractSpeechTranscript,
  getSpeechInputErrorMessage,
  getSpeechRecognitionConstructor,
  isSpeechInputSupported,
  type SpeechRecognitionLike
} from "./ask-speech";
import { useAskStore } from "./ask-store";


export function useVoiceInput() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseDraftRef = useRef("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const setInput = useAskStore((state) => state.setInput);

  const stop = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setActive(false);
      return;
    }
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
      setActive(false);
    }
  };

  const toggle = (currentInput: string) => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setError("이 브라우저는 음성 입력을 지원하지 않습니다.");
      return;
    }
    if (recognitionRef.current) {
      stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    baseDraftRef.current = currentInput;
    setActive(true);
    setError("");
    recognition.onresult = (event) => {
      const transcript = extractSpeechTranscript(event);
      const base = baseDraftRef.current.trim();
      setInput([base, transcript].filter(Boolean).join(base && transcript ? " " : ""));
    };
    recognition.onerror = (event) => {
      setError(getSpeechInputErrorMessage(event.error || ""));
      setActive(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setActive(false);
    };
    try {
      recognition.start();
    } catch (errorValue) {
      recognitionRef.current = null;
      setActive(false);
      setError(getSpeechInputErrorMessage(errorValue instanceof Error ? errorValue.name : ""));
    }
  };

  useEffect(() => () => {
    try {
      recognitionRef.current?.abort();
    } catch {
      /* noop */
    }
  }, []);

  return { active, error, supported: isSpeechInputSupported(), toggle, stop };
}
