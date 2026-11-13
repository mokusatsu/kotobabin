import { mountApp } from './ui';
import { createAppRuntime } from './app/runtime';
import './style.css';
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root missing');
root.textContent = '配達の準備をしています。';
const runtime = await createAppRuntime();
const dispose = mountApp(root, runtime);
window.addEventListener('pagehide', event => {
  if (!event.persisted) { dispose(); runtime.close(); }
});
