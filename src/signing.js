/**
 * ERC-3009 and Permit2 Signing Functions
 */

const { ethers } = require('ethers');

// =============================================================================
// ERC-3009 Types (USDC receiveWithAuthorization)
// =============================================================================

const ERC3009_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ]
};

// =============================================================================
// Permit2 Types
// =============================================================================

const PERMIT2_TYPES = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'OriginPullWitness' }
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' }
  ],
  OriginPullWitness: [
    { name: 'orderId', type: 'bytes32' }
  ]
};

// =============================================================================
// ERC-3009 Signing
// =============================================================================

/**
 * Sign an ERC-3009 ReceiveWithAuthorization message
 * 
 * @param {Object} quote - Quote response from Riddler
 * @param {string} inputChain - Input chain key (e.g., 'op-sepolia')
 * @param {Object} config - Configuration object
 * @returns {Promise<{signature: string, signedObject: string}>}
 */
async function signERC3009(quote, inputChain, config) {
  const wallet = new ethers.Wallet(config.PRIVATE_KEY);
  const chainConfig = config.CHAINS[inputChain];

  // Verify wallet address matches expected
  console.log('\n🔐 Signing ERC-3009 ReceiveWithAuthorization...');
  console.log(`\n   Wallet Address: ${wallet.address}`);
  console.log(`   Expected Address: ${quote.request.refundAddress || quote.request.outputAddress || 'N/A'}`);
  
  if (quote.request.refundAddress && wallet.address.toLowerCase() !== quote.request.refundAddress.toLowerCase()) {
    console.warn(`\n   ⚠️  WARNING: Wallet address (${wallet.address}) does not match refundAddress (${quote.request.refundAddress})`);
    console.warn(`   The signature will be invalid!`);
  }

  // ERC-3009 domain for USDC
  const domain = {
    name: chainConfig.usdcName || 'USD Coin',
    version: chainConfig.usdcVersion || '2',
    chainId: chainConfig.chainId,
    verifyingContract: chainConfig.usdc
  };

  // Normalize nonce to ensure consistent format for both signing and encoding
  // The nonce from the quote is a hex string like "0x3358df12..."
  // We need to ensure it's exactly 32 bytes (64 hex chars) for consistency
  let normalizedNonce;
  if (typeof quote.gasless.nonce === 'string' && quote.gasless.nonce.startsWith('0x')) {
    // Remove 0x prefix and ensure it's exactly 64 hex chars (32 bytes)
    const hexWithoutPrefix = quote.gasless.nonce.slice(2);
    const paddedHex = hexWithoutPrefix.padStart(64, '0').slice(0, 64); // Ensure exactly 64 chars
    normalizedNonce = '0x' + paddedHex.toLowerCase(); // Normalize to lowercase
  } else {
    // Already bytes or other format - convert to hex string
    normalizedNonce = ethers.utils.hexlify(quote.gasless.nonce);
  }

  // CRITICAL: The 'to' address comes from quote.gasless.to (set by server)
  // For ERC-3009, this MUST be the relayer/solver address on the INPUT chain
  // (the chain where tokens are being pulled from, not the destination chain)
  const solverAddress = quote.gasless.to;
  
  console.log(`\n   📍 Solver Address Source:`);
  console.log(`      From quote.gasless.to: ${solverAddress}`);
  console.log(`      This is the address that will call receiveWithAuthorization`);
  console.log(`      It MUST match the relayer address on the input chain (${inputChain})`);
  
  // Validate solver address matches expected test solver (if validation enabled)
  if (config.VALIDATE_SOLVER_ADDRESS && config.TEST_SOLVER_WALLET) {
    if (solverAddress.toLowerCase() !== config.TEST_SOLVER_WALLET.toLowerCase()) {
      console.error(`\n   ❌ ERROR: Quote solver address (${solverAddress}) does not match expected test solver (${config.TEST_SOLVER_WALLET})`);
      console.error(`   The signature will be invalid! The server expects the solver address from the quote.`);
      console.error(`   Expected: ${config.TEST_SOLVER_WALLET} (relayer on input chain)`);
      console.error(`   Got:      ${solverAddress} (likely solver on output chain - WRONG!)`);
      console.error(`   To fix: Ensure the server returns the correct solver address in the quote (input chain relayer).`);
      console.error(`   To disable validation: Set VALIDATE_SOLVER_ADDRESS=false in .env`);
      throw new Error(`Solver address mismatch: quote has ${solverAddress}, expected ${config.TEST_SOLVER_WALLET}`);
    } else {
      console.log(`\n   ✅ Solver address matches test wallet: ${config.TEST_SOLVER_WALLET}`);
    }
  }

  // Message to sign - use normalized nonce for EIP-712
  const message = {
    from: wallet.address,
    to: solverAddress, // This comes from quote.gasless.to (server response)
    value: ethers.BigNumber.from(quote.request.inputAmount),
    validAfter: 0,
    validBefore: quote.quoteExpires,
    nonce: normalizedNonce // Use normalized nonce for signing
  };

  console.log('\n   Domain:');
  console.log(`     name: ${domain.name}`);
  console.log(`     version: ${domain.version}`);
  console.log(`     chainId: ${domain.chainId}`);
  console.log(`     verifyingContract: ${domain.verifyingContract}`);
  console.log('\n   Message:');
  console.log(`     from: ${message.from}`);
  console.log(`     to: ${message.to}`);
  console.log(`     value: ${message.value.toString()} (${parseInt(message.value.toString()) / 1e6} USDC)`);
  console.log(`     validAfter: ${message.validAfter}`);
  console.log(`     validBefore: ${message.validBefore} (${new Date(message.validBefore * 1000).toISOString()})`);
  console.log(`     nonce: ${message.nonce}`);

  // Compute the EIP-712 message hash (for debugging)
  try {
    // Compute domain separator hash
    const domainSeparator = ethers.utils._TypedDataEncoder.hashDomain(domain);
    console.log(`\n   Domain Separator Hash: ${domainSeparator}`);
    
    // Compute struct hash
    const structHash = ethers.utils._TypedDataEncoder.hashStruct('ReceiveWithAuthorization', { ReceiveWithAuthorization: ERC3009_TYPES.ReceiveWithAuthorization }, message);
    console.log(`   Struct Hash: ${structHash}`);
    
    // Compute final message hash
    const messageHash = ethers.utils._TypedDataEncoder.hash(domain, { ReceiveWithAuthorization: ERC3009_TYPES.ReceiveWithAuthorization }, message);
    console.log(`   EIP-712 Message Hash: ${messageHash}`);
  } catch (error) {
    console.error(`\n   ⚠️  Could not compute message hash: ${error.message}`);
  }

  // Sign typed data (EIP-712)
  const signature = await wallet._signTypedData(
    domain,
    { ReceiveWithAuthorization: ERC3009_TYPES.ReceiveWithAuthorization },
    message
  );

  console.log(`\n✅ Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 10)}`);

  // Verify signature can be recovered to the correct address
  try {
    const recoveredAddress = ethers.utils.verifyTypedData(
      domain,
      { ReceiveWithAuthorization: ERC3009_TYPES.ReceiveWithAuthorization },
      message,
      signature
    );
    console.log(`\n   Signature Recovery Test:`);
    console.log(`     Recovered: ${recoveredAddress}`);
    console.log(`     Expected:  ${wallet.address}`);
    if (recoveredAddress.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error(`     ❌ MISMATCH! Signature recovery failed!`);
    } else {
      console.log(`     ✅ Match! Signature is valid.`);
    }
  } catch (error) {
    console.error(`\n   ⚠️  Could not verify signature recovery: ${error.message}`);
  }

  // Encode the signed object (ABI encode the authorization params)
  // CRITICAL: Use EXACTLY the same values that were used for signing!
  // Convert normalized hex string to bytes for AbiCoder.encode
  const nonceBytes = ethers.utils.hexDataSlice(normalizedNonce, 0, 32);
  
  // CRITICAL: Re-read quote values to ensure they haven't changed
  const currentQuoteNonce = quote.gasless?.nonce;
  const currentQuoteExpires = quote.quoteExpires;
  
  console.log(`\n   Encoding signedObject (MUST match signed message):`);
  console.log(`     Quote nonce (current): ${currentQuoteNonce}`);
  console.log(`     Quote expires (current): ${currentQuoteExpires}`);
  console.log(`     Signed nonce: ${normalizedNonce}`);
  console.log(`     Signed validBefore: ${message.validBefore}`);
  
  // Verify quote hasn't changed
  if (currentQuoteNonce && currentQuoteNonce.toLowerCase() !== quote.gasless.nonce.toLowerCase()) {
    console.error(`\n   ❌ ERROR: Quote nonce changed between signing and encoding!`);
    console.error(`      Original: ${quote.gasless.nonce}`);
    console.error(`      Current: ${currentQuoteNonce}`);
  }
  if (currentQuoteExpires && currentQuoteExpires !== quote.quoteExpires) {
    console.error(`\n   ❌ ERROR: Quote expires changed between signing and encoding!`);
    console.error(`      Original: ${quote.quoteExpires}`);
    console.error(`      Current: ${currentQuoteExpires}`);
  }
  
  // Ensure we're using the exact same values from the message object
  const encodingValues = {
    from: message.from,
    to: message.to,
    value: message.value,
    validAfter: message.validAfter,
    validBefore: message.validBefore, // Use the SAME value that was signed
    nonce: nonceBytes // Use the SAME nonce that was signed
  };
  
  console.log(`     Encoding values:`);
  console.log(`       from: ${encodingValues.from}`);
  console.log(`       to: ${encodingValues.to}`);
  console.log(`       value: ${encodingValues.value.toString()}`);
  console.log(`       validAfter: ${encodingValues.validAfter}`);
  console.log(`       validBefore: ${encodingValues.validBefore}`);
  console.log(`       nonce (bytes32): ${ethers.utils.hexlify(encodingValues.nonce)}`);
  
  const abiCoder = new ethers.utils.AbiCoder();
  const signedObject = abiCoder.encode(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [encodingValues.from, encodingValues.to, encodingValues.value, encodingValues.validAfter, encodingValues.validBefore, encodingValues.nonce]
  );
  
  console.log(`     signedObject length: ${signedObject.length} chars`);
  console.log(`     signedObject preview: ${signedObject.substring(0, 66)}...`);

  return { signature, signedObject };
}

// =============================================================================
// Permit2 Signing
// =============================================================================

/**
 * Sign a Permit2 PermitWitnessTransferFrom message with witness
 * 
 * @param {Object} quote - Quote response from Riddler
 * @param {string} inputChain - Input chain key (e.g., 'op-sepolia')
 * @param {Object} config - Configuration object
 * @param {string} [inputTokenAddress] - Optional token address (if not in quote.request.inputToken)
 * @returns {Promise<{signature: string, signedObject: string}>}
 */
async function signPermit2(quote, inputChain, config, inputTokenAddress = null) {
  const wallet = new ethers.Wallet(config.PRIVATE_KEY);
  const chainConfig = config.CHAINS[inputChain];

  // CRITICAL: orderId must be present in quote for witness signing
  if (!quote.gasless || !quote.gasless.orderId) {
    throw new Error('Quote must include orderId in gasless.orderId for Permit2 witness signing');
  }

  // Permit2 domain
  const domain = {
    name: 'Permit2',
    chainId: chainConfig.chainId,
    verifyingContract: config.PERMIT2_ADDRESS
  };

  // Parse nonce - handle both hex string and integer
  let nonce;
  if (typeof quote.gasless.nonce === 'string' && quote.gasless.nonce.startsWith('0x')) {
    nonce = ethers.BigNumber.from(quote.gasless.nonce);
  } else {
    nonce = ethers.BigNumber.from(quote.gasless.nonce);
  }

  // Parse orderId - ensure it's bytes32 format
  let orderId = quote.gasless.orderId;
  if (!orderId.startsWith('0x')) {
    orderId = '0x' + orderId;
  }
  // Ensure orderId is exactly 66 chars (0x + 64 hex chars = 32 bytes)
  if (orderId.length !== 66) {
    throw new Error(`orderId must be 32 bytes (66 hex chars), got ${orderId.length} chars: ${orderId}`);
  }

  // CRITICAL: The spender comes from quote.gasless.to (set by server)
  // For Permit2, this MUST be the relayer/solver address on the INPUT chain
  // (the chain where tokens are being pulled from, not the destination chain)
  const solverAddress = quote.gasless.to;
  
  console.log(`\n   📍 Spender Address Source:`);
  console.log(`      From quote.gasless.to: ${solverAddress}`);
  console.log(`      This is the address that will submit the Permit2 transaction`);
  console.log(`      It MUST match the relayer address on the input chain (${inputChain})`);
  
  // Validate solver address matches expected test solver (if validation enabled)
  if (config.VALIDATE_SOLVER_ADDRESS && config.TEST_SOLVER_WALLET) {
    if (solverAddress.toLowerCase() !== config.TEST_SOLVER_WALLET.toLowerCase()) {
      console.error(`\n   ❌ ERROR: Quote solver address (${solverAddress}) does not match expected test solver (${config.TEST_SOLVER_WALLET})`);
      console.error(`   The signature will be invalid! The server expects the solver address from the quote.`);
      console.error(`   Expected: ${config.TEST_SOLVER_WALLET} (relayer on input chain)`);
      console.error(`   Got:      ${solverAddress} (likely solver on output chain - WRONG!)`);
      console.error(`   To fix: Ensure the server returns the correct solver address in the quote (input chain relayer).`);
      console.error(`   To disable validation: Set VALIDATE_SOLVER_ADDRESS=false in .env`);
      throw new Error(`Solver address mismatch: quote has ${solverAddress}, expected ${config.TEST_SOLVER_WALLET}`);
    } else {
      console.log(`\n   ✅ Solver address matches test wallet: ${config.TEST_SOLVER_WALLET}`);
    }
  }

  // Get token address from quote request (the actual token being transferred)
  // CRITICAL: Use the token from the quote or passed parameter, not hardcoded USDC
  const tokenAddress = inputTokenAddress || quote.request?.inputToken || chainConfig.usdc;
  
  if (!tokenAddress) {
    throw new Error(`Token address not found. Provide inputTokenAddress parameter, quote.request.inputToken, or configure USDC for ${inputChain}`);
  }
  
  console.log(`\n   📍 Token Address Source:`);
  console.log(`      Using token: ${tokenAddress}`);
  if (inputTokenAddress) {
    console.log(`      Source: Passed as parameter`);
  } else if (quote.request?.inputToken) {
    console.log(`      Source: quote.request.inputToken`);
  } else {
    console.log(`      Source: chainConfig.usdc (fallback - may be wrong token!)`);
  }

  // Message to sign - CRITICAL: Include witness for PermitWitnessTransferFrom
  const message = {
    permitted: {
      token: tokenAddress,
      amount: ethers.BigNumber.from(quote.request.inputAmount)
    },
    spender: solverAddress, // This comes from quote.gasless.to (server response)
    nonce: nonce,
    deadline: quote.quoteExpires,
    witness: {
      orderId: orderId
    }
  };

  console.log('\n🔐 Signing Permit2 PermitWitnessTransferFrom WITH WITNESS...');
  console.log(`\n   Wallet Address: ${wallet.address}`);
  console.log(`   Expected Address: ${quote.request.refundAddress || quote.request.outputAddress || 'N/A'}`);
  
  if (quote.request.refundAddress && wallet.address.toLowerCase() !== quote.request.refundAddress.toLowerCase()) {
    console.warn(`\n   ⚠️  WARNING: Wallet address (${wallet.address}) does not match refundAddress (${quote.request.refundAddress})`);
    console.warn(`   The signature will be invalid!`);
  }

  console.log('\n   Domain:');
  console.log(`     name: ${domain.name}`);
  console.log(`     chainId: ${domain.chainId}`);
  console.log(`     verifyingContract: ${domain.verifyingContract}`);
  console.log('\n   Message:');
  console.log(`     permitted.token: ${message.permitted.token}`);
  console.log(`     permitted.amount: ${message.permitted.amount.toString()} (${parseInt(message.permitted.amount.toString()) / 1e6} tokens)`);
  console.log(`     spender: ${message.spender}`);
  console.log(`     nonce: ${message.nonce.toString()}`);
  console.log(`     deadline: ${message.deadline} (${new Date(message.deadline * 1000).toISOString()})`);
  console.log(`     witness.orderId: ${message.witness.orderId}`);

  // Compute the EIP-712 message hash (for debugging)
  try {
    // Compute domain separator hash
    const domainSeparator = ethers.utils._TypedDataEncoder.hashDomain(domain);
    console.log(`\n   Domain Separator Hash: ${domainSeparator}`);
    
    // Compute witness hash - THIS IS WHAT SERVER MUST MATCH
    // hashStruct(OriginPullWitness) = keccak256(typeHash || encodeData)
    // For bytes32, encodeData is just the value itself (no dynamic encoding)
    const witnessTypeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('OriginPullWitness(bytes32 orderId)'));
    console.log(`   Witness Type Hash: ${witnessTypeHash}`);
    // EIP-712 hashStruct = keccak256(typeHash || abi.encode(fields))
    // For a single bytes32 field, abi.encode just returns the bytes32 as-is
    const witnessStructHash = ethers.utils.keccak256(
      ethers.utils.hexConcat([witnessTypeHash, orderId])
    );
    console.log(`   Witness Struct Hash (hashStruct(OriginPullWitness)): ${witnessStructHash}`);
    console.log(`   ^^^ Server must send THIS as the 'witness' parameter to Permit2`);
    
    // Additional debug: compute ALL intermediate values for struct hash comparison
    const fullTypeString = 'PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,OriginPullWitness witness)OriginPullWitness(bytes32 orderId)TokenPermissions(address token,uint256 amount)';
    const permitTypeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(fullTypeString));
    console.log(`   Permit Type Hash: ${permitTypeHash}`);
    
    const tokenPermissionsTypeHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TokenPermissions(address token,uint256 amount)'));
    console.log(`   TokenPermissions Type Hash: ${tokenPermissionsTypeHash}`);
    
    // hashStruct(TokenPermissions) = keccak256(typeHash || token || amount)
    const tokenPermissionsHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'address', 'uint256'],
        [tokenPermissionsTypeHash, message.permitted.token, message.permitted.amount]
      )
    );
    console.log(`   TokenPermissions Hash: ${tokenPermissionsHash}`);
    
    // Compute struct hash
    const structHash = ethers.utils._TypedDataEncoder.hashStruct('PermitWitnessTransferFrom', {
      PermitWitnessTransferFrom: PERMIT2_TYPES.PermitWitnessTransferFrom,
      TokenPermissions: PERMIT2_TYPES.TokenPermissions,
      OriginPullWitness: PERMIT2_TYPES.OriginPullWitness
    }, message);
    console.log(`   Struct Hash: ${structHash}`);
    
    // Compute final message hash
    const messageHash = ethers.utils._TypedDataEncoder.hash(domain, {
      PermitWitnessTransferFrom: PERMIT2_TYPES.PermitWitnessTransferFrom,
      TokenPermissions: PERMIT2_TYPES.TokenPermissions,
      OriginPullWitness: PERMIT2_TYPES.OriginPullWitness
    }, message);
    console.log(`   EIP-712 Message Hash: ${messageHash}`);
  } catch (error) {
    console.error(`\n   ⚠️  Could not compute message hash: ${error.message}`);
  }

  // Sign typed data (EIP-712) - CRITICAL: Use PermitWitnessTransferFrom with witness
  const signature = await wallet._signTypedData(
    domain,
    {
      PermitWitnessTransferFrom: PERMIT2_TYPES.PermitWitnessTransferFrom,
      TokenPermissions: PERMIT2_TYPES.TokenPermissions,
      OriginPullWitness: PERMIT2_TYPES.OriginPullWitness
    },
    message
  );

  console.log(`\n✅ Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 10)}`);

  // Verify signature can be recovered to the correct address
  try {
    const recoveredAddress = ethers.utils.verifyTypedData(
      domain,
      {
        PermitWitnessTransferFrom: PERMIT2_TYPES.PermitWitnessTransferFrom,
        TokenPermissions: PERMIT2_TYPES.TokenPermissions,
        OriginPullWitness: PERMIT2_TYPES.OriginPullWitness
      },
      message,
      signature
    );
    console.log(`\n   Signature Recovery Test:`);
    console.log(`     Recovered: ${recoveredAddress}`);
    console.log(`     Expected:  ${wallet.address}`);
    if (recoveredAddress.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error(`     ❌ MISMATCH! Signature recovery failed!`);
    } else {
      console.log(`     ✅ Match! Signature is valid.`);
    }
  } catch (error) {
    console.error(`\n   ⚠️  Could not verify signature recovery: ${error.message}`);
  }

  // Encode the signed object (ABI encode the permit params)
  // IMPORTANT: Server expects nested tuple: ((address token, uint256 amount), address spender, uint256 nonce, uint256 deadline)
  console.log(`\n   Encoding signedObject (MUST match signed message):`);
  console.log(`     permitted.token: ${message.permitted.token}`);
  console.log(`     permitted.amount: ${message.permitted.amount.toString()}`);
  console.log(`     spender: ${message.spender}`);
  console.log(`     nonce: ${message.nonce.toString()}`);
  console.log(`     deadline: ${message.deadline}`);
  
  const abiCoder = new ethers.utils.AbiCoder();
  // Encode as nested tuple: ((address, uint256), address, uint256, uint256)
  // Server expects: [{{token, amount}, spender, nonce, deadline}]
  // NOTE: ethers.js encode() with ['tuple(...)'] and [[...]] encodes it as an array,
  // which adds an offset pointer. The server's decode_raw expects just the tuple data.
  // We need to extract just the tuple portion (skip the offset).
  
  // Encode the tuple (this will include an offset if treated as array)
  const encodedWithOffset = abiCoder.encode(
    ['tuple(tuple(address,uint256),address,uint256,uint256)'],
    [[
      [message.permitted.token, message.permitted.amount],
      message.spender,
      message.nonce,
      message.deadline
    ]]
  );
  
  console.log(`     Raw encoded length: ${encodedWithOffset.length} chars`);
  console.log(`     Raw encoded preview: ${encodedWithOffset.substring(0, 130)}...`);
  
  // Check if first 32 bytes is an offset pointer (small values like 0x80, 0xc0, etc.)
  // An offset pointer would be something like 0x0000000000000000000000000000000000000000000000000000000000000080 (128)
  // NOT a large address value like 0x0000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c7238
  const first32Bytes = encodedWithOffset.substring(0, 66);
  const offsetValue = parseInt(first32Bytes, 16);
  
  // Offset pointers are typically small values (128, 192, 256, etc.) - addresses are huge
  // A valid offset would be < 1000 bytes, addresses are much larger
  const isLikelyOffset = offsetValue < 1000 && offsetValue >= 32;
  
  let signedObject;
  if (isLikelyOffset) {
    // This is an offset pointer - the tuple data starts at this offset
    // Offset is in bytes, convert to hex chars (each byte = 2 hex chars)
    const dataStart = offsetValue * 2;
    if (dataStart < encodedWithOffset.length - 2) {
      signedObject = '0x' + encodedWithOffset.substring(2 + dataStart);
      console.log(`   ⚠️  Stripped offset pointer (${first32Bytes} = ${offsetValue} bytes), using tuple data directly`);
    } else {
      // Offset points beyond data, use as-is
      signedObject = encodedWithOffset;
      console.log(`   ⚠️  Offset ${offsetValue} points beyond data, using full encoding`);
    }
  } else {
    // No offset detected (likely the actual tuple data starts here), use as-is
    signedObject = encodedWithOffset;
    console.log(`   ✅ No offset detected (first 32 bytes: ${first32Bytes}, value: ${offsetValue}), using encoding as-is`);
  }
  
  console.log(`     signedObject length: ${signedObject.length} chars`);
  console.log(`     signedObject preview: ${signedObject.substring(0, 130)}...`);

  return { signature, signedObject };
}

module.exports = {
  signERC3009,
  signPermit2,
  ERC3009_TYPES,
  PERMIT2_TYPES
};

