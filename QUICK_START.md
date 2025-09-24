# 🚀 Quick Start Guide - Rekt CEO Enhanced Contracts

Get up and running with the enhanced Rekt CEO smart contracts in just 5 minutes!

## ⚡ Super Quick Start (2 Commands)

```bash
# 1. Install and setup
npm install && npm run compile

# 2. Run everything
npm run setup:local
```

## 🎯 Step-by-Step Guide

### Step 1: Prerequisites Check

```bash
# Check Node.js version (needs 16+)
node --version

# Check npm version
npm --version
```

### Step 2: Install Dependencies

```bash
# Clone and install
git clone <your-repo-url>
cd rekt-ceo-smart-contracts
npm install
```

### Step 3: Compile Contracts

```bash
# Compile smart contracts
npm run compile
```

### Step 4: Start Local Testing

#### Option A: Automated Setup (Recommended)

```bash
# Run the setup script
npm run setup:local
```

#### Option B: Manual Setup

```bash
# Terminal 1: Start local blockchain
npm run node

# Terminal 2: Run enhanced tests
npm run test:enhanced:localhost

# Terminal 2: Deploy contracts
npm run deploy:enhanced:localhost
```

## 🧪 Testing Commands

### Enhanced Features Testing

```bash
# Test all enhanced features
npm run test:enhanced:localhost

# Test on BSC testnet
npm run test:enhanced:bsc-testnet

# Test on BSC mainnet
npm run test:enhanced:bsc
```

### Original Testing

```bash
# Quick system test
npx hardhat run scripts/simple-test.js --network localhost

# Unit tests
npm test

# Interactive demo
npx hardhat run scripts/interact.js --network localhost
```

## 🚀 Deployment Commands

### Local Deployment

```bash
# Deploy enhanced contracts locally
npm run deploy:enhanced:localhost
```

### Testnet Deployment

```bash
# Deploy to BSC testnet
npm run deploy:enhanced:bsc-testnet
```

### Mainnet Deployment

```bash
# Deploy to BSC mainnet
npm run deploy:enhanced:bsc
```

## 📊 What You'll See

### Successful Test Output

```
🧪 Starting Enhanced Rekt CEO Contract Testing...

📋 Test Configuration:
USDC Address: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
Safe Wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Treasury: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

1️⃣ Deploying contracts...
✅ CEO Token deployed to: 0x...
✅ PFP Collection deployed to: 0x...
✅ Meme Collection deployed to: 0x...
✅ Enhanced Minter Contract deployed to: 0x...

2️⃣ Testing basic functionality...
🔍 Test 1: CEO Token Functionality
Total CEO supply: 20370000.0
Dev balance: 630000.0
Dev allocation locked: true

🔍 Test 2: CEO Token Transfers
User1 CEO balance: 1000.0
User2 CEO balance: 1000.0

🔍 Test 3: Pricing Functionality
PFP Tier 1 price in CEO: 33.33
Meme Tier 1 price in CEO: 3.33

🔍 Test 4: USDC Swap Configuration
USDC swap enabled: true
USDC swap percentage: 5000 basis points

🔍 Test 5: Royalty Functionality
PFP royalty for $100 sale: 2.5
Meme royalty for $100 sale: 2.5

🔍 Test 6: User Approval and Minting
User1 PFP count: 1
User1 Meme count: 1

🔍 Test 7: Permit Functionality
Note: Permit functionality requires off-chain signature generation

🔍 Test 8: Safe Wallet Integration
PFP Safe wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Meme Safe wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Minter Safe wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

🔍 Test 9: Recovery Functionality
Recovery role granted to deployer

🔍 Test 10: Collection Limits
PFP max supply: 999
PFP max per user: 2
Meme max supply: 9999
Meme max per user: 9

🔍 Test 11: Creator Tracking
PFP Token 1 creator: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Meme Token 1 creator: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

🔍 Test 12: Price Update Cooldown
Price update succeeded (cooldown not active)

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

## 🐛 Troubleshooting

### Common Issues

#### 1. Node.js Version Error

```bash
# Update Node.js to version 16+
nvm install 20.19.4
nvm use 20.19.4
```

#### 2. Dependencies Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### 3. Contract Compilation Failed

```bash
# Compile contracts
npm run compile
```

#### 4. Network Connection Error

```bash
# Start local node first
npm run node
# Then run tests in another terminal
```

## 🎯 Next Steps

### After Local Testing

1. **Deploy to Testnet**: `npm run deploy:enhanced:bsc-testnet`
2. **Test on Testnet**: `npm run test:enhanced:bsc-testnet`
3. **Deploy to Mainnet**: `npm run deploy:enhanced:bsc`
4. **Verify Contracts**: Use BSCScan verification

### Production Checklist

- [ ] All local tests pass
- [ ] Testnet deployment successful
- [ ] Testnet testing complete
- [ ] Contract verification ready
- [ ] Security audit completed

## 📚 Additional Resources

- **README.md**: Complete project documentation
- **ENHANCED_FEATURES.md**: Detailed feature documentation
- **LOCAL_TESTING_GUIDE.md**: Comprehensive testing guide
- **Contract Comments**: Inline code documentation

## 🆘 Need Help?

### Quick Commands

```bash
# Check system status
npm run setup:local

# Run all tests
npm run test:enhanced:localhost

# Deploy everything
npm run deploy:enhanced:localhost
```
