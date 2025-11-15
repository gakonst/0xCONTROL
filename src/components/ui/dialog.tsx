import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

type DialogProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Dialog({ open, onClose, children }: DialogProps) {
  if (!open) return null

  return (
    <div className="ui-dialog" role="dialog" aria-modal="true">
      <div className="ui-dialog__backdrop" onClick={onClose} />
      <div className="ui-dialog__panel" role="document">
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-dialog__header', className)} {...props} />
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('ui-dialog__title', className)} {...props} />
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ui-dialog__description', className)} {...props} />
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-dialog__footer', className)} {...props} />
}
