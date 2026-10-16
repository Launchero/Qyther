import React from 'react';
import ReactDOM from 'react-dom/client';
import { SettingsApp } from './components/settings/SettingsApp';
import { ThemeProvider } from './context/ThemeProvider';
import { TooltipProvider } from './components/ui/tooltip';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

// Second renderer entry: the settings window. Same provider order as `main.tsx` (ThemeProvider now
// reads appearance from main, not localStorage), but mounts `SettingsApp` instead of the palette.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <SettingsApp />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
