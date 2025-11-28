const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== Step 2: Deploy PFP Collection ===\n");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Load previous deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run step 1 first!");
        process.exit(1);
    }
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    // Configuration
    const PFP_NAME = "Rekt CEO PFPs";
    const PFP_SYMBOL = "RCPFP";
    const PFP_MAX_SUPPLY = 999;
    const PFP_MAX_MINT_PER_USER = 2;
    const ROYALTY_PERCENTAGE = 210; // 2.1%
    
    const ADMIN = process.env.ADMIN_ADDRESS || deployer.address;
    const SAFE_WALLET = process.env.SAFE_WALLET_ADDRESS || deployer.address;
    
    // Validate admin address
    if (process.env.ADMIN_ADDRESS && !ethers.isAddress(process.env.ADMIN_ADDRESS)) {
        console.error("❌ Invalid ADMIN_ADDRESS provided");
        process.exit(1);
    }
    
    // Validate safe wallet address
    if (process.env.SAFE_WALLET_ADDRESS && !ethers.isAddress(process.env.SAFE_WALLET_ADDRESS)) {
        console.error("❌ Invalid SAFE_WALLET_ADDRESS provided");
        process.exit(1);
    }
    
    console.log("Configuration:");
    console.log("- Name:", PFP_NAME);
    console.log("- Symbol:", PFP_SYMBOL);
    console.log("- Max Supply:", PFP_MAX_SUPPLY);
    console.log("- Max Mint Per User:", PFP_MAX_MINT_PER_USER);
    console.log("- Admin:", ADMIN);
    console.log("- Safe Wallet:", SAFE_WALLET);
    console.log("- Royalty:", ROYALTY_PERCENTAGE / 100, "%");
    
    // Check for existing PFP Collection address
    const existingAddress = process.env.PFP_COLLECTION_ADDRESS || "";
    
    let pfpCollectionAddress;
    let isNewDeployment = false;
    
    if (existingAddress && ethers.isAddress(existingAddress)) {
        console.log("\nUsing existing PFP Collection at:", existingAddress);
        pfpCollectionAddress = existingAddress;
        
        // Get contract instance and display information
        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        const existingCollection = NFTCollection.attach(existingAddress);
        
        console.log("\nExisting PFP Collection Details:");
        console.log("- Name:", await existingCollection.name());
        console.log("- Symbol:", await existingCollection.symbol());
        console.log("- Max Supply:", (await existingCollection.MAX_SUPPLY()).toString());
        console.log("- Max Mint Per User:", (await existingCollection.MAX_MINT_PER_USER()).toString());
        console.log("- Current Token ID:", (await existingCollection.getCurrentTokenId()).toString());
        console.log("- Remaining Supply:", (await existingCollection.getRemainingSupply()).toString());
        console.log("- Minter Contract:", await existingCollection.minterContract());
        console.log("- Protocol Royalty Recipient:", await existingCollection.protocolRoyaltyRecipient());
        console.log("- Total Royalty Percentage:", (await existingCollection.totalRoyaltyPercentage()).toString(), "basis points");
    } else {
        if (existingAddress && !ethers.isAddress(existingAddress)) {
            console.log("⚠️  Invalid PFP_COLLECTION_ADDRESS provided, deploying new collection...");
        }
        
        console.log("\nDeploying new PFP Collection...");
        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        const pfpCollection = await NFTCollection.deploy(
            PFP_NAME,
            PFP_SYMBOL,
            ADMIN,
            SAFE_WALLET,
            PFP_MAX_SUPPLY,
            PFP_MAX_MINT_PER_USER,
            ROYALTY_PERCENTAGE
        );
        await pfpCollection.waitForDeployment();
        pfpCollectionAddress = await pfpCollection.getAddress();
        isNewDeployment = true;
        console.log("✅ PFP Collection deployed to:", pfpCollectionAddress);
    }
    
    // Update deployment state
    deploymentState.pfpCollection = pfpCollectionAddress;
    deploymentState.pfpCollectionDeployedInThisRun = isNewDeployment;
    deploymentState.lastUpdate = new Date().toISOString();
    
    fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
    console.log("\n✅ Deployment state updated");
    
    console.log("\n=== PFP Collection Deployment Complete ===");
    console.log("Address:", pfpCollectionAddress);
    console.log("Next: Run step 3 to deploy Meme Collection");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

