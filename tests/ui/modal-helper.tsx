import { fireEvent, screen, waitFor } from '@testing-library/react';

export interface ModalCheck {
  /** The element that opens the dialog; it gets the focus first, like a user who tabbed to it. */
  opener: HTMLElement;
  /** Opens the dialog (click, file choice ...). */
  open(): unknown;
  role: 'dialog' | 'alertdialog';
  /** Accessible name part of the dialog. */
  name: RegExp;
  /** What must hold the focus when the dialog has opened (default: anything inside the dialog). */
  startFocus?: RegExp;
}

const key = (k: string, shiftKey = false) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: k, shiftKey });

/** Shared check for every dialog: start focus, focus trap, inert background, Escape, focus back. */
export async function expectModalKeyboard(c: ModalCheck): Promise<void> {
  c.opener.focus();
  expect(document.activeElement).toBe(c.opener);
  await c.open();
  const dialog = await screen.findByRole(c.role, { name: c.name });
  expect(dialog.getAttribute('aria-modal')).toBe('true');

  // start focus
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  if (c.startFocus)
    expect(
      (document.activeElement?.textContent ?? '') +
        (document.activeElement?.getAttribute('aria-label') ?? '') +
        (document.activeElement?.id ?? ''),
    ).toMatch(c.startFocus);

  // background out of reach
  expect(c.opener.closest('[inert]')).not.toBeNull();
  expect(c.opener.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(dialog.closest('[inert]')).toBeNull();

  // focus trap: Tab on the last element wraps to the first, Shift+Tab on the first to the last
  const items = [
    ...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ];
  const first = items[0];
  const last = items[items.length - 1];
  expect(first).toBeDefined();
  last?.focus();
  key('Tab');
  expect(document.activeElement).toBe(first);
  key('Tab', true);
  expect(document.activeElement).toBe(last);

  // Escape closes, background is back, focus returns to the opener
  key('Escape');
  await waitFor(() => expect(screen.queryByRole(c.role, { name: c.name })).toBeNull());
  expect(c.opener.closest('[inert]')).toBeNull();
  expect(c.opener.closest('[aria-hidden="true"]')).toBeNull();
  expect(document.activeElement).toBe(c.opener);
}
