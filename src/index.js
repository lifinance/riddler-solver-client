#!/usr/bin/env node
/**
 * Riddler Commerce Client
 * 
 * Sign and submit ERC-3009, Permit2, and Deposit Address transactions to the Riddler solver.
 * 
 * Usage:
 *   node src/index.js quote --method erc3009 --amount 1000000
 *   node src/index.js quote --method deposit_address --amount 1000000
 *   node src/index.js full --method erc3009 --amount 1000000
 *   node src/index.js full --method deposit_address --amount 1000000
 *   node src/index.js status --order-id order_xxx
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { CONFIG, getTokenAddress } = require('./config');
const { signERC3009, signPermit2 } = require('./signing');

// =============================================================================
// Server Configuration
// =============================================================================

// Active server config (set by --server flag)
let activeServer = {
  name: CONFIG.DEFAULT_SERVER,
  url: CONFIG.SERVERS[CONFIG.DEFAULT_SERVER]?.url || CONFIG.RIDDLER_URL,
  apiKey: CONFIG.SERVERS[CONFIG.DEFAULT_SERVER]?.apiKey || CONFIG.RIDDLER_API_KEY
};

/**
 * Set the active server configuration
 * @param {string} serverName - Server name: local | dev | prod
 */
function setServer(serverName) {
  const server = CONFIG.SERVERS[serverName];
  if (!server) {
    console.error(`❌ Unknown server: ${serverName}`);
    console.error(`   Available servers: ${Object.keys(CONFIG.SERVERS).join(', ')}`);
    process.exit(1);
  }
  activeServer = {
    name: serverName,
    url: server.url,
    apiKey: server.apiKey
  };
  console.log(`🖥️  Server: ${serverName} (${server.url})`);
}

// =============================================================================
// Helpers
// =============================================================================

function getExplorerTransactionUrl(chain, txHash) {
  return `${CONFIG.CHAINS[chain].explorerUrl}/tx/${txHash}`
}

// =============================================================================
// API Client
// =============================================================================

async function fetchRiddler(endpoint, options = {}) {
  const url = `${activeServer.url}${endpoint}`;
  
  // Use correct auth header based on server type
  // - local: Authorization: Bearer <token>
  // - dev/prod: X-API-Key: <token>
  const headers = {
    'Content-Type': 'application/json',
    ...(activeServer.name === 'local' 
      ? { 'Authorization': `Bearer ${activeServer.apiKey}` }
      : { 'X-API-Key': activeServer.apiKey }
    )
  };

  console.log(`\n🌐 ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers }
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`API Error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

// =============================================================================
// HD Wallet Functions
// =============================================================================

/**
 * Derive an HD wallet from a mnemonic and get the public key
 * 
 * @param {string} mnemonic - The mnemonic seed phrase
 * @param {string} derivationPath - BIP44 derivation path (default: m/44'/60'/0'/0/0)
 * @returns {Object} Wallet info with address, public key, and private key
 */
function deriveHDWallet(mnemonic, derivationPath = "m/44'/60'/0'/0/0") {
  if (!mnemonic || mnemonic.trim() === '') {
    throw new Error('Mnemonic is required. Set EVM_HD_MNEMONIC in .env file.');
  }

  // Validate mnemonic
  if (!ethers.utils.isValidMnemonic(mnemonic.trim())) {
    throw new Error('Invalid mnemonic phrase. Please check your EVM_HD_MNEMONIC.');
  }

  // Create HD node from mnemonic
  const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic.trim());
  
  // Derive wallet at the specified path
  const derivedNode = hdNode.derivePath(derivationPath);
  
  // Get the wallet
  const wallet = new ethers.Wallet(derivedNode.privateKey);
  
  // Get public key (uncompressed, 65 bytes with 0x04 prefix)
  const publicKey = derivedNode.publicKey;
  
  // Get compressed public key (33 bytes)
  const publicKeyCompressed = ethers.utils.computePublicKey(derivedNode.publicKey, true);
  
  return {
    derivationPath,
    address: wallet.address,
    publicKey: publicKey, // Uncompressed (0x04 + 64 bytes)
    publicKeyCompressed: publicKeyCompressed, // Compressed (33 bytes)
    privateKey: derivedNode.privateKey,
    // Additional info
    extendedPublicKey: derivedNode.extendedPublicKey,
    extendedPrivateKey: derivedNode.extendedPrivateKey
  };
}

/**
 * Display HD wallet information
 */
function showHDWalletInfo(derivationPath = null, accountIndex = 0) {
  const mnemonic = process.env.EVM_HD_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ EVM_HD_MNEMONIC not found in .env file');
    console.error('   Please add your mnemonic seed phrase to .env:');
    console.error('   EVM_HD_MNEMONIC="your twelve word mnemonic phrase here"');
    process.exit(1);
  }

  try {
    // Build derivation path: use custom path if provided, otherwise use account index
    const path = derivationPath 
      ? derivationPath
      : `m/44'/60'/0'/0/${accountIndex}`;

    const walletInfo = deriveHDWallet(mnemonic, path);

    console.log('\n' + '═'.repeat(60));
    console.log('HD WALLET INFORMATION');
    console.log('═'.repeat(60));
    console.log(`Derivation Path: ${walletInfo.derivationPath}`);
    console.log(`\nAddress: ${walletInfo.address}`);
    console.log(`\nPublic Key (Uncompressed):`);
    console.log(`  ${walletInfo.publicKey}`);
    console.log(`  Length: ${walletInfo.publicKey.length - 2} hex chars (${(walletInfo.publicKey.length - 2) / 2} bytes)`);
    console.log(`\nPublic Key (Compressed):`);
    console.log(`  ${walletInfo.publicKeyCompressed}`);
    console.log(`  Length: ${walletInfo.publicKeyCompressed.length - 2} hex chars (${(walletInfo.publicKeyCompressed.length - 2) / 2} bytes)`);
    console.log(`\nExtended Public Key (xpub):`);
    console.log(`  ${walletInfo.extendedPublicKey}`);
    console.log(`\nExtended Private Key (xprv):`);
    console.log(`  ${walletInfo.extendedPrivateKey}`);
    console.log(`\nPrivate Key (⚠️  KEEP SECRET):`);
    console.log(`  ${walletInfo.privateKey}`);
    console.log('\n' + '═'.repeat(60));
    
    return walletInfo;
  } catch (error) {
    console.error(`\n❌ Error deriving HD wallet: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// =============================================================================
// Balance Check Functions
// =============================================================================

/**
 * Check user's token (USDT/USDC) and ETH balance on a chain
 */
async function checkUserBalance(chainKey, token = 'usdt') {
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  const chainConfig = CONFIG.CHAINS[chainKey];
  
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${chainKey}`);
  }

  const tokenAddress = getTokenAddress(chainKey, token);
  if (!tokenAddress) {
    throw new Error(`Token ${token.toUpperCase()} not available on ${chainKey}`);
  }

  // Create provider with explicit network config
  const provider = new ethers.providers.JsonRpcProvider({
    url: chainConfig.rpc,
    chainId: chainConfig.chainId
  });

  // Check token balance
  const tokenContract = new ethers.Contract(tokenAddress, [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ], provider);

  const [tokenBalance, decimals, symbol, ethBalance] = await Promise.all([
    tokenContract.balanceOf(wallet.address),
    tokenContract.decimals(),
    tokenContract.symbol().catch(() => token.toUpperCase()),
    provider.getBalance(wallet.address)
  ]);

  const tokenFormatted = parseFloat(ethers.utils.formatUnits(tokenBalance, decimals));
  const ethFormatted = parseFloat(ethers.utils.formatEther(ethBalance));

  return {
    chain: chainConfig.name,
    chainId: chainConfig.chainId,
    user: wallet.address,
    token: tokenAddress,
    tokenSymbol: symbol,
    tokenBalance: tokenBalance.toString(),
    tokenBalanceFormatted: tokenFormatted,
    tokenDecimals: decimals,
    ethBalance: ethBalance.toString(),
    ethBalanceFormatted: ethFormatted
  };
}

// =============================================================================
// Permit2 Approval Functions
// =============================================================================

/**
 * Check if Permit2 is approved for a token on a chain
 */
async function checkPermit2Approval(chainKey, token = 'usdt') {
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  const chainConfig = CONFIG.CHAINS[chainKey];
  
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${chainKey}`);
  }

  const tokenAddress = getTokenAddress(chainKey, token);
  if (!tokenAddress) {
    throw new Error(`Token ${token.toUpperCase()} not available on ${chainKey}`);
  }

  // Create provider with explicit network config to avoid auto-detection issues
  const provider = new ethers.providers.JsonRpcProvider({
    url: chainConfig.rpc,
    chainId: chainConfig.chainId
  });
  const tokenContract = new ethers.Contract(tokenAddress, [
    'function allowance(address owner, address spender) view returns (uint256)'
  ], provider);

  const allowance = await tokenContract.allowance(wallet.address, CONFIG.PERMIT2_ADDRESS);
  
  return {
    approved: !allowance.isZero(),
    allowance: allowance.toString(),
    chain: chainConfig.name,
    token: tokenAddress,
    permit2: CONFIG.PERMIT2_ADDRESS,
    user: wallet.address
  };
}

/**
 * Approve Permit2 to spend tokens
 */
async function approvePermit2(chainKey, token = 'usdt', amount = null) {
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  const chainConfig = CONFIG.CHAINS[chainKey];
  
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${chainKey}`);
  }

  const tokenAddress = getTokenAddress(chainKey, token);
  if (!tokenAddress) {
    throw new Error(`Token ${token.toUpperCase()} not available on ${chainKey}`);
  }

  // Create provider with explicit network config to avoid auto-detection issues
  const provider = new ethers.providers.JsonRpcProvider({
    url: chainConfig.rpc,
    chainId: chainConfig.chainId
  });
  const signer = wallet.connect(provider);
  const tokenContract = new ethers.Contract(tokenAddress, [
    'function approve(address spender, uint256 amount) returns (bool)'
  ], signer);

  const approveAmount = amount 
    ? ethers.BigNumber.from(amount)
    : ethers.constants.MaxUint256;

  console.log(`\n🔐 Approving Permit2...`);
  console.log(`   Chain: ${chainConfig.name} (${chainConfig.chainId})`);
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   Spender: ${CONFIG.PERMIT2_ADDRESS}`);
  console.log(`   Amount: ${amount ? `${amount} (${parseInt(amount) / 1e6} ${token.toUpperCase()})` : 'MaxUint256 (unlimited)'}`);
  console.log(`   From: ${wallet.address}`);

  const tx = await tokenContract.approve(CONFIG.PERMIT2_ADDRESS, approveAmount);
  console.log(`\n📤 Transaction submitted: ${getExplorerTransactionUrl(chainKey, tx.hash)}`);
  console.log(`   Waiting for confirmation...`);

  const receipt = await tx.wait(1);
  console.log(`\n✅ Permit2 approved!`);
  console.log(`   Block: ${receipt.blockNumber}`);
  console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    chain: chainConfig.name
  };
}

// =============================================================================
// Quote Functions
// =============================================================================

async function getQuote(params) {
  const {
    method = 'erc3009',
    amount = '1000000',
    inputChain = 'op-sepolia',
    outputChain = 'base-sepolia',
    inputToken = 'usdt',
    outputToken = 'usdt'
  } = params;

  const inputConfig = CONFIG.CHAINS[inputChain];
  const outputConfig = CONFIG.CHAINS[outputChain];
  
  if (!inputConfig) {
    throw new Error(`Unknown input chain: ${inputChain}. Available: ${Object.keys(CONFIG.CHAINS).join(', ')}`);
  }
  if (!outputConfig) {
    throw new Error(`Unknown output chain: ${outputChain}. Available: ${Object.keys(CONFIG.CHAINS).join(', ')}`);
  }

  const inputTokenAddress = getTokenAddress(inputChain, inputToken);
  const outputTokenAddress = getTokenAddress(outputChain, outputToken);

  if (!inputTokenAddress) {
    throw new Error(`Token ${inputToken.toUpperCase()} not available on ${inputChain}`);
  }
  if (!outputTokenAddress) {
    throw new Error(`Token ${outputToken.toUpperCase()} not available on ${outputChain}`);
  }

  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  const userAddress = wallet.address;
  
  console.log(`\n👛 Wallet: ${userAddress}`);
  
  const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  const queryParams = new URLSearchParams({
    refundAddress: userAddress,
    inputToken: inputTokenAddress,
    inputChainId: inputConfig.chainId.toString(),
    outputAddress: userAddress,
    outputToken: outputTokenAddress,
    outputChainId: outputConfig.chainId.toString(),
    inputAmount: amount,
    expires: expires.toString(),
    gaslessOrDepositAddress: method
  });

  console.log('\n📝 Requesting quote...');
  console.log(`   Method: ${method}`);
  console.log(`   Amount: ${amount} (${parseInt(amount) / 1e6} ${inputToken.toUpperCase()})`);
  console.log(`   From: ${inputChain} (${inputConfig.chainId}) - ${inputToken.toUpperCase()}`);
  console.log(`   To: ${outputChain} (${outputConfig.chainId}) - ${outputToken.toUpperCase()}`);
  console.log(`   User: ${userAddress}`);

  const quote = await fetchRiddler(`/quote?${queryParams}`);

  console.log('\n✅ Quote received:');
  console.log(`   Quote ID: ${quote.quoteId}`);
  console.log(`   Output Amount: ${quote.outputAmount}`);
  console.log(`   Expires: ${new Date(quote.quoteExpires * 1000).toISOString()}`);
  
  if (quote.gasless) {
    console.log(`   Gasless Type: ${quote.gasless.type}`);
    console.log(`   Solver (to): ${quote.gasless.to}`);
    console.log(`   Input Chain: ${inputChain} (${inputConfig.chainId})`);
    console.log(`   Output Chain: ${outputChain} (${outputConfig.chainId})`);
    
    // Show test solver validation if configured
    if (CONFIG.VALIDATE_SOLVER_ADDRESS && CONFIG.TEST_SOLVER_WALLET) {
      if (quote.gasless.to.toLowerCase() === CONFIG.TEST_SOLVER_WALLET.toLowerCase()) {
        console.log(`   ✅ Solver matches test wallet: ${CONFIG.TEST_SOLVER_WALLET}`);
      } else {
        console.log(`   ⚠️  Solver does NOT match test wallet!`);
        console.log(`      Quote solver: ${quote.gasless.to}`);
        console.log(`      Expected:     ${CONFIG.TEST_SOLVER_WALLET}`);
        console.log(`      Input chain:  ${inputChain} (${inputConfig.chainId})`);
        console.log(`      ⚠️  For Permit2/ERC-3009, solver should be on INPUT chain (${inputChain}), not output chain!`);
        console.log(`      Validation will fail when signing (set VALIDATE_SOLVER_ADDRESS=false to disable)`);
      }
    }
    
    console.log(`   Nonce: ${quote.gasless.nonce}`);
  }

  if (quote.depositAddress) {
    console.log(`\n📬 Deposit Address:`);
    console.log(`   Address: ${quote.depositAddress.address}`);
    console.log(`   Chain ID: ${quote.depositAddress.chainId}`);
  }

  return quote;
}

// =============================================================================
// Submit Order (for gasless flows)
// =============================================================================

async function submitOrder(quoteId, signedObject, signature) {
  console.log('\n📤 Submitting order...');
  console.log(`   Quote ID: ${quoteId}`);

  const result = await fetchRiddler('/order', {
    method: 'POST',
    body: JSON.stringify({
      quoteId: quoteId,
      signedObject: signedObject,
      signature: signature
    })
  });

  console.log('\n✅ Order submitted:');
  console.log(`   Order ID: ${result.orderId}`);
  console.log(`   Status: ${result.status}`);
  console.log(`   Success: ${result.success}`);

  return result;
}

// =============================================================================
// Check Status
// =============================================================================

async function checkStatus(orderId) {
  console.log(`\n🔍 Checking status for: ${orderId}`);

  const status = await fetchRiddler(`/status/${orderId}`);

  console.log('\n📊 Order Status:');
  console.log(JSON.stringify(status, null, 2));

  return status;
}

// =============================================================================
// Deposit Address Flow
// =============================================================================

async function depositFlow(params) {
  const {
    amount = '1000000',
    inputChain = 'ethereum',
    outputChain = 'base',
    inputToken = 'usdt',
    outputToken = 'usdt'
  } = params;

  console.log('═'.repeat(60));
  console.log('💰 RIDDLER DEPOSIT ADDRESS FLOW');
  console.log('═'.repeat(60));

  // Step 1: Get quote with deposit_address method
  console.log('\n' + '─'.repeat(60));
  console.log('STEP 1: GET QUOTE WITH DEPOSIT ADDRESS');
  console.log('─'.repeat(60));

  const quote = await getQuote({
    method: 'deposit_address',
    amount,
    inputChain,
    outputChain,
    inputToken,
    outputToken
  });

  if (!quote.depositAddress) {
    throw new Error('Quote did not return a deposit address. Check if deposit_address method is supported.');
  }

  const inputConfig = CONFIG.CHAINS[inputChain];
  const inputTokenAddress = getTokenAddress(inputChain, inputToken);

  console.log(`\n📬 Deposit Address: ${quote.depositAddress.address}`);
  console.log(`   Chain: ${inputConfig.name} (${inputConfig.chainId})`);
  console.log(`   Amount: ${parseInt(amount) / 1e6} ${inputToken.toUpperCase()}`);

  // Step 2: Deposit funds
  console.log('\n' + '─'.repeat(60));
  console.log('STEP 2: SENDING DEPOSIT TRANSACTION');
  console.log('─'.repeat(60));

  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  const provider = new ethers.providers.JsonRpcProvider({
    url: inputConfig.rpc,
    chainId: inputConfig.chainId
  });
  const signer = wallet.connect(provider);

  // Check balance first
  const tokenContract = new ethers.Contract(inputTokenAddress, [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)'
  ], signer);

  const balance = await tokenContract.balanceOf(wallet.address);
  const amountBN = ethers.BigNumber.from(amount);

  if (balance.lt(amountBN)) {
    throw new Error(`Insufficient balance: have ${balance.toString()}, need ${amount}`);
  }

  console.log(`\n💸 Sending ${parseInt(amount) / 1e6} ${inputToken.toUpperCase()}...`);
  console.log(`   From: ${wallet.address}`);
  console.log(`   To: ${quote.depositAddress.address}`);

  const tx = await tokenContract.transfer(quote.depositAddress.address, amountBN);
  console.log(`\n📤 Transaction submitted: ${getExplorerTransactionUrl(inputChain, tx.hash)}`);
  console.log(`   Waiting for confirmation...`);

  const receipt = await tx.wait(1);
  console.log(`\n✅ Deposit confirmed!`);
  console.log(`   Block: ${receipt.blockNumber}`);
  console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

  // Step 3: Poll for order status
  console.log('\n' + '─'.repeat(60));
  console.log('STEP 3: POLLING FOR SETTLEMENT');
  console.log('─'.repeat(60));

  // The order ID for deposit flows is "order_" + quoteId (including the "quote_" prefix)
  const orderId = `order_${quote.quoteId}`;
  
  console.log(`\n⏳ Checking for order: ${orderId}`);
  console.log(`   Will poll every 2 seconds for up to 2 minutes...`);

  let attempts = 0;
  const maxAttempts = 60; // 2 minute with 2s intervals
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    
    try {
      const status = await fetchRiddler(`/status/${orderId}`);
      
      if (status.status === 'completed') {
        console.log('\n🎉 ORDER COMPLETED!');
        console.log(`   Settlement TX: ${getExplorerTransactionUrl(outputChain, status.outputTransaction)}`);
        console.log(`   Output Chain: ${outputChain}`);
        console.log(`   Output Amount: ${status.outputAmount || quote.outputAmount}`);
        break;
      } else if (status.status === 'refunded') {
        console.log('\n💸 ORDER REFUNDED');
        console.log(`   Refund TX: ${status.refundTxHash || 'Check blockchain'}`);
        console.log(`   Reason: ${status.errorReason || 'Quote expired before deposit was confirmed'}`);
        break;
      } else if (status.status === 'failed') {
        console.log(`\n❌ ORDER FAILED`);
        console.log(`   Reason: ${status.errorReason || 'Unknown'}`);
        break;
      } else if (status.status === 'expired') {
        console.log('\n⚠️  QUOTE EXPIRED');
        console.log(`   The quote expired before deposit was confirmed on-chain.`);
        console.log(`   If you already sent a deposit, it will be automatically refunded.`);
        console.log(`   Continuing to poll for refund status...`);
      } else if (status.status === 'received' || status.status === 'settling') {
        console.log(`   ✅ Deposit received! Status: ${status.status} (attempt ${attempts + 1}/${maxAttempts})`);
      } else {
        console.log(`   Status: ${status.status} (attempt ${attempts + 1}/${maxAttempts})`);
      }
    } catch (e) {
      if (e.message.includes('not found') || e.message.includes('404')) {
        console.log(`   Order not found yet (waiting for deposit)... (attempt ${attempts + 1}/${maxAttempts})`);
      } else {
        console.log(`   Error checking status: ${e.message}`);
      }
    }
    
    attempts++;
  }

  if (attempts >= maxAttempts) {
    console.log('\n⏰ Timeout - order not completed within 5 minutes');
    console.log(`   You can check status later with:`);
    console.log(`   npm run status -- --order-id ${orderId}`);
  }

  console.log('\n' + '═'.repeat(60));

  return { quote, orderId };
}

// =============================================================================
// Full Gasless Flow
// =============================================================================

async function gaslessFlow(params) {
  const {
    method = 'erc3009',
    inputChain = 'op-sepolia',
    outputChain = 'base-sepolia',
    amount = '1000000',
    inputToken = 'usdt',
    outputToken = 'usdt'
  } = params;

  console.log('═'.repeat(60));
  console.log(`🚀 RIDDLER GASLESS FLOW (${method.toUpperCase()})`);
  console.log('═'.repeat(60));

  // Check balance
  console.log('\n📊 Checking balance...');
  try {
    const balance = await checkUserBalance(inputChain, inputToken);
    const requiredAmount = ethers.BigNumber.from(amount);
    const currentBalance = ethers.BigNumber.from(balance.tokenBalance);
    
    if (currentBalance.lt(requiredAmount)) {
      throw new Error(`Insufficient balance: need ${parseInt(amount) / 1e6} ${inputToken.toUpperCase()}, have ${balance.tokenBalanceFormatted.toFixed(2)}`);
    }
    console.log(`   ✅ ${balance.tokenBalanceFormatted.toFixed(2)} ${inputToken.toUpperCase()} available`);
  } catch (error) {
    if (error.message.includes('Insufficient')) throw error;
    console.log(`   ⚠️  Could not check balance, continuing...`);
  }

  // For Permit2, auto-approve if needed
  if (method === 'permit2') {
    console.log('\n🔐 Checking Permit2 approval...');
    try {
      const approvalStatus = await checkPermit2Approval(inputChain, inputToken);
      const required = ethers.BigNumber.from(amount);
      const current = ethers.BigNumber.from(approvalStatus.allowance);
      
      if (!approvalStatus.approved || current.lt(required)) {
        console.log('   ⚠️  Approval needed, approving...');
        await approvePermit2(inputChain, inputToken, amount);
        console.log('   ✅ Permit2 approved');
      } else {
        console.log('   ✅ Already approved');
      }
    } catch (error) {
      if (error.message.includes('Permit2 approval')) throw error;
      console.log(`   ⚠️  Could not check approval, continuing...`);
    }
  }

  // Get quote
  console.log('\n📝 Getting quote...');
  const quote = await getQuote({ ...params, method });

  if (!quote.gasless) {
    throw new Error('Quote does not include gasless signing info.');
  }

  // Sign
  console.log('\n✍️  Signing transaction...');
  let signResult;
  if (method === 'erc3009') {
    signResult = await signERC3009(quote, inputChain, CONFIG);
  } else {
    // Pass the input token address to ensure correct token is used in permit
    const inputTokenAddress = getTokenAddress(inputChain, inputToken);
    signResult = await signPermit2(quote, inputChain, CONFIG, inputTokenAddress);
  }
  console.log('   ✅ Signed');

  console.log('\n📤 Submitting order...');
  const order = await submitOrder(quote.quoteId, signResult.signedObject, signResult.signature);
  console.log(`   ✅ Order submitted: ${order.orderId}`);

  // Poll for settlement
  console.log('\n⏳ Polling for settlement...');
  let attempts = 0;
  const maxAttempts = 60;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const status = await checkStatus(order.orderId);
      
      if (status.status === 'completed') {
        console.log('\n🎉 ORDER COMPLETED!');
        console.log(`   TX: ${getExplorerTransactionUrl(outputChain, status.outputTransaction)}`);
        break;
      } else if (status.status === 'failed') {
        console.log('\n❌ ORDER FAILED');
        console.log(`   Reason: ${status.errorReason || 'Unknown'}`);
        break;
      }
      
      console.log(`   ${status.status} (${attempts + 1}/${maxAttempts})`);
    } catch (e) {
      console.log(`   Waiting... (${attempts + 1}/${maxAttempts})`);
    }
    
    attempts++;
  }

  console.log('\n' + '═'.repeat(60));
}

// =============================================================================
// CLI
// =============================================================================

function printHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              RIDDLER COMMERCE CLIENT                          ║
║         (ERC-3009 / Permit2 / Deposit Address)                ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  node src/index.js <command> [options]

Commands:
  quote            Get a quote (erc3009, permit2, or deposit_address)
  status           Check order status
  full             Run full flow gasless: (quote → sign → submit → poll) or deposit: (quote → send → poll)
  balance          Check token and ETH balance on a chain
  approve-permit2  Check/approve Permit2 for a token on a chain
  hd-wallet        Derive HD wallet from mnemonic and show public key
  help             Show this help message

Options:
  --server          Server: local | dev | prod (default: local)
  --method          Signing method: erc3009 | permit2 | deposit_address (default: erc3009)
  --amount          Amount in smallest unit (default: 1000000 = 1 USDT)
  --input-chain     Source chain (default: op-sepolia for testnet, ethereum for mainnet)
  --output-chain    Dest chain (default: base-sepolia for testnet, base for mainnet)
  --input-token     Input token: usdc | usdt (default: usdt)
  --output-token    Output token: usdc | usdt (default: usdt)
  --order-id        Order ID for status check

Servers:
  local             http://localhost:4001/commerce
  dev               https://riddler-dev.li.quest/commerce
  prod              https://riddler-prod.li.quest/commerce

Supported Chains (Mainnet):
  ethereum        Ethereum (1)
  base            Base (8453)
  optimism        Optimism (10)
  arbitrum        Arbitrum One (42161)
  polygon         Polygon (137)

Supported Chains (Testnet):
  eth-sepolia     Ethereum Sepolia (11155111)
  op-sepolia      Optimism Sepolia (11155420)
  base-sepolia    Base Sepolia (84532)
  arb-sepolia     Arbitrum Sepolia (421614)

Examples:
  # ─────────────────────────────────────────────────────────────
  # SERVER SELECTION (local | dev | prod)
  # ─────────────────────────────────────────────────────────────

  # Use local server (default)
  node src/index.js full --method deposit_address --server local --input-chain eth-sepolia --output-chain base-sepolia --input-token usdc --output-token usdc
  
  # Use dev server (testnet)
  node src/index.js full --method deposit_address --server dev --input-chain eth-sepolia --output-chain base-sepolia --input-token usdc --output-token usdc
  
  # Use production server (mainnet)
  node src/index.js full --method deposit_address --server prod --input-chain ethereum --output-chain base
  
  # ─────────────────────────────────────────────────────────────
  # DEPOSIT ADDRESS FLOW
  # ─────────────────────────────────────────────────────────────
  
  # Testnet: Eth Sepolia → Base Sepolia (USDC)
  node src/index.js full --method deposit_address --server dev --input-chain eth-sepolia --output-chain base-sepolia --input-token usdc --output-token usdc --amount 1000000
  
  # Mainnet: Ethereum → Base (USDT)
  node src/index.js full --method deposit_address --server prod --input-chain ethereum --output-chain base --amount 1000000
  
  # Mainnet: Ethereum → Optimism (USDC)
  node src/index.js full --method deposit_address --server prod --input-chain ethereum --output-chain optimism --input-token usdc --output-token usdc --amount 5000000
  
  # ─────────────────────────────────────────────────────────────
  # GASLESS FLOW (ERC-3009 / Permit2)
  # ─────────────────────────────────────────────────────────────
  
  # ERC-3009 flow (1 USDT from OP Sepolia to Base Sepolia)
  node src/index.js full --method erc3009 --amount 1000000 --input-chain op-sepolia --output-chain base-sepolia
  
  # Permit2 flow (5 USDT from Ethereum to Base)
  node src/index.js full --method permit2 --amount 5000000 --input-chain ethereum --output-chain base
  
  # ─────────────────────────────────────────────────────────────
  # QUOTES & STATUS
  # ─────────────────────────────────────────────────────────────
  
  # Get a quote with deposit address
  node src/index.js quote --method deposit_address --amount 1000000 --input-chain ethereum --output-chain base
  
  # Check order status
  node src/index.js status --order-id order_abc123
  
  # ─────────────────────────────────────────────────────────────
  # BALANCE & APPROVALS
  # ─────────────────────────────────────────────────────────────
  
  # Check wallet balance on Ethereum mainnet
  node src/index.js balance --input-chain ethereum
  
  # Check USDT balance on Base
  node src/index.js balance --input-chain base --input-token usdt
  
  # Approve Permit2 (unlimited)
  node src/index.js approve-permit2 --input-chain ethereum

Environment Variables (.env):
  PRIVATE_KEY             Your wallet private key (with 0x prefix)
  EVM_HD_MNEMONIC         HD wallet mnemonic (for hd-wallet command)
  
  # Server API Keys (use one per server)
  RIDDLER_API_KEY_LOCAL   API key for local server
  RIDDLER_API_KEY_DEV     API key for dev server
  RIDDLER_API_KEY_PROD    API key for production server
  RIDDLER_API_KEY         Fallback API key (used if server-specific key not set)
  
  # Server URLs (optional - defaults are built-in)
  RIDDLER_URL_LOCAL       Local server URL (default: http://localhost:4001/commerce)
  RIDDLER_URL_DEV         Dev URL (default: https://riddler-dev.li.quest/commerce)
  RIDDLER_URL_PROD        Production URL (default: https://riddler-prod.li.quest/commerce)
  RIDDLER_SERVER          Default server: local | dev | prod (default: local)
  
  # RPC URLs (optional)
  ETH_RPC, BASE_RPC, OP_RPC, ARB_RPC, POLYGON_RPC
  ETH_SEPOLIA_RPC, OP_SEPOLIA_RPC, BASE_SEPOLIA_RPC, ARB_SEPOLIA_RPC
  `);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse flags
  const flags = {};
  for (let i = 1; i < args.length; i += 2) {
    if (args[i] && args[i].startsWith('--')) {
      const key = args[i].substring(2).replace(/-/g, '_');
      flags[key] = args[i + 1];
    }
  }

  // Set server if specified (local | dev | prod)
  if (flags.server) {
    setServer(flags.server);
  }

  // Validate config (skip for hd-wallet command which only needs mnemonic)
  if (command && command !== 'help' && command !== 'hd-wallet') {
    if (!CONFIG.PRIVATE_KEY) {
      console.error('❌ PRIVATE_KEY not set in .env file');
      console.error('   Create a .env file with: PRIVATE_KEY=0xyour_key_here');
      process.exit(1);
    }

    // balance and approve-permit2 commands don't need Riddler API key
    const needsRiddlerApi = !['balance', 'approve-permit2'].includes(command);
    if (needsRiddlerApi && !activeServer.apiKey) {
      console.error(`❌ API key not set for server: ${activeServer.name}`);
      console.error(`   Set RIDDLER_API_KEY_${activeServer.name.toUpperCase()} in .env file`);
      process.exit(1);
    }

    // Show wallet address
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
    console.log(`\n👛 Wallet: ${wallet.address}`);
    if (needsRiddlerApi) {
      console.log(`🌐 Server: ${activeServer.name} (${activeServer.url})`);
    }
  }

  try {
    switch (command) {
      case 'quote':
        await getQuote({
          method: flags.method || 'erc3009',
          amount: flags.amount || '1000000',
          inputChain: flags.input_chain || 'op-sepolia',
          outputChain: flags.output_chain || 'base-sepolia',
          inputToken: flags.input_token || 'usdt',
          outputToken: flags.output_token || 'usdt'
        });
        break;

      case 'status':
        if (!flags.order_id) {
          console.error('❌ --order-id required');
          console.error('   Example: node src/index.js status --order-id order_abc123');
          process.exit(1);
        }
        await checkStatus(flags.order_id);
        break;

      case 'full':
        if (flags.method === 'deposit_address') {
          await depositFlow({
            amount: flags.amount || '1000000',
            inputChain: flags.input_chain || 'op-sepolia',
            outputChain: flags.output_chain || 'base-sepolia',
            inputToken: flags.input_token || 'usdt',
            outputToken: flags.output_token || 'usdt'
          });
        } else {
          await gaslessFlow({
            method: flags.method || 'erc3009',
            amount: flags.amount || '1000000',
            inputChain: flags.input_chain || 'op-sepolia',
            outputChain: flags.output_chain || 'base-sepolia',
            inputToken: flags.input_token || 'usdt',
            outputToken: flags.output_token || 'usdt'
          });
        }
        break;

      case 'balance':
        const chainToCheck = flags.input_chain || 'ethereum';
        const tokenToCheck = flags.input_token || 'usdt';
        const balanceInfo = await checkUserBalance(chainToCheck, tokenToCheck);
        console.log('\n' + '═'.repeat(60));
        console.log('WALLET BALANCE');
        console.log('═'.repeat(60));
        console.log(`Chain: ${balanceInfo.chain} (${balanceInfo.chainId})`);
        console.log(`Address: ${balanceInfo.user}`);
        console.log(`Token: ${balanceInfo.token}`);
        console.log(`\n💰 ${balanceInfo.tokenSymbol} Balance: ${balanceInfo.tokenBalanceFormatted.toFixed(6)}`);
        console.log(`   Raw: ${balanceInfo.tokenBalance} (${balanceInfo.tokenDecimals} decimals)`);
        console.log(`\n⛽ ETH Balance: ${balanceInfo.ethBalanceFormatted.toFixed(6)} ETH`);
        console.log(`   Raw: ${balanceInfo.ethBalance} wei`);
        console.log('\n' + '═'.repeat(60));
        break;

      case 'approve-permit2':
        if (!flags.input_chain) {
          console.error('❌ --input-chain required');
          console.error('   Example: node src/index.js approve-permit2 --input-chain ethereum');
          process.exit(1);
        }
        
        const tokenForApproval = flags.input_token || 'usdt';
        
        // Check and auto-approve
        console.log('\n🔐 Checking Permit2 approval...');
        const status = await checkPermit2Approval(flags.input_chain, tokenForApproval);
        
        if (status.approved) {
          console.log(`✅ Permit2 already approved (allowance: ${status.allowance})`);
        } else {
          console.log('⚠️  Not approved, approving now...');
          await approvePermit2(flags.input_chain, tokenForApproval, flags.amount);
          console.log('✅ Permit2 approved!');
        }
        break;

      case 'hd-wallet':
        const derivationPath = flags.path || "m/44'/60'/0'/0/0";
        const accountIndex = flags.account ? parseInt(flags.account) : 0;
        showHDWalletInfo(derivationPath, accountIndex);
        break;

      case 'help':
      default:
        printHelp();
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
