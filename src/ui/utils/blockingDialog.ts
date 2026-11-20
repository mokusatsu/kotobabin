interface BlockingDialogOptions {
  focusOrder: readonly HTMLButtonElement[];
  initialFocus: HTMLButtonElement;
  onDismiss: () => void;
}

/** Opens a view-owned modal after the controller has mounted the new DOM. */
export function mountBlockingDialog(
  dialog: HTMLDialogElement,
  { focusOrder, initialFocus, onDismiss }: BlockingDialogOptions,
): void {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) onDismiss();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onDismiss();
  });
  dialog.addEventListener('keydown', (event) => {
    // Do not pass dialog input to page-level shortcuts.
    event.stopPropagation();
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onDismiss();
    } else if (event.key === 'Tab') {
      const current = focusOrder.findIndex((button) => button === document.activeElement);
      if (current === -1 || (event.shiftKey ? current === 0 : current === focusOrder.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? focusOrder.at(-1) : focusOrder[0])?.focus();
      }
    }
  });
  queueMicrotask(() => {
    if (!dialog.isConnected) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
    initialFocus.focus({ preventScroll: true });
  });
}
