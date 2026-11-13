import { mountApp } from './ui';
import { createAppRuntime } from './app/runtime';
import { installAssetFailureFallback } from './ui/asset-failures';
import './style.css';
import './ipad.css';
import './tablet-play.css';
import './game-shell.css';
import './district-map.css';
import './city-stage.css';
import './result-stage.css';
import './game-menu.css';
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root missing');
const runtime = await createAppRuntime();
const disposeAssets = installAssetFailureFallback(root);
const dispose = mountApp(root, runtime);
window.addEventListener('pagehide', event => {
  if (!event.persisted) { dispose(); disposeAssets(); runtime.close(); }
});
