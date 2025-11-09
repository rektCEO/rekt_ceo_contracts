// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title CEOToken
 * @dev ERC-20 token with permit functionality and dev wallet lock mechanism
 * @notice This contract implements the $CEO token with a maximum supply of 21,000,000 tokens
 */
contract CEOToken is ERC20, ERC20Permit, Ownable, ReentrancyGuard {
    uint256 public constant MAX_SUPPLY = 21_000_000 * 10**18; // 21 million tokens
    uint256 public constant DEV_ALLOCATION_PERCENTAGE = 3; // 3% for dev wallet
    uint256 public constant LOCK_DURATION = 3 * 365 * 24 * 60 * 60; // 3 years in seconds
    
    address public devWallet;
    uint256 public devAllocation;
    uint256 public lockEndTime;
    bool public devAllocationMinted;
    
    // Events
    event DevWalletSet(address indexed devWallet, uint256 allocation);
    event DevAllocationMinted(address indexed devWallet, uint256 amount);
    event StuckTokensRecovered(address indexed token, uint256 amount);
    
    /**
     * @dev Constructor that mints initial supply to owner
     * @param _owner The address that will own the contract
     */
    constructor(address _owner) ERC20("Rekt CEO", "CEO") ERC20Permit("Rekt CEO") {
        _transferOwnership(_owner);
        
        // Mint 97% of supply to owner (community treasury)
        uint256 communitySupply = (MAX_SUPPLY * (100 - DEV_ALLOCATION_PERCENTAGE)) / 100;
        _mint(_owner, communitySupply);
    }
    
    /**
     * @dev Set the dev wallet and calculate allocation
     * @param _devWallet The address of the dev wallet
     * @notice Can only be called by owner and only once
     */
    function setDevWallet(address _devWallet) external onlyOwner {
        require(_devWallet != address(0), "CEOToken: Invalid dev wallet address");
        require(devWallet == address(0), "CEOToken: Dev wallet already set");
        
        devWallet = _devWallet;
        devAllocation = (MAX_SUPPLY * DEV_ALLOCATION_PERCENTAGE) / 100;
        lockEndTime = block.timestamp + LOCK_DURATION;
        
        emit DevWalletSet(_devWallet, devAllocation);
    }
    
    /**
     * @dev Mint dev allocation to dev wallet
     * @notice Can only be called by owner and only once
     */
    function mintDevAllocation() external onlyOwner {
        require(devWallet != address(0), "CEOToken: Dev wallet not set");
        require(!devAllocationMinted, "CEOToken: Dev allocation already minted");
        require(totalSupply() + devAllocation <= MAX_SUPPLY, "CEOToken: Would exceed max supply");
        
        devAllocationMinted = true;
        _mint(devWallet, devAllocation);
        
        emit DevAllocationMinted(devWallet, devAllocation);
    }
    
    /**
     * @dev Check if dev allocation is locked
     * @return bool True if dev allocation is still locked
     */
    function isDevAllocationLocked() external view returns (bool) {
        return block.timestamp < lockEndTime;
    }
    
    /**
     * @dev Recover stuck ERC-20 tokens (only owner can call)
     * @param token The address of the token to recover
     * @param amount The amount to recover
     */
    function recoverStuckTokens(address token, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "CEOToken: Invalid token address");
        require(token != address(this), "CEOToken: Cannot recover CEO tokens");
        
        // Recover ERC-20 tokens
        IERC20(token).transfer(owner(), amount);
        
        emit StuckTokensRecovered(token, amount);
    }
    
    /**
     * @dev Override transfer to prevent dev wallet from transferring during lock period
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._beforeTokenTransfer(from, to, amount);
        
        // Prevent dev wallet from transferring during lock period
        if (from == devWallet && block.timestamp < lockEndTime) {
            revert("CEOToken: Dev allocation is locked for 3 years");
        }
    }
}
