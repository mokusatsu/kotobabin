import {
  GameSession,
  isScorableKey,
  type KeyHandleResult,
} from './gameSession';


export interface InputAdapterOptions {
  inputElement: HTMLInputElement;
  session: GameSession;
  onKeyProcessed?: (result: KeyHandleResult) => void;
  onNotice?: (message: string) => void;
  onImePause?: () => void;
  onPause?: () => void;
}

export class InputAdapter {
  private readonly inputElement: HTMLInputElement;
  private readonly session: GameSession;
  private readonly onKeyProcessed?: (result: KeyHandleResult) => void;
  private readonly onNotice?: (message: string) => void;
  private readonly onImePause?: () => void;
  private readonly onPause?: () => void;

  private isComposing = false;
  private attached = false;

  private readonly handleKeyDownBound: (e: KeyboardEvent) => void;
  private readonly handleInputBound: (e: Event) => void;
  private readonly handleCompositionStartBound: () => void;
  private readonly handleCompositionEndBound: () => void;
  private readonly handleBlurBound: () => void;
  private readonly handleVisibilityChangeBound: () => void;

  constructor(options: InputAdapterOptions) {
    this.inputElement = options.inputElement;
    this.session = options.session;
    this.onKeyProcessed = options.onKeyProcessed;
    this.onNotice = options.onNotice;
    this.onImePause = options.onImePause;
    this.onPause = options.onPause;

    this.handleKeyDownBound = (e) => this.onKeyDown(e);
    this.handleInputBound = (e) => this.onInput(e);
    this.handleCompositionStartBound = () => this.onCompositionStart();
    this.handleCompositionEndBound = () => this.onCompositionEnd();
    this.handleBlurBound = () => this.triggerPause();
    this.handleVisibilityChangeBound = () => {
      if (document.visibilityState === 'hidden') {
        this.triggerPause();
      }
    };
  }

  attach(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDownBound);
    this.inputElement.addEventListener('input', this.handleInputBound);
    this.inputElement.addEventListener(
      'compositionstart',
      this.handleCompositionStartBound,
    );
    this.inputElement.addEventListener(
      'compositionend',
      this.handleCompositionEndBound,
    );
    this.inputElement.addEventListener('blur', this.handleBlurBound);
    window.addEventListener('blur', this.handleBlurBound);
    document.addEventListener(
      'visibilitychange',
      this.handleVisibilityChangeBound,
    );
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDownBound);
    this.inputElement.removeEventListener('input', this.handleInputBound);
    this.inputElement.removeEventListener(
      'compositionstart',
      this.handleCompositionStartBound,
    );
    this.inputElement.removeEventListener(
      'compositionend',
      this.handleCompositionEndBound,
    );
    this.inputElement.removeEventListener('blur', this.handleBlurBound);
    window.removeEventListener('blur', this.handleBlurBound);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChangeBound,
    );
  }

  private onKeyDown(e: KeyboardEvent): void {
    const state = this.session.currentState;
    if (
      state !== 'READY' &&
      state !== 'PLAYING' &&
      state !== 'PRACTICE' &&
      state !== 'TUTORIAL'
    ) {
      return;
    }

    if (e.shiftKey && e.key === 'Enter') {
      return;
    }

    if (e.repeat) {
      e.preventDefault();
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    if (document.activeElement !== this.inputElement) {
      this.inputElement.focus({ preventScroll: true });
    }

    if (
      this.isComposing ||
      e.isComposing ||
      e.keyCode === 229 ||
      e.key === 'Process'
    ) {
      this.triggerImePause();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      this.triggerPause();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      this.onNotice?.('訂正は不要です');
      return;
    }

    if (isScorableKey(e.key)) {
      const result = this.session.handleKey(e.key);
      this.inputElement.value = '';
      this.onKeyProcessed?.(result);
    }
  }

  private onInput(e: Event): void {
    const inputEvent = e as InputEvent;
    const isImeOrPaste =
      this.isComposing ||
      inputEvent.isComposing ||
      inputEvent.inputType === 'insertCompositionText' ||
      inputEvent.inputType === 'insertFromPaste' ||
      inputEvent.inputType === 'insertFromDrop';

    this.inputElement.value = '';

    if (isImeOrPaste && (this.isComposing || inputEvent.isComposing)) {
      this.triggerImePause();
    }
  }

  private onCompositionStart(): void {
    this.isComposing = true;
    this.triggerImePause();
  }

  private onCompositionEnd(): void {
    this.isComposing = false;
    this.inputElement.value = '';
  }

  private triggerImePause(): void {
    const paused = this.session.pause();
    if (paused) {
      this.onImePause?.();
      this.onPause?.();
    }
  }

  private triggerPause(): void {
    const paused = this.session.pause();
    if (paused) {
      this.onPause?.();
    }
  }
}
