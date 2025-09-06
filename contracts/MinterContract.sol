// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./CEOToken.sol";
import "./PFPCollection.sol";
import "./MemeCollection.sol";

/**
 * @title MinterContract
 * @dev Central contract for handling NFT minting with $CEO token payments
 * @notice This contract manages tiered pricing, payment processing, and mint limit enforcement
 */
contract MinterContract is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;
    
    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");
    
    // NFT Types
    enum NFTType { PFP, MEME }
    
    // Tier Structure
    struct Tier {
        uint256 priceUSD; // Price in USD (scaled by 1e18)
        bool active;
    }
    
    // State variables
    CEOToken public ceoToken;
    PFPCollection public pfpCollection;
    MemeCollection public memeCollection;
    
    // Pricing tiers (USD prices scaled by 1e18)
    mapping(NFTType => mapping(uint256 => Tier)) public tiers;
    
    // Current active tier for each NFT type
    mapping(NFTType => uint256) public activeTier;
    
    // CEO price in USD (scaled by 1e18)
    uint256 public ceoPriceUSD = 1e18; // Default: $1 per CEO token
    
    // Treasury address
    address public treasury;
    
    // Events
    event CEOPriceUpdated(uint256 newPriceUSD);
    event TierUpdated(NFTType nftType, uint256 tierId, uint256 priceUSD, bool active);
    event ActiveTierUpdated(NFTType nftType, uint256 tierId);
    event TreasuryUpdated(address indexed newTreasury);
    event NFTPurchased(
        address indexed user,
        NFTType nftType,
        uint256 tierId,
        uint256 ceoAmount,
        uint256 tokenId,
        string metadataURI
    );
    event FundsWithdrawn(address indexed to, uint256 amount);
    event StuckTokensRecovered(address indexed token, uint256 amount);
    
    /**
     * @dev Constructor
     * @param _ceoToken Address of the CEO token contract
     * @param _pfpCollection Address of the PFP collection contract
     * @param _memeCollection Address of the Meme collection contract
     * @param _treasury Address of the treasury wallet
     * @param _admin Address that will have admin role
     */
    constructor(
        address _ceoToken,
        address _pfpCollection,
        address _memeCollection,
        address _treasury,
        address _admin
    ) {
        require(_ceoToken != address(0), "MinterContract: Invalid CEO token address");
        require(_pfpCollection != address(0), "MinterContract: Invalid PFP collection address");
        require(_memeCollection != address(0), "MinterContract: Invalid Meme collection address");
        require(_treasury != address(0), "MinterContract: Invalid treasury address");
        require(_admin != address(0), "MinterContract: Invalid admin address");
        
        ceoToken = CEOToken(_ceoToken);
        pfpCollection = PFPCollection(_pfpCollection);
        memeCollection = MemeCollection(_memeCollection);
        treasury = _treasury;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        
        // Initialize default tiers
        _initializeDefaultTiers();
    }
    
    /**
     * @dev Initialize default pricing tiers
     */
    function _initializeDefaultTiers() internal {
        // PFP Tiers
        tiers[NFTType.PFP][1] = Tier(50e18, true);  // $50
        tiers[NFTType.PFP][2] = Tier(150e18, true); // $150
        tiers[NFTType.PFP][3] = Tier(250e18, true); // $250
        
        // Meme Tiers
        tiers[NFTType.MEME][1] = Tier(5e18, true);   // $5
        tiers[NFTType.MEME][2] = Tier(15e18, true);  // $15
        tiers[NFTType.MEME][3] = Tier(25e18, true);  // $25
        
        // Set default active tiers
        activeTier[NFTType.PFP] = 1;
        activeTier[NFTType.MEME] = 1;
    }
    
    /**
     * @dev Set CEO token price in USD
     * @param _priceUSD New price in USD (scaled by 1e18)
     * @notice Can only be called by admin
     */
    function setCEOPrice(uint256 _priceUSD) external onlyRole(ADMIN_ROLE) {
        require(_priceUSD > 0, "MinterContract: Price must be greater than 0");
        ceoPriceUSD = _priceUSD;
        emit CEOPriceUpdated(_priceUSD);
    }
    
    /**
     * @dev Update tier pricing
     * @param _nftType The type of NFT (PFP or MEME)
     * @param _tierId The tier ID
     * @param _priceUSD Price in USD (scaled by 1e18)
     * @param _active Whether the tier is active
     * @notice Can only be called by admin
     */
    function updateTier(
        NFTType _nftType,
        uint256 _tierId,
        uint256 _priceUSD,
        bool _active
    ) external onlyRole(ADMIN_ROLE) {
        require(_tierId > 0 && _tierId <= 3, "MinterContract: Invalid tier ID");
        require(_priceUSD > 0, "MinterContract: Price must be greater than 0");
        
        tiers[_nftType][_tierId] = Tier(_priceUSD, _active);
        emit TierUpdated(_nftType, _tierId, _priceUSD, _active);
    }
    
    /**
     * @dev Set active tier for NFT type
     * @param _nftType The type of NFT (PFP or MEME)
     * @param _tierId The tier ID to activate
     * @notice Can only be called by admin
     */
    function setActiveTier(NFTType _nftType, uint256 _tierId) external onlyRole(ADMIN_ROLE) {
        require(_tierId > 0 && _tierId <= 3, "MinterContract: Invalid tier ID");
        require(tiers[_nftType][_tierId].active, "MinterContract: Tier is not active");
        
        activeTier[_nftType] = _tierId;
        emit ActiveTierUpdated(_nftType, _tierId);
    }
    
    /**
     * @dev Set treasury address
     * @param _treasury New treasury address
     * @notice Can only be called by admin
     */
    function setTreasury(address _treasury) external onlyRole(ADMIN_ROLE) {
        require(_treasury != address(0), "MinterContract: Invalid treasury address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
    
    /**
     * @dev Get current price in CEO tokens for a specific NFT type and tier
     * @param _nftType The type of NFT (PFP or MEME)
     * @param _tierId The tier ID (0 for current active tier)
     * @return The price in CEO tokens
     */
    function getPriceInCEO(NFTType _nftType, uint256 _tierId) external view returns (uint256) {
        if (_tierId == 0) {
            _tierId = activeTier[_nftType];
        }
        
        require(tiers[_nftType][_tierId].active, "MinterContract: Tier is not active");
        
        uint256 priceUSD = tiers[_nftType][_tierId].priceUSD;
        return (priceUSD * 1e18) / ceoPriceUSD;
    }
    
    /**
     * @dev Get current active tier information
     * @param _nftType The type of NFT (PFP or MEME)
     * @return tierId The active tier ID
     * @return priceUSD The price in USD
     * @return priceCEO The price in CEO tokens
     */
    function getActiveTierInfo(NFTType _nftType) external view returns (
        uint256 tierId,
        uint256 priceUSD,
        uint256 priceCEO
    ) {
        tierId = activeTier[_nftType];
        priceUSD = tiers[_nftType][tierId].priceUSD;
        priceCEO = (priceUSD * 1e18) / ceoPriceUSD;
    }
    
    /**
     * @dev Purchase and mint NFT
     * @param _nftType The type of NFT to mint (PFP or MEME)
     * @param _tierId The tier ID (0 for current active tier)
     * @param _metadataURI The metadata URI for the NFT
     * @notice Can only be called by approver role (backend)
     */
    function mintNFT(
        NFTType _nftType,
        uint256 _tierId,
        string memory _metadataURI
    ) external onlyRole(APPROVER_ROLE) nonReentrant {
        if (_tierId == 0) {
            _tierId = activeTier[_nftType];
        }
        
        require(tiers[_nftType][_tierId].active, "MinterContract: Tier is not active");
        
        uint256 priceCEO = (tiers[_nftType][_tierId].priceUSD * 1e18) / ceoPriceUSD;
        
        // Transfer CEO tokens from user to this contract
        IERC20(ceoToken).safeTransferFrom(msg.sender, address(this), priceCEO);
        
        // Mint NFT based on type
        uint256 tokenId;
        if (_nftType == NFTType.PFP) {
            pfpCollection.mintForUser(msg.sender, _metadataURI);
            tokenId = pfpCollection.getCurrentTokenId() - 1;
        } else {
            memeCollection.mintForUser(msg.sender, _metadataURI);
            tokenId = memeCollection.getCurrentTokenId() - 1;
        }
        
        emit NFTPurchased(msg.sender, _nftType, _tierId, priceCEO, tokenId, _metadataURI);
    }
    
    /**
     * @dev Withdraw collected funds to treasury
     * @notice Can only be called by admin
     */
    function withdrawFunds() external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 balance = ceoToken.balanceOf(address(this));
        require(balance > 0, "MinterContract: No funds to withdraw");
        
        IERC20(ceoToken).safeTransfer(treasury, balance);
        emit FundsWithdrawn(treasury, balance);
    }
    
    /**
     * @dev Recover stuck tokens
     * @param _token The token address to recover (address(0) for ETH)
     * @param _amount The amount to recover
     * @notice Can only be called by rescuer role
     */
    function recoverStuckTokens(address _token, uint256 _amount) external onlyRole(RESCUER_ROLE) nonReentrant {
        require(_token != address(ceoToken), "MinterContract: Cannot recover CEO tokens");
        
        if (_token == address(0)) {
            // Recover ETH
            require(address(this).balance >= _amount, "MinterContract: Insufficient ETH balance");
            payable(msg.sender).transfer(_amount);
        } else {
            // Recover ERC-20 tokens
            IERC20(_token).safeTransfer(msg.sender, _amount);
        }
        
        emit StuckTokensRecovered(_token, _amount);
    }
    
    /**
     * @dev Check if user can mint more NFTs of a specific type
     * @param _user The user address
     * @param _nftType The type of NFT (PFP or MEME)
     * @return bool True if user can mint more NFTs
     */
    function canUserMint(address _user, NFTType _nftType) external view returns (bool) {
        if (_nftType == NFTType.PFP) {
            return pfpCollection.canUserMint(_user);
        } else {
            return memeCollection.canUserMint(_user);
        }
    }
    
    /**
     * @dev Get user's mint count for a specific NFT type
     * @param _user The user address
     * @param _nftType The type of NFT (PFP or MEME)
     * @return The number of NFTs minted by the user
     */
    function getUserMintCount(address _user, NFTType _nftType) external view returns (uint256) {
        if (_nftType == NFTType.PFP) {
            return pfpCollection.getUserMintCount(_user);
        } else {
            return memeCollection.getUserMintCount(_user);
        }
    }
}
