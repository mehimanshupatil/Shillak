// ─── Shared step affordances ──────────────────────────────────────────────────

export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable step order
          key={i}
          className={`rounded-full transition-all ${
            i < current
              ? 'w-2 h-2 bg-success'
              : i === current
                ? 'w-2.5 h-2.5 bg-accent'
                : 'w-2 h-2 bg-surface-3'
          }`}
        />
      ))}
    </div>
  )
}

// ─── Instruction card ─────────────────────────────────────────────────────────

export function InstructionCard({
  thisDevice,
  otherDevice,
}: {
  thisDevice: string
  otherDevice?: string
}) {
  return (
    <div className="rounded-xl bg-surface-2 border border-border divide-y divide-border mb-4">
      <div className="px-4 py-3 flex items-start gap-3">
        <span className="text-xs font-semibold text-accent mt-0.5 shrink-0">YOU</span>
        <p className="text-sm text-text-primary leading-snug">{thisDevice}</p>
      </div>
      {otherDevice && (
        <div className="px-4 py-3 flex items-start gap-3">
          <span className="text-xs font-semibold text-text-tertiary mt-0.5 shrink-0">THEM</span>
          <p className="text-sm text-text-secondary leading-snug">{otherDevice}</p>
        </div>
      )}
    </div>
  )
}

// ─── WiFi Tab ─────────────────────────────────────────────────────────────────
