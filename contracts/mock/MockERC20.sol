// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @dev Mock ERC-20 token for testing purposes with configurable decimals
 */
contract MockERC20 is ERC20 {
    uint8 private _decimals;
    
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // Default to 6 decimals for stablecoins like USDC, 18 for others
        _decimals = keccak256(bytes(symbol)) == keccak256(bytes("USDC")) ? 6 : 18;
        _mint(msg.sender, 1000000 * 10**uint256(_decimals)); // Mint 1 million tokens to deployer
    }

    /**
     * @dev Returns the number of decimals used to get its user representation
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Mint tokens to a specific address (for testing)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
