// Точка входа приложения: монтирует корневой компонент App в #root
// и подключает глобальные стили.
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Не найден элемент #root');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
