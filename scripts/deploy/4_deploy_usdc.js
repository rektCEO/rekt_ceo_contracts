const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== Step 4: Deploy/Configure USDC ===\n");
    
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
    
    // Check for existing USDC address
    const existingAddress = process.env.USDC_ADDRESS || "";
    
    let usdcAddress;
    let isNewDeployment = false;
    
    if (existingAddress && ethers.isAddress(existingAddress)) {
        console.log("\nUsing existing USDC at:", existingAddress);
        usdcAddress = existingAddress;
        
        // Get contract instance and display information
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const existingUsdc = MockERC20.attach(existingAddress);
        
        console.log("\nExisting USDC Details:");
        console.log("- Name:", await existingUsdc.name());
        console.log("- Symbol:", await existingUsdc.symbol());
        console.log("- Decimals:", await existingUsdc.decimals());
        const totalSupply = await existingUsdc.totalSupply();
        const decimals = await existingUsdc.decimals();
        console.log("- Total Supply:", ethers.formatUnits(totalSupply, decimals));
    } else {
        if (existingAddress && !ethers.isAddress(existingAddress)) {
            console.log("⚠️  Invalid USDC_ADDRESS provided, deploying mock USDC...");
        }
        
        console.log("\nDeploying Mock USDC (for testing)...");
        console.log("⚠️  This is a mock token! Use real USDC address for production.");
        
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("Mock USDC", "USDC");
        await usdc.waitForDeployment();
        usdcAddress = await usdc.getAddress();
        isNewDeployment = true;
        console.log("✅ Mock USDC deployed to:", usdcAddress);
    }
    
    // Update deployment state
    deploymentState.usdc = usdcAddress;
    deploymentState.usdcDeployedInThisRun = isNewDeployment;
    deploymentState.lastUpdate = new Date().toISOString();
    
    fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
    console.log("\n✅ Deployment state updated");
    
    // Display deployer's USDC balance
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcContract = MockERC20.attach(usdcAddress);
    const deployerBalance = await usdcContract.balanceOf(deployer.address);
    const decimals = await usdcContract.decimals();
    console.log("\n📊 Deployer's USDC Balance:", ethers.formatUnits(deployerBalance, decimals), "USDC");
    
    console.log("\n=== USDC Configuration Complete ===");
    console.log("Address:", usdcAddress);
    console.log("Next: Run step 5 to deploy Minter Contract");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

