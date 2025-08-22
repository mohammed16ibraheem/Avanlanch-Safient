import { ethers } from 'ethers'

// Avalanche Fuji Testnet Configuration
const AVALANCHE_FUJI_CONFIG = {
  chainId: '0xa869', // Convert 43113 to hex with 0x prefix
  name: 'Avalanche Fuji Testnet',
  rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
  blockExplorer: 'https://testnet.snowtrace.io',
  nativeCurrency: {
    name: 'AVAX',
    symbol: 'AVAX',
    decimals: 18
  }
}

// Avalanche-specific configuration
const AVALANCHE_LIMITS = {
  MAX_BLOCK_RANGE: 2048, // Avalanche supports larger ranges
  DEFAULT_PRIORITY_FEE: '1000000000', // 1 gwei for Avalanche
  POLLING_INTERVAL: 2000, // 2 seconds (faster than Monad)
}

export class AvalancheProvider {
  private provider: ethers.JsonRpcProvider
  private signer: ethers.Signer | null = null

  constructor() {
    this.provider = new ethers.JsonRpcProvider(AVALANCHE_FUJI_CONFIG.rpcUrl)
  }

  // Connect wallet with error handling
  async connectWallet(): Promise<{ address: string; balance: string }> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        const browserProvider = new ethers.BrowserProvider(window.ethereum)
        
        // First, try to add/switch to Avalanche Fuji network
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: AVALANCHE_FUJI_CONFIG.chainId }], // Now uses hex string directly
          })
        } catch (switchError: any) {
          // If network doesn't exist, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: AVALANCHE_FUJI_CONFIG.chainId, // Now uses hex string directly
                  chainName: AVALANCHE_FUJI_CONFIG.name,
                  rpcUrls: [AVALANCHE_FUJI_CONFIG.rpcUrl],
                  blockExplorerUrls: [AVALANCHE_FUJI_CONFIG.blockExplorer],
                  nativeCurrency: {
                    name: AVALANCHE_FUJI_CONFIG.nativeCurrency.name,
                    symbol: AVALANCHE_FUJI_CONFIG.nativeCurrency.symbol,
                    decimals: AVALANCHE_FUJI_CONFIG.nativeCurrency.decimals,
                  },
                },
              ],
            })
          } else {
            throw switchError
          }
        }
        
        // Request account access
        await browserProvider.send('eth_requestAccounts', [])
        
        this.signer = await browserProvider.getSigner()
        const address = await this.signer.getAddress()
        
        // Get balance
        const balance = await this.provider.getBalance(address)
        
        return {
          address,
          balance: ethers.formatEther(balance)
        }
      } else {
        throw new Error('MetaMask extension not found')
      }
    } catch (error: any) {
      console.error('Wallet connection failed:', error)
      throw new Error(`Failed to connect wallet: ${error.message}`)
    }
  }

  // Send transaction with Avalanche-specific handling
  async sendTransaction(to: string, value: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Wallet not connected')
    }

    try {
      const tx = await this.signer.sendTransaction({
        to,
        value: ethers.parseEther(value),
        // Use Avalanche's priority fee
        maxPriorityFeePerGas: AVALANCHE_LIMITS.DEFAULT_PRIORITY_FEE,
      })
      
      return tx.hash
    } catch (error: any) {
      throw new Error(`Transaction failed: ${error.message}`)
    }
  }

  // Wait for transaction confirmation
  async waitForTransaction(txHash: string): Promise<ethers.TransactionReceipt> {
    try {
      const receipt = await this.provider.waitForTransaction(txHash, 1, 30000) // 30 second timeout
      if (!receipt) {
        throw new Error('Transaction receipt not found')
      }
      return receipt
    } catch (error: any) {
      throw new Error(`Failed to get transaction receipt: ${error.message}`)
    }
  }

  // Get contract logs with Avalanche block range limits
  async getContractLogs(
    contractAddress: string,
    eventSignature: string,
    fromBlock: number,
    toBlock: number = fromBlock + AVALANCHE_LIMITS.MAX_BLOCK_RANGE
  ) {
    try {
      // Ensure we don't exceed Avalanche's block range limit
      const adjustedToBlock = Math.min(toBlock, fromBlock + AVALANCHE_LIMITS.MAX_BLOCK_RANGE)
      
      const logs = await this.provider.getLogs({
        address: contractAddress,
        topics: [eventSignature],
        fromBlock,
        toBlock: adjustedToBlock
      })
      
      return logs
    } catch (error: any) {
      throw new Error(`Failed to get contract logs: ${error.message}`)
    }
  }

  // Call contract method
  async callContract(
    contractAddress: string,
    abi: any[],
    methodName: string,
    params: any[] = []
  ) {
    try {
      const contract = new ethers.Contract(contractAddress, abi, this.provider)
      return await contract[methodName](...params)
    } catch (error: any) {
      throw new Error(`Contract call failed: ${error.message}`)
    }
  }

  async getCurrentBlock(): Promise<number> {
    return await this.provider.getBlockNumber()
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address)
    return ethers.formatEther(balance)
  }
}

// Contract address updated with deployed Remix address
export const ESCROW_CONTRACT_ADDRESS = '0xB336ace71Ed4F50A8BC0E32D27fE1e68F5DFE45f' // Deployed on Avalanche Fuji via Remix

// Create provider instance
export const avalancheProvider = new AvalancheProvider()

// Export configurations
export { AVALANCHE_FUJI_CONFIG, AVALANCHE_LIMITS }