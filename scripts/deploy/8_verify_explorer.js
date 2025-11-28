const { run } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function verifyContract(contractAddress, constructorArguments, contractName) {
    console.log(`\nVerifying ${contractName} at ${contractAddress}...`);
    
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: constructorArguments,
        });
        console.log(`✅ ${contractName} verified successfully!`);
        return { success: true, address: contractAddress };
    } catch (error) {
        if (error.message.includes("Contract source code already verified")) {
            console.log(`✅ ${contractName} is already verified!`);
            return { success: true, address: contractAddress, alreadyVerified: true };
        } else {
            console.error(`❌ Error verifying ${contractName}:`, error.message);
            return { success: false, address: contractAddress, error: error.message };
        }
    }
}

async function main() {
    console.log("\n=== Step 8: Verify Contracts on Block Explorer ===\n");
    
    // Load deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run previous steps first!");
        process.exit(1);
    }
    
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    console.log("Network:", deploymentState.network.name);
    console.log("Chain ID:", deploymentState.network.chainId);
    console.log("Deployer:", deploymentState.deployer);
    console.log("\nContracts to verify:");
    console.log("- CEO Token:", deploymentState.ceoToken);
    console.log("- PFP Collection:", deploymentState.pfpCollection);
    console.log("- Meme Collection:", deploymentState.memeCollection);
    console.log("- USDC:", deploymentState.usdc);
    console.log("- Minter Contract:", deploymentState.minterContract);
    
    // Wait a bit to ensure contracts are indexed by the explorer
    console.log("\n⏳ Waiting 30 seconds for contracts to be indexed by the explorer...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    const verificationResults = {
        timestamp: new Date().toISOString(),
        network: deploymentState.network.name,
        chainId: deploymentState.network.chainId,
        contracts: {}
    };
    
    // Get configuration values from environment or deployment state
    const ADMIN = deploymentState.configuration?.admin || deploymentState.deployer;
    const SAFE_WALLET = process.env.SAFE_WALLET_ADDRESS || deploymentState.deployer;
    const TREASURY = process.env.TREASURY_ADDRESS || deploymentState.deployer;
    
    // 1. Verify CEO Token (MockERC20)
    console.log("\n" + "=".repeat(60));
    console.log("1. CEO Token (MockERC20)");
    console.log("=".repeat(60));
    const ceoTokenResult = await verifyContract(
        deploymentState.ceoToken,
        [deploymentState.deployer],
        "CEO Token"
    );
    verificationResults.contracts.ceoToken = ceoTokenResult;
    
    // 2. Verify PFP Collection (NFTCollection)
    console.log("\n" + "=".repeat(60));
    console.log("2. PFP Collection (NFTCollection)");
    console.log("=".repeat(60));
    const pfpCollectionResult = await verifyContract(
        deploymentState.pfpCollection,
        [
            "Rekt CEO PFPs",     // name
            "RCPFP",             // symbol
            ADMIN,               // admin
            SAFE_WALLET,         // protocolRoyaltyRecipient
            999,                 // maxSupply
            2,                   // maxMintPerUser
            210                  // totalRoyaltyPercentage (2.1%)
        ],
        "PFP Collection"
    );
    verificationResults.contracts.pfpCollection = pfpCollectionResult;
    
    // 3. Verify Meme Collection (NFTCollection)
    console.log("\n" + "=".repeat(60));
    console.log("3. Meme Collection (NFTCollection)");
    console.log("=".repeat(60));
    const memeCollectionResult = await verifyContract(
        deploymentState.memeCollection,
        [
            "Rekt CEO Memes",    // name
            "RCMEME",            // symbol
            ADMIN,               // admin
            SAFE_WALLET,         // protocolRoyaltyRecipient
            9999,                // maxSupply
            9,                   // maxMintPerUser
            210                  // totalRoyaltyPercentage (2.1%)
        ],
        "Meme Collection"
    );
    verificationResults.contracts.memeCollection = memeCollectionResult;
    
    // 4. Verify USDC (MockERC20)
    console.log("\n" + "=".repeat(60));
    console.log("4. USDC (MockERC20)");
    console.log("=".repeat(60));
    const usdcResult = await verifyContract(
        deploymentState.usdc,
        ["Mock USDC", "USDC"],
        "USDC"
    );
    verificationResults.contracts.usdc = usdcResult;
    
    // 5. Verify Minter Contract
    console.log("\n" + "=".repeat(60));
    console.log("5. Minter Contract");
    console.log("=".repeat(60));
    const minterContractResult = await verifyContract(
        deploymentState.minterContract,
        [
            deploymentState.ceoToken,         // ceoToken
            deploymentState.pfpCollection,    // pfpCollection
            deploymentState.memeCollection,   // memeCollection
            deploymentState.usdc,             // usdcToken
            TREASURY,                         // treasury
            ADMIN                             // admin
        ],
        "Minter Contract"
    );
    verificationResults.contracts.minterContract = minterContractResult;
    
    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("VERIFICATION SUMMARY");
    console.log("=".repeat(60));
    
    const successCount = Object.values(verificationResults.contracts).filter(r => r.success).length;
    const totalCount = Object.keys(verificationResults.contracts).length;
    
    console.log(`\nSuccessfully verified: ${successCount}/${totalCount} contracts\n`);
    
    Object.entries(verificationResults.contracts).forEach(([name, result]) => {
        const status = result.success ? "✅" : "❌";
        const note = result.alreadyVerified ? " (already verified)" : "";
        console.log(`${status} ${name}: ${result.address}${note}`);
        if (!result.success && result.error) {
            console.log(`   Error: ${result.error}`);
        }
    });
    
    // Save verification results
    const verificationFile = path.join(__dirname, 'verification-results.json');
    fs.writeFileSync(verificationFile, JSON.stringify(verificationResults, null, 2));
    console.log(`\n📄 Verification results saved to: ${verificationFile}`);
    
    // Update deployment state with verification info
    deploymentState.verified = true;
    deploymentState.verificationTimestamp = verificationResults.timestamp;
    deploymentState.verificationResults = verificationResults.contracts;
    fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
    console.log(`📄 Deployment state updated with verification info`);
    
    // Explorer links
    console.log("\n" + "=".repeat(60));
    console.log("EXPLORER LINKS");
    console.log("=".repeat(60));
    
    const explorerUrl = deploymentState.network.name === 'sepolia' 
        ? 'https://sepolia.etherscan.io' 
        : deploymentState.network.name === 'baseSepolia'
        ? 'https://sepolia.basescan.org'
        : 'https://etherscan.io';
    
    console.log(`\nCEO Token: ${explorerUrl}/address/${deploymentState.ceoToken}#code`);
    console.log(`PFP Collection: ${explorerUrl}/address/${deploymentState.pfpCollection}#code`);
    console.log(`Meme Collection: ${explorerUrl}/address/${deploymentState.memeCollection}#code`);
    console.log(`USDC: ${explorerUrl}/address/${deploymentState.usdc}#code`);
    console.log(`Minter Contract: ${explorerUrl}/address/${deploymentState.minterContract}#code`);
    
    if (successCount === totalCount) {
        console.log("\n✨ All contracts verified successfully! ✨");
    } else {
        console.log("\n⚠️  Some contracts failed to verify. Check the errors above.");
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("IMPORTANT NOTES");
    console.log("=".repeat(60));
    console.log("\n1. Make sure you have set the correct ETHERSCAN_API_KEY in your .env file");
    console.log("2. For Sepolia testnet, you need an Etherscan API key");
    console.log("3. For Base Sepolia, you need a Basescan API key");
    console.log("4. If verification fails, you can manually verify using the constructor arguments above");
    console.log("5. Verification may take a few minutes to appear on the explorer\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Verification script failed:", error);
        process.exit(1);
    });

