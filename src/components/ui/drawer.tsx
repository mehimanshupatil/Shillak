import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import * as React from 'react'

import { cn } from '@/lib/utils'

type DrawerContextProps = {
  modal: DrawerPrimitive.Root.Props['modal']
  showSwipeHandle: boolean
}

const DrawerContext = React.createContext<DrawerContextProps | null>(null)

function useDrawer() {
  const context = React.useContext(DrawerContext)

  if (!context) {
    throw new Error('useDrawer must be used within a Drawer.')
  }

  return context
}

function Drawer({
  modal = true,
  showSwipeHandle = false,
  ...props
}: DrawerPrimitive.Root.Props & {
  showSwipeHandle?: boolean
}) {
  const contextValue = React.useMemo(() => ({ modal, showSwipeHandle }), [modal, showSwipeHandle])

  return (
    <DrawerContext.Provider value={contextValue}>
      <DrawerPrimitive.Root data-slot="drawer" modal={modal} swipeDirection="down" {...props} />
    </DrawerContext.Provider>
  )
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/10 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] select-none data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs supports-[-webkit-touch-callout:none]:absolute',
        className,
      )}
      {...props}
    />
  )
}

function DrawerSwipeHandle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className={cn(
        'relative z-10 flex h-3 w-full shrink-0 cursor-grab items-end justify-center after:block after:h-1 after:w-24 after:shrink-0 after:rounded-full after:bg-muted active:cursor-grabbing',
        className,
      )}
      {...props}
    />
  )
}

function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  const { modal, showSwipeHandle } = useDrawer()

  return (
    <DrawerPrimitive.VirtualKeyboardProvider>
      <DrawerPortal data-slot="drawer-portal">
        {modal === true && <DrawerOverlay />}
        <DrawerPrimitive.Viewport
          data-slot="drawer-viewport"
          data-modal={modal}
          className="pointer-events-none fixed inset-0 z-50 flex touch-none flex-col justify-end select-none data-[modal=true]:pointer-events-auto"
        >
          <DrawerPrimitive.Popup
            data-slot="drawer-popup"
            className={cn(
              'group/drawer-popup relative z-50 flex max-h-[calc(100%-6rem)] w-full touch-none flex-col rounded-t-xl border-t bg-popover text-sm text-popover-foreground outline-none transform-[translateY(var(--drawer-swipe-movement-y,0px))] transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform select-none data-ending-style:transform-[translateY(calc(100%+2px))] data-starting-style:transform-[translateY(calc(100%+2px))] data-swiping:duration-0',
              className,
            )}
            {...props}
          >
            {showSwipeHandle && <DrawerSwipeHandle />}
            <DrawerPrimitive.Content
              data-slot="drawer-content"
              className="flex min-h-0 flex-1 flex-col touch-auto overflow-y-auto overscroll-contain rounded-[inherit] select-text"
            >
              {children}
            </DrawerPrimitive.Content>
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPortal>
    </DrawerPrimitive.VirtualKeyboardProvider>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex shrink-0 flex-col gap-0.5 p-4 pb-0 text-center md:gap-0.5 md:text-left',
        className,
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('mt-auto flex shrink-0 flex-col gap-2 p-4 pt-0', className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('font-heading text-base font-medium text-foreground', className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-balance text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerSwipeHandle,
  DrawerTitle,
  DrawerTrigger,
}
