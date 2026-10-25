export type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "phrases-not-supported"
  | "service-not-allowed";

export type SpeechRecognitionErrorKind =
  | "cancelled"
  | "microphone_unavailable"
  | "permission_denied"
  | "unsupported_language"
  | "network"
  | "no_speech"
  | "unknown";

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export type SpeechRecognitionEventLike = {
  results: SpeechRecognitionResultListLike;
};

export type SpeechRecognitionErrorEventLike = {
  error?: SpeechRecognitionErrorCode | string;
};

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

export type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

export type SpeechRecognitionResultLike = {
  0?: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
};

export type SpeechRecognitionResultListLike = {
  [index: number]: SpeechRecognitionResultLike | undefined;
  length: number;
};

const DEFAULT_SPEECH_RECOGNITION_LANGUAGE = "en-US";
const SPEECH_RECOGNITION_LANGUAGE_ALLOWLIST = new Set([
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pt",
  "zh",
]);

export function getSpeechRecognitionConstructor(
  value: unknown = globalThis,
): SpeechRecognitionConstructor | null {
  const maybeWindow = value as Partial<SpeechRecognitionWindow>;
  return (
    maybeWindow.SpeechRecognition ?? maybeWindow.webkitSpeechRecognition ?? null
  );
}

export function getSpeechRecognitionLanguage(locale: string): string {
  const normalized = normalizeBCP47Locale(locale);
  const language = normalized.split("-")[0]?.toLowerCase();

  if (language === "zh") {
    return "zh-CN";
  }
  if (language && SPEECH_RECOGNITION_LANGUAGE_ALLOWLIST.has(language)) {
    return normalized;
  }
  return DEFAULT_SPEECH_RECOGNITION_LANGUAGE;
}

export function shouldRestartSpeechRecognition(
  lastError: SpeechRecognitionErrorKind | null,
): boolean {
  return lastError === null || lastError === "no_speech";
}

// Scripts written without spaces between words and the punctuation that
// surrounds them: Han (Chinese), kana (Japanese), CJK symbols/punctuation,
// and their full-width/half-width compatibility forms. Korean Hangul is
// deliberately absent — Korean uses eojeol spaces, so it is joined like any
// space-delimited script. Property escapes keep supplementary-plane Han
// (CJK Ext B+) matching alongside the BMP forms.
const NO_SPACE_SCRIPT_BOUNDARY =
  /[\u3000-\u303f\u31f0-\u31ff\uff00-\uff9f\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

// These leading marks attach to the preceding text. Keep the rule directional:
// a sentence-ending mark on the left still needs a space before the next word.
const NO_SPACE_BEFORE_PUNCTUATION = /[,.;:!?%…)\]}]/;

// One full code point at each string edge: a single UTF-16 unit slices a
// supplementary-plane character into a lone surrogate, which matches neither
// script class and misclassifies the seam.
function lastCodePoint(text: string): string {
  if (!text) {
    return "";
  }
  const index = text.length - 1;
  if (
    index > 0 &&
    text.charCodeAt(index) >= 0xdc00 &&
    text.charCodeAt(index) <= 0xdfff &&
    text.charCodeAt(index - 1) >= 0xd800 &&
    text.charCodeAt(index - 1) <= 0xdbff
  ) {
    return text.slice(-2);
  }
  return text.slice(-1);
}

function firstCodePoint(text: string): string {
  if (!text) {
    return "";
  }
  if (
    text.length >= 2 &&
    text.charCodeAt(0) >= 0xd800 &&
    text.charCodeAt(0) <= 0xdbff &&
    text.charCodeAt(1) >= 0xdc00 &&
    text.charCodeAt(1) <= 0xdfff
  ) {
    return text.slice(0, 2);
  }
  return text.slice(0, 1);
}

function joinTranscriptSegments(left: string, right: string): string {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  const lastChar = lastCodePoint(left.trimEnd());
  const firstChar = firstCodePoint(right.trimStart());
  // Space-delimited scripts need an explicit separator when a provider does
  // not pad its results (WebKit trims final transcripts), otherwise the last
  // finalized word glues onto the next segment. No-space scripts (Chinese,
  // Japanese) keep the plain concatenation they always had.
  if (
    !lastChar ||
    !firstChar ||
    NO_SPACE_SCRIPT_BOUNDARY.test(lastChar) ||
    NO_SPACE_SCRIPT_BOUNDARY.test(firstChar) ||
    NO_SPACE_BEFORE_PUNCTUATION.test(firstChar)
  ) {
    return `${left}${right}`;
  }
  return `${left} ${right}`;
}

export function readSpeechRecognitionTranscript(
  results: SpeechRecognitionResultListLike,
): { finalText: string; interimText: string; text: string } {
  const finalParts: string[] = [];
  const interimParts: string[] = [];

  for (const result of Array.from(
    { length: results.length },
    (_, index) => results[index],
  )) {
    const transcript = result?.[0]?.transcript ?? "";
    if (result?.isFinal) {
      finalParts.push(transcript);
    } else {
      interimParts.push(transcript);
    }
  }

  let finalText = "";
  for (const part of finalParts) {
    finalText = joinTranscriptSegments(finalText, part);
  }
  let interimText = "";
  for (const part of interimParts) {
    interimText = joinTranscriptSegments(interimText, part);
  }
  let text = "";
  for (const part of [...finalParts, ...interimParts]) {
    text = joinTranscriptSegments(text, part);
  }

  return {
    finalText: normalizeSpeechTranscript(finalText),
    interimText: normalizeSpeechTranscript(interimText),
    text: normalizeSpeechTranscript(text),
  };
}

export function appendSpeechTranscript(baseText: string, transcript: string) {
  const cleanTranscript = normalizeSpeechTranscript(transcript);
  if (!cleanTranscript) {
    return baseText;
  }

  const cleanBase = baseText.trimEnd();
  if (!cleanBase) {
    return cleanTranscript;
  }

  return `${cleanBase} ${cleanTranscript}`;
}

export function normalizeSpeechTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function mapSpeechRecognitionError(
  error: SpeechRecognitionErrorCode | string | undefined,
): SpeechRecognitionErrorKind {
  switch (error) {
    case "aborted":
      return "cancelled";
    case "audio-capture":
      return "microphone_unavailable";
    case "not-allowed":
    case "service-not-allowed":
      return "permission_denied";
    case "language-not-supported":
      return "unsupported_language";
    case "network":
      return "network";
    case "no-speech":
      return "no_speech";
    default:
      return "unknown";
  }
}

function normalizeBCP47Locale(locale: string): string {
  const trimmed = locale.trim();
  if (!trimmed) {
    return DEFAULT_SPEECH_RECOGNITION_LANGUAGE;
  }
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? trimmed;
  } catch {
    return DEFAULT_SPEECH_RECOGNITION_LANGUAGE;
  }
}
