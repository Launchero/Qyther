import { globalShortcut } from 'electron';
import { toggleMainWindow, toggleWindowMode } from './windows';

export function registerGlobalShortcuts(): void {
  // Register Alt+Space as the global shortcut to show/hide window
  const ret = globalShortcut.register('Alt+Space', () => {
    toggleMainWindow();
  });

  if (!ret) {
    console.log('Failed to register global shortcut Alt+Space');
  } else {
    console.log('Global shortcut Alt+Space registered successfully');
  }

  // Register Alt+Shift+M to toggle window mode (compact/expanded)
  const retMode = globalShortcut.register('Alt+Shift+M', () => {
    const newMode = toggleWindowMode();
    console.log(`Window mode toggled to: ${newMode}`);
  });

  if (!retMode) {
    console.log('Failed to register global shortcut Alt+Shift+M');
  } else {
    console.log('Global shortcut Alt+Shift+M registered successfully');
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregister('Alt+Space');
  globalShortcut.unregister('Alt+Shift+M');
  console.log('Global shortcuts unregistered');
}
