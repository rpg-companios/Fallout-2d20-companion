import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);

// PWA (только прод-билд): офлайн-статика по sw.js. Регистрация защищена —
// песочницы/прокси превью не должны ломать приложение ошибкой SW.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* превью без SW */ });
  });
}
