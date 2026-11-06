import 'lenis/dist/lenis.css';
import './style.css';
import { App } from './app/App';

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const boot = async (): Promise<void> => {
  await document.fonts.ready;
  new App();
};

void boot();
