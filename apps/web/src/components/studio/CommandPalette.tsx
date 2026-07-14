import { useEffect, useRef, useState } from "react";

import type { StudioCommand } from "./types";

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

  useEffect(() => {
    if (!open) return;
    setQuery("");
    window.requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
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
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="CounterLab commands"
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
