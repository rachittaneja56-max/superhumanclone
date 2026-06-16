"use client";

import type { ReactNode } from "react";

export function DisconnectActionForm({
  action,
  confirmText,
  children,
  className,
}: {
  action: () => Promise<void>;
  confirmText: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
