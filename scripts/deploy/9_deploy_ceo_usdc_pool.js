const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Script 9: Deploy CEO/USDC Uniswap V2 Liquidity Pool
 * - Sets arbitrary price (0.000001$ per CEO token)
 * - Uses 50% of CEO tokens from approver balance
 * - Creates liquidity pool on Uniswap V2
 */


// Network-specific Uniswap V2 Router addresses
const UNISWAP_ROUTERS = {
    mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    base: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    sepolia: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3"
};

async function main() {
    console.log("\n=== Step 9: Deploy CEO/USDC Uniswap V2 Pool ===\n");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");
    
    // Load previous deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run previous steps first!");
        process.exit(1);
    }
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    // Verify required contracts are present
    if (!deploymentState.ceoToken) {
        console.error("❌ CEO Token address not found. Run step 1 first!");
        process.exit(1);
    }
    if (!deploymentState.usdc) {
        console.error("❌ USDC address not found. Run step 4 first!");
        process.exit(1);
    }
    if (!deploymentState.configuration || !deploymentState.configuration.admin) {
        console.error("❌ Approver address not found. Run step 6 first!");
        process.exit(1);
    }
    
    const ceoTokenAddress = deploymentState.ceoToken;
    const usdcAddress = deploymentState.usdc;
    const adminAddress = deploymentState.configuration.admin;
    
    console.log("\nConfiguration:");
    console.log("- CEO Token:", ceoTokenAddress);
    console.log("- USDC Token:", usdcAddress);
    console.log("- Approver (liquidity provider):", adminAddress);
    
    // Get network and router address
    const network = await deployer.provider.getNetwork();
    const networkName = network.name === "unknown" ? "hardhat" : network.name;
    const routerAddress = UNISWAP_ROUTERS[networkName];
    
    if (!routerAddress) {
        console.error(`❌ No Uniswap V2 router configured for network: ${networkName}`);
        process.exit(1);
    }
    
    console.log("- Network:", networkName);
    console.log("- Uniswap Router:", routerAddress);
    
    // Get contract instances
    const ceoToken = await ethers.getContractAt("IERC20", ceoTokenAddress);
    const usdc = await ethers.getContractAt("IERC20", usdcAddress);
    const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);
    
    // Check approver's CEO token balance
    const ceoDecimals = await ethers.getContractAt("IERC20Metadata", ceoTokenAddress).then(c => c.decimals());
    const usdcDecimals = await ethers.getContractAt("IERC20Metadata", usdcAddress).then(c => c.decimals());
    
    console.log("\n--- Checking Approver Balances ---");
    
    // If deployer is not approver, we need to check approver's balance
    let approverCEOBalance;
    let approverUSDCBalance;
    
    if (deployer.address.toLowerCase() === adminAddress.toLowerCase()) {
        approverCEOBalance = await ceoToken.balanceOf(deployer.address);
        approverUSDCBalance = await usdc.balanceOf(deployer.address);
    } else {
        // Get balance from approver address
        approverCEOBalance = await ceoToken.balanceOf(adminAddress);
        approverUSDCBalance = await usdc.balanceOf(adminAddress);
        console.log("⚠️  Note: Deployer is different from approver");
        console.log("   This script requires deployer to be the approver for liquidity provision");
        
        if (deployer.address.toLowerCase() !== adminAddress.toLowerCase()) {
            console.error("❌ Error: Current signer must be the approver to provide liquidity!");
            console.error(`   Expected: ${adminAddress}`);
            console.error(`   Got: ${deployer.address}`);
            process.exit(1);
        }
    }
    
    console.log("Approver CEO Balance:", ethers.formatUnits(approverCEOBalance, ceoDecimals), "CEO");
    console.log("Approver USDC Balance:", ethers.formatUnits(approverUSDCBalance, usdcDecimals), "USDC");
    
    if (approverCEOBalance === 0n) {
        console.error("❌ Approver has no CEO tokens! Cannot create liquidity pool.");
        process.exit(1);
    }
    
    // Calculate amounts for liquidity pool
    // Target price: 1 CEO = 0.000001 USDC (or 1 million CEO = 1 USDC)
    // We'll use 50% of approver's CEO balance
    const ceoLiquidityAmount = approverCEOBalance / 2n;
    
    // Calculate required USDC based on target price
    // Price = 0.000001 USDC per CEO
    // For ceoLiquidityAmount CEO tokens, we need:
    // USDC = ceoLiquidityAmount * 0.000001
    
    // Convert to proper decimals:
    // ceoLiquidityAmount is in CEO decimals (18)
    // USDC is in 6 decimals
    // Price: 0.000001 = 1/1000000
    
    const usdcLiquidityAmount = (ceoLiquidityAmount * BigInt(10 ** Number(usdcDecimals))) / (BigInt(1000000) * BigInt(10 ** Number(ceoDecimals)));
    
    console.log("\n--- Liquidity Pool Parameters ---");
    console.log("Target Price: 1 CEO = 0.000001 USDC");
    console.log("CEO Amount (50% of balance):", ethers.formatUnits(ceoLiquidityAmount, ceoDecimals), "CEO");
    console.log("USDC Amount (calculated):", ethers.formatUnits(usdcLiquidityAmount, usdcDecimals), "USDC");
    
    // Verify approver has enough USDC
    if (approverUSDCBalance < usdcLiquidityAmount) {
        console.error("\n❌ Insufficient USDC balance!");
        console.error(`   Required: ${ethers.formatUnits(usdcLiquidityAmount, usdcDecimals)} USDC`);
        console.error(`   Available: ${ethers.formatUnits(approverUSDCBalance, usdcDecimals)} USDC`);
        console.error("\n💡 You can:");
        console.error("   1. Mint more USDC (if using mock USDC)");
        console.error("   2. Reduce CEO amount for liquidity");
        console.error("   3. Acquire more USDC");
        process.exit(1);
    }
    
    // Check if pool already exists and create if needed
    const factory = await router.factory();
    const factoryContract = await ethers.getContractAt(
        [
            "function getPair(address,address) external view returns (address)",
            "function createPair(address,address) external returns (address)"
        ],
        factory
    );
    
    let pairAddress = await factoryContract.getPair(ceoTokenAddress, usdcAddress);
    
    if (pairAddress === ethers.ZeroAddress) {
        console.log("\n--- Creating Liquidity Pair ---");
        console.log("No existing pair found. Creating new pair...");
        
        const createPairTx = await factoryContract.createPair(ceoTokenAddress, usdcAddress);
        console.log("⏳ Waiting for pair creation...");
        console.log("Transaction hash:", createPairTx.hash);
        
        const createReceipt = await createPairTx.wait();
        console.log("✅ Pair created successfully!");
        console.log(`   Block: ${createReceipt.blockNumber}`);
        console.log(`   Gas used: ${createReceipt.gasUsed.toString()}`);
        
        // Get the pair address after creation
        pairAddress = await factoryContract.getPair(ceoTokenAddress, usdcAddress);
        console.log(`   Pair Address: ${pairAddress}`);
    } else {
        console.log("\n⚠️  Warning: Liquidity pool already exists at:", pairAddress);
        console.log("   This script will ADD liquidity to the existing pool");
        console.log("   The price will be determined by existing pool ratios");
        
        // Get current reserves
        const pair = await ethers.getContractAt(
            [
                "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
                "function token0() external view returns (address)",
                "function token1() external view returns (address)"
            ],
            pairAddress
        );
        
        const token0 = await pair.token0();
        const token1 = await pair.token1();
        const reserves = await pair.getReserves();
        
        const isCEOToken0 = token0.toLowerCase() === ceoTokenAddress.toLowerCase();
        const ceoReserve = isCEOToken0 ? reserves[0] : reserves[1];
        const usdcReserve = isCEOToken0 ? reserves[1] : reserves[0];
        
        console.log("\n   Current Pool Reserves:");
        console.log(`   - CEO: ${ethers.formatUnits(ceoReserve, ceoDecimals)}`);
        console.log(`   - USDC: ${ethers.formatUnits(usdcReserve, usdcDecimals)}`);
        
        // Only calculate price if reserves exist
        if (ceoReserve > 0n && usdcReserve > 0n) {
            const currentPrice = (BigInt(usdcReserve) * BigInt(10 ** Number(ceoDecimals))) / BigInt(ceoReserve);
            console.log(`   - Current Price: 1 CEO = ${ethers.formatUnits(currentPrice, usdcDecimals)} USDC\n`);
        } else {
            console.log(`   - Current Price: Pool has no liquidity yet\n`);
        }
    }
    
    try {
        // Step 1: Approve router to spend tokens
        console.log("\n--- Approving Tokens ---");
        
        console.log("Approving CEO tokens...");
        const approveCEOTx = await ceoToken.approve(routerAddress, ceoLiquidityAmount);
        await approveCEOTx.wait();
        console.log("✅ CEO tokens approved");
        
        console.log("Approving USDC tokens...");
        const approveUSDCTx = await usdc.approve(routerAddress, usdcLiquidityAmount);
        await approveUSDCTx.wait();
        console.log("✅ USDC tokens approved");
        
        // Step 2: Add liquidity
        console.log("\n--- Adding Liquidity to Pool ---");
        
        // Set minimum amounts (95% of desired to account for slippage)
        const minCEO = (ceoLiquidityAmount * 95n) / 100n;
        const minUSDC = (usdcLiquidityAmount * 95n) / 100n;
        
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
        
        console.log("Adding liquidity...");
        console.log(`- CEO Amount: ${ethers.formatUnits(ceoLiquidityAmount, ceoDecimals)}`);
        console.log(`- USDC Amount: ${ethers.formatUnits(usdcLiquidityAmount, usdcDecimals)}`);
        console.log(`- Min CEO (95%): ${ethers.formatUnits(minCEO, ceoDecimals)}`);
        console.log(`- Min USDC (95%): ${ethers.formatUnits(minUSDC, usdcDecimals)}`);
        console.log(`- Deadline: ${new Date(deadline * 1000).toISOString()}`);
        
        const addLiquidityTx = await router.addLiquidity(
            ceoTokenAddress,
            usdcAddress,
            ceoLiquidityAmount,
            usdcLiquidityAmount,
            minCEO,
            minUSDC,
            deployer.address,
            deadline,
            {
                gasLimit: 500000 // Set explicit gas limit
            }
        );
        
        console.log("\n⏳ Waiting for transaction confirmation...");
        console.log("Transaction hash:", addLiquidityTx.hash);
        
        const receipt = await addLiquidityTx.wait();
        console.log("✅ Liquidity added successfully!");
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
        console.log(`   Pair Address: ${pairAddress}`);
        
        // Get final balances
        const finalCEO = await ceoToken.balanceOf(deployer.address);
        const finalUSDC = await usdc.balanceOf(deployer.address);
        
        console.log("\n--- Final Balances ---");
        console.log("Approver CEO Balance:", ethers.formatUnits(finalCEO, ceoDecimals), "CEO");
        console.log("Approver USDC Balance:", ethers.formatUnits(finalUSDC, usdcDecimals), "USDC");
        
        // Update deployment state
        deploymentState.uniswapPool = {
            pairAddress: pairAddress,
            ceoAmount: ceoLiquidityAmount.toString(),
            usdcAmount: usdcLiquidityAmount.toString(),
            targetPrice: "0.000001",
            deployedAt: new Date().toISOString(),
            transactionHash: addLiquidityTx.hash,
            blockNumber: receipt.blockNumber
        };
        deploymentState.lastUpdate = new Date().toISOString();
        
        fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
        console.log("\n✅ Deployment state updated");
        
        console.log("\n=== CEO/USDC Pool Deployment Complete ===");
        console.log("Pair Address:", pairAddress);
        console.log("Next: Run step 10 to configure Uniswap in minter contract");
        
    } catch (error) {
        console.error("\n❌ Liquidity deployment failed:", error.message);
        if (error.reason) {
            console.error(`   Reason: ${error.reason}`);
        }
        if (error.code) {
            console.error(`   Code: ${error.code}`);
        }
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

