import {
  GameSession,
  isScorableKey,
  type DeliveryAttemptResult,
  type KeyHandleResult,
} from './gameSession';

export type DeliveryKeyOption = 'Space' | 'Enter';

export interface InputAdapterOptions {
  inputElement: HTMLInputElement;
  session: GameSession;
  deliveryKeys?: readonly DeliveryKeyOption[];
  pauseOnEscape?: boolean;
  canCommitDelivery?: () => boolean;
  onKeyProcessed?: (result: KeyHandleResult) => void;
  onDeliveryAttempt?: (result: DeliveryAttemptResult) => void;
  onNotice?: (message: string) => void;
  onImePause?: () => void;
  onDeadlineReached?: () => void;
  onPause?: () => void;
}

export class InputAdapter {
  private readonly inputElement: HTMLInputElement;
  private readonly session: GameSession;
  private deliveryKeys: Set<DeliveryKeyOption>;
  private readonly pauseOnEscape: boolean;
  private readonly canCommitDelivery?: () => boolean;
  private readonly onKeyProcessed?: (result: KeyHandleResult) => void;
  private readonly onDeliveryAttempt?: (result: DeliveryAttemptResult) => void;
  private readonly onNotice?: (message: string) => void;
  private readonly onImePause?: () => void;
  private readonly onDeadlineReached?: () => void;
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
    this.deliveryKeys = new Set(options.deliveryKeys ?? ['Space']);
    this.pauseOnEscape = options.pauseOnEscape ?? true;
    this.canCommitDelivery = options.canCommitDelivery;
    this.onKeyProcessed = options.onKeyProcessed;
    this.onDeliveryAttempt = options.onDeliveryAttempt;
    this.onNotice = options.onNotice;
    this.onImePause = options.onImePause;
    this.onDeadlineReached = options.onDeadlineReached;
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

  setDeliveryKeys(keys: readonly DeliveryKeyOption[]): void {
    this.deliveryKeys = new Set(keys);
  }

  attach(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    this.inputElement.addEventListener('keydown', this.handleKeyDownBound);
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
    this.inputElement.removeEventListener('keydown', this.handleKeyDownBound);
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

    if (
      e.defaultPrevented ||
      this.inputElement.ownerDocument.activeElement !== this.inputElement ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      (e.shiftKey && e.key === 'Enter')
    ) {
      return;
    }

    if (
      this.isComposing ||
      e.isComposing ||
      e.keyCode === 229 ||
      e.key === 'Process'
    ) {
      e.stopPropagation();
      this.triggerPause(true);
      return;
    }

    const isDeliveryKey =
      (e.key === ' ' && this.deliveryKeys.has('Space')) ||
      (e.key === 'Enter' && this.deliveryKeys.has('Enter'));
    const isCorrectionKey = e.key === 'Backspace' || e.key === 'Delete';
    const isPauseKey = this.pauseOnEscape && e.key === 'Escape';
    const shouldScore = isScorableKey(e.key);

    if (e.repeat) {
      if (shouldScore || isDeliveryKey || isCorrectionKey || isPauseKey) {
        e.preventDefault();
      }
      return;
    }

    if (isPauseKey) {
      e.preventDefault();
      this.triggerPause();
      return;
    }

    if (isCorrectionKey) {
      e.preventDefault();
      this.onNotice?.('訂正は不要です');
      return;
    }

    if (isDeliveryKey) {
      e.preventDefault();
      const snap = this.session.getSnapshot();
      if (snap.atWordBoundary && snap.cargoCount > 0 && this.canCommitDelivery && !this.canCommitDelivery()) {
        this.onDeliveryAttempt?.({
          delivered: false,
          reason: 'invalid_state',
          bonus: 0,
          cargoCount: snap.cargoCount,
        });
        return;
      }
      const result = this.session.commitDelivery();
      this.onDeliveryAttempt?.(result);
      return;
    }

    if (shouldScore) {
      const result = this.session.handleKey(e.key);
      if (result.deadlineReached) e.preventDefault();
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
      this.triggerPause(true);
    }
  }

  private onCompositionStart(): void {
    this.isComposing = true;
    this.triggerPause(true);
  }

  private onCompositionEnd(): void {
    this.isComposing = false;
    this.inputElement.value = '';
  }

  private triggerPause(ime = false): void {
    if (this.session.pause()) {
      if (ime) this.onImePause?.();
      this.onPause?.();
    } else if (this.session.currentState === 'RESULT') {
      // The deadline wins if the action arrives after time runs out, even
      // when the UI's periodic timer has not observed it yet.
      this.onDeadlineReached?.();
    }
  }
}
