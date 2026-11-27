import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

interface Props {
  /** `alertdialog` for questions that need an answer (confirm, delete); `dialog` for forms. */
  role?: 'dialog' | 'alertdialog';
  /** Id of the element that names the dialog (usually its heading). */
  labelledBy: string;
  describedBy?: string;
  /** Element that gets the focus first; default: the first operable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Called on Escape, unless `dismissible` is false. */
  onClose(): void;
  /**
   * False for a compulsory step that must not vanish by an accidental key press: Escape does nothing.
   * Then `lockedReason` is shown in the dialog so a keyboard user learns why Escape stays without effect.
   */
  dismissible?: boolean;
  lockedReason?: string;
  children: ReactNode;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusablesOf = (box: HTMLElement): HTMLElement[] =>
  [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
  );

/** Open modals, topmost last: only the topmost one reacts to keys. */
const stack: object[] = [];

/**
 * Shared dialog frame: role and `aria-modal`, name, start focus, focus trap (Tab / Shift+Tab), Escape,
 * focus back to the element that opened it, and the rest of the page `inert` and `aria-hidden`
 * while it is open. It stays where it is in the page (no portal), so the layout does not change.
 */
export function Modal({
  role = 'dialog',
  labelledBy,
  describedBy,
  initialFocus,
  onClose,
  dismissible = true,
  lockedReason,
  children,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  // Read while rendering, i.e. before any focus moves into the dialog.
  const [opener] = useState<Element | null>(() =>
    typeof document === 'undefined' ? null : document.activeElement,
  );
  const closeRef = useRef({ onClose, dismissible });
  useLayoutEffect(() => {
    closeRef.current = { onClose, dismissible };
  });

  // Start focus. Children that focus something themselves (ref, autoFocus) win: their effects run first.
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    if (initialFocus?.current) initialFocus.current.focus();
    else if (!el.contains(document.activeElement)) (focusablesOf(el)[0] ?? el).focus();
  }, [initialFocus]);

  // Background out of reach for keyboard and screen reader; back focus on close.
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const changed: HTMLElement[] = [];
    for (let node: HTMLElement = el; node.parentElement !== null; node = node.parentElement) {
      for (const sib of node.parentElement.children) {
        if (sib === node || !(sib instanceof HTMLElement)) continue;
        if (sib.tagName === 'SCRIPT' || sib.hasAttribute('inert')) continue;
        sib.setAttribute('inert', '');
        sib.setAttribute('aria-hidden', 'true');
        changed.push(sib);
      }
    }
    const token = {};
    stack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        if (closeRef.current.dismissible) {
          e.preventDefault();
          closeRef.current.onClose();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusablesOf(el);
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) {
        e.preventDefault();
        el.focus();
        return;
      }
      const at = document.activeElement;
      if (!el.contains(at)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (at === first || at === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      for (const sib of changed) {
        sib.removeAttribute('inert');
        sib.removeAttribute('aria-hidden');
      }
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  return (
    <div
      ref={box}
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={-1}
      className="dialog"
    >
      {children}
      {!dismissible && lockedReason !== undefined && <p className="hint">{lockedReason}</p>}
    </div>
  );
}
