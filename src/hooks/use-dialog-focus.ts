"use client";

import { useEffect, useRef, type RefObject } from "react";
import { dialogKeyboardAction, restoreDialogFocus } from "@/lib/dialog-focus";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogFocus<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  dialogRef: RefObject<T | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
) {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      const activeIndex = controls.indexOf(document.activeElement as HTMLElement);
      const action = dialogKeyboardAction(event.key, event.shiftKey, activeIndex, controls.length);
      if (!action) return;
      event.preventDefault();
      if (action.type === "close") onClose();
      else controls[action.index]?.focus();
    };
    dialog?.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });
    return () => {
      dialog?.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
      restoreDialogFocus(openerRef.current);
    };
  }, [dialogRef, initialFocusRef, onClose, open]);
}
