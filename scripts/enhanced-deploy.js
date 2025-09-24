const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Starting Enhanced Rekt CEO Contract Deployment...");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");
    
    // Configuration
    const USDC_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"; // BSC USDC
    const SAFE_WALLET_ADDRESS = deployer.address; // Using deployer as Safe wallet for testing
    const TREASURY_ADDRESS = deployer.address; // Replace with actual treasury address
    
    console.log("\n📋 Deployment Configuration:");
    console.log("USDC Address:", USDC_ADDRESS);
    console.log("Safe Wallet:", SAFE_WALLET_ADDRESS);
    console.log("Treasury:", TREASURY_ADDRESS);
    
    // Deploy CEO Token
    console.log("\n1️⃣ Deploying CEO Token...");
    const CEOToken = await ethers.getContractFactory("CEOToken");
    const ceoToken = await CEOToken.deploy(deployer.address);
    await ceoToken.waitForDeployment();
    const ceoTokenAddress = await ceoToken.getAddress();
    console.log("✅ CEO Token deployed to:", ceoTokenAddress);
    
    // Set dev wallet and mint dev allocation
    console.log("\n2️⃣ Setting up CEO Token...");
    await ceoToken.setDevWallet(deployer.address);
    await ceoToken.mintDevAllocation();
    console.log("✅ Dev wallet set and allocation minted");
    
    // Deploy PFP Collection
    console.log("\n3️⃣ Deploying PFP Collection...");
    const PFPCollection = await ethers.getContractFactory("PFPCollection");
    const pfpCollection = await PFPCollection.deploy(
        "Rekt CEO PFPs",
        "RCPFP",
        deployer.address,
        SAFE_WALLET_ADDRESS
    );
    await pfpCollection.waitForDeployment();
    const pfpCollectionAddress = await pfpCollection.getAddress();
    console.log("✅ PFP Collection deployed to:", pfpCollectionAddress);
    
    // Deploy Meme Collection
    console.log("\n4️⃣ Deploying Meme Collection...");
    const MemeCollection = await ethers.getContractFactory("MemeCollection");
    const memeCollection = await MemeCollection.deploy(
        "Rekt CEO Memes",
        "RCMEME",
        deployer.address,
        SAFE_WALLET_ADDRESS
    );
    await memeCollection.waitForDeployment();
    const memeCollectionAddress = await memeCollection.getAddress();
    console.log("✅ Meme Collection deployed to:", memeCollectionAddress);
    
    // Deploy Enhanced Minter Contract
    console.log("\n5️⃣ Deploying Enhanced Minter Contract...");
    const MinterContract = await ethers.getContractFactory("MinterContract");
    const minterContract = await MinterContract.deploy(
        ceoTokenAddress,
        pfpCollectionAddress,
        memeCollectionAddress,
        USDC_ADDRESS,
        TREASURY_ADDRESS,
        SAFE_WALLET_ADDRESS,
        deployer.address
    );
    await minterContract.waitForDeployment();
    const minterContractAddress = await minterContract.getAddress();
    console.log("✅ Enhanced Minter Contract deployed to:", minterContractAddress);
    
    // Set minter contracts
    console.log("\n6️⃣ Configuring contracts...");
    await pfpCollection.setMinterContract(minterContractAddress);
    await memeCollection.setMinterContract(minterContractAddress);
    console.log("✅ Minter contracts configured");
    
    // Grant roles
    console.log("\n7️⃣ Setting up roles...");
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), deployer.address);
    await minterContract.grantRole(await minterContract.PRICE_UPDATER_ROLE(), deployer.address);
    console.log("✅ Roles configured");
    
    // Set initial pricing
    console.log("\n8️⃣ Setting initial pricing...");
    await minterContract.setCEOPrice(ethers.parseEther("1.0")); // $1 per CEO
    await minterContract.setUSDCPrice(ethers.parseEther("1.0")); // $1 per USDC
    console.log("✅ Initial pricing set");
    
    // Configure USDC swap
    console.log("\n9️⃣ Configuring USDC swap...");
    await minterContract.updateUSDCSwapConfig(true, 5000); // 50% swap to USDC
    console.log("✅ USDC swap configured");
    
    // Update royalty info
    console.log("\n🔟 Configuring royalties...");
    await pfpCollection.updateRoyaltyInfo(SAFE_WALLET_ADDRESS, 210); // 2.1%
    await memeCollection.updateRoyaltyInfo(SAFE_WALLET_ADDRESS, 210); // 2.1%
    console.log("✅ Royalties configured");
    
    // Display deployment summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 ENHANCED REKT CEO DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    console.log("📋 Contract Addresses:");
    console.log("CEO Token:", ceoTokenAddress);
    console.log("PFP Collection:", pfpCollectionAddress);
    console.log("Meme Collection:", memeCollectionAddress);
    console.log("Minter Contract:", minterContractAddress);
    console.log("\n🔧 Features Enabled:");
    console.log("✅ Safe multisig integration");
    console.log("✅ Permit functionality (gasless approvals)");
    console.log("✅ Real-time pricing updates");
    console.log("✅ USDC swapping (50% of payments)");
    console.log("✅ Royalty management (2.1%)");
    console.log("✅ Creator tracking");
    console.log("✅ Recovery mechanisms");
    console.log("\n📊 Collection Stats:");
    console.log("PFP Collection: 999 max supply, 2 per user");
    console.log("Meme Collection: 9,999 max supply, 9 per user");
    console.log("CEO Token: 21M total supply, 3% dev (locked 3 years)");
    console.log("\n🚀 Ready for production!");
    console.log("=".repeat(60));
    
    // Save deployment info
    const deploymentInfo = {
        network: await deployer.provider.getNetwork(),
        deployer: deployer.address,
        ceoToken: ceoTokenAddress,
        pfpCollection: pfpCollectionAddress,
        memeCollection: memeCollectionAddress,
        minterContract: minterContractAddress,
        usdcToken: USDC_ADDRESS,
        safeWallet: SAFE_WALLET_ADDRESS,
        treasury: TREASURY_ADDRESS,
        timestamp: new Date().toISOString()
    };
    
    const fs = require('fs');
    fs.writeFileSync(
        `deployments/enhanced-deployment-${Date.now()}.json`,
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("\n💾 Deployment info saved to deployments/");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
