import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

import App from './App'
import { DownloadStatusProvider } from './components/download-status'
import { AuthGate } from './components/auth-gate'
import './index.css'

if (typeof document !== 'undefined') {
  const root = document.documentElement
  root.classList.add('fonts-loading')

  if ('fonts' in document) {
    const timeout = window.setTimeout(() => {
      root.classList.remove('fonts-loading')
    }, 1000)

    document.fonts.ready
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout)
        root.classList.remove('fonts-loading')
      })
  } else {
    root.classList.remove('fonts-loading')
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 30,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})

const storage =
  typeof window !== 'undefined'
    ? {
        getItem: (key: string) => Promise.resolve(window.localStorage.getItem(key)),
        setItem: (key: string, value: string) =>
          Promise.resolve(window.localStorage.setItem(key, value)),
        removeItem: (key: string) => Promise.resolve(window.localStorage.removeItem(key)),
      }
    : undefined
const persister = createAsyncStoragePersister({
  storage,
  key: '0xcontrol-query-cache',
})

const isWaveformPreview =
  typeof window !== 'undefined' && window.location.pathname.includes('waveform-preview')
const isDesignSystemPreview =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/ui' || window.location.pathname.startsWith('/ui/'))

const WaveformPreview = React.lazy(() =>
  import('./WaveformPreview').then((module) => ({
    default: module.WaveformPreview,
  })),
)

const DesignSystemPreview = React.lazy(() =>
  import('./DesignSystemPreview').then((module) => ({
    default: module.DesignSystemPreview,
  })),
)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24,
      }}
    >
      {isDesignSystemPreview ? (
        <React.Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-background text-sm uppercase tracking-[0.12rem] text-muted-foreground">
              Loading UI system…
            </div>
          }
        >
          <DesignSystemPreview />
        </React.Suspense>
      ) : (
        <AuthGate>
          {isWaveformPreview ? (
            <React.Suspense
              fallback={
                <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
                  Loading waveform lab…
                </div>
              }
            >
              <WaveformPreview />
            </React.Suspense>
          ) : (
            <DownloadStatusProvider>
              <App />
            </DownloadStatusProvider>
          )}
        </AuthGate>
      )}
    </PersistQueryClientProvider>
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
