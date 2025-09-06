# Rekt CEO Smart Contracts

This repository contains the smart contracts for the Rekt CEO project's PFP (Profile Picture) and Meme NFT minting platform. The system enables users to design and mint unique NFTs by paying with $CEO tokens, increasing token demand and fostering community engagement.

## 🏗️ Architecture

The system consists of four main smart contracts:

1. **CEOToken** - ERC-20 token with permit functionality and dev wallet lock mechanism
2. **PFPCollection** - ERC-721 NFT collection for Profile Picture NFTs (999 max supply)
3. **MemeCollection** - ERC-721 NFT collection for Meme NFTs (9,999 max supply)
4. **MinterContract** - Central contract handling payment processing and tiered pricing

## 📋 Features

### CEO Token ($CEO)
- **Max Supply**: 21,000,000 tokens
- **Dev Allocation**: 3% (630,000 tokens) locked for 3 years
- **Community Supply**: 97% (20,370,000 tokens) to treasury
- **Permit Function**: Gasless approvals using EIP-2612
- **Stuck Token Recovery**: Admin can recover stuck tokens

### PFP Collection
- **Max Supply**: 999 NFTs
- **User Limit**: 2 NFTs per user
- **Access Control**: Only MINTER contract can mint
- **Metadata**: External URI storage

### Meme Collection
- **Max Supply**: 9,999 NFTs
- **User Limit**: 9 NFTs per user
- **Access Control**: Only MINTER contract can mint
- **Metadata**: External URI storage

### Minter Contract
- **Tiered Pricing**: 3 tiers for each NFT type
  - PFP: $50, $150, $250 (USD pegged)
  - Meme: $5, $15, $25 (USD pegged)
- **Dynamic Pricing**: CEO token price adjustable by admin
- **Role-Based Access**: Admin, Approver (backend), Rescuer roles
- **Fund Management**: Automatic treasury collection

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Hardhat

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd rekt-ceo-smart-contracts
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp env.example .env
```

4. Update `.env` with your configuration:
```env
PRIVATE_KEY=your_private_key_here
BSCSCAN_API_KEY=your_bscscan_api_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

### Compilation

```bash
npm run compile
```

### Testing

```bash
# Quick system test (recommended)
npx hardhat run scripts/simple-test.js

# Run all unit tests
npm test

# Interactive demo
npx hardhat run scripts/interact.js
```

### Deployment

#### Local Network
```bash
npm run node
# In another terminal
npm run deploy
```

#### BNB Smart Chain Testnet
```bash
npm run deploy:bsc-testnet
```

#### BNB Smart Chain Mainnet
```bash
npm run deploy:bsc
```

#### Other Networks
```bash
npm run deploy:ethereum    # Ethereum Mainnet
npm run deploy:sepolia     # Ethereum Sepolia Testnet
npm run deploy:polygon     # Polygon Mainnet
npm run deploy:mumbai      # Polygon Mumbai Testnet
```

## 📁 Project Structure

```
├── contracts/              # Smart contracts
│   ├── CEOToken.sol       # ERC-20 token contract
│   ├── PFPCollection.sol  # PFP NFT collection
│   ├── MemeCollection.sol # Meme NFT collection
│   ├── MinterContract.sol # Main minter contract
│   └── MockERC20.sol      # Mock token for testing
├── scripts/               # Deployment and testing scripts
│   ├── deploy.js          # Main deployment script
│   ├── interact.js        # Interactive demo script
│   ├── simple-test.js     # Quick system verification
│   ├── advanced-test.js   # Comprehensive testing
│   └── final-test.js      # Production readiness test
├── test/                  # Unit test files
│   ├── CEOToken.test.js   # CEO token unit tests
│   ├── PFPCollection.test.js # PFP collection unit tests
│   ├── MemeCollection.test.js # Meme collection unit tests
│   ├── MinterContract.test.js # Minter contract unit tests
│   └── Basic.test.js      # Basic functionality tests
├── deployments/           # Deployment records (auto-generated)
├── hardhat.config.js      # Hardhat configuration
├── package.json           # Dependencies and scripts
├── env.example            # Environment variables template
└── README.md             # This file
```

## 🔧 Configuration

### Deployment Configuration

Update the deployment configuration in `scripts/deploy.js`:

```javascript
const DEPLOYMENT_CONFIG = {
    admin: "0x...",           // Multisig recommended
    treasury: "0x...",        // Treasury wallet
    devWallet: "0x...",       // Dev wallet
    approver: "0x...",        // Backend wallet
    rescuer: "0x...",         // Rescuer wallet
    pfpName: "Rekt CEO PFPs",
    pfpSymbol: "RCPFP",
    memeName: "Rekt CEO Memes",
    memeSymbol: "RCMEME"
};
```

### Network Configuration

Supported networks in `hardhat.config.js`:
- **BSC Mainnet** (Chain ID: 56)
- **BSC Testnet** (Chain ID: 97)
- **Ethereum Mainnet** (Chain ID: 1)
- **Ethereum Sepolia** (Chain ID: 11155111)
- **Polygon Mainnet** (Chain ID: 137)
- **Polygon Mumbai** (Chain ID: 80001)

## 🔐 Security Features

### Access Control
- **Admin Role**: Full administrative control
- **Approver Role**: Backend wallet for minting
- **Rescuer Role**: Emergency token recovery

### Dev Wallet Protection
- 3-year lock period for dev allocation
- Prevents premature token transfers
- Automatic unlock after lock period

### Reentrancy Protection
- All external calls protected with `nonReentrant`
- Safe token transfers using OpenZeppelin's SafeERC20

### Input Validation
- Comprehensive parameter validation
- Zero address checks
- Supply limit enforcement

## 🧪 Testing

The project includes comprehensive testing to ensure all features work correctly. Here's how to test everything locally:

### Test Suite Overview

The test suite covers:
- Contract deployment and initialization
- Role-based access control
- NFT minting and limits
- Payment processing
- Tier management
- Emergency functions
- Edge cases and error conditions
- Multi-user scenarios
- NFT transfers
- Fund management

### Running Tests

#### 1. Basic Unit Tests
```bash
# Run all tests
npm test

# Run specific test files
npx hardhat test test/CEOToken.test.js
npx hardhat test test/PFPCollection.test.js
npx hardhat test test/MemeCollection.test.js
npx hardhat test test/MinterContract.test.js

# Run basic functionality test
npx hardhat test test/Basic.test.js
```

#### 2. Comprehensive System Tests
```bash
# Run simple system test (recommended for quick verification)
npx hardhat run scripts/simple-test.js

# Run interactive demo
npx hardhat run scripts/interact.js

# Run advanced test (comprehensive testing)
npx hardhat run scripts/advanced-test.js

# Run final test (complete system verification)
npx hardhat run scripts/final-test.js
```

### Test Scripts Explained

#### `scripts/simple-test.js` - Quick System Verification
Tests the core functionality:
- ✅ Contract deployment
- ✅ Basic system parameters
- ✅ Pricing system
- ✅ Minting flow
- ✅ Mint limits enforcement
- ✅ Payment processing
- ✅ NFT transfers
- ✅ Access control
- ✅ Final statistics

#### `scripts/interact.js` - Interactive Demo
Demonstrates the complete user flow:
- Contract deployment and configuration
- CEO token distribution
- NFT minting with different tiers
- Mint limit enforcement
- Payment processing
- Fund accumulation

#### `scripts/advanced-test.js` - Comprehensive Testing
Tests advanced scenarios:
- Multiple user interactions
- Different pricing tiers
- Edge cases and error conditions
- Fund withdrawal
- Access control scenarios
- Complete system statistics

#### `scripts/final-test.js` - Production Readiness
Final verification before deployment:
- All core features
- Multi-user scenarios
- Error handling
- Complete system integration

### Expected Test Results

When all tests pass, you should see:
```
=== 🎉 ALL TESTS PASSED! 🎉 ===
✅ CEO Token: Working perfectly
✅ PFP Collection: Working perfectly
✅ Meme Collection: Working perfectly
✅ Minter Contract: Working perfectly
✅ Pricing System: Working perfectly
✅ Mint Limits: Working perfectly
✅ Access Control: Working perfectly
✅ Payment Processing: Working perfectly
✅ NFT Transfers: Working perfectly

🚀 System is ready for production deployment! 🚀
```

### Test Coverage

The tests verify:

**CEO Token Features:**
- 21M max supply with 97% to treasury, 3% to dev
- Dev wallet 3-year lock mechanism
- Permit function for gasless approvals
- Stuck token recovery

**PFP Collection Features:**
- 999 max supply
- 2 NFTs per user limit
- Role-based access control
- Metadata URI storage

**Meme Collection Features:**
- 9,999 max supply
- 9 NFTs per user limit
- Role-based access control
- Metadata URI storage

**Minter Contract Features:**
- Tiered pricing (PFP: $50/$150/$250, Meme: $5/$15/$25)
- Dynamic CEO token pricing
- Payment processing
- Fund accumulation
- Role-based access (Admin, Approver, Rescuer)

### Local Testing Setup

1. **Start Local Node (Optional):**
```bash
npx hardhat node
```

2. **Run Tests on Hardhat Network:**
```bash
npx hardhat run scripts/simple-test.js
```

3. **Run Tests on Local Node:**
```bash
npx hardhat run scripts/simple-test.js --network localhost
```

### Troubleshooting Tests

If tests fail:
1. Ensure Node.js version is 16+ (use `nvm use 20.19.4`)
2. Run `npm install` to ensure dependencies are installed
3. Run `npm run compile` to ensure contracts compile
4. Check that all test scripts are in the `scripts/` directory

### Test Output Example

Successful test run shows:
```
=== Simple Rekt CEO System Test ===

Owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
User1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
User2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

=== Deploying Contracts ===
✅ All contracts deployed and configured

=== Test 1: Basic System Check ===
CEO Token - Total Supply: 20370000.0
CEO Token - Max Supply: 21000000.0
PFP Collection - Max Supply: 999
Meme Collection - Max Supply: 9999
✅ Basic system parameters correct

=== Test 2: Pricing System ===
PFP Tier 1 price: 50.0 CEO tokens ($50)
Meme Tier 1 price: 5.0 CEO tokens ($5)
✅ Pricing system working correctly

=== Test 3: Minting Flow ===
PFP #1 minted to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
PFP #1 URI: https://example.com/pfp/1
Meme #1 minted to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Meme #1 URI: https://example.com/meme/1
✅ Minting flow working correctly

=== Test 4: Mint Limits ===
Owner PFP count: 2
✅ Correctly blocked from minting 3rd PFP
✅ Mint limits working correctly

=== Test 5: Payment Processing ===
Owner CEO balance: 20369895.0
Minter contract balance: 105.0
✅ Payment processing working correctly

=== Test 6: NFT Transfers ===
PFP #1 transferred to: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
✅ NFT transfers working correctly

=== Test 7: Access Control ===
✅ User1 correctly blocked (no approver role)
✅ Access control working correctly

=== Test 8: Final Statistics ===
Total PFPs minted: 2
Total Memes minted: 1
PFP remaining supply: 997
Meme remaining supply: 9998

=== 🎉 ALL TESTS PASSED! 🎉 ===
```

### Testing Workflow

**Recommended Testing Order:**

1. **Start with Simple Test:**
   ```bash
   npx hardhat run scripts/simple-test.js
   ```
   This verifies all core functionality quickly.

2. **Run Unit Tests:**
   ```bash
   npm test
   ```
   Ensures individual contract functions work correctly.

3. **Interactive Demo:**
   ```bash
   npx hardhat run scripts/interact.js
   ```
   Shows the complete user experience.

4. **Advanced Testing (Optional):**
   ```bash
   npx hardhat run scripts/advanced-test.js
   ```
   Comprehensive testing for edge cases.

5. **Final Verification:**
   ```bash
   npx hardhat run scripts/final-test.js
   ```
   Production readiness check.

### Testing Best Practices

- **Always test locally first** before deploying to testnet
- **Run simple-test.js** for quick verification after changes
- **Use different test scripts** for different scenarios
- **Check test output** for any error messages
- **Verify all ✅ checkmarks** appear in test results

### Common Test Scenarios

The test scripts cover these scenarios:

1. **Happy Path Testing:**
   - Successful contract deployment
   - Normal NFT minting flow
   - Payment processing
   - NFT transfers

2. **Edge Case Testing:**
   - Mint limit enforcement
   - Access control violations
   - Insufficient funds
   - Invalid parameters

3. **Multi-User Testing:**
   - Multiple users minting
   - Different pricing tiers
   - Concurrent operations

4. **Security Testing:**
   - Role-based access control
   - Reentrancy protection
   - Input validation

## 📊 Gas Optimization

- **Optimizer**: Enabled with 200 runs
- **Solidity Version**: 0.8.19
- **Libraries**: OpenZeppelin contracts v4.9.3
- **Gas Reporting**: Available with `npm run gas-report`

## 🔍 Verification

Verify contracts on block explorer:

```bash
npx hardhat verify --network bsc <contract-address> <constructor-args>
```


