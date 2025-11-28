const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== Step 5: Deploy Minter Contract ===\n");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Load previous deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run previous steps first!");
        process.exit(1);
    }
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    // Verify all required contracts are present
    if (!deploymentState.ceoToken) {
        console.error("❌ CEO Token address not found. Run step 1 first!");
        process.exit(1);
    }
    if (!deploymentState.pfpCollection) {
        console.error("❌ PFP Collection address not found. Run step 2 first!");
        process.exit(1);
    }
    if (!deploymentState.memeCollection) {
        console.error("❌ Meme Collection address not found. Run step 3 first!");
        process.exit(1);
    }
    if (!deploymentState.usdc) {
        console.error("❌ USDC address not found. Run step 4 first!");
        process.exit(1);
    }
    
    // Configuration
    const TREASURY = process.env.TREASURY_ADDRESS || deployer.address;
    const ADMIN = process.env.ADMIN_ADDRESS || deployer.address;
    
    // Validate addresses
    if (process.env.TREASURY_ADDRESS && !ethers.isAddress(process.env.TREASURY_ADDRESS)) {
        console.error("❌ Invalid TREASURY_ADDRESS provided");
        process.exit(1);
    }
    
    if (process.env.ADMIN_ADDRESS && !ethers.isAddress(process.env.ADMIN_ADDRESS)) {
        console.error("❌ Invalid ADMIN_ADDRESS provided");
        process.exit(1);
    }
    
    console.log("Configuration:");
    console.log("- CEO Token:", deploymentState.ceoToken);
    console.log("- PFP Collection:", deploymentState.pfpCollection);
    console.log("- Meme Collection:", deploymentState.memeCollection);
    console.log("- USDC:", deploymentState.usdc);
    console.log("- Treasury:", TREASURY);
    console.log("- Admin:", ADMIN);
    
    // Check for existing Minter Contract address
    const existingAddress = process.env.MINTER_CONTRACT_ADDRESS || "";
    
    let minterContractAddress;
    let isNewDeployment = false;
    
    if (existingAddress && ethers.isAddress(existingAddress)) {
        console.log("\nUsing existing Minter Contract at:", existingAddress);
        minterContractAddress = existingAddress;
        
        // Get contract instance and display information
        const MinterContract = await ethers.getContractFactory("MinterContract");
        const existingMinter = MinterContract.attach(existingAddress);
        
        console.log("\nExisting Minter Contract Details:");
        console.log("- CEO Token:", await existingMinter.ceoToken());
        console.log("- PFP Collection:", await existingMinter.pfpCollection());
        console.log("- Meme Collection:", await existingMinter.memeCollection());
        console.log("- USDC Token:", await existingMinter.usdcToken());
        console.log("- Treasury:", await existingMinter.treasury());
        console.log("- USDC Swap Enabled:", await existingMinter.usdcSwapEnabled());
        console.log("- USDC Swap Percentage:", (await existingMinter.usdcSwapPercentage()).toString(), "basis points");
        
        const uniswapConfig = await existingMinter.getUniswapConfig();
        console.log("- Uniswap Router:", uniswapConfig.router);
        console.log("- Swap Path:", uniswapConfig.path);
        console.log("- Slippage Tolerance:", uniswapConfig.slippage.toString(), "basis points");
        console.log("- Uniswap Configured:", uniswapConfig.isConfigured);
    } else {
        if (existingAddress && !ethers.isAddress(existingAddress)) {
            console.log("⚠️  Invalid MINTER_CONTRACT_ADDRESS provided, deploying new contract...");
        }
        
        console.log("\nDeploying Minter Contract...");
        const MinterContract = await ethers.getContractFactory("MinterContract");
        const minterContract = await MinterContract.deploy(
            deploymentState.ceoToken,
            deploymentState.pfpCollection,
            deploymentState.memeCollection,
            deploymentState.usdc,
            TREASURY,
            ADMIN
        );
        await minterContract.waitForDeployment();
        minterContractAddress = await minterContract.getAddress();
        isNewDeployment = true;
        console.log("✅ Minter Contract deployed to:", minterContractAddress);
        
    }
    
    // Update deployment state
    deploymentState.minterContract = minterContractAddress;
    deploymentState.minterContractDeployedInThisRun = isNewDeployment;
    deploymentState.lastUpdate = new Date().toISOString();
    
    fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
    console.log("\n✅ Deployment state updated");
    
    console.log("\n=== Minter Contract Deployment Complete ===");
    console.log("Address:", minterContractAddress);
    console.log("Next: Run step 6 to configure contracts");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

