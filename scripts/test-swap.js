const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Script to test Uniswap V2 swaps on mainnet using UniswapSwapTester contract
 * This allows you to test the swap functionality before integrating into main contract
 */

// Network configurations
const NETWORK_CONFIG = {
  mainnet: {
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcDecimals: 6
  },
  base: {
    uniswapRouter: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDecimals: 6
  },
  arbitrum: {
    uniswapRouter: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcDecimals: 6
  }
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;
  
  console.log("\n================================================");
  console.log("🧪 Uniswap V2 Swap Tester");
  console.log("================================================");
  console.log(`Network: ${network}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Get network config
  const config = NETWORK_CONFIG[network];
  if (!config) {
    console.error(`❌ Error: Network ${network} not supported`);
    console.error("Supported networks: mainnet, base, arbitrum");
    process.exit(1);
  }

  // Get CEO token address from environment
  const CEO_TOKEN = process.env.CEO_TOKEN_ADDRESS;
  if (!CEO_TOKEN) {
    console.error("❌ Error: CEO_TOKEN_ADDRESS not set in environment");
    console.error("   Please set it in your .env file or run:");
    console.error(`   export CEO_TOKEN_ADDRESS=<your_ceo_token_address>`);
    process.exit(1);
  }

  // Validate address format
  if (!ethers.isAddress(CEO_TOKEN)) {
    console.error(`❌ Error: Invalid CEO_TOKEN_ADDRESS format: ${CEO_TOKEN}`);
    console.error("   Please provide a valid Ethereum address (0x...)");
    process.exit(1);
  }

  console.log("📋 Configuration:");
  console.log(`CEO Token: ${CEO_TOKEN}`);
  console.log(`USDC Token: ${config.usdc}`);
  console.log(`Uniswap Router: ${config.uniswapRouter}`);
  console.log(`Swap Path: CEO → USDC (direct)\n`);

  // Get existing tester contract from environment
  const testerAddress = process.env.UNISWAP_TESTER_BASE;
  if (!testerAddress) {
    console.error("❌ Error: UNISWAP_TESTER_BASE not set in environment");
    console.error("   Please set it in your .env file:");
    console.error(`   export UNISWAP_TESTER_BASE=<your_tester_contract_address>`);
    process.exit(1);
  }

  // Validate address format
  if (!ethers.isAddress(testerAddress)) {
    console.error(`❌ Error: Invalid UNISWAP_TESTER_BASE format: ${testerAddress}`);
    console.error("   Please provide a valid Ethereum address (0x...)");
    process.exit(1);
  }

  console.log(`📍 Using UniswapSwapTester at: ${testerAddress}\n`);
  const UniswapSwapTester = await ethers.getContractFactory("UniswapSwapTester");
  const tester = UniswapSwapTester.attach(testerAddress);

  // Get CEO token contract
  const ceoToken = await ethers.getContractAt("IERC20", CEO_TOKEN);

  // Check balances
  console.log("💰 Checking balances...");
  const deployerCEO = await ceoToken.balanceOf(deployer.address);
  const testerBalances = await tester.getBalances();
  console.log(`Deployer CEO: ${ethers.formatEther(deployerCEO)}`);
  console.log(`Tester CEO: ${ethers.formatEther(testerBalances.ceoBalance)}`);
  console.log(`Tester USDC: ${ethers.formatUnits(testerBalances.usdcBalance, config.usdcDecimals)}\n`);

  // Test amount (default: 100 CEO tokens)
  const testAmount = process.env.TEST_AMOUNT 
    ? ethers.parseEther(process.env.TEST_AMOUNT)
    : ethers.parseEther("100");

  console.log(`🎯 Test amount: ${ethers.formatEther(testAmount)} CEO\n`);

  // Deposit CEO if needed
  if (testerBalances.ceoBalance < testAmount) {
    const needed = testAmount - testerBalances.ceoBalance;
    console.log(`📥 Depositing ${ethers.formatEther(needed)} CEO to tester...`);
    
    const approveTx = await ceoToken.approve(testerAddress, needed);
    console.log(`⏳ Waiting for approval tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`✅ Approved`);

    // Force nonce refresh before next transaction
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 1 second
    const currentNonce = await deployer.getNonce();
    console.log(`📍 Current nonce: ${currentNonce}`);
    
    const depositTx = await tester.depositCEO(needed, {nonce: currentNonce});
    console.log(`⏳ Waiting for deposit tx: ${depositTx.hash}`);
    await depositTx.wait();
    console.log(`✅ Deposited\n`);
  }

  // Check expected output for direct swap
  console.log("📊 Checking expected output (CEO → USDC direct path)...");
  try {
    const expectedDirect = await tester.getExpectedOutputDirect(testAmount);
    console.log(`✅ Expected USDC (CEO → USDC): ${ethers.formatUnits(expectedDirect, config.usdcDecimals)}`);
    const rate = (expectedDirect * ethers.parseEther("1")) / testAmount;
    console.log(`   Rate: 1 CEO = ${ethers.formatUnits(rate, config.usdcDecimals)} USDC\n`);
  } catch (error) {
    console.log(`❌ Direct path failed: ${error.reason || error.message}`);
    console.log(`   This means no CEO/USDC pool exists`);
    console.log(`   Please create a CEO/USDC liquidity pool on Uniswap first\n`);
    process.exit(1);
  }

  // Ask user to confirm actual swap
  console.log("⚠️  WARNING: The following test will execute a REAL swap on mainnet!");
  console.log(`   This will swap ${ethers.formatEther(testAmount)} CEO for USDC`);
  console.log(`   Recipient: ${deployer.address}`);
  console.log(`   Slippage: 1%\n`);

  // In a real scenario, you'd want user confirmation here
  // For now, we'll skip actual swap unless explicitly requested
  const shouldSwap = process.env.EXECUTE_SWAP === "true";

  if (shouldSwap) {
    console.log("🔄 Executing test swap (direct path: CEO → USDC)...");
    const slippageBps = 100; // 1%
    
    try {
      const swapTx = await tester.testSwapDirect(
        testAmount,
        deployer.address,
        slippageBps
      );
      
      console.log(`📤 Transaction sent: ${swapTx.hash}`);
      console.log("⏳ Waiting for confirmation...\n");
      
      const receipt = await swapTx.wait();
      console.log("✅ Swap successful!");
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}\n`);
      
      // Parse SwapExecuted event
      const swapEvent = receipt.logs?.find(log => {
        try {
          const parsed = tester.interface.parseLog(log);
          return parsed?.name === "SwapExecuted";
        } catch (e) {
          return false;
        }
      });
      if (swapEvent) {
        const parsed = tester.interface.parseLog(swapEvent);
        const { ceoAmountIn, usdcAmountOut, recipient } = parsed.args;
        console.log("📊 Swap details:");
        console.log(`   CEO in: ${ethers.formatEther(ceoAmountIn)}`);
        console.log(`   USDC out: ${ethers.formatUnits(usdcAmountOut, config.usdcDecimals)}`);
        console.log(`   Recipient: ${recipient}\n`);
      }
      
      // Check final balances
      const finalBalances = await tester.getBalances();
      const deployerUSDC = await ethers.getContractAt("IERC20", config.usdc);
      const deployerUSDCBalance = await deployerUSDC.balanceOf(deployer.address);
      
      console.log("💰 Final balances:");
      console.log(`   Tester CEO: ${ethers.formatEther(finalBalances.ceoBalance)}`);
      console.log(`   Tester USDC: ${ethers.formatUnits(finalBalances.usdcBalance, config.usdcDecimals)}`);
      console.log(`   Deployer USDC: ${ethers.formatUnits(deployerUSDCBalance, config.usdcDecimals)}\n`);
      
    } catch (error) {
      console.error("❌ Swap failed:", error.message);
      if (error.reason) {
        console.error(`   Reason: ${error.reason}`);
      }
      process.exit(1);
    }
  } else {
    console.log("ℹ️  Skipping actual swap (dry run mode)");
    console.log("   To execute real swap, set EXECUTE_SWAP=true\n");
  }

  console.log("================================================");
  console.log("✅ Test Complete!");
  console.log("================================================\n");

  console.log("💡 Summary:");
  console.log(`   ✓ Tester contract: ${testerAddress}`);
  console.log(`   ✓ Direct path works: CEO → USDC`);
  if (shouldSwap) {
    console.log(`   ✓ Real swap executed successfully`);
  }
  console.log("\n💡 Next steps:");
  console.log("   1. Use the direct path in your MinterContract");
  console.log("   2. Call setUniswapConfig with path [CEO, USDC]");
  console.log("   3. Test a small NFT purchase");
  console.log("   4. Monitor CEOToUSDC events\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

