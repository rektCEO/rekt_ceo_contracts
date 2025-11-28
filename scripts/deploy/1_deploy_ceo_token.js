const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== Step 1: Deploy CEO Token ===\n");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");
    
    // Check for existing CEO Token address from environment
    const existingAddress = process.env.CEO_TOKEN_ADDRESS || "";
    
    let ceoTokenAddress;
    let isNewDeployment = false;
    
    if (existingAddress && ethers.isAddress(existingAddress)) {
        console.log("Using existing CEO Token at:", existingAddress);
        ceoTokenAddress = existingAddress;
    } else {
        if (existingAddress && !ethers.isAddress(existingAddress)) {
            console.log("⚠️  Invalid CEO_TOKEN_ADDRESS provided, deploying new token...");
        }
        
        console.log("Deploying new CEO Token...");
        const CEOToken = await ethers.getContractFactory("CEOToken");
        const ceoToken = await CEOToken.deploy(deployer.address);
        await ceoToken.waitForDeployment();
        ceoTokenAddress = await ceoToken.getAddress();
        isNewDeployment = true;
        console.log("✅ CEO Token deployed to:", ceoTokenAddress);
    }
    
    // Save deployment info
    const network = await deployer.provider.getNetwork();
    const deploymentState = {
        network: {
            name: network.name,
            chainId: network.chainId.toString()
        },
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        ceoToken: ceoTokenAddress,
        ceoTokenDeployedInThisRun: isNewDeployment
    };
    
    const stateFile = path.join(__dirname, 'deployment-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
    console.log("\n✅ Deployment state saved to:", stateFile);
    
    // Display deployer's CEO token balance
    const CEOToken = await ethers.getContractFactory("CEOToken");
    const ceoTokenContract = CEOToken.attach(ceoTokenAddress);
    const deployerBalance = await ceoTokenContract.balanceOf(deployer.address);
    const decimals = await ceoTokenContract.decimals();
    console.log("\n📊 Deployer's CEO Token Balance:", ethers.formatUnits(deployerBalance, decimals), "CEO");
    
    console.log("\n=== CEO Token Deployment Complete ===");
    console.log("Address:", ceoTokenAddress);
    console.log("Next: Run step 2 to deploy PFP Collection");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

