"use client";

import React from "react";
import { useAblyChannel } from "@/hooks/useAblyChannel";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { CommandPalette } from "@/components/search/CommandPalette";
import { ShortcutsCheatsheet } from "@/components/settings/ShortcutsCheatsheet";

export function AppProviders({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  useAblyChannel(userId);
  useKeyboardShortcuts();

  return (
    <>
      {children}
      <CommandPalette />
      <ShortcutsCheatsheet />
    </>
  );
}
