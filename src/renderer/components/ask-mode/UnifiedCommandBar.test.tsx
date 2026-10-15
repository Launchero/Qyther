import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UnifiedCommandBar } from './UnifiedCommandBar';

/**
 * Study gate (docs/ask-mode-experience-research.md §8): a composing Enter
 * must not send. React 19 reads `nativeEvent.isComposing`, which jsdom
 * leaves false — so the composing case defines it onto the dispatched event.
 */
function renderBar(onSend: (message: string) => void, value = 'hello') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  act(() => {
    root.render(
      <UnifiedCommandBar
        value={value}
        onChange={onChange}
        onSend={onSend}
        windowMode="expanded"
        hasSentMessage={false}
      />
    );
  });
  const textarea = container.querySelector('textarea');
  if (!textarea) throw new Error('ask textarea did not mount');
  return { container, root, textarea };
}

function keydown(target: HTMLElement, key: string, init?: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe('UnifiedCommandBar IME', () => {
  let roots: Root[] = [];
  let containers: HTMLElement[] = [];

  afterEach(() => {
    for (const root of roots) root.unmount();
    for (const el of containers) el.remove();
    roots = [];
    containers = [];
  });

  it('sends on plain Enter', () => {
    const onSend = vi.fn();
    const { container, root, textarea } = renderBar(onSend);
    roots.push(root);
    containers.push(container);
    act(() => {
      keydown(textarea, 'Enter');
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('does not send while composing', () => {
    const onSend = vi.fn();
    const { container, root, textarea } = renderBar(onSend);
    roots.push(root);
    containers.push(container);
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'isComposing', { value: true });
    act(() => {
      textarea.dispatchEvent(event);
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('inserts a newline on Shift+Enter instead of sending', () => {
    const onSend = vi.fn();
    const { container, root, textarea } = renderBar(onSend);
    roots.push(root);
    containers.push(container);
    act(() => {
      keydown(textarea, 'Enter', { shiftKey: true });
    });
    expect(onSend).not.toHaveBeenCalled();
  });
});
