const { ethers } = require("hardhat");

async function main() {
    console.log("Starting deployment of Rekt CEO contracts...");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());
    
    // Deployment parameters - UPDATE THESE FOR YOUR DEPLOYMENT
    const DEPLOYMENT_CONFIG = {
        // Admin addresses (multisig recommended for production)
        admin: deployer.address, // Replace with multisig address
        treasury: deployer.address, // Replace with treasury address
        devWallet: deployer.address, // Replace with dev wallet address
        approver: deployer.address, // Backend wallet address
        rescuer: deployer.address, // Rescuer wallet address
        safeWallet: deployer.address, // Safe (Gnosis) wallet for royalties
        
        // NFT Collection names and symbols
        pfpName: "Rekt CEO PFPs",
        pfpSymbol: "RCPFP",
        pfpMaxSupply: 999,
        pfpMaxMintPerUser: 2,
        memeName: "Rekt CEO Memes",
        memeSymbol: "RCMEME",
        memeMaxSupply: 9999,
        memeMaxMintPerUser: 9,
        royaltyPercentage: 210 // 2.1% total (split 50/50 = 1.05% each for protocol and creator)
    };
    
    console.log("\n=== Deployment Configuration ===");
    console.log("Admin:", DEPLOYMENT_CONFIG.admin);
    console.log("Treasury:", DEPLOYMENT_CONFIG.treasury);
    console.log("Dev Wallet:", DEPLOYMENT_CONFIG.devWallet);
    console.log("Approver:", DEPLOYMENT_CONFIG.approver);
    console.log("Rescuer:", DEPLOYMENT_CONFIG.rescuer);
    console.log("PFP Collection:", DEPLOYMENT_CONFIG.pfpName, "(", DEPLOYMENT_CONFIG.pfpSymbol, ")");
    console.log("Meme Collection:", DEPLOYMENT_CONFIG.memeName, "(", DEPLOYMENT_CONFIG.memeSymbol, ")");
    
    try {
        // 1. Deploy CEO Token
        console.log("\n=== Deploying CEO Token ===");
        const CEOToken = await ethers.getContractFactory("CEOToken");
        const ceoToken = await CEOToken.deploy(DEPLOYMENT_CONFIG.admin);
        await ceoToken.waitForDeployment();
        console.log("CEO Token deployed to:", await ceoToken.getAddress());
        
        // 2. Deploy PFP Collection
        console.log("\n=== Deploying PFP Collection ===");
        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        const pfpCollection = await NFTCollection.deploy(
            DEPLOYMENT_CONFIG.pfpName,
            DEPLOYMENT_CONFIG.pfpSymbol,
            DEPLOYMENT_CONFIG.admin,
            DEPLOYMENT_CONFIG.safeWallet,
            DEPLOYMENT_CONFIG.pfpMaxSupply,
            DEPLOYMENT_CONFIG.pfpMaxMintPerUser,
            DEPLOYMENT_CONFIG.royaltyPercentage
        );
        await pfpCollection.waitForDeployment();
        console.log("PFP Collection deployed to:", await pfpCollection.getAddress());
        
        // 3. Deploy Meme Collection
        console.log("\n=== Deploying Meme Collection ===");
        const memeCollection = await NFTCollection.deploy(
            DEPLOYMENT_CONFIG.memeName,
            DEPLOYMENT_CONFIG.memeSymbol,
            DEPLOYMENT_CONFIG.admin,
            DEPLOYMENT_CONFIG.safeWallet,
            DEPLOYMENT_CONFIG.memeMaxSupply,
            DEPLOYMENT_CONFIG.memeMaxMintPerUser,
            DEPLOYMENT_CONFIG.royaltyPercentage
        );
        await memeCollection.waitForDeployment();
        console.log("Meme Collection deployed to:", await memeCollection.getAddress());

        // 3.5 Deploy Mock USDC for testing / use provided address in prod
        console.log("\n=== Deploying Mock USDC (testing) ===");
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("MockUSDC", "USDC");
        await usdc.waitForDeployment();
        console.log("Mock USDC deployed to:", await usdc.getAddress());
        
        // 4. Deploy Minter Contract
        console.log("\n=== Deploying Minter Contract ===");
        const MinterContract = await ethers.getContractFactory("MinterContract");
        const minterContract = await MinterContract.deploy(
            await ceoToken.getAddress(),
            await pfpCollection.getAddress(),
            await memeCollection.getAddress(),
            await usdc.getAddress(),
            DEPLOYMENT_CONFIG.treasury,
            DEPLOYMENT_CONFIG.safeWallet,
            DEPLOYMENT_CONFIG.admin
        );
        await minterContract.waitForDeployment();
        console.log("Minter Contract deployed to:", await minterContract.getAddress());
        
        // 5. Configure contracts
        console.log("\n=== Configuring Contracts ===");
        
        // Set minter contract in NFT collections
        console.log("Setting minter contract in PFP Collection...");
        await pfpCollection.setMinterContract(await minterContract.getAddress());
        
        console.log("Setting minter contract in Meme Collection...");
        await memeCollection.setMinterContract(await minterContract.getAddress());
        
        // Grant roles in Minter Contract
        console.log("Granting roles in Minter Contract...");
        await minterContract.grantRole(await minterContract.APPROVER_ROLE(), DEPLOYMENT_CONFIG.approver);
        await minterContract.grantRole(await minterContract.RESCUER_ROLE(), DEPLOYMENT_CONFIG.rescuer);
        await minterContract.grantRole(await minterContract.PRICE_UPDATER_ROLE(), DEPLOYMENT_CONFIG.admin);
        
        // Set dev wallet in CEO Token
        console.log("Setting dev wallet in CEO Token...");
        await ceoToken.setDevWallet(DEPLOYMENT_CONFIG.devWallet);
        
        // Mint dev allocation
        console.log("Minting dev allocation...");
        await ceoToken.mintDevAllocation();
        
        // 6. Verify deployment
        console.log("\n=== Verifying Deployment ===");
        
        // Check CEO Token
        const totalSupply = await ceoToken.totalSupply();
        const maxSupply = await ceoToken.MAX_SUPPLY();
        console.log("CEO Token total supply:", ethers.formatEther(totalSupply));
        console.log("CEO Token max supply:", ethers.formatEther(maxSupply));
        
        // Check NFT Collections
        const pfpMaxSupply = await pfpCollection.MAX_SUPPLY();
        const memeMaxSupply = await memeCollection.MAX_SUPPLY();
        console.log("PFP Collection max supply:", pfpMaxSupply.toString());
        console.log("Meme Collection max supply:", memeMaxSupply.toString());
        
        // Check Minter Contract
        const ceoPrice = await minterContract.ceoPriceUSD();
        console.log("CEO Price in USD:", ethers.formatEther(ceoPrice));
        
        // 7. Save deployment info
        const deploymentInfo = {
            network: await deployer.provider.getNetwork(),
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            contracts: {
                ceoToken: await ceoToken.getAddress(),
                pfpCollection: await pfpCollection.getAddress(),
                memeCollection: await memeCollection.getAddress(),
                minterContract: await minterContract.getAddress()
            },
            configuration: DEPLOYMENT_CONFIG
        };
        
        console.log("\n=== Deployment Summary ===");
        console.log("Network:", deploymentInfo.network.name, "(", deploymentInfo.network.chainId, ")");
        console.log("Deployer:", deploymentInfo.deployer);
        console.log("Timestamp:", deploymentInfo.timestamp);
        console.log("\nContract Addresses:");
        console.log("CEO Token:", deploymentInfo.contracts.ceoToken);
        console.log("PFP Collection:", deploymentInfo.contracts.pfpCollection);
        console.log("Meme Collection:", deploymentInfo.contracts.memeCollection);
        console.log("Minter Contract:", deploymentInfo.contracts.minterContract);
        
        console.log("\n=== Next Steps ===");
        console.log("1. Verify contracts on block explorer");
        console.log("2. Update backend configuration with contract addresses");
        console.log("3. Test the contracts with a small amount");
        console.log("4. Transfer admin roles to multisig wallets");
        console.log("5. Update frontend with contract addresses");
        
        // Save deployment info to file
        const fs = require('fs');
        const path = require('path');
        const deploymentFile = path.join(__dirname, '..', 'deployments', `${deploymentInfo.network.name}-${Date.now()}.json`);
        
        // Create deployments directory if it doesn't exist
        const deploymentsDir = path.dirname(deploymentFile);
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }
        
        fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
        console.log("\nDeployment info saved to:", deploymentFile);
        
    } catch (error) {
        console.error("Deployment failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
