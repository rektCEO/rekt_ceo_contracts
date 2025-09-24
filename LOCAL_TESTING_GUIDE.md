# 🧪 Local Testing Guide - Rekt CEO Enhanced Contracts

This guide will walk you through setting up, testing, and running the enhanced Rekt CEO smart contracts locally.

## 📋 Prerequisites

### Required Software

- **Node.js**: Version 16 or higher
- **npm**: Package manager
- **Git**: Version control
- **Code Editor**: VS Code recommended

### Check Your Setup

```bash
# Check Node.js version
node --version
# Should be 16.0.0 or higher

# Check npm version
npm --version
# Should be 8.0.0 or higher

# Check Git version
git --version
# Any recent version is fine
```

## 🚀 Quick Start (5 Minutes)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd rekt-ceo-smart-contracts

# Install dependencies
npm install
```

### Step 2: Start Local Blockchain

```bash
# Terminal 1: Start Hardhat local node
npx hardhat node
```

**Keep this terminal running!** You should see output like:

```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
...
```

### Step 3: Run Enhanced Tests

```bash
# Terminal 2: Run comprehensive tests
npx hardhat run scripts/enhanced-test.js --network localhost
```

### Step 4: Deploy Locally

```bash
# Terminal 2: Deploy enhanced contracts
npx hardhat run scripts/enhanced-deploy.js --network localhost
```

## 🔧 Detailed Testing Workflow

### Phase 1: Basic Setup Verification

#### 1.1 Check Installation

```bash
# Verify all dependencies are installed
npm list --depth=0

# Compile contracts
npm run compile
```

#### 1.2 Start Local Network

```bash
# Start Hardhat local node
npx hardhat node
```

#### 1.3 Run Basic Tests

```bash
# Test 1: Enhanced functionality test
npx hardhat run scripts/enhanced-test.js --network localhost

# Test 2: Original simple test
npx hardhat run scripts/simple-test.js --network localhost

# Test 3: Unit tests
npm test
```

### Phase 2: Enhanced Features Testing

#### 2.1 Test Safe Multisig Integration

```bash
# Run enhanced test to verify Safe integration
npx hardhat run scripts/enhanced-test.js --network localhost
```

**Look for:**

- ✅ Safe wallet configuration
- ✅ Royalty recipient setup
- ✅ Multisig address validation

#### 2.2 Test Permit Functionality

```bash
# Test permit functionality (simulated)
npx hardhat run scripts/enhanced-test.js --network localhost
```

**Look for:**

- ✅ Permit data structure
- ✅ Gasless approval simulation
- ✅ Permit function calls

#### 2.3 Test Real-Time Pricing

```bash
# Test dynamic pricing
npx hardhat run scripts/enhanced-test.js --network localhost
```

**Look for:**

- ✅ CEO price updates
- ✅ USDC price updates
- ✅ Price update cooldown
- ✅ Dynamic pricing calculations

#### 2.4 Test USDC Swapping

```bash
# Test USDC swap functionality
npx hardhat run scripts/enhanced-test.js --network localhost
```

**Look for:**

- ✅ USDC swap configuration
- ✅ Swap percentage settings
- ✅ Treasury fund management

#### 2.5 Test Royalty Management

```bash
# Test royalty system
npx hardhat run scripts/enhanced-test.js --network localhost
```

**Look for:**

- ✅ Royalty configuration
- ✅ ERC-2981 compliance
- ✅ Creator tracking
- ✅ Royalty calculations

### Phase 3: Interactive Testing

#### 3.1 Run Interactive Demo

```bash
# Interactive demonstration
npx hardhat run scripts/interact.js --network localhost
```

#### 3.2 Test User Scenarios

```bash
# Test different user scenarios
npx hardhat run scripts/advanced-test.js --network localhost
```

## 📊 Expected Test Results

### Enhanced Test Output

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

### Common Issues and Solutions

#### Issue 1: Node.js Version Error

```bash
# Error: Node.js version not supported
# Solution: Update Node.js
nvm install 20.19.4
nvm use 20.19.4
```

#### Issue 2: Dependencies Not Found

```bash
# Error: Cannot find module
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Issue 3: Contract Compilation Failed

```bash
# Error: Compilation failed
# Solution: Check Solidity version and compile
npm run compile
```

#### Issue 4: Network Connection Error

```bash
# Error: Network connection failed
# Solution: Start local node first
npx hardhat node
# Then run tests in another terminal
```

#### Issue 5: Test Scripts Not Found

```bash
# Error: Script not found
# Solution: Check file paths
ls scripts/
# Should show: enhanced-test.js, enhanced-deploy.js, etc.
```

### Debug Mode

#### Enable Debug Logging

```bash
# Run with debug output
DEBUG=hardhat npx hardhat run scripts/enhanced-test.js --network localhost
```

#### Check Contract State

```bash
# Check contract addresses
cat deployments/enhanced-deployment-*.json
```

## 🔍 Advanced Testing

### Custom Test Scenarios

#### Test 1: Multiple Users

```bash
# Test with multiple users
npx hardhat run scripts/advanced-test.js --network localhost
```

#### Test 2: Edge Cases

```bash
# Test edge cases and error conditions
npx hardhat run scripts/final-test.js --network localhost
```

#### Test 3: Gas Usage

```bash
# Check gas usage
npm run gas-report
```

### Manual Testing

#### Test 1: Contract Interaction

```bash
# Deploy contracts
npx hardhat run scripts/enhanced-deploy.js --network localhost

# Note the contract addresses from output
# Use these addresses to interact with contracts
```

#### Test 2: Frontend Integration

```bash
# Start local development server
npm run dev

# Open browser to http://localhost:3000
# Connect MetaMask to local network (http://127.0.0.1:8545)
# Test wallet connection and contract interaction
```

## 📈 Performance Testing

### Gas Usage Analysis

```bash
# Generate gas report
npm run gas-report

# Check gas usage for each function
npx hardhat run scripts/enhanced-test.js --network localhost
```

### Load Testing

```bash
# Test with multiple transactions
npx hardhat run scripts/advanced-test.js --network localhost
```

## 🚀 Production Readiness Checklist

### Before Deploying to Testnet

- [ ] All local tests pass
- [ ] No compilation errors
- [ ] Gas usage is reasonable
- [ ] All features work as expected
- [ ] Error handling is robust

### Before Deploying to Mainnet

- [ ] Testnet deployment successful
- [ ] Testnet testing complete
- [ ] Contract verification ready
- [ ] Security audit completed
- [ ] Documentation updated
