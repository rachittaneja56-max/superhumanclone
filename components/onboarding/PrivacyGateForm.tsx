'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'

export function PrivacyGateForm({
  defaultGroups, existingRules, userId, isEditMode
}: any) {
  const router = useRouter()
  const [blockedGroups, setBlockedGroups] = useState<string[]>(
    defaultGroups.map((g: any) => g.name)
  )
  const [customDomain, setCustomDomain] = useState('')
  const [customDomains, setCustomDomains] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const saveRules = trpc.settings.updatePrivacyRules.useMutation({
    onSuccess: () => {
      toast.success(isEditMode ? 'Privacy settings saved' : 'All set!')
      if (isEditMode) {
        router.push('/settings')
      } else {
        router.push('/onboarding/connect')
      }
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const handleSubmit = () => {
    const selectedGroups = defaultGroups
      .filter((g: any) => blockedGroups.includes(g.name))
      .flatMap((g: any) => g.domains)
    
    const allPatterns = [
      ...selectedGroups.map((p: string) => ({
        pattern: p, isBlocked: true, groupName: 'default'
      })),
      ...customDomains.map(p => ({
        pattern: p, isBlocked: true, groupName: 'custom'
      })),
    ]

    saveRules.mutate({ rules: allPatterns })
  }

  return (
    <div className="space-y-4">
      {/* Default groups */}
      {defaultGroups.map((group: any) => (
        <label key={group.name}
          className="flex items-start gap-3 p-4 border border-border
            rounded-lg cursor-pointer hover:bg-surface-overlay transition-colors">
          <input
            type="checkbox"
            checked={blockedGroups.includes(group.name)}
            onChange={(e) => {
              setBlockedGroups(prev =>
                e.target.checked
                  ? [...prev, group.name]
                  : prev.filter(g => g !== group.name)
              )
            }}
            className="mt-0.5 accent-amber-500"
          />
          <div>
            <p className="text-sm font-medium">{group.name}</p>
            <p className="text-xs text-foreground-subtle mt-0.5">
              {group.domains.slice(0, 3).join(', ')}
              {group.domains.length > 3 && ` +${group.domains.length - 3} more`}
            </p>
          </div>
        </label>
      ))}

      {/* Custom domain input */}
      <div className="border border-border rounded-lg p-4">
        <p className="text-sm font-medium mb-2">Custom domains</p>
        <div className="flex gap-2">
          <input
            value={customDomain}
            onChange={e => setCustomDomain(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && customDomain.includes('@')) {
                setCustomDomains(p => [...p, customDomain])
                setCustomDomain('')
              }
            }}
            placeholder="*@example.com"
            className="flex-1 h-9 px-3 text-sm bg-surface-raised border
              border-border rounded-lg focus:border-accent outline-none"
          />
          <button
            onClick={() => {
              if (customDomain.includes('@')) {
                setCustomDomains(p => [...p, customDomain])
                setCustomDomain('')
              }
            }}
            className="h-9 px-3 bg-surface border border-border rounded-lg
              hover:bg-surface-overlay transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {customDomains.map(d => (
          <div key={d} className="flex items-center gap-2 mt-2">
            <span className="text-xs text-foreground-muted font-mono">{d}</span>
            <button onClick={() => setCustomDomains(p => p.filter(x => x !== d))}>
              <X className="w-3 h-3 text-foreground-subtle" />
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saveRules.isPending}
          className="flex-1 h-10 bg-accent text-accent-foreground rounded-lg
            text-sm font-medium disabled:opacity-70 transition-opacity"
        >
          {saveRules.isPending
            ? 'Saving...'
            : isEditMode ? 'Save changes' : 'Continue →'}
        </button>
        {!isEditMode && (
          <form action={async () => {
            const { acceptPrivacyPolicy } = await import('@/app/onboarding/privacy/actions')
            await acceptPrivacyPolicy()
          }}>
            <button
              type="submit"
              className="px-4 h-10 border border-border rounded-lg text-sm
                text-foreground-muted hover:text-foreground transition-colors"
            >
              Skip
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
