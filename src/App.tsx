import { useCallback } from 'react'
import type { Connector } from 'wagmi'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { SongCatalog } from './components/SongCatalog'
import { WalletStatus } from './components/WalletStatus'

function App() {
  const { isConnected } = useAccount()
  const { connectors, connectAsync, error, status, variables } = useConnect()
  const isConnecting = status === 'pending'

  const isConnectorPending = useCallback(
    (connector: Connector) => {
      const activeConnector = variables?.connector
      if (!activeConnector) return false
      if ('id' in activeConnector) {
        return activeConnector.id === connector.id
      }
      return false
    },
    [variables?.connector],
  )
  const { disconnect } = useDisconnect()

  const handleConnect = useCallback(
    async (connector: Connector) => {
      try {
        await connectAsync({ connector })
      } catch (connectError) {
        console.error('Failed to connect', connectError)
      }
    },
    [connectAsync],
  )

  return (
    <div className="page">
      <div className="app-shell">
        <header className="hero">
          <div>
            <p className="eyebrow">Zero Control</p>
            <h1>Mix intelligence</h1>
            <p className="hero__subtitle">Curate on-chain crates with the same polish as your favorite music apps.</p>
          </div>
          <div className="hero__actions">
            <Badge variant="outline">{connectors.length} wallet options</Badge>
            <Button variant="outline">Share crate</Button>
          </div>
        </header>

        <div className="app-grid">
          <Card className="panel-card">
            <CardHeader>
              <CardTitle>Wallet connection</CardTitle>
              <CardDescription>Pick a connector to sync your account with the dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <Button variant="ghost" onClick={() => disconnect()} className="w-full">
                  Disconnect wallet
                </Button>
              ) : (
                <div className="connector-grid">
                  {connectors.map((connector) => (
                    <Button
                      key={connector.id}
                      onClick={() => handleConnect(connector)}
                      disabled={!connector.ready || isConnecting}
                      variant="secondary"
                    >
                      {connector.name}
                      {!connector.ready && ' (unsupported)'}
                      {isConnecting && isConnectorPending(connector) && '…'}
                    </Button>
                  ))}
                </div>
              )}
              {error && <p className="inline-error">{error.message}</p>}
            </CardContent>
          </Card>

          <WalletStatus />
        </div>

        <SongCatalog />
      </div>
    </div>
  )
}

export default App
