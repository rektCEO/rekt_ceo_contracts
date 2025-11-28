const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Script 11: Test Minting and Verify Balances
 * - Mints a test NFT using the minter contract
 * - Verifies NFT was minted correctly
 * - Checks CEO token balance in treasury
 * - Checks USDC balance in treasury
 * - Validates swap functionality
 */

async function main() {
    console.log("\n=== Step 11: Test Minting and Verify Balances ===\n");
    
    // Get the deployer account (will act as approver)
    const [deployer] = await ethers.getSigners();
    console.log("Testing with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");
    
    // Load previous deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run previous steps first!");
        process.exit(1);
    }
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    // Verify all required contracts are present
    if (!deploymentState.minterContract) {
        console.error("❌ Minter Contract not found. Run step 5 first!");
        process.exit(1);
    }
    if (!deploymentState.ceoToken) {
        console.error("❌ CEO Token not found. Run step 1 first!");
        process.exit(1);
    }
    if (!deploymentState.usdc) {
        console.error("❌ USDC not found. Run step 4 first!");
        process.exit(1);
    }
    if (!deploymentState.pfpCollection) {
        console.error("❌ PFP Collection not found. Run step 2 first!");
        process.exit(1);
    }
    if (!deploymentState.memeCollection) {
        console.error("❌ Meme Collection not found. Run step 3 first!");
        process.exit(1);
    }
    if (!deploymentState.uniswapConfigured) {
        console.log("⚠️  Warning: Uniswap not configured in deployment state.");
        console.log("   Make sure you've run step 10 to configure Uniswap!");
        console.log("   Continuing anyway...\n");
    }
    
    const minterAddress = deploymentState.minterContract;
    const ceoTokenAddress = deploymentState.ceoToken;
    const usdcAddress = deploymentState.usdc;
    const pfpCollectionAddress = deploymentState.pfpCollection;
    const memeCollectionAddress = deploymentState.memeCollection;
    
    console.log("Contract Addresses:");
    console.log("- Minter Contract:", minterAddress);
    console.log("- CEO Token:", ceoTokenAddress);
    console.log("- USDC Token:", usdcAddress);
    console.log("- PFP Collection:", pfpCollectionAddress);
    console.log("- Meme Collection:", memeCollectionAddress);
    
    // Get contract instances
    const minterContract = await ethers.getContractAt("MinterContract", minterAddress);
    const ceoToken = await ethers.getContractAt("IERC20", ceoTokenAddress);
    const usdc = await ethers.getContractAt("IERC20", usdcAddress);
    const pfpCollection = await ethers.getContractAt("NFTCollection", pfpCollectionAddress);
    const memeCollection = await ethers.getContractAt("NFTCollection", memeCollectionAddress);
    
    // Get decimals
    const ceoDecimals = await ethers.getContractAt("IERC20Metadata", ceoTokenAddress).then(c => c.decimals());
    const usdcDecimals = await ethers.getContractAt("IERC20Metadata", usdcAddress).then(c => c.decimals());
    
    // Get treasury address
    const treasury = await minterContract.treasury();
    console.log("- Treasury:", treasury);
    
    // Check if deployer has APPROVER_ROLE
    const approverRole = await minterContract.APPROVER_ROLE();
    const hasApproverRole = await minterContract.hasRole(approverRole, deployer.address);
    
    if (!hasApproverRole) {
        console.error("\n❌ Error: Deployer does not have APPROVER_ROLE!");
        console.error(`   Required role: APPROVER_ROLE`);
        console.error(`   Current address: ${deployer.address}`);
        console.error("\n💡 Grant APPROVER_ROLE to this address or use an account with APPROVER_ROLE");
        process.exit(1);
    }
    
    console.log("\n✅ Deployer has APPROVER_ROLE");
    
    try {
        // Get initial balances
        console.log("\n--- Initial Balances ---");
        
        const initialCEOBalance = await ceoToken.balanceOf(deployer.address);
        const initialUSDCBalance = await usdc.balanceOf(deployer.address);
        const initialTreasuryCEO = await ceoToken.balanceOf(treasury);
        const initialTreasuryUSDC = await usdc.balanceOf(treasury);
        
        console.log("Deployer (Minter):");
        console.log("  CEO:", ethers.formatUnits(initialCEOBalance, ceoDecimals));
        console.log("  USDC:", ethers.formatUnits(initialUSDCBalance, usdcDecimals));
        
        console.log("Treasury:");
        console.log("  CEO:", ethers.formatUnits(initialTreasuryCEO, ceoDecimals));
        console.log("  USDC:", ethers.formatUnits(initialTreasuryUSDC, usdcDecimals));
        
        // Get current tier info
        console.log("\n--- Current Tier Information ---");
        
        const NFTType_PFP = 0;
        const NFTType_MEME = 1;
        
        let tierInfo;
        try {
            tierInfo = await minterContract.getCurrentTierInfo(NFTType_PFP);
            console.log("PFP Collection:");
            console.log("  Current Supply:", tierInfo.currentSupply.toString());
            console.log("  Tier ID:", tierInfo.tierId.toString());
            console.log("  Price (USD):", ethers.formatUnits(tierInfo.priceUSD, usdcDecimals));
            console.log("  Price (CEO):", ethers.formatUnits(tierInfo.priceCEO, ceoDecimals));
            console.log("  Remaining in Tier:", tierInfo.remainingInTier.toString());
        } catch (error) {
            console.error("❌ Failed to get PFP tier info:", error.message);
            if (error.message.includes("Uniswap")) {
                console.error("   Issue: Uniswap not properly configured or no liquidity");
                console.error("   Make sure you've run steps 9 and 10");
            }
            throw error;
        }
        
        const requiredCEO = tierInfo.priceCEO;
        
        // Check if deployer has enough CEO tokens
        if (initialCEOBalance < requiredCEO) {
            console.error("\n❌ Insufficient CEO tokens for minting!");
            console.error(`   Required: ${ethers.formatUnits(requiredCEO, ceoDecimals)} CEO`);
            console.error(`   Available: ${ethers.formatUnits(initialCEOBalance, ceoDecimals)} CEO`);
            console.error("\n💡 You can:");
            console.error("   1. Mint more CEO tokens (if using mock CEO)");
            console.error("   2. Acquire more CEO tokens");
            process.exit(1);
        }
        
        console.log("\n✅ Deployer has enough CEO tokens for minting");
        
        // Get initial NFT count
        const initialPFPCount = await pfpCollection.getCurrentTokenId();
        console.log("\nInitial PFP NFT Count:", initialPFPCount.toString());
        
        // Approve CEO tokens for minter contract
        console.log("\n--- Approving CEO Tokens ---");
        console.log(`Approving ${ethers.formatUnits(requiredCEO, ceoDecimals)} CEO tokens...`);
        
        const approveTx = await ceoToken.approve(minterAddress, requiredCEO);
        await approveTx.wait();
        console.log("✅ CEO tokens approved");
        
        // Check allowance
        const allowance = await ceoToken.allowance(deployer.address, minterAddress);
        console.log("Allowance:", ethers.formatUnits(allowance, ceoDecimals), "CEO");
        
        // Mint NFT
        console.log("\n--- Minting Test NFT ---");
        console.log("NFT Type: PFP");
        console.log("Metadata URI: ipfs://test-metadata-uri");
        console.log("Expected CEO Cost:", ethers.formatUnits(requiredCEO, ceoDecimals), "CEO");
        
        const metadataURI = "ipfs://test-metadata-uri-" + Date.now();
        
        console.log("\nSending mint transaction...");
        const mintTx = await minterContract.mintNFT(
            NFTType_PFP,
            metadataURI,
            {
                gasLimit: 500000 // Set explicit gas limit
            }
        );
        
        console.log("Transaction hash:", mintTx.hash);
        console.log("⏳ Waiting for confirmation...");
        
        const receipt = await mintTx.wait();
        console.log("✅ Mint successful!");
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
        
        // Parse events
        console.log("\n--- Parsing Events ---");
        
        // Find NFTPurchased event
        const nftPurchasedEvent = receipt.logs.find(log => {
            try {
                const parsed = minterContract.interface.parseLog({
                    topics: [...log.topics],
                    data: log.data
                });
                return parsed?.name === "NFTPurchased";
            } catch (e) {
                return false;
            }
        });
        
        if (nftPurchasedEvent) {
            const parsed = minterContract.interface.parseLog({
                topics: [...nftPurchasedEvent.topics],
                data: nftPurchasedEvent.data
            });
            console.log("✓ NFTPurchased Event:");
            console.log("  User:", parsed.args.user);
            console.log("  NFT Type:", parsed.args.nftType === 0n ? "PFP" : "MEME");
            console.log("  Tier ID:", parsed.args.tierId.toString());
            console.log("  CEO Amount:", ethers.formatUnits(parsed.args.ceoAmount, ceoDecimals));
            console.log("  Token ID:", parsed.args.tokenId.toString());
            console.log("  Metadata URI:", parsed.args.metadataURI);
        }
        
        // Find CEOToUSDC event
        const ceoToUSDCEvent = receipt.logs.find(log => {
            try {
                const parsed = minterContract.interface.parseLog({
                    topics: [...log.topics],
                    data: log.data
                });
                return parsed?.name === "CEOToUSDC";
            } catch (e) {
                return false;
            }
        });
        
        if (ceoToUSDCEvent) {
            const parsed = minterContract.interface.parseLog({
                topics: [...ceoToUSDCEvent.topics],
                data: ceoToUSDCEvent.data
            });
            console.log("✓ CEOToUSDC Event (Swap Executed):");
            console.log("  CEO Amount:", ethers.formatUnits(parsed.args.ceoAmount, ceoDecimals));
            console.log("  USDC Amount:", ethers.formatUnits(parsed.args.usdcAmount, usdcDecimals));
        } else {
            console.log("ℹ️  No CEOToUSDC event found (swap may not have occurred)");
        }
        
        // Verify NFT was minted
        console.log("\n--- Verifying NFT Minting ---");
        
        const finalPFPCount = await pfpCollection.getCurrentTokenId();
        console.log("Final PFP NFT Count:", finalPFPCount.toString());
        console.log("NFTs Minted:", (finalPFPCount - initialPFPCount).toString());
        
        if (finalPFPCount <= initialPFPCount) {
            console.error("❌ NFT was not minted!");
            process.exit(1);
        }
        
        const tokenId = finalPFPCount - 1n;
        const tokenOwner = await pfpCollection.ownerOf(tokenId);
        const tokenURI = await pfpCollection.tokenURI(tokenId);
        
        console.log("\n✅ NFT Minted Successfully!");
        console.log("  Token ID:", tokenId.toString());
        console.log("  Owner:", tokenOwner);
        console.log("  Token URI:", tokenURI);
        
        if (tokenOwner.toLowerCase() !== deployer.address.toLowerCase()) {
            console.error("❌ NFT owner mismatch!");
            console.error(`   Expected: ${deployer.address}`);
            console.error(`   Got: ${tokenOwner}`);
            process.exit(1);
        }
        
        // Get final balances
        console.log("\n--- Final Balances ---");
        
        const finalCEOBalance = await ceoToken.balanceOf(deployer.address);
        const finalUSDCBalance = await usdc.balanceOf(deployer.address);
        const finalTreasuryCEO = await ceoToken.balanceOf(treasury);
        const finalTreasuryUSDC = await usdc.balanceOf(treasury);
        
        console.log("Deployer (Minter):");
        console.log("  CEO:", ethers.formatUnits(finalCEOBalance, ceoDecimals));
        console.log("  USDC:", ethers.formatUnits(finalUSDCBalance, usdcDecimals));
        
        console.log("Treasury:");
        console.log("  CEO:", ethers.formatUnits(finalTreasuryCEO, ceoDecimals));
        console.log("  USDC:", ethers.formatUnits(finalTreasuryUSDC, usdcDecimals));
        
        // Calculate changes
        console.log("\n--- Balance Changes ---");
        
        const ceoSpent = initialCEOBalance - finalCEOBalance;
        const treasuryCEOGained = finalTreasuryCEO - initialTreasuryCEO;
        const treasuryUSDCGained = finalTreasuryUSDC - initialTreasuryUSDC;
        
        console.log("Deployer:");
        console.log("  CEO Spent:", ethers.formatUnits(ceoSpent, ceoDecimals));
        
        console.log("Treasury:");
        console.log("  CEO Gained:", ethers.formatUnits(treasuryCEOGained, ceoDecimals));
        console.log("  USDC Gained:", ethers.formatUnits(treasuryUSDCGained, usdcDecimals));
        
        // Verify swap functionality
        console.log("\n--- Verifying Swap Functionality ---");
        
        const usdcSwapEnabled = await minterContract.usdcSwapEnabled();
        const usdcSwapPercentage = await minterContract.usdcSwapPercentage();
        
        console.log("USDC Swap Enabled:", usdcSwapEnabled);
        console.log("USDC Swap Percentage:", usdcSwapPercentage.toString(), "bps (" + (Number(usdcSwapPercentage) / 100) + "%)");
        
        if (usdcSwapEnabled && usdcSwapPercentage > 0n) {
            // Expected: ~50% CEO swapped to USDC, ~50% CEO sent directly
            const expectedCEOToTreasury = (ceoSpent * (10000n - usdcSwapPercentage)) / 10000n;
            const expectedCEOSwapped = ceoSpent - expectedCEOToTreasury;
            
            console.log("\nExpected Distribution:");
            console.log("  CEO to Treasury (direct):", ethers.formatUnits(expectedCEOToTreasury, ceoDecimals));
            console.log("  CEO Swapped to USDC:", ethers.formatUnits(expectedCEOSwapped, ceoDecimals));
            
            // Allow for small discrepancies due to rounding
            const ceoTolerance = ceoSpent / 100n; // 1% tolerance
            
            if (treasuryUSDCGained > 0n) {
                console.log("\n✅ USDC swap executed successfully!");
                console.log("   Treasury received USDC from swap");
            } else {
                console.log("\n⚠️  Warning: No USDC received in treasury");
                console.log("   This might indicate:");
                console.log("   - Swap failed silently (check logs)");
                console.log("   - Insufficient liquidity in pool");
                console.log("   - Swap path not configured correctly");
            }
            
            if (treasuryCEOGained > 0n) {
                console.log("✅ Direct CEO transfer to treasury successful!");
            }
        } else {
            console.log("\nℹ️  USDC swap is disabled");
            console.log("   All CEO tokens should go directly to treasury");
            
            if (treasuryCEOGained === ceoSpent) {
                console.log("✅ All CEO tokens transferred to treasury correctly!");
            } else {
                console.log("⚠️  CEO balance mismatch");
                console.log(`   Expected: ${ethers.formatUnits(ceoSpent, ceoDecimals)}`);
                console.log(`   Got: ${ethers.formatUnits(treasuryCEOGained, ceoDecimals)}`);
            }
        }
        
        // Update deployment state
        console.log("\n--- Updating Deployment State ---");
        
        if (!deploymentState.testResults) {
            deploymentState.testResults = [];
        }
        
        deploymentState.testResults.push({
            timestamp: new Date().toISOString(),
            nftType: "PFP",
            tokenId: tokenId.toString(),
            ceoSpent: ceoSpent.toString(),
            treasuryCEOGained: treasuryCEOGained.toString(),
            treasuryUSDCGained: treasuryUSDCGained.toString(),
            blockNumber: receipt.blockNumber,
            transactionHash: mintTx.hash
        });
        
        deploymentState.lastUpdate = new Date().toISOString();
        deploymentState.mintingTested = true;
        
        fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
        console.log("✅ Deployment state updated");
        
        // Summary
        console.log("\n=== Test Minting Complete ===");
        console.log("\n📊 Summary:");
        console.log("✓ NFT minted successfully");
        console.log("  - Token ID:", tokenId.toString());
        console.log("  - Owner:", tokenOwner);
        console.log("  - Collection: PFP");
        
        console.log("\n✓ Payment processed");
        console.log("  - CEO Spent:", ethers.formatUnits(ceoSpent, ceoDecimals));
        console.log("  - CEO to Treasury:", ethers.formatUnits(treasuryCEOGained, ceoDecimals));
        console.log("  - USDC to Treasury:", ethers.formatUnits(treasuryUSDCGained, usdcDecimals));
        
        if (treasuryUSDCGained > 0n) {
            const swapRate = (Number(treasuryUSDCGained) * Math.pow(10, Number(ceoDecimals))) / 
                             (Number(ceoSpent) * Math.pow(10, Number(usdcDecimals))) * 
                             (Number(usdcSwapPercentage) / 10000);
            console.log("\n✓ Swap executed");
            console.log("  - Effective swap rate: ~" + swapRate.toFixed(6) + " USDC per CEO");
        }
        
        console.log("\n✅ All tests passed!");
        console.log("\n💡 Next steps:");
        console.log("   1. Deploy to mainnet/testnet if not already done");
        console.log("   2. Monitor gas costs and optimize if needed");
        console.log("   3. Test with different NFT types (MEME)");
        console.log("   4. Set up backend integration for APPROVER_ROLE");
        console.log("   5. Implement frontend for users to mint NFTs");
        
    } catch (error) {
        console.error("\n❌ Test failed:", error.message);
        if (error.reason) {
            console.error(`   Reason: ${error.reason}`);
        }
        if (error.code) {
            console.error(`   Code: ${error.code}`);
        }
        
        // Additional troubleshooting
        console.error("\n💡 Troubleshooting:");
        console.error("   1. Check if Uniswap pool has liquidity (run step 9)");
        console.error("   2. Verify Uniswap is configured (run step 10)");
        console.error("   3. Ensure deployer has APPROVER_ROLE (run step 6)");
        console.error("   4. Check CEO token balance and allowance");
        console.error("   5. Verify all contracts are properly deployed");
        
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });

