import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WorkspaceFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex h-full w-full max-w-[1720px] min-w-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-5 lg:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
