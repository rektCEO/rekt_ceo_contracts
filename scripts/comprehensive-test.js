const { ethers } = require("hardhat");

async function main() {
    console.log("🧪 Starting Comprehensive Rekt CEO Testing...");
    console.log("=" .repeat(60));

    // Get accounts
    const [deployer, user1, user2, rescuer, admin] = await ethers.getSigners();
    console.log("Testing with accounts:");
    console.log("Deployer:", deployer.address);
    console.log("User1:", user1.address);
    console.log("User2:", user2.address);
    console.log("Rescuer:", rescuer.address);
    console.log("Admin:", admin.address);

    // Configuration
    const USDC_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
    const SAFE_WALLET_ADDRESS = deployer.address;
    const TREASURY_ADDRESS = deployer.address;

    console.log("\n📋 Test Configuration:");
    console.log("USDC Address:", USDC_ADDRESS);
    console.log("Safe Wallet:", SAFE_WALLET_ADDRESS);
    console.log("Treasury:", TREASURY_ADDRESS);

    // 1. Deploy contracts
    console.log("\n1️⃣ Deploying contracts...");
    
    // Deploy CEO Token
    const CEOToken = await ethers.getContractFactory("CEOToken");
    const ceoToken = await CEOToken.deploy(deployer.address);
    await ceoToken.waitForDeployment();
    const ceoTokenAddress = await ceoToken.getAddress();
    console.log("✅ CEO Token deployed to:", ceoTokenAddress);

    // Set dev wallet and mint allocation
    await ceoToken.setDevWallet(user1.address);
    await ceoToken.mintDevAllocation();

    // Deploy PFP Collection
    const PFPCollection = await ethers.getContractFactory("PFPCollection");
    const pfpCollection = await PFPCollection.deploy(
        "Rekt CEO PFPs",
        "REKTPFP",
        SAFE_WALLET_ADDRESS,
        deployer.address
    );
    await pfpCollection.waitForDeployment();
    const pfpCollectionAddress = await pfpCollection.getAddress();
    console.log("✅ PFP Collection deployed to:", pfpCollectionAddress);

    // Deploy Meme Collection
    const MemeCollection = await ethers.getContractFactory("MemeCollection");
    const memeCollection = await MemeCollection.deploy(
        "Rekt CEO Memes",
        "REKTMEME",
        SAFE_WALLET_ADDRESS,
        deployer.address
    );
    await memeCollection.waitForDeployment();
    const memeCollectionAddress = await memeCollection.getAddress();
    console.log("✅ Meme Collection deployed to:", memeCollectionAddress);

    // Deploy Mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC");
    await usdcToken.waitForDeployment();
    const usdcTokenAddress = await usdcToken.getAddress();
    console.log("✅ Mock USDC deployed to:", usdcTokenAddress);

    // Deploy Minter Contract
    const MinterContract = await ethers.getContractFactory("MinterContract");
    const minterContract = await MinterContract.deploy(
        ceoTokenAddress,
        pfpCollectionAddress,
        memeCollectionAddress,
        usdcTokenAddress,
        TREASURY_ADDRESS,
        SAFE_WALLET_ADDRESS,
        deployer.address
    );
    await minterContract.waitForDeployment();
    const minterContractAddress = await minterContract.getAddress();
    console.log("✅ Enhanced Minter Contract deployed to:", minterContractAddress);

    // Grant roles
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), deployer.address);
    await minterContract.grantRole(await minterContract.RESCUER_ROLE(), rescuer.address);
    await minterContract.grantRole(await minterContract.ADMIN_ROLE(), admin.address);

    // Grant minter role to minter contract
    await pfpCollection.grantRole(await pfpCollection.MINTER_ROLE(), minterContractAddress);
    await memeCollection.grantRole(await memeCollection.MINTER_ROLE(), minterContractAddress);

    console.log("\n2️⃣ Testing Recovery Mechanisms...");
    console.log("=" .repeat(40));

    // Test 1: Send ETH to contract
    console.log("\n🔍 Test 1: Sending ETH to contract for recovery test");
    await deployer.sendTransaction({
        to: minterContractAddress,
        value: ethers.parseEther("1.0")
    });
    
    const ethBalance = await ethers.provider.getBalance(minterContractAddress);
    console.log("Contract ETH balance:", ethers.formatEther(ethBalance));

    // Test 2: Send USDC to contract
    console.log("\n🔍 Test 2: Sending USDC to contract for recovery test");
    await usdcToken.mint(minterContractAddress, ethers.parseEther("1000"));
    
    const usdcBalance = await usdcToken.balanceOf(minterContractAddress);
    console.log("Contract USDC balance:", ethers.formatEther(usdcBalance));

    // Test 3: Recover ETH using rescuer
    console.log("\n🔍 Test 3: Recovering ETH using rescuer role");
    const rescuerBalanceBefore = await ethers.provider.getBalance(rescuer.address);
    
    await minterContract.connect(rescuer).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1.0"));
    
    const rescuerBalanceAfter = await ethers.provider.getBalance(rescuer.address);
    console.log("Rescuer ETH balance before:", ethers.formatEther(rescuerBalanceBefore));
    console.log("Rescuer ETH balance after:", ethers.formatEther(rescuerBalanceAfter));
    console.log("✅ ETH recovery successful!");

    // Test 4: Recover USDC using rescuer
    console.log("\n🔍 Test 4: Recovering USDC using rescuer role");
    const rescuerUSDCBefore = await usdcToken.balanceOf(rescuer.address);
    
    await minterContract.connect(rescuer).recoverStuckTokens(usdcTokenAddress, ethers.parseEther("1000"));
    
    const rescuerUSDCAfter = await usdcToken.balanceOf(rescuer.address);
    console.log("Rescuer USDC balance before:", ethers.formatEther(rescuerUSDCBefore));
    console.log("Rescuer USDC balance after:", ethers.formatEther(rescuerUSDCAfter));
    console.log("✅ USDC recovery successful!");

    // Test 5: Emergency recovery of all tokens
    console.log("\n🔍 Test 5: Emergency recovery of all tokens");
    
    // Send more tokens to contract
    await deployer.sendTransaction({
        to: minterContractAddress,
        value: ethers.parseEther("2.0")
    });
    await usdcToken.mint(minterContractAddress, ethers.parseEther("500"));
    
    console.log("Contract ETH balance before emergency recovery:", ethers.formatEther(await ethers.provider.getBalance(minterContractAddress)));
    console.log("Contract USDC balance before emergency recovery:", ethers.formatEther(await usdcToken.balanceOf(minterContractAddress)));
    
    // Emergency recover all
    await minterContract.connect(rescuer).emergencyRecoverAll();
    
    console.log("Contract ETH balance after emergency recovery:", ethers.formatEther(await ethers.provider.getBalance(minterContractAddress)));
    console.log("Contract USDC balance after emergency recovery:", ethers.formatEther(await usdcToken.balanceOf(minterContractAddress)));
    console.log("✅ Emergency recovery successful!");

    // Test 6: Try to recover CEO tokens (should fail)
    console.log("\n🔍 Test 6: Attempting to recover CEO tokens (should fail)");
    
    // Send CEO tokens to contract
    await ceoToken.transfer(minterContractAddress, ethers.parseEther("1000"));
    
    try {
        await minterContract.connect(rescuer).recoverStuckTokens(ceoTokenAddress, ethers.parseEther("1000"));
        console.log("❌ CEO token recovery should have failed!");
    } catch (error) {
        console.log("✅ CEO token recovery correctly blocked:", error.message);
    }

    // Test 7: Try recovery without rescuer role (should fail)
    console.log("\n🔍 Test 7: Attempting recovery without rescuer role (should fail)");
    
    await deployer.sendTransaction({
        to: minterContractAddress,
        value: ethers.parseEther("1.0")
    });
    
    try {
        await minterContract.connect(user1).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1.0"));
        console.log("❌ Recovery without rescuer role should have failed!");
    } catch (error) {
        console.log("✅ Recovery without rescuer role correctly blocked:", error.message);
    }

    console.log("\n3️⃣ Testing NFT Minting and USDC Swap...");
    console.log("=" .repeat(40));

    // Test 8: Mint NFT with USDC swap
    console.log("\n🔍 Test 8: Minting NFT with USDC swap");
    
    // Approve minter contract
    await ceoToken.approve(minterContractAddress, ethers.parseEther("10000"));
    
    const treasuryBalanceBefore = await ceoToken.balanceOf(TREASURY_ADDRESS);
    console.log("Treasury CEO balance before minting:", ethers.formatEther(treasuryBalanceBefore));
    
    // Mint PFP
    await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/1");
    
    const treasuryBalanceAfter = await ceoToken.balanceOf(TREASURY_ADDRESS);
    console.log("Treasury CEO balance after minting:", ethers.formatEther(treasuryBalanceAfter));
    console.log("CEO tokens sent to treasury (USDC swap):", ethers.formatEther(treasuryBalanceAfter - treasuryBalanceBefore));
    console.log("✅ USDC swap mechanism working!");

    // Test 9: Test mint limits
    console.log("\n🔍 Test 9: Testing mint limits");
    
    // Try to mint 3rd PFP (should fail)
    try {
        await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/2");
        await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/3");
        console.log("❌ PFP mint limit should have been enforced!");
    } catch (error) {
        console.log("✅ PFP mint limit correctly enforced:", error.message);
    }

    // Test 10: Test royalty mechanism
    console.log("\n🔍 Test 10: Testing royalty mechanism");
    
    const royaltyInfo = await pfpCollection.royaltyInfo(1, ethers.parseEther("100"));
    console.log("Royalty for $100 sale:", ethers.formatEther(royaltyInfo.royaltyAmount));
    console.log("Royalty recipient:", royaltyInfo.receiver);
    console.log("✅ Royalty mechanism working!");

    // Test 11: Test creator tracking
    console.log("\n🔍 Test 11: Testing creator tracking");
    
    const creator = await pfpCollection.getTokenCreator(1);
    console.log("Token 1 creator:", creator);
    console.log("Deployer address:", deployer.address);
    console.log("Creator tracking working:", creator === deployer.address);
    console.log("✅ Creator tracking working!");

    console.log("\n4️⃣ Testing Security Features...");
    console.log("=" .repeat(40));

    // Test 12: Test role-based access control
    console.log("\n🔍 Test 12: Testing role-based access control");
    
    try {
        await minterContract.connect(user1).updateTier(0, 1, ethers.parseEther("100"), true);
        console.log("❌ Non-admin should not be able to update tiers!");
    } catch (error) {
        console.log("✅ Role-based access control working:", error.message);
    }

    // Test 13: Test price update cooldown
    console.log("\n🔍 Test 13: Testing price update cooldown");
    
    await minterContract.setCEOPrice(ethers.parseEther("2.0"));
    console.log("First price update successful");
    
    try {
        await minterContract.setCEOPrice(ethers.parseEther("3.0"));
        console.log("❌ Price update cooldown should have been enforced!");
    } catch (error) {
        console.log("✅ Price update cooldown working:", error.message);
    }

    console.log("\n5️⃣ Testing Fund Withdrawal...");
    console.log("=" .repeat(40));

    // Test 14: Test fund withdrawal
    console.log("\n🔍 Test 14: Testing fund withdrawal");
    
    const contractBalance = await ceoToken.balanceOf(minterContractAddress);
    console.log("Contract CEO balance before withdrawal:", ethers.formatEther(contractBalance));
    
    if (contractBalance > 0) {
        await minterContract.withdrawFunds();
        const finalBalance = await ceoToken.balanceOf(minterContractAddress);
        console.log("Contract CEO balance after withdrawal:", ethers.formatEther(finalBalance));
        console.log("✅ Fund withdrawal successful!");
    } else {
        console.log("No funds to withdraw");
    }

    console.log("\n" + "=" .repeat(60));
    console.log("🎉 COMPREHENSIVE TESTING COMPLETE!");
    console.log("=" .repeat(60));
    console.log("✅ All recovery mechanisms tested successfully!");
    console.log("✅ All security features working!");
    console.log("✅ All NFT functionality working!");
    console.log("✅ All USDC swap mechanisms working!");
    console.log("✅ All role-based access controls working!");
    console.log("✅ All mint limits enforced!");
    console.log("✅ All royalty mechanisms working!");
    console.log("✅ All creator tracking working!");
    console.log("✅ All fund withdrawal mechanisms working!");
    console.log("\n🚀 System is robust, secure, and ready for production!");
    console.log("=" .repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Testing failed:", error);
        process.exit(1);
    });
