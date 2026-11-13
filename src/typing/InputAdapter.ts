export type InputPauseReason = 'escape' | 'blur' | 'hidden' | 'ime' | 'unconfirmed-input';
export interface InputAdapterOptions {
  onCharacter: (key: string, startedAtMs: number) => void;
  onDeliver: (startedAtMs: number) => void;
  onPause: (reason: InputPauseReason, resolvedAtMs: number) => void;
  onInputCheckRequired: (reason: InputPauseReason, resolvedAtMs: number) => void;
  now?: () => number;
  deliveryKeys?: ('Space' | 'Enter')[];
}
interface PendingOperation {
  key: string;
  code: string;
  startedAtMs: number;
  beforeInputConfirmed: boolean;
}
const isCharacter = (key: string) => /^[A-Za-z'-]$/.test(key);

/** Native input confirms keydown before any scoring callback is emitted. */
export class InputAdapter {
  private pending: PendingOperation | null = null;
  private composing = false;
  private inputCheckRequired = false;
  private readonly now: () => number;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly input: HTMLInputElement, private readonly options: InputAdapterOptions) {
    const view = input.ownerDocument.defaultView;
    if (!view) throw new Error('InputAdapter requires a browser window');
    this.now = options.now ?? (() => view.performance.now());
    this.listen(input, 'keydown', this.keydown);
    this.listen(input, 'keyup', this.keyup);
    this.listen(input, 'beforeinput', this.beforeinput);
    this.listen(input, 'input', this.nativeInput);
    this.listen(input, 'compositionstart', this.compositionstart);
    this.listen(input, 'compositionend', this.compositionend);
    this.listen(input, 'blur', this.blur);
    this.listen(view, 'blur', this.blur);
    this.listen(input.ownerDocument, 'visibilitychange', this.visibilitychange);
    this.listen(input, 'paste', this.unsupportedInsertion);
    this.listen(input, 'drop', this.unsupportedInsertion);
    input.value = '';
  }

  private listen(target: EventTarget, name: string, listener: (event: Event) => void): void {
    target.addEventListener(name, listener);
    this.listeners.push(() => target.removeEventListener(name, listener));
  }
  // Discarded operations never borrow their earlier keydown timestamp: lifecycle
  // transitions use the classification time so a pending key cannot extend a round.
  private requireCheck(reason: InputPauseReason, atMs: number): void {
    this.pending = null;
    this.input.value = '';
    this.inputCheckRequired = true;
    this.options.onInputCheckRequired(reason, atMs);
    this.options.onPause(reason, atMs);
  }
  private keydown = (raw: Event): void => {
    const event = raw as KeyboardEvent;
    const startedAtMs = this.now();
    if (!event.isTrusted || this.input.ownerDocument.activeElement !== this.input) return;
    if (event.isComposing || event.keyCode === 229 || event.key === 'Process' || this.composing) {
      this.requireCheck('ime', startedAtMs);
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.repeat) { event.preventDefault(); return; }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.pending = null;
      this.options.onPause('escape', startedAtMs);
      return;
    }
    const deliveries = this.options.deliveryKeys ?? ['Space'];
    if ((event.key === ' ' && deliveries.includes('Space')) || (event.key === 'Enter' && deliveries.includes('Enter'))) {
      event.preventDefault();
      if (!this.composing && !this.inputCheckRequired && !this.pending) this.options.onDeliver(startedAtMs);
      return;
    }
    if (!isCharacter(event.key)) {
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.preventDefault();
      return;
    }
    if (this.inputCheckRequired) { event.preventDefault(); return; }
    if (this.pending) {
      this.requireCheck('unconfirmed-input', startedAtMs);
      return;
    }
    this.input.value = '';
    this.pending = { key: event.key.toLowerCase(), code: event.code, startedAtMs, beforeInputConfirmed: false };
  };
  private beforeinput = (raw: Event): void => {
    const event = raw as InputEvent;
    if (!event.isTrusted) return;
    if (event.isComposing || this.composing || event.inputType !== 'insertText' || !event.data || !isCharacter(event.data)) {
      event.preventDefault();
      this.requireCheck(event.isComposing || this.composing || event.inputType.includes('Composition') ? 'ime' : 'unconfirmed-input', this.now());
      return;
    }
    if (this.pending && event.data.toLowerCase() === this.pending.key) this.pending.beforeInputConfirmed = true;
    else {
      event.preventDefault();
      this.requireCheck('unconfirmed-input', this.now());
    }
  };
  private nativeInput = (raw: Event): void => {
    const event = raw as InputEvent;
    if (!event.isTrusted) return;
    const operation = this.pending;
    if (!operation || !operation.beforeInputConfirmed || this.composing || this.inputCheckRequired || event.isComposing ||
      event.inputType !== 'insertText' || !event.data || !isCharacter(event.data) || event.data.toLowerCase() !== operation.key ||
      this.input.value.toLowerCase() !== operation.key) {
      this.requireCheck(event.isComposing || this.composing ? 'ime' : 'unconfirmed-input', this.now());
      return;
    }
    this.pending = null;
    this.input.value = '';
    this.options.onCharacter(operation.key, operation.startedAtMs);
  };
  private keyup = (raw: Event): void => {
    const event = raw as KeyboardEvent;
    if (event.isTrusted && this.pending && event.code === this.pending.code) this.requireCheck('unconfirmed-input', this.now());
  };
  private compositionstart = (event: Event): void => {
    if (!event.isTrusted) return;
    this.composing = true;
    this.requireCheck('ime', this.now());
  };
  private compositionend = (event: Event): void => {
    if (!event.isTrusted) return;
    this.composing = false;
    this.pending = null;
    this.input.value = '';
    // Keep the check requirement until the UI explicitly verifies half-width input.
  };
  private blur = (): void => {
    const startedAtMs = this.now();
    if (this.pending) this.requireCheck('unconfirmed-input', startedAtMs);
    else this.options.onPause('blur', startedAtMs);
  };
  private visibilitychange = (): void => {
    if (this.input.ownerDocument.hidden) {
      const startedAtMs = this.now();
      this.pending = null;
      this.options.onPause('hidden', startedAtMs);
    }
  };
  private unsupportedInsertion = (event: Event): void => {
    event.preventDefault();
    this.requireCheck('unconfirmed-input', this.now());
  };

  get hasPendingOperation(): boolean { return this.pending !== null; }
  /** Expiry must wait for the final pre-deadline operation to be classified. */
  deadlineTime(nowMs: number): number { return this.pending?.startedAtMs ?? nowMs; }

  /** Called only after a separate trusted half-width-a check and explicit resume. */
  resetAfterInputCheck(): void {
    this.pending = null;
    this.composing = false;
    this.inputCheckRequired = false;
    this.input.value = '';
  }
  destroy(): void {
    this.listeners.splice(0).forEach((remove) => remove());
    this.pending = null;
  }
}
