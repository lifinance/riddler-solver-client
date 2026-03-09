# Riddler Commerce Client

CLI tool for interacting with the Riddler Commerce API. Supports:
- **ERC-3009** - Gasless USDC transfers via `receiveWithAuthorization`
- **Permit2** - Gasless transfers via Uniswap's Permit2 contract
- **Deposit Address** - Traditional deposit flow (get address → send funds → receive on destination)

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the project root:

```bash
# Wallet
PRIVATE_KEY=0xyour_private_key_here

# API Key
RIDDLER_API_KEY=your_api_key

# Optional: RPC URLs (defaults are public RPCs)
# ETH_RPC=https://eth.llamarpc.com
# BASE_RPC=https://mainnet.base.org
```

## Quick Start

All commands are **single-command flows** that auto-execute everything.

### Deposit Address Flow

```bash
# Testnet: Eth Sepolia → Base Sepolia (USDC)
node src/index.js full --method deposit_address --server dev --input-chain eth-sepolia --output-chain base-sepolia --input-token usdc --output-token usdc --amount 1000000

# Mainnet: Ethereum → Base (USDT)
node src/index.js full --method deposit_address --server prod --input-chain ethereum --output-chain base --amount 1000000

# Mainnet: Ethereum → Optimism (USDC)
node src/index.js full --method deposit_address --server prod --input-chain ethereum --output-chain optimism --input-token usdc --output-token usdc --amount 5000000
```

**What happens:** Gets quote → Auto-sends deposit → Polls for settlement

### ERC-3009 Flow (Gasless)

```bash
# Testnet
node src/index.js full --server dev --method erc3009 --input-chain eth-sepolia --output-chain base-sepolia --input-token usdc --output-token usdc --amount 1000000

# Mainnet
node src/index.js full --server prod --method erc3009 --input-chain ethereum --output-chain base --input-token usdc --output-token usdc --amount 1000000
```

**What happens:** Checks balance → Gets quote → Signs → Submits → Polls

### Permit2 Flow (Gasless)

```bash
# Testnet
node src/index.js full --server dev --method permit2 --input-chain eth-sepolia --output-chain base-sepolia --input-token usdc --output-token usdc --amount 1000000

# Mainnet
node src/index.js full --server prod --method permit2 --input-chain ethereum --output-chain base --amount 1000000
```

**What happens:** Checks balance → Auto-approves Permit2 → Gets quote → Signs → Submits → Polls

## Servers

| Server | Flag | URL | Use For |
|--------|------|-----|---------|
| Local | `--server local` | `http://localhost:4001/commerce` | Local development |
| Dev | `--server dev` | `https://riddler-dev.li.quest/commerce` | Testnet |
| Production | `--server prod` | `https://riddler-prod.li.quest/commerce` | Mainnet |

## Other Commands

### Check Balance

```bash
node src/index.js balance --input-chain ethereum
node src/index.js balance --input-chain base --input-token usdt
```

### Check Order Status

```bash
node src/index.js status --server dev --order-id order_abc123
```

### Get Quote Only

```bash
node src/index.js quote --server dev --method deposit_address --input-chain eth-sepolia --output-chain base-sepolia --input-token usdc --output-token usdc --amount 1000000
```

### Approve Permit2

```bash
node src/index.js approve-permit2 --input-chain ethereum
```

## Supported Chains

### Mainnet

| Chain | Key | Chain ID | USDC | USDT |
|-------|-----|----------|------|------|
| Ethereum | `ethereum` | 1 | ✅ | ✅ |
| Base | `base` | 8453 | ✅ | ✅ |
| Optimism | `optimism` | 10 | ✅ | ✅ |
| Arbitrum | `arbitrum` | 42161 | ✅ | ✅ |
| Polygon | `polygon` | 137 | ✅ | ✅ |

### Testnet

| Chain | Key | Chain ID | USDC |
|-------|-----|----------|------|
| Ethereum Sepolia | `eth-sepolia` | 11155111 | ✅ |
| Optimism Sepolia | `op-sepolia` | 11155420 | ✅ |
| Base Sepolia | `base-sepolia` | 84532 | ✅ |
| Arbitrum Sepolia | `arb-sepolia` | 421614 | ✅ |

## Token Addresses

### Mainnet USDC
| Chain | Address |
|-------|---------|
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Optimism | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Polygon | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |

### Mainnet USDT
| Chain | Address |
|-------|---------|
| Ethereum | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Base | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |
| Optimism | `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58` |
| Arbitrum | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| Polygon | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |

## How It Works

### Deposit Address Flow

1. **Quote**: Request a quote with `gaslessOrDepositAddress=deposit_address`
2. **Receive Address**: Get a unique deposit address on the source chain
3. **Send Funds**: Transfer tokens to the deposit address
4. **Settlement**: Solver detects the deposit and sends tokens on destination chain

```
User requests quote with deposit_address
           │
           ▼
Solver returns unique deposit address
           │
           ▼
User sends tokens to deposit address
           │
           ▼
Solver detects deposit → Sends tokens on destination chain
```

### ERC-3009 Flow

1. **Quote**: Request a quote with `gaslessOrDepositAddress=erc3009`
2. **Sign**: Sign `ReceiveWithAuthorization` typed data (EIP-712)
3. **Submit**: POST the signature to `/order`
4. **Execute**: Solver calls `USDC.receiveWithAuthorization()` to pull funds
5. **Settle**: Solver sends tokens on destination chain

### Permit2 Flow

1. **Quote**: Request a quote with `gaslessOrDepositAddress=permit2`
2. **Approve**: Approve Permit2 contract (one-time)
3. **Sign**: Sign `PermitWitnessTransferFrom` typed data (EIP-712)
4. **Submit**: POST the signature to `/order`
5. **Execute**: Solver calls `Permit2.permitWitnessTransferFrom()` to pull funds
6. **Settle**: Solver sends tokens on destination chain

## Command Reference

```bash
# Commands
full             Run full flow gasless: (quote → sign → submit → poll) or deposit: (quote → send → poll)
quote            Get a quote only
status           Check order status
balance          Check wallet balance
approve-permit2  Approve Permit2 contract
hd-wallet        Derive HD wallet from mnemonic
help             Show help

# Options
--server          Server: local | dev | prod (default: local)
--method          Method: erc3009 | permit2 | deposit_address (default: erc3009)
--amount          Amount in smallest unit (default: 1000000 = 1 token)
--input-chain     Source chain key
--output-chain    Destination chain key
--input-token     Input token: usdc | usdt (default: usdt)
--output-token    Output token: usdc | usdt (default: usdt)
--order-id        Order ID for status check
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | Yes | Wallet private key (0x prefixed) |
| `RIDDLER_API_KEY_LOCAL` | Yes | API key for local server |
| `RIDDLER_API_KEY_DEV` | Yes | API key for dev server |
| `RIDDLER_API_KEY_PROD` | Yes | API key for production server |
| `SOLVER_WALLET_ADDRESS` | No | Expected test solver wallet address for validation (defaults to `0xc6E555dfcC47e4A3bfecd6879570044ADc0270ff`) |
| `VALIDATE_SOLVER_ADDRESS` | No | Enable solver address validation (default: `false`, set to `true` to disable) |
| `ETH_RPC` | No | Ethereum mainnet RPC URL | Recommeneded
| `BASE_RPC` | No | Base mainnet RPC URL | Recommeneded
| `OP_RPC` | No | Optimism mainnet RPC URL | Recommeneded
| `ARB_RPC` | No | Arbitrum mainnet RPC URL | Recommeneded
| `POLYGON_RPC` | No | Polygon mainnet RPC URL | Recommeneded
| `DEBUG` | No | Set to `true` for verbose errors |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/commerce/quote` | GET | Get a quote for a transfer |
| `/commerce/order` | POST | Submit a signed order |
| `/commerce/status/:orderId` | GET | Check order status |
| `/commerce/chains` | GET | List supported chains |
| `/commerce/routes` | GET | List supported routes |

## License

MIT
