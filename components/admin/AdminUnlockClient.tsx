"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LockKeyhole, Shield, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc/client";

export function AdminUnlockClient() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [accessId, setAccessId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);

  const unlock = trpc.admin.unlockDashboard.useMutation({
    onSuccess: async () => {
      toast.success("Admin access unlocked");
      await utils.admin.getDashboard.invalidate();
      router.refresh();
    },
    onError: (error) => {
      try {
        const parsed = JSON.parse(error.message);
        if (Array.isArray(parsed) && parsed[0]?.message) {
          toast.error(parsed[0].message);
          return;
        }
      } catch {
        // Fallback to normal error message if not JSON
      }
      toast.error(error.message || "Invalid admin credentials");
    },
  });
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
            <Shield className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Admin unlock</h2>
          <p className="text-sm text-foreground-muted">
            Enter the admin access ID and password to open the dashboard.
          </p>
        </div>

        <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              unlock.mutate({ accessId, password });
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Access ID</label>
              <Input
                value={accessId}
                onChange={(event) => setAccessId(event.target.value)}
                autoComplete="username"
                placeholder="Admin ID"
                className="border-border bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Admin password"
                className="border-border bg-background"
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground-muted">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
                className="h-4 w-4 rounded border-border bg-background text-accent focus:ring-accent"
              />
              Remember this device
            </label>
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" disabled={unlock.isPending}>
                <LockKeyhole className="mr-2 h-4 w-4" />
                {unlock.isPending ? "Unlocking..." : "Unlock dashboard"}
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-foreground-subtle">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Keep this shared only with trusted admins.
            </div>
          </form>
      </div>
    </div>
  );
}
