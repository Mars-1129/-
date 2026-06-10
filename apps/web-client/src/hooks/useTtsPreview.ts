import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 旁白 TTS 试听 Hook
 * 使用浏览器内置 SpeechSynthesis API 即时预览旁白文案
 * 零外部依赖
 */

type UseTtsPreviewOptions = {
  /** 语音语言，默认 zh-CN */
  lang?: string;
  /** 语速，默认 1.0 */
  rate?: number;
};

type UseTtsPreviewReturn = {
  /** 是否正在播放 */
  speaking: boolean;
  /** 是否有可用语音 */
  available: boolean;
  /** 试听旁白 */
  speak: (text: string) => void;
  /** 停止播放 */
  stop: () => void;
};

export function useTtsPreview(options: UseTtsPreviewOptions = {}): UseTtsPreviewReturn {
  const { lang = 'zh-CN', rate = 1.0 } = options;
  const [speaking, setSpeaking] = useState(false);
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (!available) return;

    clearTimer();
    window.speechSynthesis.cancel();
    setSpeaking(false);
    utteranceRef.current = null;
  }, [available, clearTimer]);

  const speak = useCallback(
    (text: string) => {
      if (!available || !text.trim()) return;

      // 先停止之前的播放
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;

      // 优先使用 zh-CN 语音
      const voices = window.speechSynthesis.getVoices();
      const chineseVoice = voices.find((v) => v.lang.startsWith('zh'));
      if (chineseVoice) {
        utterance.voice = chineseVoice;
      }

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setSpeaking(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);

      // 兼容 Chrome 长时间不调用会暂停的 bug
      const resumeTimer = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(resumeTimer);
          timerRef.current = null;
          return;
        }
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }, 10000);
      timerRef.current = resumeTimer;

      // 安全清理：仅当 timerRef 仍指向本 timer 时才清空，防止竞态覆盖新 timer
      const cleanup = () => {
        clearInterval(resumeTimer);
        if (timerRef.current === resumeTimer) {
          timerRef.current = null;
        }
      };
      utterance.addEventListener('end', cleanup);
      utterance.addEventListener('error', cleanup);
    },
    [available, lang, rate, clearTimer],
  );

  // 组件卸载时清理定时器和语音合成
  useEffect(() => {
    return () => {
      clearTimer();
      window.speechSynthesis.cancel();
    };
  }, [clearTimer]);

  return { speaking, available, speak, stop };
}
