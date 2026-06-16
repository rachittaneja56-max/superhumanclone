'use client'
import { trpc } from '@/lib/trpc/client'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

export function SettingsClient({ initialSettings }: { initialSettings: any }) {
  const { data: settings = initialSettings } =
    trpc.settings.getUserSettings.useQuery({}, {
      initialData: initialSettings,
      staleTime: 60000,
    })

  const updateMutation = trpc.settings.updateSetting.useMutation({
    onSuccess: () => toast.success('Setting saved'),
    onError: () => toast.error('Failed to save'),
  })

  const toggle = (key: string, value: boolean) => {
    updateMutation.mutate({ key: key as any, value })
  }

  const settingsRows = [
    {
      key: 'aiEnabled',
      label: 'Enable AI features',
      description: 'Allow Aethra to classify, summarize and draft replies',
      value: settings?.aiEnabled ?? false,
    },
    {
      key: 'draftSuggestionsEnabled',
      label: 'Reply suggestions',
      description: 'Pre-generate reply variants when emails arrive',
      value: settings?.draftSuggestionsEnabled ?? true,
    },
    {
      key: 'autoTagEnabled',
      label: 'Auto-tagging',
      description: 'Automatically categorize emails',
      value: settings?.autoTagEnabled ?? true,
    },
  ]

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-border">
        <h2 className="text-xs font-medium text-foreground-subtle uppercase tracking-wider">
          AI Features
        </h2>
      </div>
      {settingsRows.map((row, i) => (
        <div key={row.key}
          className={[
            'flex items-center justify-between px-4 py-3',
            i < settingsRows.length - 1 ? 'border-b border-border' : '',
          ].join(' ')}>
          <div>
            <p className="text-sm font-medium">{row.label}</p>
            <p className="text-xs text-foreground-muted mt-0.5">{row.description}</p>
          </div>
          <Switch
            checked={row.value}
            onCheckedChange={(v) => toggle(row.key, v)}
            disabled={updateMutation.isPending}
          />
        </div>
      ))}
    </div>
  )
}
