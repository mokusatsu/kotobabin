import { mountApp } from './ui';
import './style.css';
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root missing');
mountApp(root);
