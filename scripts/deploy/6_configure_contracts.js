const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== Step 6: Configure Contracts ===\n");
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Configuring with account:", deployer.address);
    
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
    
    // Configuration addresses
    const APPROVER = process.env.APPROVER_ADDRESS || deployer.address;
    const RESCUER = process.env.RESCUER_ADDRESS || deployer.address;
    const ADMIN = process.env.ADMIN_ADDRESS || deployer.address;
    
    // Validate addresses
    if (process.env.APPROVER_ADDRESS && !ethers.isAddress(process.env.APPROVER_ADDRESS)) {
        console.error("❌ Invalid APPROVER_ADDRESS provided");
        process.exit(1);
    }
    
    if (process.env.RESCUER_ADDRESS && !ethers.isAddress(process.env.RESCUER_ADDRESS)) {
        console.error("❌ Invalid RESCUER_ADDRESS provided");
        process.exit(1);
    }
    
    if (process.env.ADMIN_ADDRESS && !ethers.isAddress(process.env.ADMIN_ADDRESS)) {
        console.error("❌ Invalid ADMIN_ADDRESS provided");
        process.exit(1);
    }
    
    console.log("Configuration:");
    console.log("- Approver (Backend):", APPROVER);
    console.log("- Rescuer:", RESCUER);
    console.log("- Admin (Price Updater):", ADMIN);
    
    try {
        // Get contract instances
        const MinterContract = await ethers.getContractFactory("MinterContract");
        const minterContract = MinterContract.attach(deploymentState.minterContract);
        
        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        const pfpCollection = NFTCollection.attach(deploymentState.pfpCollection);
        const memeCollection = NFTCollection.attach(deploymentState.memeCollection);
        
        // 1. Set minter contract in NFT collections (only if newly deployed)
        console.log("\n--- Configuring NFT Collections ---");
        
        if (deploymentState.pfpCollectionDeployedInThisRun) {
            console.log("Setting minter contract in PFP Collection...");
            const tx1 = await pfpCollection.setMinterContract(deploymentState.minterContract);
            await tx1.wait();
            console.log("✅ PFP Collection minter set");
        } else {
            console.log("⏭️  Skipping PFP Collection (using existing collection)");
        }
        
        if (deploymentState.memeCollectionDeployedInThisRun) {
            console.log("Setting minter contract in Meme Collection...");
            const tx2 = await memeCollection.setMinterContract(deploymentState.minterContract);
            await tx2.wait();
            console.log("✅ Meme Collection minter set");
        } else {
            console.log("⏭️  Skipping Meme Collection (using existing collection)");
        }
        
        // 2. Grant roles in Minter Contract (only if newly deployed)
        console.log("\n--- Configuring Minter Contract Roles ---");
        
        if (deploymentState.minterContractDeployedInThisRun) {
            console.log("Granting APPROVER_ROLE to:", APPROVER);
            const approverRole = await minterContract.APPROVER_ROLE();
            const tx3 = await minterContract.grantRole(approverRole, APPROVER);
            await tx3.wait();
            console.log("✅ APPROVER_ROLE granted");
            
            console.log("Granting RESCUER_ROLE to:", RESCUER);
            const rescuerRole = await minterContract.RESCUER_ROLE();
            const tx4 = await minterContract.grantRole(rescuerRole, RESCUER);
            await tx4.wait();
            console.log("✅ RESCUER_ROLE granted");
        } else {
            console.log("⏭️  Skipping role grants (using existing minter contract)");
        }
        
        // Update deployment state
        deploymentState.configured = true;
        deploymentState.configuration = {
            approver: APPROVER,
            rescuer: RESCUER,
            admin: ADMIN
        };
        deploymentState.lastUpdate = new Date().toISOString();
        
        fs.writeFileSync(stateFile, JSON.stringify(deploymentState, null, 2));
        console.log("\n✅ Deployment state updated");
        
        console.log("\n=== Configuration Complete ===");
        console.log("Next: Run step 7 to verify deployment");
        
    } catch (error) {
        console.error("❌ Configuration failed:", error.message);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Configuration failed:", error);
        process.exit(1);
    });

