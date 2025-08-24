import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { avalancheProvider, AVALANCHE_FUJI_CONFIG, ESCROW_CONTRACT_ADDRESS } from '../lib/avalanche'
import EscrowABI from '../abi/Escrow.json'
import escrowLogger from '../lib/logger';

// Remove the duplicate ethereum declaration - it's already in global.d.ts

interface EscrowTransaction {
  id: string
  sender: string
  recipient: string
  amount: string
  createdAt: number
  releaseTime: number
  isReleased: boolean
  isReturned: boolean
  isActive: boolean
  timeRemaining: number
  canReturn: boolean
  canRelease: boolean
}

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [balance, setBalance] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [sendAmount, setSendAmount] = useState<string>('')
  const [recipientAddress, setRecipientAddress] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [txHash, setTxHash] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  
  // Escrow states
  const [userEscrows, setUserEscrows] = useState<EscrowTransaction[]>([])
  const [loadingEscrows, setLoadingEscrows] = useState<boolean>(false)

  // Format balance to show max 6 decimal places
  const formatBalance = (bal: string | null): string => {
    if (!bal) return '0.0'
    const num = parseFloat(bal)
    if (num === 0) return '0.0'
    if (num < 0.000001) return num.toExponential(2)
    return num.toFixed(6).replace(/\.?0+$/, '')
  }

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Expired'
    
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  }

  // Connect wallet function
  const connectWallet = async () => {
    try {
      if (typeof window === 'undefined') {
        setError('Please use a browser with MetaMask installed')
        return
      }

      if (!window.ethereum) {
        setError('MetaMask not found. Please install MetaMask extension.')
        return
      }

      setIsLoading(true)
      setError('')
      
      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      })
      
      if (accounts.length === 0) {
        throw new Error('No accounts found')
      }

      const account = accounts[0]
      setWalletAddress(account)
      setIsConnected(true)
      
      // Switch to Avalanche network
      await switchToAvalanche()
      
      // Get balance
      await updateBalance(account)
      
      // Load user escrows
      await loadUserEscrows(account)
      
      setSuccess('Wallet connected successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
    } catch (error: any) {
      console.error('Connection error:', error)
      setError(error.message || 'Failed to connect wallet')
      setIsConnected(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Switch to Avalanche network
  const switchToAvalanche = async () => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: AVALANCHE_FUJI_CONFIG.chainId }], // Now correctly uses hex format
      })
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          if (!window.ethereum) {
            throw new Error('MetaMask is not installed');
          }
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [AVALANCHE_FUJI_CONFIG], // Pass entire config with hex chainId
          })
        } catch (addError) {
          throw new Error('Failed to add Avalanche network')
        }
      } else {
        throw switchError
      }
    }
  }

  // Update balance
  const updateBalance = async (address: string) => {
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum as any)
        const balance = await provider.getBalance(address)
        const balanceInEth = ethers.formatEther(balance)
        setBalance(balanceInEth)
        escrowLogger.info(`Balance updated: ${balanceInEth} AVAX`, address)
      }
    } catch (error) {
      console.error('Failed to get balance:', error)
    }
  }

  // Load user escrows
  const loadUserEscrows = async (address: string) => {
    try {
      setLoadingEscrows(true)
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum as any)
        const escrowContract = new ethers.Contract(
          ESCROW_CONTRACT_ADDRESS,
          EscrowABI.abi,
          provider
        )

        // Get user escrow IDs
        const escrowIds = await escrowContract.getUserEscrows(address)
        const currentTime = Math.floor(Date.now() / 1000)
        
        const escrows: EscrowTransaction[] = []
        
        for (const escrowId of escrowIds) {
          try {
            const escrowData = await escrowContract.getEscrow(escrowId)
            const status = await escrowContract.getEscrowStatus(escrowId)
            const canReturn = await escrowContract.canReturn(escrowId)
            const canRelease = await escrowContract.canRelease(escrowId)
            
            escrows.push({
              id: escrowId,
              sender: escrowData.sender,
              recipient: escrowData.recipient,
              amount: ethers.formatEther(escrowData.amount),
              createdAt: Number(escrowData.createdAt),
              releaseTime: Number(escrowData.releaseTime),
              isReleased: escrowData.isReleased,
              isReturned: escrowData.isReturned,
              isActive: escrowData.isActive,
              timeRemaining: Math.max(0, Number(status.timeRemaining)),
              canReturn,
              canRelease
            })
          } catch (error) {
            console.error(`Failed to load escrow ${escrowId}:`, error)
          }
        }
        
        setUserEscrows(escrows)
        escrowLogger.info(`Loaded ${escrows.length} escrows for user ${address}`)
      }
    } catch (error) {
      escrowLogger.error('Failed to load user escrows:', error)
      setError('Failed to load transaction history')
    } finally {
      setLoadingEscrows(false)
    }
  }

  // Send escrow transaction
  const sendEscrow = async () => {
    if (!sendAmount || !recipientAddress) {
      setError('Please enter amount and recipient address')
      return
    }

    if (!ethers.isAddress(recipientAddress)) {
      setError('Invalid recipient address')
      return
    }

    try {
      setIsLoading(true)
      setError('')
      setTxHash('')
      
      const provider = new ethers.BrowserProvider(window.ethereum as any)
      const signer = await provider.getSigner()
      const escrowContract = new ethers.Contract(
        ESCROW_CONTRACT_ADDRESS,
        EscrowABI.abi,
        signer
      )

      const amountWei = ethers.parseEther(sendAmount)
      
      const tx = await escrowContract.createEscrow(recipientAddress, {
        value: amountWei
      })
      
      setTxHash(tx.hash)
      setSuccess('Transaction sent! Waiting for confirmation...')
      
      const receipt = await tx.wait()
      
      if (receipt.status === 1) {
        setSuccess('successfully!')
        setSendAmount('')
        setRecipientAddress('')
        
        // Update balance and reload escrows
        await updateBalance(walletAddress)
        await loadUserEscrows(walletAddress)
        
        setTimeout(() => setSuccess(''), 5000)
      } else {
        throw new Error('Transaction failed')
      }
      
    } catch (error: any) {
      console.error('Send error:', error)
      setError(error.message || 'Failed to send escrow')
    } finally {
      setIsLoading(false)
    }
  }

  // Return escrow
  const returnEscrow = async (escrowId: string) => {
    try {
      setIsLoading(true)
      setError('')
      
      const provider = new ethers.BrowserProvider(window.ethereum as any)
      const signer = await provider.getSigner()
      const escrowContract = new ethers.Contract(
        ESCROW_CONTRACT_ADDRESS,
        EscrowABI.abi,
        signer
      )

      const tx = await escrowContract.returnEscrow(escrowId)
      setSuccess('Return transaction sent! Waiting for confirmation...')
      
      const receipt = await tx.wait()
      
      if (receipt.status === 1) {
        setSuccess('Funds returned successfully!')
        
        // Update balance and reload escrows
        await updateBalance(walletAddress)
        await loadUserEscrows(walletAddress)
        
        setTimeout(() => setSuccess(''), 5000)
      } else {
        throw new Error('Return transaction failed')
      }
      
    } catch (error: any) {
      console.error('Return error:', error)
      setError(error.message || 'Failed to return escrow')
    } finally {
      setIsLoading(false)
    }
  }

  // Release escrow
  const releaseEscrow = async (escrowId: string) => {
    try {
      setIsLoading(true)
      setError('')
      
      const provider = new ethers.BrowserProvider(window.ethereum as any)
      const signer = await provider.getSigner()
      const escrowContract = new ethers.Contract(
        ESCROW_CONTRACT_ADDRESS,
        EscrowABI.abi,
        signer
      )

      const tx = await escrowContract.releaseEscrow(escrowId)
      setSuccess('Release transaction sent! Waiting for confirmation...')
      
      const receipt = await tx.wait()
      
      if (receipt.status === 1) {
        setSuccess('Escrow released successfully!')
        
        // Update balance and reload escrows
        await updateBalance(walletAddress)
        await loadUserEscrows(walletAddress)
        
        setTimeout(() => setSuccess(''), 5000)
      } else {
        throw new Error('Release transaction failed')
      }
      
    } catch (error: any) {
      console.error('Release error:', error)
      setError(error.message || 'Failed to release escrow')
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-refresh escrows every 30 seconds
  useEffect(() => {
    if (isConnected && walletAddress) {
      const interval = setInterval(() => {
        loadUserEscrows(walletAddress)
      }, 30000)
      
      return () => clearInterval(interval)
    }
  }, [isConnected, walletAddress])

  // Update timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUserEscrows(prev => prev.map(escrow => ({
        ...escrow,
        timeRemaining: Math.max(0, escrow.timeRemaining - 1)
      })))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center">
                <img src="/avax.png" alt="Avalanche" className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Avalanche Wallet</h1>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">SafientAI</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">BETA</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Network:</span> Avalanche Fuji Testnet
              </div>
              {!isConnected ? (
                <button
                  onClick={connectWallet}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
                >
                  {isLoading ? 'Connecting...' : 'Connect Wallet'}
                </button>
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatBalance(balance)} AVAX
                    </div>
                    <div className="text-xs text-gray-500">
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </div>
                  </div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Success Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {success}
            {txHash && (
              <div className="mt-2">
                <a
                  href={`https://testnet.snowtrace.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline text-sm"
                >
                  View on SnowTrace →
                </a>
              </div>
            )}
          </div>
        )}

        {!isConnected ? (
          /* Enhanced Landing Page */
          <div className="py-12">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className="mb-8">
                <span className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 text-sm font-medium rounded-full mb-6">
                  🛡️ Revolutionary Fund Recovery Technology
                </span>
                <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                  Never Lose Your Crypto
                  <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                    to Wrong Transfers
                  </span>
                </h1>
                <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
                  SafientAI + Avalanche provides a revolutionary 5-minute safety window to recover funds 
                  if your account is hacked or you accidentally send to the wrong wallet address.
                </p>
              </div>
              
              <button
                onClick={connectWallet}
                disabled={isLoading}
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 disabled:opacity-50 disabled:transform-none"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Connecting...
                  </>
                ) : (
                  <>
                    🦊 Connect MetaMask & Start Protecting
                    <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            {/* Key Features Section */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
              <div className="text-center p-6 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.031 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Fund Recovery</h3>
                <p className="text-gray-600 text-sm">Recover funds sent to wrong addresses or during account compromises</p>
              </div>
              
              <div className="text-center p-6 rounded-xl bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
                <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">5-Minute Safety Window</h3>
                <p className="text-gray-600 text-sm">Automatic protection period with real-time countdown timer</p>
              </div>
              
              <div className="text-center p-6 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
                <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Avalanche Security</h3>
                <p className="text-gray-600 text-sm">Built on Avalanche's fast, secure, and eco-friendly blockchain</p>
              </div>
              
              <div className="text-center p-6 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200">
                <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">One-Click Recovery</h3>
                <p className="text-gray-600 text-sm">Simple interface to reclaim or release funds instantly</p>
              </div>
            </div>

            {/* Problem-Solution Section */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-8 mb-16">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-6">The Problem</h2>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-1">
                        <span className="text-red-600 text-sm">✗</span>
                      </div>
                      <p className="text-gray-700">$4+ billion lost annually to wrong wallet addresses</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-1">
                        <span className="text-red-600 text-sm">✗</span>
                      </div>
                      <p className="text-gray-700">Account hacks result in immediate, irreversible losses</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-1">
                        <span className="text-red-600 text-sm">✗</span>
                      </div>
                      <p className="text-gray-700">No safety net for human errors in crypto transactions</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Solution</h2>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1">
                        <span className="text-green-600 text-sm">✓</span>
                      </div>
                      <p className="text-gray-700">5-minute recovery window for all transactions</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1">
                        <span className="text-green-600 text-sm">✓</span>
                      </div>
                      <p className="text-gray-700">Smart contract-enforced safety mechanisms</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1">
                        <span className="text-green-600 text-sm">✓</span>
                      </div>
                      <p className="text-gray-700">Peace of mind for every crypto transfer</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trust Indicators */}
            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-900 mb-8">Trusted by the Community</h3>
              <div className="flex justify-center items-center space-x-8 text-gray-500">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">Open Source</span>
                </div>
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">Audited Smart Contracts</span>
                </div>
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                  </svg>
                  <span className="text-sm font-medium">Community Driven</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ORIGINAL POST-CONNECTION UI WITH FUND RECOVERY BUTTONS */
          <div>
            {/* Balance Display */}
            <div className="bg-red-50 rounded-xl p-6 mb-8">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Wallet Balance</h2>
                  <p className="text-3xl font-bold text-gray-900">{formatBalance(balance)} AVAX</p>
                  <p className="text-sm text-gray-600 mt-1">Avalanche Fuji Testnet</p>
                </div>
                <button
                  onClick={() => updateBalance(walletAddress)}
                  disabled={isLoading}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Updating...' : 'Refresh'}
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Send Escrow Form */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Send</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount (AVAX)
                    </label>
                    <input
                      type="number"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      placeholder="0.0"
                      step="0.001"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Recipient Address
                    </label>
                    <input
                      type="text"
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  
                  <button
                    onClick={sendEscrow}
                    disabled={isLoading || !sendAmount || !recipientAddress}
                    className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white py-3 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
                  >
                    {isLoading ? 'Sending...' : 'Send Transfer'}
                  </button>
                </div>
              </div>

              {/* Transaction History WITH FUND RECOVERY BUTTONS */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Transaction History</h3>
                  <button
                    onClick={() => loadUserEscrows(walletAddress)}
                    disabled={loadingEscrows}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {loadingEscrows ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
                
                {loadingEscrows ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto"></div>
                    <p className="text-gray-500 mt-2">Loading transactions...</p>
                  </div>
                ) : userEscrows.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No transactions yet</p>
                    <p className="text-sm text-gray-400 mt-1">Send your first transfer to get started</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {userEscrows.map((escrow) => (
                      <div key={escrow.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-900">
                                {escrow.amount} AVAX
                              </span>
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                escrow.isReturned ? 'bg-gray-100 text-gray-800' :
                                escrow.isReleased ? 'bg-green-100 text-green-800' :
                                escrow.timeRemaining > 0 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {escrow.isReturned ? 'Returned' :
                                 escrow.isReleased ? 'Released' :
                                 escrow.timeRemaining > 0 ? 'Active' : 'Expired'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {escrow.sender.toLowerCase() === walletAddress.toLowerCase() ? (
                                <>To: {escrow.recipient.slice(0, 6)}...{escrow.recipient.slice(-4)}</>
                              ) : (
                                <>From: {escrow.sender.slice(0, 6)}...{escrow.sender.slice(-4)}</>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            {escrow.timeRemaining > 0 && !escrow.isReleased && !escrow.isReturned && (
                              <div className="text-sm font-medium text-gray-900">
                                {formatTimeRemaining(escrow.timeRemaining)}
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(escrow.createdAt * 1000).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex space-x-2">
                          {/* FUND RECOVERY BUTTON - Return/Reclaim for sender */}
                          {escrow.sender.toLowerCase() === walletAddress.toLowerCase() && 
                           escrow.canReturn && 
                           !escrow.isReturned && 
                           !escrow.isReleased && (
                            <button
                              onClick={() => returnEscrow(escrow.id)}
                              disabled={isLoading}
                              className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                            >
                              Reclaim Funds
                            </button>
                          )}
                          
                          {/* Release button for recipient */}
                          {escrow.recipient.toLowerCase() === walletAddress.toLowerCase() && 
                           escrow.canRelease && 
                           !escrow.isReleased && 
                           !escrow.isReturned && (
                            <button
                              onClick={() => releaseEscrow(escrow.id)}
                              disabled={isLoading}
                              className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded hover:bg-green-200 transition-colors disabled:opacity-50"
                            >
                              Claim
                            </button>
                          )}
                          
                          <a
                            href={`https://testnet.snowtrace.io/address/${ESCROW_CONTRACT_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded hover:bg-blue-200 transition-colors"
                          >
                            View
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Powered by Avalanche • Contract: {ESCROW_CONTRACT_ADDRESS.slice(0, 6)}...{ESCROW_CONTRACT_ADDRESS.slice(-4)}
            </div>
            <div className="flex space-x-4 text-sm">
              <a
                href={`https://testnet.snowtrace.io/address/${ESCROW_CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Contract
              </a>
              <a
                href="https://faucet.avax.network/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Faucet
              </a>
              <a
                href="https://testnet.snowtrace.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Explorer
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
