"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui-store";

export function useKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

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
        useUIStore.getState().closeCheatsheet();
        window.dispatchEvent(new CustomEvent("aethra:escape-all"));
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
      const isMailWorkspace = pathname.startsWith("/inbox");

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
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:thread-next"));
          break;
        case "k":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:thread-prev"));
          break;
        case "e":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:thread-archive"));
          break;
        case "r":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:thread-open"));
          break;
        case "c":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:compose-open"));
          break;
        case "u":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:thread-toggle-read"));
          break;
        case "Enter":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:thread-open"));
          break;
        case "Delete":
        case "Backspace":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:thread-trash"));
          break;
        case "/":
          if (!isMailWorkspace) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("aethra:focus-mail-search"));
          break;
        case "?":
          e.preventDefault();
          useUIStore.getState().openCheatsheet();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (sequenceTimeout) clearTimeout(sequenceTimeout);
    };
  }, [pathname, router]);
}
