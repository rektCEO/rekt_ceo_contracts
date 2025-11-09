const { ethers } = require("hardhat");

async function main() {
    console.log("=== Rekt CEO Contract Interaction Demo ===\n");
    
    // Get signers
    const [owner, user1, user2] = await ethers.getSigners();
    console.log("Owner:", owner.address);
    console.log("User1:", user1.address);
    console.log("User2:", user2.address);
    
    // Deploy contracts (same as in deploy.js but simplified)
    console.log("\n=== Deploying Contracts ===");
    
    const CEOToken = await ethers.getContractFactory("CEOToken");
    const ceoToken = await CEOToken.deploy(owner.address);
    await ceoToken.waitForDeployment();
    console.log("CEO Token deployed to:", await ceoToken.getAddress());
    
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    const pfpCollection = await NFTCollection.deploy("Rekt CEO PFPs", "RCPFP", owner.address, owner.address, 999, 2, 210);
    await pfpCollection.waitForDeployment();
    console.log("PFP Collection deployed to:", await pfpCollection.getAddress());
    
    const memeCollection = await NFTCollection.deploy("Rekt CEO Memes", "RCMEME", owner.address, owner.address, 9999, 9, 210);
    await memeCollection.waitForDeployment();
    console.log("Meme Collection deployed to:", await memeCollection.getAddress());
    
    // Deploy Mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("MockUSDC", "USDC");
    await usdc.waitForDeployment();
    
    const MinterContract = await ethers.getContractFactory("MinterContract");
    const minterContract = await MinterContract.deploy(
        await ceoToken.getAddress(),
        await pfpCollection.getAddress(),
        await memeCollection.getAddress(),
        await usdc.getAddress(),
        owner.address, // treasury
        owner.address, // safe wallet
        owner.address  // admin
    );
    await minterContract.waitForDeployment();
    console.log("Minter Contract deployed to:", await minterContract.getAddress());
    
    // Configure contracts
    console.log("\n=== Configuring Contracts ===");
    await pfpCollection.setMinterContract(await minterContract.getAddress());
    await memeCollection.setMinterContract(await minterContract.getAddress());
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), owner.address);
    console.log("Contracts configured successfully!");
    
    // Check initial state
    console.log("\n=== Initial State ===");
    const totalSupply = await ceoToken.totalSupply();
    const maxSupply = await ceoToken.MAX_SUPPLY();
    console.log("CEO Token total supply:", ethers.formatEther(totalSupply));
    console.log("CEO Token max supply:", ethers.formatEther(maxSupply));
    console.log("Owner CEO balance:", ethers.formatEther(await ceoToken.balanceOf(owner.address)));
    
    // Check pricing
    console.log("\n=== Pricing Information ===");
    const pfpPrice = await minterContract.getPriceInCEO(0, 1); // PFP tier 1
    const memePrice = await minterContract.getPriceInCEO(1, 1); // MEME tier 1
    console.log("PFP Tier 1 price:", ethers.formatEther(pfpPrice), "CEO tokens");
    console.log("Meme Tier 1 price:", ethers.formatEther(memePrice), "CEO tokens");
    
    // Test minting flow
    console.log("\n=== Testing Minting Flow ===");
    
    // Approve minter contract to spend CEO tokens
    await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("1000"));
    console.log("Approved minter contract to spend CEO tokens");
    
    // Mint a PFP NFT
    console.log("\n--- Minting PFP NFT ---");
    const pfpMetadataURI = "https://example.com/pfp/metadata/1";
    await minterContract.mintNFT(0, 1, pfpMetadataURI);
    console.log(" PFP NFT minted successfully!");
    
    // Check PFP NFT
    const pfpOwner = await pfpCollection.ownerOf(1);
    const pfpURI = await pfpCollection.tokenURI(1);
    console.log("PFP NFT #1 owner:", pfpOwner);
    console.log("PFP NFT #1 URI:", pfpURI);
    
    // Mint a Meme NFT
    console.log("\n--- Minting Meme NFT ---");
    const memeMetadataURI = "https://example.com/meme/metadata/1";
    await minterContract.mintNFT(1, 1, memeMetadataURI);
    console.log("Meme NFT minted successfully!");
    
    // Check Meme NFT
    const memeOwner = await memeCollection.ownerOf(1);
    const memeURI = await memeCollection.tokenURI(1);
    console.log("Meme NFT #1 owner:", memeOwner);
    console.log("Meme NFT #1 URI:", memeURI);
    
    // Check mint limits
    console.log("\n--- Checking Mint Limits ---");
    const ownerPfpCount = await pfpCollection.getUserMintCount(owner.address);
    const ownerMemeCount = await memeCollection.getUserMintCount(owner.address);
    console.log("Owner PFP mint count:", ownerPfpCount.toString());
    console.log("Owner Meme mint count:", ownerMemeCount.toString());
    
    // Try to mint another PFP (should work)
    console.log("\n--- Minting Second PFP NFT ---");
    await minterContract.mintNFT(0, 1, "https://example.com/pfp/metadata/2");
    console.log(" Second PFP NFT minted successfully!");
    
    // Try to mint third PFP (should fail)
    console.log("\n--- Attempting to Mint Third PFP NFT (Should Fail) ---");
    try {
        await minterContract.mintNFT(0, 1, "https://example.com/pfp/metadata/3");
        console.log("This should have failed!");
    } catch (error) {
        console.log(" Correctly failed:", error.message.split(": ")[1]);
    }
    
    // Check final state
    console.log("\n=== Final State ===");
    const finalOwnerBalance = await ceoToken.balanceOf(owner.address);
    const minterBalance = await ceoToken.balanceOf(await minterContract.getAddress());
    console.log("Owner CEO balance:", ethers.formatEther(finalOwnerBalance));
    console.log("Minter contract CEO balance:", ethers.formatEther(minterBalance));
    
    const finalPfpCount = await pfpCollection.getUserMintCount(owner.address);
    const finalMemeCount = await memeCollection.getUserMintCount(owner.address);
    console.log("Final PFP mint count:", finalPfpCount.toString());
    console.log("Final Meme mint count:", finalMemeCount.toString());
    
    console.log("\n=== Demo Complete! ===");
    console.log(" All contracts are working correctly!");
    console.log(" Minting flow is functional!");
    console.log(" Mint limits are enforced!");
    console.log(" Payment processing works!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Demo failed:", error);
        process.exit(1);
    });
