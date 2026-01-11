import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { WagmiProvider } from 'wagmi'

import App from './App'
import WaveformPreview from './WaveformPreview'
import { config } from './wagmi'
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
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24,
        }}
      >
        {isWaveformPreview ? <WaveformPreview /> : <App />}
      </PersistQueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
