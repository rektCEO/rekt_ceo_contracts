# 🚀 Rekt CEO Smart Contracts - Enhanced Edition

This repository contains the **enhanced** smart contracts for the Rekt CEO project's PFP (Profile Picture) and Meme NFT minting platform. The system enables users to design and mint unique NFTs by paying with $CEO tokens, increasing token demand and fostering community engagement.

## ✨ What's New - Enhanced Features

### 🔐 Safe Multisig Integration
- **Safe.global Integration**: Secure multisig wallet management
- **Enhanced Security**: Decentralized governance and reduced single points of failure
- **Royalty Management**: Safe wallet as royalty recipient

### ⚡ Permit Functionality (Gasless Approvals)
- **Gasless Approvals**: Users can approve token spending without paying gas fees
- **Better UX**: No separate approval transactions needed
- **EIP-2612 Compliant**: Standard permit implementation

### 📈 Real-Time Dynamic Pricing
- **Live Price Updates**: CEO and USDC token prices updated in real-time
- **Cooldown Protection**: 5-minute cooldown prevents price manipulation
- **Market Responsive**: Adapts to market conditions

### 💱 USDC Swapping
- **Automatic Conversion**: 50% of CEO payments swapped to USDC
- **Treasury Diversification**: Reduces volatility impact
- **Configurable**: Adjustable swap percentage

### 👑 Enhanced Royalty Management
- **ERC-2981 Compliant**: Standard royalty implementation
- **Creator Compensation**: 50% of royalties go to creators
- **Admin Revenue**: 50% of royalties go to admin
- **2.1% Total Royalty**: Industry standard rate

### 🎨 Creator Tracking
- **IP Ownership**: Each NFT tracks its original creator
- **Attribution**: Creator information stored on-chain
- **Future Royalties**: Enables creator compensation

### 🛡️ Advanced Recovery Mechanisms
- **Emergency Recovery**: Multiple recovery functions for stuck tokens
- **Role-Based Access**: Separate rescuer role for emergencies
- **Non-Reentrant Protection**: Secure recovery operations

## 🏗️ Architecture

The enhanced system consists of four main smart contracts:

1. **CEOToken** - ERC-20 token with permit functionality and dev wallet lock mechanism
2. **PFPCollection** - ERC-721 NFT collection for Profile Picture NFTs (999 max supply)
3. **MemeCollection** - ERC-721 NFT collection for Meme NFTs (9,999 max supply)
4. **MinterContract** - Enhanced central contract with all new features

## 📋 Enhanced Features

### CEO Token ($CEO)
- **Max Supply**: 21,000,000 tokens
- **Dev Allocation**: 3% (630,000 tokens) locked for 3 years
- **Community Supply**: 97% (20,370,000 tokens) to treasury
- **Permit Function**: Gasless approvals using EIP-2612
- **Stuck Token Recovery**: Admin can recover stuck tokens
- **Real-Time Pricing**: Dynamic price updates with cooldown

### PFP Collection
- **Max Supply**: 999 NFTs
- **User Limit**: 2 NFTs per user
- **Access Control**: Only MINTER contract can mint
- **Metadata**: External URI storage
- **Royalty Support**: ERC-2981 compliant royalties
- **Creator Tracking**: Original creator attribution
- **Safe Integration**: Multisig wallet support

### Meme Collection
- **Max Supply**: 9,999 NFTs
- **User Limit**: 9 NFTs per user
- **Access Control**: Only MINTER contract can mint
- **Metadata**: External URI storage
- **Royalty Support**: ERC-2981 compliant royalties
- **Creator Tracking**: Original creator attribution
- **Safe Integration**: Multisig wallet support

### Enhanced Minter Contract
- **Tiered Pricing**: 3 tiers for each NFT type
  - PFP: $50, $150, $250 (USD pegged)
  - Meme: $5, $15, $25 (USD pegged)
- **Dynamic Pricing**: Real-time CEO and USDC price updates
- **USDC Swapping**: 50% of payments automatically swapped
- **Permit Support**: Gasless minting with permit function
- **Royalty Management**: 2.1% royalties with creator/admin split
- **Safe Integration**: Multisig wallet support
- **Role-Based Access**: Admin, Approver, Rescuer, Price Updater roles
- **Fund Management**: Automatic treasury collection

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Hardhat
- Git

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd rekt-ceo-smart-contracts
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create environment file:**
```bash
cp env.example .env
```

4. **Update `.env` with your configuration:**
```env
PRIVATE_KEY=your_private_key_here
BSCSCAN_API_KEY=your_bscscan_api_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

## 🧪 Local Testing & Development

### Step 1: Start Local Hardhat Node
```bash
# Terminal 1: Start local blockchain
npx hardhat node
```

### Step 2: Run Enhanced Tests
```bash
# Terminal 2: Run comprehensive tests
npx hardhat run scripts/enhanced-test.js --network localhost
```

### Step 3: Deploy Locally
```bash
# Deploy enhanced contracts to local network
npx hardhat run scripts/enhanced-deploy.js --network localhost
```

### Step 4: Interactive Testing
```bash
# Run interactive demo
npx hardhat run scripts/interact.js --network localhost
```

## 🔧 Enhanced Testing Suite

### Test Scripts

#### 1. Enhanced Test (Recommended)
```bash
npx hardhat run scripts/enhanced-test.js
```
**Tests all new features:**
- ✅ Safe multisig integration
- ✅ Permit functionality
- ✅ Real-time pricing
- ✅ USDC swapping
- ✅ Royalty management
- ✅ Creator tracking
- ✅ Recovery mechanisms

#### 2. Original Test Suite
```bash
# Quick system test
npx hardhat run scripts/simple-test.js

# Run all unit tests
npm test

# Interactive demo
npx hardhat run scripts/interact.js
```

### Expected Test Results

When all tests pass, you should see:
```
=== 🎉 ENHANCED REKT CEO TESTING COMPLETE! 🎉 ===
✅ All tests passed successfully!

🔧 Features Tested:
✅ CEO Token functionality
✅ Pricing system
✅ USDC swap configuration
✅ Royalty management
✅ NFT minting
✅ User limits
✅ Creator tracking
✅ Safe wallet integration
✅ Recovery mechanisms
✅ Price update cooldown

🚀 System ready for production!
```

## 🚀 Deployment

### Local Development
```bash
# Start local node
npx hardhat node

# Deploy to local network
npx hardhat run scripts/enhanced-deploy.js --network localhost
```

### BSC Testnet
```bash
# Deploy to BSC testnet
npx hardhat run scripts/enhanced-deploy.js --network bscTestnet

# Test on testnet
npx hardhat run scripts/enhanced-test.js --network bscTestnet
```

### BSC Mainnet
```bash
# Deploy to BSC mainnet
npx hardhat run scripts/enhanced-deploy.js --network bsc

# Verify contracts
npx hardhat verify --network bsc <contract-address> <constructor-args>
```

## 📁 Project Structure

```
├── contracts/                    # Smart contracts
│   ├── CEOToken.sol             # ERC-20 token contract
│   ├── PFPCollection.sol        # PFP NFT collection (enhanced)
│   ├── MemeCollection.sol       # Meme NFT collection (enhanced)
│   ├── MinterContract.sol       # Main minter contract (enhanced)
│   └── MockERC20.sol            # Mock token for testing
├── scripts/                     # Deployment and testing scripts
│   ├── deploy.js                # Original deployment script
│   ├── enhanced-deploy.js       # Enhanced deployment script
│   ├── enhanced-test.js         # Enhanced testing script
│   ├── interact.js              # Interactive demo script
│   ├── simple-test.js           # Quick system verification
│   ├── advanced-test.js         # Comprehensive testing
│   └── final-test.js            # Production readiness test
├── test/                        # Unit test files
│   ├── CEOToken.test.js         # CEO token unit tests
│   ├── PFPCollection.test.js    # PFP collection unit tests
│   ├── MemeCollection.test.js   # Meme collection unit tests
│   ├── MinterContract.test.js   # Minter contract unit tests
│   └── Basic.test.js            # Basic functionality tests
├── deployments/                 # Deployment records (auto-generated)
├── hardhat.config.js            # Hardhat configuration
├── package.json                 # Dependencies and scripts
├── env.example                  # Environment variables template
├── README.md                    # This file
└── ENHANCED_FEATURES.md         # Detailed feature documentation
```

## 🔐 Enhanced Security Features

### Role-Based Access Control
- **Admin Role**: Full administrative control
- **Approver Role**: Backend wallet for minting
- **Rescuer Role**: Emergency token recovery
- **Price Updater Role**: Real-time price updates

### Safe Multisig Integration
- **Multisig Governance**: Safe wallet for critical operations
- **Enhanced Security**: Multiple signature requirements
- **Decentralized Control**: Community governance

### Advanced Protection
- **Reentrancy Protection**: All external calls protected
- **Input Validation**: Comprehensive parameter validation
- **Price Update Cooldown**: Prevents price manipulation
- **Emergency Recovery**: Multiple recovery mechanisms

## 💰 Enhanced Economic Model

### Revenue Streams
- **Primary Revenue**: NFT sales ($100,000 - $500,000 potential)
- **Secondary Royalties**: 2.1% of all secondary sales
- **Creator Compensation**: 50% of royalties to creators
- **Admin Revenue**: 50% of royalties to admin

### Token Flow
1. **User Purchase**: User buys CEO tokens from DEX
2. **NFT Creation**: User designs PFP/Meme on website
3. **Payment**: User pays with CEO tokens
4. **USDC Swap**: 50% of payment swapped to USDC
5. **Treasury**: Funds accumulated for community
6. **Royalties**: 2.1% on secondary sales

## 🔍 Verification

### Contract Verification
```bash
# Verify on BSCScan
npx hardhat verify --network bsc <contract-address> <constructor-args>

# Verify on Etherscan
npx hardhat verify --network ethereum <contract-address> <constructor-args>
```

### Audit Tools
```bash
# Run Slither static analysis
npx slither contracts/

# Run Mythril security analysis
npx mythril analyze contracts/MinterContract.sol
```

## 📊 Gas Optimization

- **Optimizer**: Enabled with 200 runs
- **Solidity Version**: 0.8.19
- **Libraries**: OpenZeppelin contracts v4.9.3
- **Gas Reporting**: Available with `npm run gas-report`

## 🛠️ Development Workflow

### 1. Local Development
```bash
# Start local node
npx hardhat node

# Run tests
npx hardhat run scripts/enhanced-test.js --network localhost

# Deploy locally
npx hardhat run scripts/enhanced-deploy.js --network localhost
```

### 2. Testnet Deployment
```bash
# Deploy to testnet
npx hardhat run scripts/enhanced-deploy.js --network bscTestnet

# Test on testnet
npx hardhat run scripts/enhanced-test.js --network bscTestnet
```

### 3. Mainnet Deployment
```bash
# Deploy to mainnet
npx hardhat run scripts/enhanced-deploy.js --network bsc

# Verify contracts
npx hardhat verify --network bsc <contract-address> <constructor-args>
```

## 🚨 Troubleshooting

### Common Issues

1. **Node.js Version**: Ensure Node.js 16+ is installed
2. **Dependencies**: Run `npm install` if packages are missing
3. **Compilation**: Run `npm run compile` if contracts fail to compile
4. **Network Issues**: Check network configuration in `hardhat.config.js`

### Test Failures

If tests fail:
1. Check Node.js version: `node --version`
2. Reinstall dependencies: `rm -rf node_modules && npm install`
3. Compile contracts: `npm run compile`
4. Check test scripts are in `scripts/` directory

## 📞 Support

### Documentation
- **README.md**: This file
- **ENHANCED_FEATURES.md**: Detailed feature documentation
- **Contract Comments**: Inline documentation in contracts

### Community
- **GitHub Issues**: Report bugs and feature requests
- **Discord**: Community support
- **Telegram**: Real-time updates

## 🎯 Next Steps

### Immediate
1. **Deploy to BSC Testnet**
2. **Run comprehensive tests**
3. **Set up Safe multisig wallet**
4. **Configure USDC token address**

### Production
1. **Deploy to BSC Mainnet**
2. **Verify contracts on BSCScan**
3. **Set up monitoring and analytics**
4. **Launch frontend integration**

### Future Enhancements
1. **DEX Integration**: Direct PancakeSwap integration
2. **Staking System**: CEO token staking rewards
3. **Governance**: DAO governance implementation
4. **Cross-Chain**: Multi-chain deployment

---

**🎉 Your enhanced Rekt CEO system is now ready with cutting-edge features including Safe multisig integration, gasless approvals, real-time pricing, USDC swapping, and comprehensive royalty management!**