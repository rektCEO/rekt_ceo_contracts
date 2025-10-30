// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./CEOToken.sol";
import "./PFPCollection.sol";
import "./MemeCollection.sol";

struct PermitData {
    address owner;
    address spender;
    uint256 value;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

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
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");
    
    // NFT Types
    enum NFTType { PFP, MEME }
    
    // Tier Structure
    struct Tier {
        uint256 priceUSD; // Price in USD (scaled by 1e18)
        bool active;
    }
    
    // State variables
    IERC20 public ceoToken;
    PFPCollection public pfpCollection;
    MemeCollection public memeCollection;
    IERC20 public usdcToken;
    
    //multisig wallet address
    address public safeWallet;
    
    // Pricing tiers (USD prices scaled by 1e18)
    mapping(NFTType => mapping(uint256 => Tier)) public tiers;
    
    // Current active tier for each NFT type
    mapping(NFTType => uint256) public activeTier;
    
    // CEO price in USD 
    uint256 public ceoPriceUSD = 1e18; // Default: $1 per CEO token
    
    // Treasury address
    address public treasury;
    
    struct RoyaltyInfoCfg {
        address adminRecipient;    // Safe wallet (50% of royalties)
        uint256 totalPercentage;   // Total royalty percentage (e.g., 210 = 2.1%)
        uint256 adminPercentage;   // Admin percentage (e.g., 105 = 1.05%)
        uint256 creatorPercentage; // Creator percentage (e.g., 105 = 1.05%)
    }
    RoyaltyInfoCfg public royaltyInfo;
    
    // USDC swap configuration
    bool public usdcSwapEnabled = true;
    uint256 public usdcSwapPercentage = 5000; // 50% (basis points)

    
    uint256 public constant PRICE_UPDATE_COOLDOWN = 300; // 5 minutes
    uint256 public lastPriceUpdate;
    
    // USDC price in USD (scaled by 1e18)
    uint256 public usdcPriceUSD = 1e18; // Default: $1 per USDC
    
    // Events
    event CEOPriceUpdated(uint256 newPriceUSD, uint256 timestamp);
    event TierUpdated(NFTType nftType, uint256 tierId, uint256 priceUSD, bool active);
    event ActiveTierUpdated(NFTType nftType, uint256 tierId);
    event TreasuryUpdated(address indexed newTreasury);
    event SafeWalletUpdated(address indexed newSafeWallet);
    event RoyaltyInfoUpdated(address indexed recipient, uint256 percentage);
    event USDCSwapConfigUpdated(bool enabled, uint256 percentage);
    event USDCPriceUpdated(uint256 newPriceUSD, uint256 timestamp);
    event NFTPurchased(
        address indexed user,
        NFTType nftType,
        uint256 tierId,
        uint256 ceoAmount,
        uint256 usdcAmount,
        uint256 tokenId,
        string metadataURI
    );
    event FundsWithdrawn(address indexed to, uint256 amount);
    event StuckTokensRecovered(address indexed token, uint256 amount);
    event CEOToUSDC(uint256 ceoAmount, uint256 usdcAmount);
    
    /**
     * @dev Constructor
     * @param _ceoToken Address of the CEO token contract
     * @param _pfpCollection Address of the PFP collection contract
     * @param _memeCollection Address of the Meme collection contract
     * @param _usdcToken Address of the USDC token contract
     * @param _treasury Address of the treasury wallet
     * @param _safeWallet Address of the Safe multisig wallet
     * @param _admin Address that will have admin role
     */
    constructor(
        address _ceoToken,
        address _pfpCollection,
        address _memeCollection,
        address _usdcToken,
        address _treasury,
        address _safeWallet,
        address _admin
    ) {
        require(_ceoToken != address(0), "MinterContract: Invalid CEO token address");
        require(_pfpCollection != address(0), "MinterContract: Invalid PFP collection address");
        require(_memeCollection != address(0), "MinterContract: Invalid Meme collection address");
        require(_usdcToken != address(0), "MinterContract: Invalid USDC token address");
        require(_treasury != address(0), "MinterContract: Invalid treasury address");
        require(_safeWallet != address(0), "MinterContract: Invalid Safe wallet address");
        require(_admin != address(0), "MinterContract: Invalid admin address");
        
        ceoToken = IERC20(_ceoToken);
        pfpCollection = PFPCollection(_pfpCollection);
        memeCollection = MemeCollection(_memeCollection);
        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;
        safeWallet = _safeWallet;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin);
        
        // Initialize default tiers
        _initializeDefaultTiers();
        
        // Initialize default royalty info (2.1% total split 50/50)
        royaltyInfo = RoyaltyInfoCfg(_safeWallet, 210, 105, 105);
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
    function setCEOPrice(uint256 _priceUSD) external onlyRole(PRICE_UPDATER_ROLE) {
        require(_priceUSD > 0, "MinterContract: Price must be greater than 0");
        require(block.timestamp >= lastPriceUpdate + PRICE_UPDATE_COOLDOWN, "MinterContract: Price update cooldown not met");
        ceoPriceUSD = _priceUSD;
        lastPriceUpdate = block.timestamp;
        emit CEOPriceUpdated(_priceUSD, block.timestamp);
    }

  

    function setUSDCPrice(uint256 _priceUSD) external onlyRole(PRICE_UPDATER_ROLE) {
        require(_priceUSD > 0, "MinterContract: Price must be greater than 0");
        usdcPriceUSD = _priceUSD;
        emit USDCPriceUpdated(_priceUSD, block.timestamp);
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

   
     
    function setSafeWallet(address _safeWallet) external onlyRole(ADMIN_ROLE) {
        require(_safeWallet != address(0), "MinterContract: Invalid Safe wallet address");
        require(_safeWallet != address(this), "MinterContract: Cannot set contract as Safe wallet");
        require(_safeWallet != treasury, "MinterContract: Safe wallet cannot be same as treasury");
        uint256 codeSize;
        assembly { codeSize := extcodesize(_safeWallet) }
        require(codeSize > 0, "MinterContract: Safe wallet must be a contract");
        safeWallet = _safeWallet;
        emit SafeWalletUpdated(_safeWallet);
    }

  
    
    function updateUSDCSwapConfig(bool _enabled, uint256 _percentage) external onlyRole(ADMIN_ROLE) {
        require(_percentage <= 10000, "MinterContract: Percentage cannot exceed 100%");
        usdcSwapEnabled = _enabled;
        usdcSwapPercentage = _percentage;
        emit USDCSwapConfigUpdated(_enabled, _percentage);
    }

    
    function updateRoyaltyInfo(address _adminRecipient, uint256 _totalPercentage) external onlyRole(ADMIN_ROLE) {
        require(_adminRecipient != address(0), "MinterContract: Invalid admin recipient address");
        require(_totalPercentage <= 1000, "MinterContract: Royalty percentage too high");
        require(_totalPercentage % 2 == 0, "MinterContract: Total percentage must be even for 50/50 split");
        uint256 half = _totalPercentage / 2;
        royaltyInfo = RoyaltyInfoCfg(_adminRecipient, _totalPercentage, half, half);
        emit RoyaltyInfoUpdated(_adminRecipient, _totalPercentage);
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
        ceoToken.safeTransferFrom(msg.sender, address(this), priceCEO);
        
        // Process USDC swap if enabled
        uint256 usdcAmount = 0;
        if (usdcSwapEnabled && usdcSwapPercentage > 0) {
            usdcAmount = _swapCEOToUSDC(priceCEO);
        }
        
        // Mint NFT based on type
        uint256 tokenId;
        if (_nftType == NFTType.PFP) {
            pfpCollection.mintForUser(msg.sender, _metadataURI);
            tokenId = pfpCollection.getCurrentTokenId() - 1;
        } else {
            memeCollection.mintForUser(msg.sender, _metadataURI);
            tokenId = memeCollection.getCurrentTokenId() - 1;
        }
        
        emit NFTPurchased(msg.sender, _nftType, _tierId, priceCEO, usdcAmount, tokenId, _metadataURI);
    }

   
    function mintNFTWithPermit(
        NFTType _nftType,
        uint256 _tierId,
        string memory _metadataURI,
        PermitData memory _permitData
    ) external onlyRole(APPROVER_ROLE) nonReentrant {
        if (_tierId == 0) {
            _tierId = activeTier[_nftType];
        }
        require(tiers[_nftType][_tierId].active, "MinterContract: Tier is not active");
        uint256 priceCEO = (tiers[_nftType][_tierId].priceUSD * 1e18) / ceoPriceUSD;
        
        // permit for gasless approval
        IERC20Permit(address(ceoToken)).permit(
            _permitData.owner,
            address(this),
            _permitData.value,
            _permitData.deadline,
            _permitData.v,
            _permitData.r,
            _permitData.s
        );
        
        ceoToken.safeTransferFrom(_permitData.owner, address(this), priceCEO);
        
        uint256 usdcAmount = 0;
        if (usdcSwapEnabled && usdcSwapPercentage > 0) {
            usdcAmount = _swapCEOToUSDC(priceCEO);
        }
        
        uint256 tokenId;
        if (_nftType == NFTType.PFP) {
            pfpCollection.mintForUser(_permitData.owner, _metadataURI);
            tokenId = pfpCollection.getCurrentTokenId() - 1;
        } else {
            memeCollection.mintForUser(_permitData.owner, _metadataURI);
            tokenId = memeCollection.getCurrentTokenId() - 1;
        }
        
        emit NFTPurchased(_permitData.owner, _nftType, _tierId, priceCEO, usdcAmount, tokenId, _metadataURI);
    }
    
    /**
     * @dev Withdraw collected funds to treasury
     * @notice Can only be called by admin
     */
    function withdrawFunds() external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 balance = ceoToken.balanceOf(address(this));
        require(balance > 0, "MinterContract: No funds to withdraw");
        
        ceoToken.safeTransfer(treasury, balance);
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



    function getRoyaltyInfo(uint256 /*tokenId*/, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount) {
        receiver = royaltyInfo.adminRecipient;
        royaltyAmount = (salePrice * royaltyInfo.totalPercentage) / 10000;
    }

    // split royalty information for a token
    function getSplitRoyaltyInfo(uint256 /*tokenId*/, uint256 salePrice, address creator) external view returns (
        address adminReceiver,
        address creatorReceiver,
        uint256 adminAmount,
        uint256 creatorAmount
    ) {
        adminReceiver = royaltyInfo.adminRecipient;
        creatorReceiver = creator != address(0) ? creator : royaltyInfo.adminRecipient;
        adminAmount = (salePrice * royaltyInfo.adminPercentage) / 10000;
        creatorAmount = (salePrice * royaltyInfo.creatorPercentage) / 10000;
    }



    function _swapCEOToUSDC(uint256 _ceoAmount) internal returns (uint256) {
        uint256 swapAmount = (_ceoAmount * usdcSwapPercentage) / 10000;
        ceoToken.safeTransfer(treasury, swapAmount);
        uint256 usdcAmount = (swapAmount * ceoPriceUSD) / usdcPriceUSD;
        emit CEOToUSDC(swapAmount, usdcAmount);
        return usdcAmount;
    }

   
    receive() external payable {}
}
