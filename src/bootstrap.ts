/** Keep the HTML recovery action usable even when the game module cannot load. */
export {};
const root = document.querySelector<HTMLElement>('#app');
if (root) {
  const preparationMarkup = root.innerHTML;
  try {
    await import('./main');
  } catch {
    root.innerHTML = preparationMarkup;
    root.dataset.bootstrap = 'failed';
    const message = root.querySelector<HTMLElement>('[data-boot-message]');
    if (message) {
      message.setAttribute('role', 'alert');
      message.textContent = '必要なデータの読み込み、または配達の準備に失敗しました。もう一度読み込んでください。';
    }
  }
}
