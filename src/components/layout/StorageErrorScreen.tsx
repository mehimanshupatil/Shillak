interface Props {
  message: string
}

export default function StorageErrorScreen({ message }: Props) {
  return (
    <div className="app-shell flex flex-col items-center justify-center p-6 gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center">
        <span className="text-3xl">⚠️</span>
      </div>
      <h1 className="text-xl font-semibold text-text-primary">Storage unavailable</h1>
      <p className="text-sm text-text-secondary max-w-xs">
        Shillak requires persistent storage (IndexedDB). This may be blocked in private browsing
        mode or by browser settings.
      </p>
      <p className="text-xs text-text-tertiary font-mono break-all">{message}</p>
    </div>
  )
}
