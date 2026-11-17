import './ui/styles/tokens.css';
import './ui/styles/main.css';
import { AppController } from './ui/appController';

const mountEl = document.getElementById('app');
if (mountEl) {
  const controller = new AppController(mountEl);
  void controller.init();
}
