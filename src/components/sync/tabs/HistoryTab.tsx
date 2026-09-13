import type { SyncEvent } from '@/db/schema'

export default function HistoryTab({ events }: { events: SyncEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm text-text-secondary">No sync history yet.</p>
        <p className="text-xs text-text-tertiary">Sync logs appear here after a successful sync.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((evt) => (
        <div
          key={evt.syncId}
          className="p-3 rounded-xl bg-surface-2 flex items-start justify-between gap-3"
        >
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  evt.status === 'ok'
                    ? 'bg-success'
                    : evt.status === 'partial'
                      ? 'bg-warning'
                      : 'bg-danger'
                }`}
              />
              <span className="text-xs font-medium text-text-primary capitalize">{evt.method}</span>
              {evt.conflictsFound > 0 && (
                <span className="text-[10px] text-warning">
                  · {evt.conflictsFound} conflict{evt.conflictsFound > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-[10px] text-text-tertiary">
              ↑ {evt.recordsSent} sent · ↓ {evt.recordsReceived} received
            </p>
          </div>
          <p className="text-[10px] text-text-tertiary shrink-0">
            {new Date(evt.syncedAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      ))}
    </div>
  )
}
