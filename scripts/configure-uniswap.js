const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Configuration script for Uniswap V2 integration
 * Run after deploying MinterContract to configure swap functionality
 */

// Network-specific configurations
const UNISWAP_ROUTERS = {
  mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  base: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  arbitrum: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  goerli: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  sepolia: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
};


async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;
  
  console.log("\n================================================");
  console.log("🔄 Configuring Uniswap V2 Integration");
  console.log("================================================");
  console.log(`Network: ${network}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH\n`);

  // Get contract addresses from deployment
  // TODO: Replace with your actual deployed contract addresses
  const MINTER_CONTRACT_ADDRESS = process.env.MINTER_CONTRACT_ADDRESS || "0x...";
  const CEO_TOKEN_ADDRESS = process.env.CEO_TOKEN_ADDRESS || "0x...";
  const USDC_TOKEN_ADDRESS = process.env.USDC_TOKEN_ADDRESS || "0x...";

  if (MINTER_CONTRACT_ADDRESS === "0x..." || 
      CEO_TOKEN_ADDRESS === "0x..." || 
      USDC_TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set contract addresses in environment variables or script");
    console.error("   Set: MINTER_CONTRACT_ADDRESS, CEO_TOKEN_ADDRESS, USDC_TOKEN_ADDRESS");
    process.exit(1);
  }

  // Get Uniswap router for current network
  const routerAddress = UNISWAP_ROUTERS[network];
  if (!routerAddress) {
    console.error(`❌ Error: No Uniswap V2 router configured for network: ${network}`);
    process.exit(1);
  }

  console.log("📋 Configuration Details:");
  console.log(`MinterContract: ${MINTER_CONTRACT_ADDRESS}`);
  console.log(`CEO Token: ${CEO_TOKEN_ADDRESS}`);
  console.log(`USDC Token: ${USDC_TOKEN_ADDRESS}`);
  console.log(`Uniswap Router: ${routerAddress}\n`);

  // Connect to MinterContract
  const MinterContract = await ethers.getContractFactory("MinterContract");
  const minterContract = MinterContract.attach(MINTER_CONTRACT_ADDRESS);

  // Check if already configured
  console.log("🔍 Checking current configuration...");
  const currentConfig = await minterContract.getUniswapConfig();
  console.log(`Current Router: ${currentConfig.router}`);
  console.log(`Current Path: ${currentConfig.path.join(" → ")}`);
  console.log(`Current Slippage: ${currentConfig.slippage} bps (${currentConfig.slippage / 100}%)`);
  console.log(`Is Configured: ${currentConfig.isConfigured}\n`);

  if (currentConfig.isConfigured) {
    console.log("⚠️  Warning: Uniswap is already configured!");
    console.log("Do you want to reconfigure? (This will override existing settings)");
    // In production, add user confirmation here
  }

  // Use direct swap path (CEO → USDC)
  const swapPath = [CEO_TOKEN_ADDRESS, USDC_TOKEN_ADDRESS];
  const pathDescription = "CEO → USDC (direct)";

  console.log(`📍 Selected swap path: ${pathDescription}`);
  console.log(`   ${swapPath.join(" → ")}\n`);

  // Set slippage tolerance (1% = 100 basis points)
  const slippageTolerance = 100; // 1%
  console.log(`📊 Slippage tolerance: ${slippageTolerance} bps (${slippageTolerance / 100}%)\n`);

  // Configure Uniswap
  console.log("⏳ Sending configuration transaction...");
  try {
    const tx = await minterContract.setUniswapConfig(
      routerAddress,
      swapPath,
      slippageTolerance
    );

    console.log(`📤 Transaction sent: ${tx.hash}`);
    console.log("⏳ Waiting for confirmation...\n");

    const receipt = await tx.wait();
    console.log("✅ Configuration successful!");
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}\n`);

    // Verify configuration
    console.log("🔍 Verifying new configuration...");
    const newConfig = await minterContract.getUniswapConfig();
    console.log(`✓ Router: ${newConfig.router}`);
    console.log(`✓ Path: ${newConfig.path.join(" → ")}`);
    console.log(`✓ Slippage: ${newConfig.slippage} bps`);
    console.log(`✓ Is Configured: ${newConfig.isConfigured}\n`);

    // Check swap settings
    const swapEnabled = await minterContract.usdcSwapEnabled();
    const swapPercentage = await minterContract.usdcSwapPercentage();
    console.log("📋 Current swap settings:");
    console.log(`   Swap Enabled: ${swapEnabled}`);
    console.log(`   Swap Percentage: ${swapPercentage} bps (${swapPercentage / 100}%)\n`);

    console.log("================================================");
    console.log("✅ Uniswap V2 Configuration Complete!");
    console.log("================================================");
    console.log("\n💡 Next steps:");
    console.log("   1. Verify liquidity exists in the swap path pools");
    console.log("   2. Test with a small NFT purchase");
    console.log("   3. Monitor CEOToUSDC events");
    console.log("   4. Check treasury balances after swap\n");

  } catch (error) {
    console.error("❌ Configuration failed:", error.message);
    if (error.reason) {
      console.error(`   Reason: ${error.reason}`);
    }
    process.exit(1);
  }
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Unhandled error:", error);
    process.exit(1);
  });

