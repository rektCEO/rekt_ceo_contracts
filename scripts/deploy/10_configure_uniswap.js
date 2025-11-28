const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Script 10: Configure Uniswap in Minter Contract
 * - Sets Uniswap V2 router address
 * - Configures swap path (CEO -> USDC)
 * - Sets slippage tolerance
 * - Verifies configuration
 */

// Network-specific Uniswap V2 Router addresses
const UNISWAP_ROUTERS = {
    mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    base: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    sepolia: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3"
};

async function main() {
    console.log("\n=== Step 10: Configure Uniswap in Minter Contract ===\n");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Configuring with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");
    
    // Load previous deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run previous steps first!");
        process.exit(1);
    }
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    // Verify required contracts are present
    if (!deploymentState.minterContract) {
        console.error("❌ Minter Contract address not found. Run step 5 first!");
        process.exit(1);
    }
    if (!deploymentState.ceoToken) {
        console.error("❌ CEO Token address not found. Run step 1 first!");
        process.exit(1);
    }
    if (!deploymentState.usdc) {
        console.error("❌ USDC address not found. Run step 4 first!");
        process.exit(1);
    }
    if (!deploymentState.uniswapPool) {
        console.log("⚠️  Warning: Uniswap pool not found in deployment state.");
        console.log("   Make sure you've run step 9 to create the CEO/USDC pool!");
        console.log("   Continuing with configuration anyway...\n");
    }
    
    const minterAddress = deploymentState.minterContract;
    const ceoTokenAddress = deploymentState.ceoToken;
    const usdcAddress = deploymentState.usdc;
    
    console.log("Configuration:");
    console.log("- Minter Contract:", minterAddress);
    console.log("- CEO Token:", ceoTokenAddress);
    console.log("- USDC Token:", usdcAddress);
    
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
    
    if (deploymentState.uniswapPool) {
        console.log("- Pool Address:", deploymentState.uniswapPool.pairAddress);
        console.log("- Target Price:", deploymentState.uniswapPool.targetPrice, "USDC per CEO");
    }
    
    // Get contract instance
    const MinterContract = await ethers.getContractFactory("MinterContract");
    const minterContract = MinterContract.attach(minterAddress);
    
    // Check current configuration
    console.log("\n--- Current Uniswap Configuration ---");
    const currentConfig = await minterContract.getUniswapConfig();
    console.log("Router:", currentConfig.router);
    console.log("Swap Path:", currentConfig.path.length > 0 ? currentConfig.path.join(" -> ") : "Not set");
    console.log("Slippage:", currentConfig.slippage.toString(), "bps (" + (Number(currentConfig.slippage) / 100) + "%)");
    console.log("Is Configured:", currentConfig.isConfigured);
    
    // Check USDC swap settings
    const usdcSwapEnabled = await minterContract.usdcSwapEnabled();
    const usdcSwapPercentage = await minterContract.usdcSwapPercentage();
    console.log("\nUSDC Swap Settings:");
    console.log("- Enabled:", usdcSwapEnabled);
    console.log("- Percentage:", usdcSwapPercentage.toString(), "bps (" + (Number(usdcSwapPercentage) / 100) + "%)");
    
    // Check if already configured
    if (currentConfig.isConfigured && 
        currentConfig.router.toLowerCase() === routerAddress.toLowerCase() &&
        currentConfig.path.length === 2 &&
        currentConfig.path[0].toLowerCase() === ceoTokenAddress.toLowerCase() &&
        currentConfig.path[1].toLowerCase() === usdcAddress.toLowerCase()) {
        console.log("\n✅ Uniswap is already properly configured!");
        console.log("   Skipping configuration step...");
        
        // Still update deployment state
        if (!deploymentState.uniswapConfigured) {
            deploymentState.uniswapConfigured = true;
            deploymentState.lastUpdate = new Date().toISOString();
            fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
        }
        
        console.log("\n=== Uniswap Configuration Already Complete ===");
        console.log("Next: Run step 11 to test minting and verify balances");
        return;
    }
    
    try {
        // Prepare configuration
        const swapPath = [ceoTokenAddress, usdcAddress]; // Direct path: CEO -> USDC
        const slippageTolerance = 100; // 1% (100 basis points)
        
        console.log("\n--- New Configuration ---");
        console.log("Router:", routerAddress);
        console.log("Swap Path:", swapPath.join(" -> "));
        console.log("Slippage Tolerance:", slippageTolerance, "bps (" + (slippageTolerance / 100) + "%)");
        
        // Verify deployer has ADMIN_ROLE
        const adminRole = await minterContract.ADMIN_ROLE();
        const hasAdminRole = await minterContract.hasRole(adminRole, deployer.address);
        
        if (!hasAdminRole) {
            console.error("\n❌ Error: Deployer does not have ADMIN_ROLE!");
            console.error(`   Required role: ADMIN_ROLE`);
            console.error(`   Current address: ${deployer.address}`);
            console.error("\n💡 Grant ADMIN_ROLE to this address or use an account with ADMIN_ROLE");
            process.exit(1);
        }
        
        console.log("\n✅ Deployer has ADMIN_ROLE");
        
        // Set Uniswap configuration
        console.log("\n--- Setting Uniswap Configuration ---");
        console.log("Sending transaction...");
        
        const tx = await minterContract.setUniswapConfig(
            routerAddress,
            swapPath,
            slippageTolerance,
            {
                gasLimit: 200000 // Set explicit gas limit
            }
        );
        
        console.log("Transaction hash:", tx.hash);
        console.log("⏳ Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("✅ Configuration successful!");
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
        
        // Verify new configuration
        console.log("\n--- Verifying New Configuration ---");
        const newConfig = await minterContract.getUniswapConfig();
        console.log("✓ Router:", newConfig.router);
        console.log("✓ Swap Path:", newConfig.path.join(" -> "));
        console.log("✓ Slippage:", newConfig.slippage.toString(), "bps (" + (Number(newConfig.slippage) / 100) + "%)");
        console.log("✓ Is Configured:", newConfig.isConfigured);
        
        // Verify configuration matches
        if (newConfig.router.toLowerCase() !== routerAddress.toLowerCase()) {
            console.error("❌ Router address mismatch!");
            process.exit(1);
        }
        if (newConfig.path.length !== 2 || 
            newConfig.path[0].toLowerCase() !== ceoTokenAddress.toLowerCase() ||
            newConfig.path[1].toLowerCase() !== usdcAddress.toLowerCase()) {
            console.error("❌ Swap path mismatch!");
            process.exit(1);
        }
        if (newConfig.slippage.toString() !== slippageTolerance.toString()) {
            console.error("❌ Slippage tolerance mismatch!");
            process.exit(1);
        }
        
        console.log("\n✅ All configuration values verified!");
        
        // Test price query from DEX
        console.log("\n--- Testing Price Query from DEX ---");
        try {
            const ceoPriceFromDEX = await minterContract.queryCEOPriceFromDEX();
            console.log("✅ CEO Price from DEX:", ethers.formatUnits(ceoPriceFromDEX, 6), "USDC per CEO");
            
            // Calculate effective price
            const effectivePricePerCEO = Number(ethers.formatUnits(ceoPriceFromDEX, 6));
            console.log(`   (1 CEO = ${effectivePricePerCEO} USDC)`);
            
            if (effectivePricePerCEO > 0) {
                console.log(`   (1 USDC = ${(1 / effectivePricePerCEO).toFixed(2)} CEO)`);
            }
        } catch (error) {
            console.error("❌ Failed to query price from DEX:", error.message);
            console.error("   This might indicate issues with the liquidity pool or swap path");
            console.error("   Make sure the CEO/USDC pool has liquidity (run step 9)");
            // Don't exit - configuration is still valid
        }
        
        // Update deployment state
        deploymentState.uniswapConfigured = true;
        deploymentState.uniswapConfiguration = {
            router: routerAddress,
            swapPath: swapPath,
            slippageTolerance: slippageTolerance,
            configuredAt: new Date().toISOString(),
            transactionHash: tx.hash,
            blockNumber: receipt.blockNumber
        };
        deploymentState.lastUpdate = new Date().toISOString();
        
        fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
        console.log("\n✅ Deployment state updated");
        
        console.log("\n=== Uniswap Configuration Complete ===");
        console.log("Minter Contract:", minterAddress);
        console.log("Router:", routerAddress);
        console.log("Swap Path:", swapPath.join(" -> "));
        console.log("\n💡 The minter contract is now configured to:");
        console.log("   - Swap 50% of CEO payments to USDC");
        console.log("   - Send 50% of CEO directly to treasury");
        console.log("   - Use 1% slippage tolerance for swaps");
        console.log("\nNext: Run step 11 to test minting and verify balances");
        
    } catch (error) {
        console.error("\n❌ Configuration failed:", error.message);
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
        console.error("❌ Configuration failed:", error);
        process.exit(1);
    });

