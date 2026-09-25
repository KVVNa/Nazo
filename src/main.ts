import './styles.css';
import { start } from './ui/app';

start();

// Service Worker（ビルド版のみ）。オフライン起動用。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 登録できなくてもゲームは動く */ });
  });
}
