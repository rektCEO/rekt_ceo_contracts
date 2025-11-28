const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== Step 7: Verify Deployment ===\n");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    
    // Load deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run previous steps first!");
        process.exit(1);
    }
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    console.log("Verifying deployment on network:", deploymentState.network.name);
    console.log("Chain ID:", deploymentState.network.chainId);
    
    try {
        // Get contract instances
        const CEOToken = await ethers.getContractFactory("MockERC20");
        const ceoToken = CEOToken.attach(deploymentState.ceoToken);
        
        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        const pfpCollection = NFTCollection.attach(deploymentState.pfpCollection);
        const memeCollection = NFTCollection.attach(deploymentState.memeCollection);
        
        const MinterContract = await ethers.getContractFactory("MinterContract");
        const minterContract = MinterContract.attach(deploymentState.minterContract);
        
        // Verify CEO Token
        console.log("\n--- CEO Token Verification ---");
        console.log("Address:", deploymentState.ceoToken);
        const ceoName = await ceoToken.name();
        const ceoSymbol = await ceoToken.symbol();
        const ceoTotalSupply = await ceoToken.totalSupply();
        console.log("✅ Name:", ceoName);
        console.log("✅ Symbol:", ceoSymbol);
        console.log("✅ Total Supply:", ethers.formatEther(ceoTotalSupply));
        
        // Verify PFP Collection
        console.log("\n--- PFP Collection Verification ---");
        console.log("Address:", deploymentState.pfpCollection);
        const pfpName = await pfpCollection.name();
        const pfpSymbol = await pfpCollection.symbol();
        const pfpMaxSupply = await pfpCollection.MAX_SUPPLY();
        const pfpTotalSupply = await pfpCollection.totalSupply();
        const pfpMaxMintPerUser = await pfpCollection.MAX_MINT_PER_USER();
        console.log("✅ Name:", pfpName);
        console.log("✅ Symbol:", pfpSymbol);
        console.log("✅ Total Supply:", pfpTotalSupply.toString());
        console.log("✅ Max Supply:", pfpMaxSupply.toString());
        console.log("✅ Max Mint Per User:", pfpMaxMintPerUser.toString());
        
        // Verify Meme Collection
        console.log("\n--- Meme Collection Verification ---");
        console.log("Address:", deploymentState.memeCollection);
        const memeName = await memeCollection.name();
        const memeSymbol = await memeCollection.symbol();
        const memeMaxSupply = await memeCollection.MAX_SUPPLY();
        const memeTotalSupply = await memeCollection.totalSupply();
        const memeMaxMintPerUser = await memeCollection.MAX_MINT_PER_USER();
        console.log("✅ Name:", memeName);
        console.log("✅ Symbol:", memeSymbol);
        console.log("✅ Total Supply:", memeTotalSupply.toString());
        console.log("✅ Max Supply:", memeMaxSupply.toString());
        console.log("✅ Max Mint Per User:", memeMaxMintPerUser.toString());
        
        // Verify USDC
        console.log("\n--- USDC Verification ---");
        console.log("Address:", deploymentState.usdc);
        const USDC = await ethers.getContractFactory("MockERC20");
        const usdc = USDC.attach(deploymentState.usdc);
        const usdcName = await usdc.name();
        const usdcSymbol = await usdc.symbol();
        console.log("✅ Name:", usdcName);
        console.log("✅ Symbol:", usdcSymbol);
        
        // Verify Minter Contract
        console.log("\n--- Minter Contract Verification ---");
        console.log("Address:", deploymentState.minterContract);
        const ceoTokenAddr = await minterContract.ceoToken();
        const pfpCollectionAddr = await minterContract.pfpCollection();
        const memeCollectionAddr = await minterContract.memeCollection();
        const usdcAddr = await minterContract.usdcToken();
        console.log("✅ CEO Token configured:", ceoTokenAddr === deploymentState.ceoToken ? "✓" : "✗");
        console.log("✅ PFP Collection configured:", pfpCollectionAddr === deploymentState.pfpCollection ? "✓" : "✗");
        console.log("✅ Meme Collection configured:", memeCollectionAddr === deploymentState.memeCollection ? "✓" : "✗");
        console.log("✅ USDC configured:", usdcAddr === deploymentState.usdc ? "✓" : "✗");
        
        // Final summary
        console.log("\n=== Deployment Summary ===");
        console.log("Network:", deploymentState.network.name, `(Chain ID: ${deploymentState.network.chainId})`);
        console.log("Deployer:", deploymentState.deployer);
        console.log("Deployed:", deploymentState.timestamp);
        console.log("\n📋 Contract Addresses:");
        console.log("CEO Token:", deploymentState.ceoToken);
        console.log("PFP Collection:", deploymentState.pfpCollection);
        console.log("Meme Collection:", deploymentState.memeCollection);
        console.log("USDC:", deploymentState.usdc);
        console.log("Minter Contract:", deploymentState.minterContract);
        
        if (deploymentState.configuration) {
            console.log("\n🔐 Configuration:");
            console.log("Approver:", deploymentState.configuration.approver);
            console.log("Rescuer:", deploymentState.configuration.rescuer);
            console.log("Admin:", deploymentState.configuration.admin);
        }
        
        // Save final deployment info
        const network = await deployer.provider.getNetwork();
        const finalDeploymentFile = path.join(
            __dirname, 
            '..', 
            '..', 
            'deployments', 
            `${network.name}-${Date.now()}.json`
        );
        
        // Create deployments directory if it doesn't exist
        const deploymentsDir = path.dirname(finalDeploymentFile);
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }
        
        // Save complete deployment info
        fs.writeFileSync(finalDeploymentFile, JSON.stringify(deploymentState, null, 2));
        console.log("\n✅ Final deployment info saved to:", finalDeploymentFile);
        
        console.log("\n=== Next Steps ===");
        console.log("1. Verify contracts on block explorer (e.g., Etherscan)");
        console.log("2. Update backend configuration with contract addresses");
        console.log("3. Test the contracts with small amounts");
        console.log("4. Transfer admin roles to multisig wallets for production");
        console.log("5. Update frontend with contract addresses");
        
        console.log("\n✨ All deployment steps complete! ✨");
        
    } catch (error) {
        console.error("❌ Verification failed:", error.message);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Verification failed:", error);
        process.exit(1);
    });

