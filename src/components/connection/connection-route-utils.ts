export const getConnectionChainPath = (chains: string[] = []) =>
  chains.filter(Boolean).slice().reverse()

export const formatConnectionChainPath = (chains: string[]) =>
  getConnectionChainPath(chains).join(' -> ')
