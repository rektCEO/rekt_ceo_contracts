const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Script 12: Test Minting NFT with Permit
 * - Uses a USER wallet to sign a permit for CEO token spending
 * - Deployer (with APPROVER_ROLE) calls mintNFTWithPermit with user's permit
 * - Mints NFT to the user's address
 * - Verifies NFT was minted correctly and balances updated
 */

async function main() {
    console.log("\n=== Test Minting NFT with Permit ===\n");
    
    const [deployer] = await ethers.getSigners();
    const userPrivateKey = process.env.USER_PRIVATE_KEY;
    
    if (!userPrivateKey) {
        console.error("❌ USER_PRIVATE_KEY not found in .env file!");
        console.error("💡 Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
        process.exit(1);
    }
    
    const user = new ethers.Wallet(userPrivateKey, deployer.provider);
    console.log("Deployer:", deployer.address);
    console.log("User:    ", user.address);
    
    // Load deployment state
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Deployment state not found. Run previous steps first!");
        process.exit(1);
    }
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    
    // Verify required contracts
    const required = ['minterContract', 'ceoToken', 'usdc', 'pfpCollection'];
    for (const contract of required) {
        if (!deploymentState[contract]) {
            console.error(`❌ ${contract} not found in deployment state!`);
            process.exit(1);
        }
    }
    
    const minterAddress = deploymentState.minterContract;
    const ceoTokenAddress = deploymentState.ceoToken;
    const usdcAddress = deploymentState.usdc;
    const pfpCollectionAddress = deploymentState.pfpCollection;
    
    // Get contract instances
    const minterContract = await ethers.getContractAt("MinterContract", minterAddress);
    const ceoToken = await ethers.getContractAt("CEOToken", ceoTokenAddress);
    const usdc = await ethers.getContractAt("IERC20", usdcAddress);
    const pfpCollection = await ethers.getContractAt("NFTCollection", pfpCollectionAddress);
    
    const ceoDecimals = await ceoToken.decimals();
    const usdcDecimals = await ethers.getContractAt("IERC20Metadata", usdcAddress).then(c => c.decimals());
    const treasury = await minterContract.treasury();
    
    // Verify APPROVER_ROLE
    const approverRole = await minterContract.APPROVER_ROLE();
    const hasApproverRole = await minterContract.hasRole(approverRole, deployer.address);
    if (!hasApproverRole) {
        console.error("❌ Deployer does not have APPROVER_ROLE!");
        process.exit(1);
    }
    
    try {
        // Get tier info and fund user
        console.log("\n--- Funding User & Getting Tier Info ---");
        const tierInfo = await minterContract.getCurrentTierInfo(0); // 0 = PFP
        const priceCEO = tierInfo[3];
        
        console.log(`Tier ${tierInfo[1]}: $${ethers.formatUnits(tierInfo[2], usdcDecimals)} = ${ethers.formatUnits(priceCEO, ceoDecimals)} CEO (${tierInfo[4]} remaining)`);
        
        const userInitialBalance = await ceoToken.balanceOf(user.address);
        if (userInitialBalance < priceCEO) {
            const amountToTransfer = priceCEO * 2n;
            await (await ceoToken.connect(deployer).transfer(user.address, amountToTransfer)).wait();
            console.log(`✅ Funded user with ${ethers.formatUnits(amountToTransfer, ceoDecimals)} CEO`);
        }
        
        // Create permit signature
        console.log("\n--- Creating Permit Signature ---");
        const owner = user.address;
        const spender = minterAddress;
        const value = priceCEO;
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = await ceoToken.nonces(owner);
        const chainId = (await deployer.provider.getNetwork()).chainId;
        const name = await ceoToken.name();
        
        const domain = {
            name: name,
            version: "1",
            chainId: chainId,
            verifyingContract: ceoTokenAddress
        };
        
        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };
        
        const message = {
            owner: owner,
            spender: spender,
            value: value.toString(),
            nonce: nonce.toString(),
            deadline: deadline
        };
        
        const signature = await user.signTypedData(domain, types, message);
        const sig = ethers.Signature.from(signature);
        console.log(`✅ Permit signed (nonce: ${nonce}, deadline: ${new Date(deadline * 1000).toISOString()})`);
        
        // Get initial balances
        const userCEOBefore = await ceoToken.balanceOf(user.address);
        const treasuryCEOBefore = await ceoToken.balanceOf(treasury);
        const treasuryUSDCBefore = await usdc.balanceOf(treasury);
        const userNFTsBefore = await pfpCollection.balanceOf(user.address);
        
        // Mint NFT with permit
        console.log("\n--- Minting NFT with Permit ---");
        const metadataURI = "ipfs://QmTestPermitMintHash123456";
        const permitData = {
            owner: owner,
            spender: spender,
            value: value,
            deadline: deadline,
            v: sig.v,
            r: sig.r,
            s: sig.s
        };
        
        const mintTx = await minterContract.connect(deployer).mintNFTWithPermit(0, metadataURI, permitData);
        const mintReceipt = await mintTx.wait();
        
        // Parse event
        let tokenId, ceoSpent;
        for (const log of mintReceipt.logs) {
            try {
                const parsed = minterContract.interface.parseLog(log);
                if (parsed && parsed.name === "NFTPurchased") {
                    tokenId = parsed.args.tokenId;
                    ceoSpent = parsed.args.ceoAmount;
                }
            } catch (e) {
                // Skip non-matching logs
            }
        }
        
        console.log(`✅ NFT #${tokenId} minted (Gas: ${mintReceipt.gasUsed}, Tx: ${mintTx.hash})`);
        
        // Verify balances
        console.log("\n--- Verification ---");
        const userCEOAfter = await ceoToken.balanceOf(user.address);
        const treasuryCEOAfter = await ceoToken.balanceOf(treasury);
        const treasuryUSDCAfter = await usdc.balanceOf(treasury);
        const userNFTsAfter = await pfpCollection.balanceOf(user.address);
        const newNonce = await ceoToken.nonces(user.address);
        
        const userCEOChange = userCEOAfter - userCEOBefore;
        const treasuryCEOChange = treasuryCEOAfter - treasuryCEOBefore;
        const treasuryUSDCChange = treasuryUSDCAfter - treasuryUSDCBefore;
        const nftOwner = await pfpCollection.ownerOf(tokenId);
        
        console.log(`User: ${ethers.formatUnits(-userCEOChange, ceoDecimals)} CEO spent, +${userNFTsAfter - userNFTsBefore} NFT`);
        console.log(`Treasury: +${ethers.formatUnits(treasuryCEOChange, ceoDecimals)} CEO, +${ethers.formatUnits(treasuryUSDCChange, usdcDecimals)} USDC`);
        console.log(`Permit: Nonce ${nonce} → ${newNonce} ${newNonce > nonce ? '✅' : '❌'}`);
        console.log(`NFT: Owner ${nftOwner === user.address ? '✅' : '❌'} matches user`);
        
        // Update deployment state
        deploymentState.lastUpdate = new Date().toISOString();
        if (!deploymentState.permitTestResults) {
            deploymentState.permitTestResults = [];
        }
        deploymentState.permitTestResults.push({
            timestamp: new Date().toISOString(),
            user: user.address,
            nftType: "PFP",
            tokenId: tokenId.toString(),
            ceoSpent: ceoSpent.toString(),
            treasuryCEOGained: treasuryCEOChange.toString(),
            treasuryUSDCGained: treasuryUSDCChange.toString(),
            blockNumber: mintReceipt.blockNumber,
            transactionHash: mintTx.hash,
            permitUsed: true
        });
        deploymentState.permitMintingTested = true;
        fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
        
        console.log("\n🎉 Permit minting test completed successfully!");
        console.log(`   User minted NFT without pre-approval (gasless permit)`);
        
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌", error.message);
        process.exit(1);
    });
