/**
 * Configuration for Riddler Gasless Client
 */

const CONFIG = {
  // Server configurations (use --server flag to switch)
  SERVERS: {
    local: {
      url: process.env.RIDDLER_URL_LOCAL || 'http://localhost:4001/commerce',
      apiKey: process.env.RIDDLER_API_KEY_LOCAL || process.env.RIDDLER_API_KEY || ''
    },
    dev: {
      url: process.env.RIDDLER_URL_DEV || 'https://riddler-dev.li.quest/commerce',
      apiKey: process.env.RIDDLER_API_KEY_DEV || process.env.RIDDLER_API_KEY || ''
    },
    prod: {
      url: process.env.RIDDLER_URL_PROD || 'https://riddler-prod.li.quest/commerce',
      apiKey: process.env.RIDDLER_API_KEY_PROD || process.env.RIDDLER_API_KEY || ''
    }
  },

  // Default server (can be overridden with --server flag)
  DEFAULT_SERVER: process.env.RIDDLER_SERVER || 'local',

  // Legacy support (deprecated - use SERVERS instead)
  RIDDLER_URL: process.env.RIDDLER_URL || 'http://localhost:4001/commerce',
  RIDDLER_API_KEY: process.env.RIDDLER_API_KEY || '',

  // Wallet
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',

  // Chain configuration
  CHAINS: {
    // =============================================================================
    // MAINNET CHAINS
    // =============================================================================
    'ethereum': {
      chainId: 1,
      name: 'Ethereum',
      usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      usdcName: 'USD Coin',
      usdcVersion: '2',
      rpc: process.env.ETH_RPC || 'https://eth.llamarpc.com',
      explorerUrl: 'https://etherscan.io',
      isTestnet: false
    },
    'base': {
      chainId: 8453,
      name: 'Base',
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      usdcName: 'USD Coin',
      usdcVersion: '2',
      rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
      explorerUrl: 'https://basescan.org',
      isTestnet: false
    },
    'optimism': {
      chainId: 10,
      name: 'Optimism',
      usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      usdt: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      usdcName: 'USD Coin',
      usdcVersion: '2',
      rpc: process.env.OP_RPC || 'https://mainnet.optimism.io',
      explorerUrl: 'https://optimistic.etherscan.io',
      isTestnet: false
    },
    'arbitrum': {
      chainId: 42161,
      name: 'Arbitrum One',
      usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      usdcName: 'USD Coin',
      usdcVersion: '2',
      rpc: process.env.ARB_RPC || 'https://arb1.arbitrum.io/rpc',
      explorerUrl: 'https://arbiscan.io',
      isTestnet: false
    },
    'polygon': {
      chainId: 137,
      name: 'Polygon',
      usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      usdcName: 'USD Coin',
      usdcVersion: '2',
      rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
      explorerUrl: 'https://polygonscan.com',
      isTestnet: false
    },

    // =============================================================================
    // TESTNET CHAINS
    // =============================================================================
    'eth-sepolia': {
      chainId: 11155111,
      name: 'Ethereum Sepolia',
      usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      usdt: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', // Pimlico USDT
      usdcName: 'USDC',
      usdcVersion: '2',
      rpc: process.env.ETH_SEPOLIA_RPC || 'https://rpc.sepolia.org',
      explorerUrl: 'https://sepolia.etherscan.io',
      isTestnet: true
    },
    'op-sepolia': {
      chainId: 11155420,
      name: 'Optimism Sepolia',
      usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
      usdt: null, // No USDT liquidity on testnet
      usdcName: 'USDC',
      usdcVersion: '2',
      rpc: process.env.OP_SEPOLIA_RPC || 'https://sepolia.optimism.io',
      explorerUrl: 'https://sepolia-optimism.etherscan.io',
      isTestnet: true
    },
    'base-sepolia': {
      chainId: 84532,
      name: 'Base Sepolia',
      usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      usdt: null, // No USDT liquidity on testnet
      usdcName: 'USDC',
      usdcVersion: '2',
      rpc: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
      explorerUrl: 'https://sepolia.basescan.org',
      isTestnet: true
    },
    'arb-sepolia': {
      chainId: 421614,
      name: 'Arbitrum Sepolia',
      usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      usdt: null, // No USDT liquidity on testnet
      usdcName: 'USD Coin',
      usdcVersion: '2',
      rpc: process.env.ARB_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
      explorerUrl: 'https://sepolia.arbiscan.io',
      isTestnet: true
    }
  },

  // Permit2 contract address (same on all EVM chains)
  PERMIT2_ADDRESS: '0x000000000022D473030F116dDEE9F6B43aC78BA3',

  // Test solver wallet address (for validation/testing)
  // Set SOLVER_WALLET_ADDRESS in .env to validate the solver address from quote matches this
  // Set VALIDATE_SOLVER_ADDRESS=false to disable validation
  // Defaults to the expected test solver wallet: 0xc6E555dfcC47e4A3bfecd6879570044ADc0270ff
  // For production set: 0xe9674277E85D7e5Ddf1340Dce118D1B887BEE727
  TEST_SOLVER_WALLET: process.env.SOLVER_WALLET_ADDRESS || '0xc6E555dfcC47e4A3bfecd6879570044ADc0270ff',
  VALIDATE_SOLVER_ADDRESS: process.env.VALIDATE_SOLVER_ADDRESS === 'true'
};

/**
 * Get token address for a chain
 * @param {string} chainKey - Chain key
 * @param {string} token - Token symbol (usdc or usdt)
 * @returns {string|null} Token address
 */
function getTokenAddress(chainKey, token = 'usdc') {
  const chain = CONFIG.CHAINS[chainKey];
  if (!chain) return null;
  return token.toLowerCase() === 'usdt' ? chain.usdt : chain.usdc;
}

/**
 * Get chain by chain ID
 * @param {number} chainId - Chain ID
 * @returns {Object|null} Chain config
 */
function getChainByChainId(chainId) {
  return Object.entries(CONFIG.CHAINS).find(([_, chain]) => chain.chainId === chainId)?.[1] || null;
}

/**
 * Get chain key by chain ID
 * @param {number} chainId - Chain ID
 * @returns {string|null} Chain key
 */
function getChainKeyByChainId(chainId) {
  return Object.entries(CONFIG.CHAINS).find(([_, chain]) => chain.chainId === chainId)?.[0] || null;
}

module.exports = { CONFIG, getTokenAddress, getChainByChainId, getChainKeyByChainId };
