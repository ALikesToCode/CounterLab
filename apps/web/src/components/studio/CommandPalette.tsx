import { useEffect, useRef, useState } from "react";

import type { StudioCommand } from "./types";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: readonly StudioCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const palette = useRef<HTMLElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery("");
    const focusFrame = window.requestAnimationFrame(() =>
      (input.current ?? palette.current)?.focus(),
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);
      const target = restoreFocusTo.current;
      restoreFocusTo.current = null;
      if (target?.isConnected) target.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const containKeyboardFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || event.defaultPrevented) return;

      const container = palette.current;
      if (container === null) return;
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containKeyboardFocus);
    return () => window.removeEventListener("keydown", containKeyboardFocus);
  }, [onClose, open]);

  if (!open) return null;
  const normalized = query.trim().toLowerCase();
  const visible = commands.filter(
    (command) =>
      normalized.length === 0 ||
      `${command.label} ${command.hint}`.toLowerCase().includes(normalized),
  );

  return (
    <div className="command-backdrop" onMouseDown={onClose}>
      <section
        ref={palette}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="CounterLab commands"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label>
          <span aria-hidden="true">⌕</span>
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What do you want to do?"
            aria-label="Search commands"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-results">
          {visible.map((command) => (
            <button
              type="button"
              disabled={command.disabled}
              key={command.id}
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <span>
                <strong>{command.label}</strong>
                <small>{command.hint}</small>
              </span>
              {command.shortcut !== undefined && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
          {visible.length === 0 && (
            <p className="command-empty">No matching command.</p>
          )}
        </div>
        <footer>
          <span>All commands also have visible controls in the workspace.</span>
          <strong>CounterLab Studio</strong>
        </footer>
      </section>
    </div>
  );
}
