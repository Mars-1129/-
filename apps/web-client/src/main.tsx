import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './app/router';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import './i18n';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  </React.StrictMode>,
);
