const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Test Script: Swap CEO/USDC on Uniswap V2 Pool
 * Usage: npx hardhat run scripts/deploy/test_swap_ceo_usdc.js --direction [usdc-to-ceo|ceo-to-usdc] --amount [amount]
 */

const UNISWAP_ROUTERS = {
    mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    base: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    sepolia: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3"
};

async function getPoolInfo(pairAddress, ceoTokenAddress, usdcAddress, ceoDecimals, usdcDecimals) {
    const pair = await ethers.getContractAt(
        ["function getReserves() external view returns (uint112, uint112, uint32)",
         "function token0() external view returns (address)"],
        pairAddress
    );
    
    const token0 = await pair.token0();
    const reserves = await pair.getReserves();
    const isCEOToken0 = token0.toLowerCase() === ceoTokenAddress.toLowerCase();
    const ceoReserve = isCEOToken0 ? reserves[0] : reserves[1];
    const usdcReserve = isCEOToken0 ? reserves[1] : reserves[0];
    
    return {
        ceoReserve,
        usdcReserve,
        priceUSDCperCEO: ceoReserve > 0n ? (usdcReserve * BigInt(10 ** Number(ceoDecimals))) / ceoReserve : 0n,
        priceCEOperUSDC: usdcReserve > 0n ? (ceoReserve * BigInt(10 ** Number(usdcDecimals))) / usdcReserve : 0n
    };
}

function calculateExpectedOutput(amountIn, reserveIn, reserveOut) {
    const amountInWithFee = amountIn * 997n;
    return (amountInWithFee * reserveOut) / ((reserveIn * 1000n) + amountInWithFee);
}

async function main() {
    console.log("\n=== Swap CEO/USDC on Uniswap V2 ===\n");
    
    // Parse arguments
    const args = process.argv.slice(2);
    let swapDirection = "usdc-to-ceo";
    let swapAmount = "100";
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--direction" && i + 1 < args.length) swapDirection = args[i + 1];
        if (args[i] === "--amount" && i + 1 < args.length) swapAmount = args[i + 1];
    }
    
    if (!["usdc-to-ceo", "ceo-to-usdc"].includes(swapDirection)) {
        console.error("❌ Invalid direction. Use: usdc-to-ceo OR ceo-to-usdc");
        process.exit(1);
    }
    
    // Setup
    const [signer] = await ethers.getSigners();
    const stateFile = path.join(__dirname, 'deployment-state.json');
    if (!fs.existsSync(stateFile)) {
        console.error("❌ Run deployment scripts first!");
        process.exit(1);
    }
    
    const deploymentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!deploymentState.uniswapPool?.pairAddress) {
        console.error("❌ Pool not found. Run step 9 first!");
        process.exit(1);
    }
    
    const ceoTokenAddress = deploymentState.ceoToken;
    const usdcAddress = deploymentState.usdc;
    const pairAddress = deploymentState.uniswapPool.pairAddress;
    
    const network = await signer.provider.getNetwork();
    const networkName = network.name === "unknown" ? "hardhat" : network.name;
    const routerAddress = UNISWAP_ROUTERS[networkName];
    
    if (!routerAddress) {
        console.error(`❌ No router for network: ${networkName}`);
        process.exit(1);
    }
    
    console.log(`Signer: ${signer.address} | Direction: ${swapDirection}`);
    
    // Get contracts and initial state
    const ceoToken = await ethers.getContractAt("IERC20", ceoTokenAddress);
    const usdc = await ethers.getContractAt("IERC20", usdcAddress);
    const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);
    const ceoDecimals = await ethers.getContractAt("IERC20Metadata", ceoTokenAddress).then(c => c.decimals());
    const usdcDecimals = await ethers.getContractAt("IERC20Metadata", usdcAddress).then(c => c.decimals());
    
    const initialCEO = await ceoToken.balanceOf(signer.address);
    const initialUSDC = await usdc.balanceOf(signer.address);
    const poolBefore = await getPoolInfo(pairAddress, ceoTokenAddress, usdcAddress, ceoDecimals, usdcDecimals);
    
    console.log(`\n📊 Pre-Swap: CEO=${ethers.formatUnits(initialCEO, ceoDecimals)} | USDC=${ethers.formatUnits(initialUSDC, usdcDecimals)}`);
    console.log(`💧 Pool: CEO=${ethers.formatUnits(poolBefore.ceoReserve, ceoDecimals)} | USDC=${ethers.formatUnits(poolBefore.usdcReserve, usdcDecimals)}`);
    console.log(`💲 Price: 1 CEO = ${ethers.formatUnits(poolBefore.priceUSDCperCEO, usdcDecimals)} USDC`);
    
    // Setup swap parameters
    const isUSDCToCEO = swapDirection === "usdc-to-ceo";
    const tokenIn = isUSDCToCEO ? usdc : ceoToken;
    const tokenOut = isUSDCToCEO ? ceoToken : usdc;
    const tokenInSymbol = isUSDCToCEO ? "USDC" : "CEO";
    const tokenOutSymbol = isUSDCToCEO ? "CEO" : "USDC";
    const decimalsIn = isUSDCToCEO ? usdcDecimals : ceoDecimals;
    const decimalsOut = isUSDCToCEO ? ceoDecimals : usdcDecimals;
    const reserveIn = isUSDCToCEO ? poolBefore.usdcReserve : poolBefore.ceoReserve;
    const reserveOut = isUSDCToCEO ? poolBefore.ceoReserve : poolBefore.usdcReserve;
    
    const defaultAmount = isUSDCToCEO ? "1" : "1000000";
    const amountIn = ethers.parseUnits(swapAmount || defaultAmount, decimalsIn);
    const balance = isUSDCToCEO ? initialUSDC : initialCEO;
    
    if (balance < amountIn) {
        console.error(`❌ Insufficient ${tokenInSymbol}: need ${ethers.formatUnits(amountIn, decimalsIn)}, have ${ethers.formatUnits(balance, decimalsIn)}`);
        process.exit(1);
    }
    
    const expectedAmountOut = calculateExpectedOutput(amountIn, reserveIn, reserveOut);
    const minAmountOut = (expectedAmountOut * 95n) / 100n;
    
    console.log(`\n🔄 Swap: ${ethers.formatUnits(amountIn, decimalsIn)} ${tokenInSymbol} → ~${ethers.formatUnits(expectedAmountOut, decimalsOut)} ${tokenOutSymbol} (min: ${ethers.formatUnits(minAmountOut, decimalsOut)})`);
    
    try {
        // Approve if needed
        const currentAllowance = await tokenIn.allowance(signer.address, routerAddress);
        if (currentAllowance < amountIn) {
            const approveTx = await tokenIn.approve(routerAddress, amountIn);
            await approveTx.wait();
            console.log(`✅ Approved ${tokenInSymbol}`);
        }
        
        // Execute swap
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const swapTx = await router.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            [tokenIn.target, tokenOut.target],
            signer.address,
            deadline,
            { gasLimit: 300000 }
        );
        
        console.log(`⏳ Swapping... (tx: ${swapTx.hash})`);
        const receipt = await swapTx.wait();
        console.log(`✅ Swap complete! Block: ${receipt.blockNumber} | Gas: ${receipt.gasUsed.toString()}`);
        
        // Get final state
        const finalCEO = await ceoToken.balanceOf(signer.address);
        const finalUSDC = await usdc.balanceOf(signer.address);
        const poolAfter = await getPoolInfo(pairAddress, ceoTokenAddress, usdcAddress, ceoDecimals, usdcDecimals);
        
        const ceoDelta = finalCEO - initialCEO;
        const usdcDelta = finalUSDC - initialUSDC;
        
        console.log(`\n📊 Post-Swap: CEO=${ethers.formatUnits(finalCEO, ceoDecimals)} (${ceoDelta >= 0n ? '+' : ''}${ethers.formatUnits(ceoDelta, ceoDecimals)}) | USDC=${ethers.formatUnits(finalUSDC, usdcDecimals)} (${usdcDelta >= 0n ? '+' : ''}${ethers.formatUnits(usdcDelta, usdcDecimals)})`);
        console.log(`💧 Pool: CEO=${ethers.formatUnits(poolAfter.ceoReserve, ceoDecimals)} | USDC=${ethers.formatUnits(poolAfter.usdcReserve, usdcDecimals)}`);
        console.log(`💲 Price: 1 CEO = ${ethers.formatUnits(poolAfter.priceUSDCperCEO, usdcDecimals)} USDC`);
        
        // Calculate price impact
        const priceBefore = isUSDCToCEO ? poolBefore.priceCEOperUSDC : poolBefore.priceUSDCperCEO;
        const priceAfter = isUSDCToCEO ? poolAfter.priceCEOperUSDC : poolAfter.priceUSDCperCEO;
        if (priceBefore > 0n) {
            const impact = Number((priceAfter - priceBefore) * 10000n / priceBefore) / 100;
            console.log(`📈 Price Impact: ${impact.toFixed(2)}%`);
        }
        
        console.log("\n✅ Swap complete! Run with: --direction [usdc-to-ceo|ceo-to-usdc] --amount [amount]");
        
    } catch (error) {
        console.error(`\n❌ Swap failed: ${error.message}`);
        if (error.reason) console.error(`Reason: ${error.reason}`);
        
        if (error.message.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
            console.error("💡 Try reducing amount or increasing slippage tolerance");
        } else if (error.message.includes("INSUFFICIENT_LIQUIDITY")) {
            console.error("💡 Not enough liquidity - try a smaller amount");
        }
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });

