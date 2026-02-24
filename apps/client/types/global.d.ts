// src/types/speech.d.ts

declare interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;

    onaudioend?: (event: Event) => void;
    onaudiostart?: (event: Event) => void;
    onend?: (event: Event) => void;
    onerror?: (event: SpeechRecognitionErrorEvent) => void;
    onnomatch?: (event: Event) => void;
    onresult?: (event: SpeechRecognitionEvent) => void;
    onsoundend?: (event: Event) => void;
    onsoundstart?: (event: Event) => void;
    onspeechend?: (event: Event) => void;
    onspeechstart?: (event: Event) => void;
    onstart?: (event: Event) => void;
}

declare interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
}

declare interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

declare const webkitSpeechRecognition: {
    new (): SpeechRecognition;
};

declare const SpeechRecognition: {
    new (): SpeechRecognition;
};
