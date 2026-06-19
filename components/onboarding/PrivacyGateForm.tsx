'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { Plus, X, ShieldAlert, Check } from 'lucide-react'
import { acceptPrivacyPolicy } from '@/app/onboarding/privacy/actions'

export function PrivacyGateForm({
  defaultGroups, existingRules, userId, isEditMode
}: any) {
  const router = useRouter()
  const [blockedGroups, setBlockedGroups] = useState<string[]>(
    defaultGroups.map((g: any) => g.name)
  )
  const [customDomain, setCustomDomain] = useState('')
  const [customDomains, setCustomDomains] = useState<string[]>([])
  
  const saveRules = trpc.settings.updatePrivacyRules.useMutation({
    onSuccess: () => {
      toast.success(isEditMode ? 'Privacy settings saved' : 'All set!')
      if (isEditMode) {
        router.push('/settings')
      } else {
        router.push('/inbox')
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Default groups */}
        {defaultGroups.map((group: any) => {
          const isSelected = blockedGroups.includes(group.name)
          return (
            <label key={group.name}
              className={`relative flex flex-col gap-3 p-5 border rounded-xl cursor-pointer transition-all duration-200 ${
                isSelected 
                  ? 'border-accent bg-accent/5 shadow-sm' 
                  : 'border-border bg-surface hover:bg-surface-overlay hover:border-border/80'
              }`}>
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold text-foreground">{group.name}</p>
                <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  isSelected ? 'bg-accent border-accent text-accent-foreground' : 'border-border'
                }`}>
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </div>
              </div>
              
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  setBlockedGroups(prev =>
                    e.target.checked
                      ? [...prev, group.name]
                      : prev.filter(g => g !== group.name)
                  )
                }}
                className="sr-only"
              />
              <div className="mt-auto">
                <p className="text-xs text-foreground-subtle leading-relaxed">
                  {group.domains.slice(0, 3).join(', ')}
                  {group.domains.length > 3 && ` +${group.domains.length - 3} more`}
                </p>
              </div>
            </label>
          )
        })}
      </div>

      {/* Custom domain input */}
      <div className="border border-border rounded-xl p-5 bg-surface/50">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-foreground-muted" />
          <p className="text-sm font-medium text-foreground">Add specific domains to block</p>
        </div>
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
            placeholder="e.g. *@company.com"
            className="flex-1 h-11 px-4 text-sm bg-background border
              border-border rounded-lg focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-foreground-subtle"
          />
          <button
            onClick={() => {
              if (customDomain.includes('@')) {
                setCustomDomains(p => [...p, customDomain])
                setCustomDomain('')
              }
            }}
            className="h-11 px-4 bg-surface border border-border rounded-lg
              hover:bg-surface-overlay transition-colors flex items-center justify-center text-foreground-muted hover:text-foreground"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        {customDomains.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {customDomains.map(d => (
              <div key={d} className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-full shadow-sm">
                <span className="text-xs text-foreground-muted font-mono">{d}</span>
                <button 
                  onClick={() => setCustomDomains(p => p.filter(x => x !== d))}
                  className="hover:bg-surface-raised p-0.5 rounded-full transition-colors"
                >
                  <X className="w-3 h-3 text-foreground-subtle hover:text-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border/50">
        <button
          onClick={handleSubmit}
          disabled={saveRules.isPending}
          className="flex-1 h-12 bg-accent text-accent-foreground rounded-xl
            text-[15px] font-medium disabled:opacity-70 transition-all hover:opacity-90 shadow-sm"
        >
          {saveRules.isPending
            ? 'Saving...'
            : isEditMode ? 'Save changes' : 'Continue to Inbox'}
        </button>
        {!isEditMode && (
          <form action={acceptPrivacyPolicy} className="flex sm:w-auto">
            <button
              type="submit"
              className="w-full sm:w-auto px-8 h-12 border border-border bg-surface rounded-xl text-[15px] font-medium
                text-foreground-muted hover:text-foreground hover:bg-surface-overlay transition-all"
            >
              Skip
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
