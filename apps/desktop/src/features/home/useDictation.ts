import { useEffect, useRef, useState } from "react";
import {
  extractSpeechTranscript,
  getSpeechRecognitionConstructor,
  isSpeechInputSupported,
  type SpeechRecognitionLike
} from "../ask/ask-speech";

// 홈 컴포저용 받아쓰기 훅 — 브라우저 SpeechRecognition(ko-KR) 재사용.
// AskPage의 useVoiceInput 패턴을 그대로 따른다. 전사 결과는 onTranscript(base+transcript)로 전달.
export function useDictation(onTranscript: (next: string) => void) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;
  const [listening, setListening] = useState(false);

  const stop = () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          /* noop */
        }
      }
    }
    recognitionRef.current = null;
    setListening(false);
  };

  const toggle = (currentValue: string) => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return;
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
    baseRef.current = currentValue;
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = extractSpeechTranscript(event);
      const base = baseRef.current.trim();
      callbackRef.current([base, transcript].filter(Boolean).join(base && transcript ? " " : ""));
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    // 일부 WebView는 SpeechRecognition 전에 마이크 권한을 명시적으로 요구한다 → 먼저 권한을 띄운다.
    void navigator.mediaDevices
      ?.getUserMedia?.({ audio: true })
      .then((stream) => stream.getTracks().forEach((track) => track.stop()))
      .catch(() => {});
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  };

  useEffect(() => () => stop(), []);

  return { supported: isSpeechInputSupported(), listening, toggle, stop };
}
