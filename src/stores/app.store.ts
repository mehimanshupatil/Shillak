import { create } from 'zustand'

interface AppStore {
  activeGroupId: string | null
  currentUserId: string | null
  setActiveGroupId: (id: string) => void
  setCurrentUserId: (id: string) => void
}

const useAppStore = create<AppStore>((set) => ({
  activeGroupId: null,
  currentUserId: null,
  setActiveGroupId: (id) => set({ activeGroupId: id }),
  setCurrentUserId: (id) => set({ currentUserId: id }),
}))

export default useAppStore
