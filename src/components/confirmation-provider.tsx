'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import ConfirmationDialog from './confirmation-dialog'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  type?: 'danger' | 'warning' | 'info'
}

interface ConfirmationContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined)

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        options,
        resolve,
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (dialogState) {
      dialogState.resolve(true)
      setDialogState(null)
    }
  }, [dialogState])

  const handleCancel = useCallback(() => {
    if (dialogState) {
      dialogState.resolve(false)
      setDialogState(null)
    }
  }, [dialogState])

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      {dialogState && (
        <ConfirmationDialog
          isOpen={dialogState.isOpen}
          title={dialogState.options.title}
          message={dialogState.options.message}
          confirmLabel={dialogState.options.confirmLabel}
          cancelLabel={dialogState.options.cancelLabel}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          type={dialogState.options.type}
        />
      )}
    </ConfirmationContext.Provider>
  )
}

export function useConfirmation() {
  const context = useContext(ConfirmationContext)
  if (context === undefined) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider')
  }
  return context
}
