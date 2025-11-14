import { formatEther } from 'viem'
import { mainnet } from 'wagmi/chains'
import { useAccount, useBalance, useEnsName, useSwitchChain } from 'wagmi'

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
      <section className="card">
        <h2 className="card__title">Status</h2>
        <p>Connect a wallet to see account details.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2 className="card__title">Status</h2>
      <dl className="definition-list">
        <div className="definition-list__row">
          <dt>Address</dt>
          <dd>{ensName ?? address}</dd>
        </div>
        <div className="definition-list__row">
          <dt>Network</dt>
          <dd>{chain?.name}</dd>
        </div>
        {balance && (
          <div className="definition-list__row">
            <dt>Balance</dt>
            <dd>
              {Number.parseFloat(formatEther(balance.value)).toFixed(4)} {balance.symbol}
            </dd>
          </div>
        )}
      </dl>

      <div className="button-grid">
        {availableChains.map((availableChain) => (
          <button
            key={availableChain.id}
            className="button button--ghost"
            disabled={availableChain.id === chain?.id}
            onClick={() => switchChain({ chainId: availableChain.id })}
          >
            Switch to {availableChain.name}
          </button>
        ))}
      </div>
      {switchError && <p className="error">{switchError.message}</p>}
    </section>
  )
}
