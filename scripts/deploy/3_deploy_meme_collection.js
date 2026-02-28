const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== Step 3: Deploy Meme Collection ===\n");
    
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
    
    // Configuration
    const MEME_NAME = "Rekt CEO Memes";
    const MEME_SYMBOL = "RCMEME";
    const MEME_MAX_SUPPLY = 9999;
    const MEME_MAX_MINT_PER_USER = 9;
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
    console.log("- Name:", MEME_NAME);
    console.log("- Symbol:", MEME_SYMBOL);
    console.log("- Max Supply:", MEME_MAX_SUPPLY);
    console.log("- Max Mint Per User:", MEME_MAX_MINT_PER_USER);
    console.log("- Admin:", ADMIN);
    console.log("- Safe Wallet:", SAFE_WALLET);
    console.log("- Royalty:", ROYALTY_PERCENTAGE / 100, "%");
    
    // Check for existing Meme Collection address
    const existingAddress = process.env.MEME_COLLECTION_ADDRESS || "";
    
    let memeCollectionAddress;
    let isNewDeployment = false;
    
    if (existingAddress && ethers.isAddress(existingAddress)) {
        console.log("\nUsing existing Meme Collection at:", existingAddress);
        memeCollectionAddress = existingAddress;
        
        // Check if contract exists at address
        const code = await ethers.provider.getCode(existingAddress);
        if (code === "0x") {
            console.error(`❌ No contract found at address ${existingAddress}`);
            console.error("Please verify the address or deploy a new collection.");
            process.exit(1);
        }
        
        // Get contract instance and display information
        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        const existingCollection = NFTCollection.attach(existingAddress);
        
        console.log("\nExisting Meme Collection Details:");
        
        // Helper function to safely call contract methods
        const safeCall = async (fn, label, defaultValue = "N/A") => {
            try {
                const result = await fn();
                return result.toString ? result.toString() : result;
            } catch (error) {
                console.warn(`⚠️  Could not fetch ${label}: ${error.message}`);
                return defaultValue;
            }
        };
        
        const name = await safeCall(() => existingCollection.name(), "Name");
        const symbol = await safeCall(() => existingCollection.symbol(), "Symbol");
        const maxSupply = await safeCall(() => existingCollection.MAX_SUPPLY(), "Max Supply");
        const maxMintPerUser = await safeCall(() => existingCollection.MAX_MINT_PER_USER(), "Max Mint Per User");
        const currentTokenId = await safeCall(() => existingCollection.getCurrentTokenId(), "Current Token ID");
        const remainingSupply = await safeCall(() => existingCollection.getRemainingSupply(), "Remaining Supply");
        const minterContract = await safeCall(() => existingCollection.minterContract(), "Minter Contract");
        const protocolRoyaltyRecipient = await safeCall(() => existingCollection.protocolRoyaltyRecipient(), "Protocol Royalty Recipient");
        const totalRoyaltyPercentage = await safeCall(() => existingCollection.totalRoyaltyPercentage(), "Total Royalty Percentage");
        
        console.log("- Name:", name);
        console.log("- Symbol:", symbol);
        console.log("- Max Supply:", maxSupply);
        console.log("- Max Mint Per User:", maxMintPerUser);
        console.log("- Current Token ID:", currentTokenId);
        console.log("- Remaining Supply:", remainingSupply);
        console.log("- Minter Contract:", minterContract);
        console.log("- Protocol Royalty Recipient:", protocolRoyaltyRecipient);
        console.log("- Total Royalty Percentage:", totalRoyaltyPercentage, "basis points");
    } else {
        if (existingAddress && !ethers.isAddress(existingAddress)) {
            console.log("⚠️  Invalid MEME_COLLECTION_ADDRESS provided, deploying new collection...");
        }
        
        console.log("\nDeploying new Meme Collection...");
        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        const memeCollection = await NFTCollection.deploy(
            MEME_NAME,
            MEME_SYMBOL,
            ADMIN,
            SAFE_WALLET,
            MEME_MAX_SUPPLY,
            MEME_MAX_MINT_PER_USER,
            ROYALTY_PERCENTAGE
        );
        await memeCollection.waitForDeployment();
        memeCollectionAddress = await memeCollection.getAddress();
        isNewDeployment = true;
        console.log("✅ Meme Collection deployed to:", memeCollectionAddress);
    }
    
    // Update deployment state
    deploymentState.memeCollection = memeCollectionAddress;
    deploymentState.memeCollectionDeployedInThisRun = isNewDeployment;
    deploymentState.lastUpdate = new Date().toISOString();
    
    fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
    console.log("\n✅ Deployment state updated");
    
    console.log("\n=== Meme Collection Deployment Complete ===");
    console.log("Address:", memeCollectionAddress);
    console.log("Next: Run step 4 to deploy/configure USDC");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

