// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockUniswapRouter
 * @notice Mock Uniswap V2 Router for TESTING PURPOSES ONLY
 * @dev NOT FOR DEPLOYMENT
 * @dev Returns fixed mock prices and handles token transfers for testing
 */
contract MockUniswapRouter {
    // Mock price: 1 CEO (1e18) = 0.567 USDC
    // USDC has 6 decimals, so 0.567 USDC = 567000
    // For any CEO amount: USDC_out = (CEO_amount * 567000) / 1e18
    
    /**
     * @dev Mock implementation of getAmountsOut
     * @notice Returns scaled amounts for testing based on mock price
     * @param amountIn The input amount (CEO tokens in 18 decimals)
     * @param path The swap path (must have at least 2 addresses)
     * @return amounts Array with input and output amounts
     */
    function getAmountsOut(uint256 amountIn, address[] memory path) 
        external 
        pure 
        returns (uint256[] memory amounts) 
    {
        require(path.length >= 2, "MockRouter: Invalid path");
        
        amounts = new uint256[](path.length);
        amounts[0] = amountIn; // Input amount (CEO tokens)
        
        // For simplicity, set all intermediate amounts to input
        for (uint i = 1; i < path.length - 1; i++) {
            amounts[i] = amountIn;
        }
        
        // Last amount is USDC output (6 decimals)
        // Mock: 1 CEO (1e18) = 0.567 USDC (567000)
        // Scale: (amountIn * 567000) / 1e18
        amounts[path.length - 1] = (amountIn * 567000) / 1e18;
        
        return amounts;
    }
    
    /**
     * @dev Mock implementation of getAmountsIn
     * @notice Returns the input amounts needed to get desired output
     * @param amountOut The desired output amount (USDC in 6 decimals)
     * @param path The swap path (must have at least 2 addresses)
     * @return amounts Array with input and output amounts
     */
    function getAmountsIn(uint256 amountOut, address[] memory path)
        external
        pure
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "MockRouter: Invalid path");
        
        amounts = new uint256[](path.length);
        amounts[path.length - 1] = amountOut; // Output amount (USDC)
        
        // Calculate CEO input needed for desired USDC output
        // Mock: 1 CEO (1e18) = 0.567 USDC (567000)
        // Reverse: CEO_needed = (USDC_wanted * 1e18) / 567000
        amounts[0] = (amountOut * 1e18) / 567000;
        
        // For simplicity, set all intermediate amounts
        for (uint i = 1; i < path.length - 1; i++) {
            amounts[i] = amounts[0];
        }
        
        return amounts;
    }
    
    /**
     * @dev Mock implementation of swapExactTokensForTokens
     * @notice Transfers input tokens from msg.sender to this contract
     * @notice Mock doesn't actually perform swap, just takes the input tokens
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address /* to */,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "MockRouter: Invalid path");
        require(deadline >= block.timestamp, "MockRouter: Expired");
        
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        
        for (uint i = 1; i < path.length - 1; i++) {
            amounts[i] = amountIn;
        }
        
        // Calculate USDC output based on amount: (amountIn * 567000) / 1e18
        amounts[path.length - 1] = (amountIn * 567000) / 1e18;
        require(amounts[path.length - 1] >= amountOutMin, "MockRouter: Insufficient output");
        
        // Transfer input tokens (CEO) from sender to this router
        // In a real swap, these would be used for the swap
        // In the mock, we just take them (simulating burning/locking)
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        // Mock: We DON'T transfer output tokens (USDC) because:
        // 1. This is a mock and we don't have USDC to give
        // 2. Tests don't check USDC balance, only CEO balance
        // 3. The important part is that CEO tokens are removed from MinterContract
        
        return amounts;
    }
}

