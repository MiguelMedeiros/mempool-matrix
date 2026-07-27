import { describe, expect, it, vi } from "vitest";
import { dialogKeyboardAction, restoreDialogFocus } from "./dialog-focus";

describe("accessible dialog focus behavior", () => {
  it("closes on Escape", () => {
    expect(dialogKeyboardAction("Escape", false, 1, 3)).toEqual({ type: "close" });
  });

  it("cycles Tab and Shift+Tab within the focusable controls", () => {
    expect(dialogKeyboardAction("Tab", false, 2, 3)).toEqual({ type: "focus", index: 0 });
    expect(dialogKeyboardAction("Tab", true, 0, 3)).toEqual({ type: "focus", index: 2 });
    expect(dialogKeyboardAction("Tab", false, 1, 3)).toBeNull();
  });

  it("restores focus to the opener", () => {
    const focus = vi.fn();
    restoreDialogFocus({ focus });
    expect(focus).toHaveBeenCalledOnce();
  });
});
