export type DialogKeyboardAction = { type: "close" } | { type: "focus"; index: number } | null;

export function dialogKeyboardAction(
  key: string,
  shiftKey: boolean,
  activeIndex: number,
  focusableCount: number,
): DialogKeyboardAction {
  if (key === "Escape") return { type: "close" };
  if (key !== "Tab" || focusableCount < 1) return null;
  if (!shiftKey && activeIndex === focusableCount - 1) return { type: "focus", index: 0 };
  if (shiftKey && activeIndex <= 0) return { type: "focus", index: focusableCount - 1 };
  return null;
}

export function restoreDialogFocus(opener: { focus: () => void } | null): void {
  opener?.focus();
}
