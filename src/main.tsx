import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'

import App from './App'
import WaveformPreview from './WaveformPreview'
import { config } from './wagmi'
import './index.css'

const queryClient = new QueryClient()

const isWaveformPreview =
  typeof window !== 'undefined' && window.location.pathname.includes('waveform-preview')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {isWaveformPreview ? <WaveformPreview /> : <App />}
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
