import { formatEther } from 'viem'
import { mainnet } from 'wagmi/chains'
import { useAccount, useBalance, useEnsName, useSwitchChain } from 'wagmi'

import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

function shortenAddress(value?: string | null) {
  if (!value) return ''
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function WalletStatus() {
  const { address, chain, isConnected } = useAccount()
  const { chains: availableChains, switchChain, error: switchError } = useSwitchChain()

  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
    query: {
      enabled: Boolean(address),
    },
  })

  const { data: balance } = useBalance({
    address,
    chainId: chain?.id,
    query: {
      enabled: Boolean(address && chain?.id),
      refetchInterval: 12_000,
    },
  })

  if (!isConnected) {
    return (
      <Card className="status-card" variant="translucent">
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Connect a wallet to see ENS, balances and network health.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="muted">Connect to surface live wallet telemetry.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="status-card" variant="translucent">
      <CardHeader>
        <CardTitle>Wallet status</CardTitle>
        <CardDescription>Live data powered by wagmi + viem.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="status-header">
          <div>
            <p className="status-label">Account</p>
            <p className="status-value">{ensName ?? shortenAddress(address)}</p>
          </div>
          {chain && <Badge variant="success">{chain.name}</Badge>}
        </div>
        <dl className="status-grid">
          <div>
            <dt>Address</dt>
            <dd>{address}</dd>
          </div>
          <div>
            <dt>Balance</dt>
            <dd>
              {balance
                ? `${Number.parseFloat(formatEther(balance.value)).toFixed(4)} ${balance.symbol}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Chain ID</dt>
            <dd>{chain?.id}</dd>
          </div>
        </dl>
        <div className="status-actions">
          {availableChains.map((availableChain) => (
            <Button
              key={availableChain.id}
              variant={availableChain.id === chain?.id ? 'outline' : 'ghost'}
              onClick={() => switchChain({ chainId: availableChain.id })}
              disabled={availableChain.id === chain?.id}
            >
              Switch to {availableChain.name}
            </Button>
          ))}
        </div>
        {switchError && <p className="inline-error">{switchError.message}</p>}
      </CardContent>
    </Card>
  )
}
