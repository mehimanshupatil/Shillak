import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CategorySheet from '@/components/category/CategorySheet'
import { Button } from '@/components/ui/button'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { db } from '@/db/db'
import type { Category } from '@/db/schema'
import useAppStore from '@/stores/app.store'


export default function CategoriesPage() {
  const navigate = useNavigate()
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [catSheetOpen, setCatSheetOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | undefined>(undefined)
  const [catTypeFilter, setCatTypeFilter] = useState<'expense' | 'income'>('expense')

  const categories = useLiveQuery(
    () => (activeGroupId ? db.categories.where((c) => c.groupId === activeGroupId) : []),
    [activeGroupId],
  )

  async function handleDeleteCategory(cat: Category) {
    const txns = await db.transactions.where(
      (t) => t.groupId === activeGroupId && t.categoryId === cat.categoryId && t.deletedAt === null,
    )
    if (txns.length > 0) {
      alert(`Cannot delete — ${txns.length} transaction(s) use this category.`)
      return
    }
    await db.categories.delete(cat.categoryId)
  }

  const filteredCats = (categories ?? [])
    .filter((c) => c.type === catTypeFilter)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="px-4 pt-4 pb-24 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex items-center justify-center w-8 h-8 rounded-full
                     bg-surface-2 text-text-secondary active:bg-surface-3 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl font-bold text-text-primary flex-1">Categories</h1>
        <Button
          variant="link"
          onClick={() => {
            setEditCategory(undefined)
            setCatSheetOpen(true)
          }}
        >
          <Plus size={12} />
          Add
        </Button>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-1.5">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setCatTypeFilter(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
              catTypeFilter === t ? 'bg-accent text-black' : 'bg-surface-2 text-text-secondary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Category list */}
      <div className="flex flex-col gap-1.5">
        {filteredCats.map((cat) => (
          <div
            key={cat.categoryId}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border"
          >
            <CategoryIcon icon={cat.icon} color={cat.color} size={14} containerSize={28} />
            <span className="flex-1 text-sm text-text-primary">{cat.name}</span>
            {cat.isDefault && (
              <span className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded">
                default
              </span>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setEditCategory(cat)
                setCatSheetOpen(true)
              }}
              className="text-text-tertiary hover:text-text-primary"
            >
              <Pencil size={13} />
            </Button>
            {!cat.isDefault && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDeleteCategory(cat)}
                className="text-text-tertiary hover:text-danger hover:bg-danger/10"
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        ))}
        {filteredCats.length === 0 && (
          <p className="text-sm text-text-tertiary py-8 text-center">
            No {catTypeFilter} categories.
          </p>
        )}
      </div>

      {activeGroupId && currentUserId && (
        <CategorySheet
          open={catSheetOpen}
          onClose={() => {
            setCatSheetOpen(false)
            setEditCategory(undefined)
          }}
          groupId={activeGroupId}
          userId={currentUserId}
          category={editCategory}
          nextSortOrder={(categories ?? []).length}
        />
      )}
    </div>
  )
}
