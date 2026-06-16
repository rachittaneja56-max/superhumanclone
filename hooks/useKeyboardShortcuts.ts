"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui-store";

export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let sequenceTimeout: NodeJS.Timeout | null = null;
    let keySequence = "";

    const handleKeyDown = (e: KeyboardEvent) => {
      // Always allow Escape and Cmd+K globally
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        useUIStore.getState().openPalette();
        return;
      }
      if (e.key === "Escape") {
        useUIStore.getState().closePalette();
        return;
      }

      // Skip single-key shortcuts if typing in an input
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isTyping) return;

      const { focusLayer } = useUIStore.getState();
      if (focusLayer !== 0) return;

      // Handle sequence
      if (e.key === "g") {
        keySequence = "g";
        if (sequenceTimeout) clearTimeout(sequenceTimeout);
        sequenceTimeout = setTimeout(() => {
          keySequence = "";
        }, 500);
        return;
      }

      if (keySequence === "g") {
        keySequence = "";
        if (sequenceTimeout) clearTimeout(sequenceTimeout);
        switch (e.key) {
          case "i":
            router.push("/inbox");
            break;
          case "c":
            router.push("/calendar");
            break;
          case "a":
            router.push("/agent");
            break;
          case "s":
            router.push("/settings");
            break;
        }
        return;
      }

      // Single keys
      switch (e.key) {
        case "j":
        case "k":
        case "e":
        case "r":
        case "c":
        case "u":
          break;
        case "/":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:focus-mail-search"));
          break;
        case "?":
          // Stub for actions. Real implementation would wire these
          // to trpc calls, state updates, or the Compose box focus.
          console.log(`Triggered shortcut: ${e.key}`);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (sequenceTimeout) clearTimeout(sequenceTimeout);
    };
  }, [router]);
}
