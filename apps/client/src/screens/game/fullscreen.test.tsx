import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FullscreenButton } from './fullscreen';

/** jsdom has no Fullscreen API: give the document a fake one the test controls. */
function fakeFullscreen(enabled: boolean) {
  let element: Element | null = null;
  const change = () => document.dispatchEvent(new Event('fullscreenchange'));
  const request = vi.fn(async () => {
    element = document.documentElement;
    change();
  });
  const exit = vi.fn(async () => {
    element = null;
    change();
  });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: request,
  });
  return { request, exit };
}

afterEach(() => {
  for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) {
    delete (document as unknown as Record<string, unknown>)[key];
  }
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
});

describe('Fullscreen button (ui-spec §7.1)', () => {
  let api: ReturnType<typeof fakeFullscreen>;
  beforeEach(() => {
    api = fakeFullscreen(true);
  });

  it('enters full screen on click and leaves it on the next click', async () => {
    render(<FullscreenButton />);
    const btn = screen.getByTestId('game-fullscreen');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Full screen');
    await act(async () => fireEvent.click(btn));
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Exit full screen');
    await act(async () => fireEvent.click(btn));
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('the F key toggles it too, but not while typing in chat', async () => {
    render(
      <>
        <input data-testid="chat" />
        <FullscreenButton />
      </>,
    );
    await act(async () => fireEvent.keyDown(screen.getByTestId('chat'), { key: 'f' }));
    expect(api.request).not.toHaveBeenCalled();
    await act(async () => fireEvent.keyDown(window, { key: 'f' }));
    expect(api.request).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.keyDown(window, { key: 'F' }));
    expect(api.exit).toHaveBeenCalledTimes(1);
  });

  it('follows full screen left with Esc (the browser exits on its own)', async () => {
    render(<FullscreenButton />);
    const btn = screen.getByTestId('game-fullscreen');
    await act(async () => fireEvent.click(btn));
    await act(async () => {
      await document.exitFullscreen();
    });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('is hidden where the browser has no Fullscreen API (iPhone Safari)', () => {
    fakeFullscreen(false);
    render(<FullscreenButton />);
    expect(screen.queryByTestId('game-fullscreen')).toBeNull();
  });
});
