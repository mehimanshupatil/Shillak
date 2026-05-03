import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import type { User } from '@/db/schema'
import { GROUP_COLORS } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  user: User
}

export default function EditProfileSheet({ open, onClose, user }: Props) {
  const [name, setName] = useState(user.displayName)
  const [colorIdx, setColorIdx] = useState(
    Math.max(0, GROUP_COLORS.indexOf(user.avatarColor as (typeof GROUP_COLORS)[number])),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(user.displayName)
      setColorIdx(
        Math.max(0, GROUP_COLORS.indexOf(user.avatarColor as (typeof GROUP_COLORS)[number])),
      )
      setError('')
    }
  }, [open, user])

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await db.users.update(user.userId, {
        displayName: name.trim(),
        avatarColor: GROUP_COLORS[colorIdx % GROUP_COLORS.length] as string,
      })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-[var(--color-surface)]
                   border-0 border-t border-[var(--color-border)] safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
        </div>
        <div className="px-5 pb-6 flex flex-col gap-4">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              Edit profile
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Display name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)]
                         text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]
                         focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Avatar colour
            </p>
            <div className="flex gap-3 flex-wrap">
              {GROUP_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorIdx(i)}
                  className={`w-9 h-9 rounded-full transition-transform ${colorIdx === i ? 'scale-125 ring-2 ring-offset-2 ring-offset-[var(--color-surface)]' : ''}`}
                  style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-[var(--color-accent)] text-black font-semibold
                       hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
