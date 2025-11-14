import { createConfig, http } from 'wagmi'
import { mainnet, optimism, polygon, sepolia } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

const chains = [mainnet, polygon, optimism, sepolia] as const

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, http()]),
) as Record<number, ReturnType<typeof http>>

const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
        }),
      ]
    : []),
]

export const config = createConfig({
  chains,
  connectors,
  transports,
  ssr: false,
})
