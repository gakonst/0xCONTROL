import { useCallback } from 'react'
import type { Connector } from 'wagmi'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

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
    <main className="app">
      <header className="app__header">
        <h1>Zero Control Dashboard</h1>
        <p className="app__subtitle">
          Connect your wallet to explore the zero-control PID controller smart contracts.
        </p>
      </header>

      <section className="card">
        <h2 className="card__title">Wallet Connection</h2>
        {isConnected ? (
          <button className="button button--secondary" onClick={() => disconnect()}>
            Disconnect
          </button>
        ) : (
          <div className="button-grid">
            {connectors.map((connector) => (
              <button
                key={connector.id}
                className="button"
                disabled={!connector.ready || isConnecting}
                onClick={() => handleConnect(connector)}
              >
                {connector.name}
                {!connector.ready && ' (unsupported)'}
                {isConnecting && isConnectorPending(connector) && '…'}
              </button>
            ))}
          </div>
        )}
        {error && <p className="error">{error.message}</p>}
      </section>

      <WalletStatus />
    </main>
  )
}

export default App
