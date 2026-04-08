import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './context/ThemeProvider';
import { OpenCodeProvider } from './context/OpenCodeProvider';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <OpenCodeProvider>
        <App />
      </OpenCodeProvider>
    </ThemeProvider>
  </React.StrictMode>
);
