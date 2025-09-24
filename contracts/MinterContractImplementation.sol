// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./CEOToken.sol";
import "./CollectionFactory.sol";

// Permit data structure for gasless approvals
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
 * @title MinterContractImplementation
 * @dev Implementation contract for MinterContract using proxy pattern
 * @notice This contract handles NFT minting with $CEO token payments
 * @notice Enhanced with Factory pattern integration and upgradeability
 */
contract MinterContractImplementation is AccessControl, ReentrancyGuard, Initializable {
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
    
    // Royalty Structure - Split between admin and creator
    struct RoyaltyInfo {
        address adminRecipient;    // Safe wallet (50% of royalties)
        address creatorRecipient;  // Creator address (50% of royalties)
        uint256 totalPercentage;   // Total royalty percentage (e.g., 210 = 2.1%)
        uint256 adminPercentage;   // Admin percentage (e.g., 105 = 1.05%)
        uint256 creatorPercentage; // Creator percentage (e.g., 105 = 1.05%)
    }
    
    // State variables
    CEOToken public ceoToken;
    CollectionFactory public collectionFactory;
    IERC20 public usdcToken;
    
    // Safe multisig wallet address
    address public safeWallet;
    
    // Pricing tiers (USD prices scaled by 1e18)
    mapping(NFTType => mapping(uint256 => Tier)) public tiers;
    
    // Current active tier for each NFT type
    mapping(NFTType => uint256) public activeTier;
    
    // CEO price in USD (scaled by 1e18)
    uint256 public ceoPriceUSD = 1e18; // Default: $1 per CEO token
    
    // Treasury address
    address public treasury;
    
    // Royalty configuration
    RoyaltyInfo public royaltyInfo;
    
    // USDC swap configuration
    bool public usdcSwapEnabled = true;
    uint256 public usdcSwapPercentage = 5000; // 50% (5000 basis points)
    
    // Price update cooldown (to prevent spam)
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
    event SafeWalletSet(address indexed newSafeWallet);
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
        string metadataURI,
        address indexed collection
    );
    event FundsWithdrawn(address indexed to, uint256 amount);
    event StuckTokensRecovered(address indexed token, uint256 amount);
    event CEOToUSDC(uint256 ceoAmount, uint256 usdcAmount);
    event CollectionFactoryUpdated(address indexed newFactory);
    event RoyaltyDistributed(uint256 indexed tokenId, address indexed adminRecipient, address indexed creatorRecipient, uint256 adminAmount, uint256 creatorAmount);
    
    /**
     * @dev Initialize the implementation contract
     * @param _ceoToken Address of the CEO token contract
     * @param _collectionFactory Address of the collection factory contract
     * @param _usdcToken Address of the USDC token contract
     * @param _treasury Address of the treasury wallet
     * @param _safeWallet Address of the Safe multisig wallet
     * @param _admin Address that will have admin role
     */
    function initialize(
        address _ceoToken,
        address _collectionFactory,
        address _usdcToken,
        address _treasury,
        address _safeWallet,
        address _admin
    ) external initializer {
        require(_ceoToken != address(0), "MinterContract: Invalid CEO token address");
        require(_collectionFactory != address(0), "MinterContract: Invalid collection factory address");
        require(_usdcToken != address(0), "MinterContract: Invalid USDC token address");
        require(_treasury != address(0), "MinterContract: Invalid treasury address");
        require(_safeWallet != address(0), "MinterContract: Invalid Safe wallet address");
        require(_admin != address(0), "MinterContract: Invalid admin address");
        
        ceoToken = CEOToken(_ceoToken);
        collectionFactory = CollectionFactory(_collectionFactory);
        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;
        safeWallet = _safeWallet;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin);
        
        // Initialize default tiers
        _initializeDefaultTiers();
        
        // Initialize royalty info (2.1% total split 50/50 between admin and creator)
        royaltyInfo = RoyaltyInfo(
            _safeWallet,    // adminRecipient (Safe wallet)
            address(0),     // creatorRecipient (will be set per token)
            210,            // totalPercentage (2.1%)
            105,            // adminPercentage (1.05%)
            105             // creatorPercentage (1.05%)
        );
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
     * @dev Set collection factory address
     * @param _collectionFactory Address of the collection factory
     * @notice Can only be called by admin
     */
    function setCollectionFactory(address _collectionFactory) external onlyRole(ADMIN_ROLE) {
        require(_collectionFactory != address(0), "MinterContract: Invalid factory address");
        collectionFactory = CollectionFactory(_collectionFactory);
        emit CollectionFactoryUpdated(_collectionFactory);
    }
    
    /**
     * @dev Set CEO token price in USD (real-time pricing)
     * @param _priceUSD New price in USD (scaled by 1e18)
     * @notice Can only be called by price updater role with cooldown
     */
    function setCEOPrice(uint256 _priceUSD) external onlyRole(PRICE_UPDATER_ROLE) {
        require(_priceUSD > 0, "MinterContract: Price must be greater than 0");
        require(block.timestamp >= lastPriceUpdate + PRICE_UPDATE_COOLDOWN, "MinterContract: Price update cooldown not met");
        
        ceoPriceUSD = _priceUSD;
        lastPriceUpdate = block.timestamp;
        emit CEOPriceUpdated(_priceUSD, block.timestamp);
    }
    
    /**
     * @dev Set USDC price in USD (real-time pricing)
     * @param _priceUSD New price in USD (scaled by 1e18)
     * @notice Can only be called by price updater role
     */
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
    
    /**
     * @dev Set Safe multisig wallet address
     * @param _safeWallet New Safe wallet address
     * @notice Can only be called by admin
     */
    function setSafeWallet(address _safeWallet) external onlyRole(ADMIN_ROLE) {
        require(_safeWallet != address(0), "MinterContract: Invalid Safe wallet address");
        safeWallet = _safeWallet;
        emit SafeWalletSet(_safeWallet);
    }
    
    /**
     * @dev Update royalty information
     * @param _adminRecipient Address to receive admin royalties (Safe wallet)
     * @param _totalPercentage Total royalty percentage in basis points
     * @notice Can only be called by admin
     * @notice Creator percentage is automatically set to 50% of total
     */
    function updateRoyaltyInfo(address _adminRecipient, uint256 _totalPercentage) external onlyRole(ADMIN_ROLE) {
        require(_adminRecipient != address(0), "MinterContract: Invalid admin recipient address");
        require(_totalPercentage <= 1000, "MinterContract: Royalty percentage too high"); // Max 10%
        require(_totalPercentage % 2 == 0, "MinterContract: Total percentage must be even for 50/50 split");
        
        uint256 halfPercentage = _totalPercentage / 2;
        
        royaltyInfo = RoyaltyInfo(
            _adminRecipient,    // adminRecipient
            address(0),         // creatorRecipient (set per token)
            _totalPercentage,   // totalPercentage
            halfPercentage,     // adminPercentage (50%)
            halfPercentage      // creatorPercentage (50%)
        );
        
        emit RoyaltyInfoUpdated(_adminRecipient, _totalPercentage);
    }
    
    /**
     * @dev Update USDC swap configuration
     * @param _enabled Whether USDC swapping is enabled
     * @param _percentage Percentage of CEO tokens to swap to USDC (in basis points)
     * @notice Can only be called by admin
     */
    function updateUSDCSwapConfig(bool _enabled, uint256 _percentage) external onlyRole(ADMIN_ROLE) {
        require(_percentage <= 10000, "MinterContract: Percentage cannot exceed 100%");
        
        usdcSwapEnabled = _enabled;
        usdcSwapPercentage = _percentage;
        emit USDCSwapConfigUpdated(_enabled, _percentage);
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
     * @dev Purchase and mint NFT using permit (gasless approval)
     * @param _nftType The type of NFT to mint (PFP or MEME)
     * @param _tierId The tier ID (0 for current active tier)
     * @param _metadataURI The metadata URI for the NFT
     * @param _permitData Permit data for gasless approval
     * @param _collection Address of the collection contract
     * @notice Can only be called by approver role (backend)
     */
    function mintNFTWithPermit(
        NFTType _nftType,
        uint256 _tierId,
        string memory _metadataURI,
        PermitData memory _permitData,
        address _collection
    ) external onlyRole(APPROVER_ROLE) nonReentrant {
        if (_tierId == 0) {
            _tierId = activeTier[_nftType];
        }
        
        require(tiers[_nftType][_tierId].active, "MinterContract: Tier is not active");
        require(_collection != address(0), "MinterContract: Invalid collection address");
        
        uint256 priceCEO = (tiers[_nftType][_tierId].priceUSD * 1e18) / ceoPriceUSD;
        
        // Execute permit for gasless approval
        IERC20Permit(address(ceoToken)).permit(
            _permitData.owner,
            address(this),
            _permitData.value,
            _permitData.deadline,
            _permitData.v,
            _permitData.r,
            _permitData.s
        );
        
        // Transfer CEO tokens from user to this contract
        IERC20(ceoToken).safeTransferFrom(_permitData.owner, address(this), priceCEO);
        
        // Process USDC swap if enabled
        uint256 usdcAmount = 0;
        if (usdcSwapEnabled && usdcSwapPercentage > 0) {
            usdcAmount = _swapCEOToUSDC(priceCEO);
        }
        
        // Mint NFT using the collection contract
        uint256 tokenId = _mintNFT(_collection, _permitData.owner, _metadataURI);
        
        emit NFTPurchased(_permitData.owner, _nftType, _tierId, priceCEO, usdcAmount, tokenId, _metadataURI, _collection);
    }
    
    /**
     * @dev Purchase and mint NFT (traditional method)
     * @param _nftType The type of NFT to mint (PFP or MEME)
     * @param _tierId The tier ID (0 for current active tier)
     * @param _metadataURI The metadata URI for the NFT
     * @param _collection Address of the collection contract
     * @notice Can only be called by approver role (backend)
     */
    function mintNFT(
        NFTType _nftType,
        uint256 _tierId,
        string memory _metadataURI,
        address _collection
    ) external onlyRole(APPROVER_ROLE) nonReentrant {
        if (_tierId == 0) {
            _tierId = activeTier[_nftType];
        }
        
        require(tiers[_nftType][_tierId].active, "MinterContract: Tier is not active");
        require(_collection != address(0), "MinterContract: Invalid collection address");
        
        uint256 priceCEO = (tiers[_nftType][_tierId].priceUSD * 1e18) / ceoPriceUSD;
        
        // Transfer CEO tokens from user to this contract
        IERC20(ceoToken).safeTransferFrom(msg.sender, address(this), priceCEO);
        
        // Process USDC swap if enabled
        uint256 usdcAmount = 0;
        if (usdcSwapEnabled && usdcSwapPercentage > 0) {
            usdcAmount = _swapCEOToUSDC(priceCEO);
        }
        
        // Mint NFT using the collection contract
        uint256 tokenId = _mintNFT(_collection, msg.sender, _metadataURI);
        
        emit NFTPurchased(msg.sender, _nftType, _tierId, priceCEO, usdcAmount, tokenId, _metadataURI, _collection);
    }
    
    /**
     * @dev Internal function to mint NFT using collection contract
     * @param _collection Address of the collection contract
     * @param _to Address to mint to
     * @param _metadataURI Metadata URI
     * @return tokenId The minted token ID
     */
    function _mintNFT(address _collection, address _to, string memory _metadataURI) internal returns (uint256) {
        // Call the collection's mintForUser function
        (bool success, bytes memory data) = _collection.call(
            abi.encodeWithSignature("mintForUser(address,string)", _to, _metadataURI)
        );
        
        require(success, "MinterContract: NFT minting failed");
        
        // Get the current token ID from the collection
        (bool success2, bytes memory tokenIdData) = _collection.staticcall(
            abi.encodeWithSignature("getCurrentTokenId()")
        );
        
        require(success2, "MinterContract: Failed to get token ID");
        
        uint256 tokenId = abi.decode(tokenIdData, (uint256));
        return tokenId - 1; // Adjust for 0-based indexing
    }
    
    /**
     * @dev Internal function to swap CEO tokens to USDC
     * @param _ceoAmount Amount of CEO tokens to swap
     * @return usdcAmount Amount of USDC received
     */
    function _swapCEOToUSDC(uint256 _ceoAmount) internal returns (uint256) {
        uint256 swapAmount = (_ceoAmount * usdcSwapPercentage) / 10000;
        
        // For now, we'll simulate the swap by transferring CEO to treasury
        // In production, this would integrate with a DEX like PancakeSwap
        IERC20(ceoToken).safeTransfer(treasury, swapAmount);
        
        // Calculate equivalent USDC amount
        uint256 usdcAmount = (swapAmount * ceoPriceUSD) / usdcPriceUSD;
        
        emit CEOToUSDC(swapAmount, usdcAmount);
        return usdcAmount;
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
     * @dev RECOVERY MECHANISM: Recover stuck tokens
     * @param _token The token address to recover (address(0) for ETH)
     * @param _amount The amount to recover
     * @notice Can only be called by rescuer role
     * @notice This is the main recovery mechanism for stuck tokens
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
     * @dev RECOVERY MECHANISM: Emergency recovery of all stuck tokens
     * @notice Can only be called by rescuer role
     * @notice This recovers all stuck tokens at once
     */
    function emergencyRecoverAll() external onlyRole(RESCUER_ROLE) nonReentrant {
        // Recover ETH
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            payable(msg.sender).transfer(ethBalance);
            emit StuckTokensRecovered(address(0), ethBalance);
        }
        
        // Recover USDC
        uint256 usdcBalance = usdcToken.balanceOf(address(this));
        if (usdcBalance > 0) {
            usdcToken.safeTransfer(msg.sender, usdcBalance);
            emit StuckTokensRecovered(address(usdcToken), usdcBalance);
        }
        
        // Emit event even if no tokens to recover
        if (ethBalance == 0 && usdcBalance == 0) {
            emit StuckTokensRecovered(address(0), 0);
        }
    }
    
    /**
     * @dev Check if user can mint more NFTs of a specific type
     * @param _user The user address
     * @param _collection The collection address
     * @return bool True if user can mint more NFTs
     */
    function canUserMint(address _user, address _collection) external view returns (bool) {
        require(_collection != address(0), "MinterContract: Invalid collection address");
        
        (bool success, bytes memory data) = _collection.staticcall(
            abi.encodeWithSignature("canUserMint(address)", _user)
        );
        
        if (!success) return false;
        
        return abi.decode(data, (bool));
    }
    
    /**
     * @dev Get user's mint count for a specific collection
     * @param _user The user address
     * @param _collection The collection address
     * @return The number of NFTs minted by the user
     */
    function getUserMintCount(address _user, address _collection) external view returns (uint256) {
        require(_collection != address(0), "MinterContract: Invalid collection address");
        
        (bool success, bytes memory data) = _collection.staticcall(
            abi.encodeWithSignature("getUserMintCount(address)", _user)
        );
        
        if (!success) return 0;
        
        return abi.decode(data, (uint256));
    }
    
    /**
     * @dev Get royalty information for a token
     * @param tokenId The token ID
     * @param salePrice The sale price
     * @return receiver The address to receive royalties (admin for now, creator per token in future)
     * @return royaltyAmount The royalty amount
     */
    function getRoyaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount) {
        receiver = royaltyInfo.adminRecipient; // For now, return admin recipient
        royaltyAmount = (salePrice * royaltyInfo.totalPercentage) / 10000;
    }
    
    /**
     * @dev Get split royalty information for a token
     * @param tokenId The token ID
     * @param salePrice The sale price
     * @param creator The creator address for this token
     * @return adminReceiver The admin address to receive royalties
     * @return creatorReceiver The creator address to receive royalties
     * @return adminAmount The admin royalty amount
     * @return creatorAmount The creator royalty amount
     */
    function getSplitRoyaltyInfo(uint256 tokenId, uint256 salePrice, address creator) external view returns (
        address adminReceiver,
        address creatorReceiver,
        uint256 adminAmount,
        uint256 creatorAmount
    ) {
        adminReceiver = royaltyInfo.adminRecipient;
        creatorReceiver = creator != address(0) ? creator : royaltyInfo.adminRecipient; // Fallback to admin if no creator
        adminAmount = (salePrice * royaltyInfo.adminPercentage) / 10000;
        creatorAmount = (salePrice * royaltyInfo.creatorPercentage) / 10000;
    }
    
    /**
     * @dev AUTOMATIC ROYALTY DISTRIBUTION: Distribute royalties automatically
     * @param tokenId The token ID
     * @param salePrice The sale price
     * @param creator The creator address for this token
     * @notice This function automatically distributes royalties to admin and creator
     * @notice Can only be called by admin or approver role
     */
    function distributeRoyalties(uint256 tokenId, uint256 salePrice, address creator) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(salePrice > 0, "MinterContract: Sale price must be greater than 0");
        
        uint256 totalRoyalty = (salePrice * royaltyInfo.totalPercentage) / 10000;
        uint256 adminAmount = (salePrice * royaltyInfo.adminPercentage) / 10000;
        uint256 creatorAmount = (salePrice * royaltyInfo.creatorPercentage) / 10000;
        
        require(totalRoyalty == adminAmount + creatorAmount, "MinterContract: Royalty calculation error");
        
        // Distribute to admin (Safe wallet)
        if (adminAmount > 0) {
            IERC20(ceoToken).safeTransfer(royaltyInfo.adminRecipient, adminAmount);
        }
        
        // Distribute to creator
        address creatorRecipient = creator != address(0) ? creator : royaltyInfo.adminRecipient;
        if (creatorAmount > 0) {
            IERC20(ceoToken).safeTransfer(creatorRecipient, creatorAmount);
        }
        
        emit RoyaltyDistributed(tokenId, royaltyInfo.adminRecipient, creatorRecipient, adminAmount, creatorAmount);
    }
    
    /**
     * @dev AUTOMATIC ROYALTY DISTRIBUTION: Distribute royalties for NFT collection
     * @param collection The collection contract address
     * @param tokenId The token ID
     * @param salePrice The sale price
     * @notice This function automatically distributes royalties for specific collection
     * @notice Can only be called by admin or approver role
     */
    function distributeCollectionRoyalties(address collection, uint256 tokenId, uint256 salePrice) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(collection != address(0), "MinterContract: Invalid collection address");
        require(salePrice > 0, "MinterContract: Sale price must be greater than 0");
        
        // Get creator from collection
        (bool success, bytes memory data) = collection.staticcall(
            abi.encodeWithSignature("getTokenCreator(uint256)", tokenId)
        );
        
        address creator = address(0);
        if (success && data.length > 0) {
            creator = abi.decode(data, (address));
        }
        
        // Distribute royalties directly
        uint256 totalRoyalty = (salePrice * royaltyInfo.totalPercentage) / 10000;
        uint256 adminAmount = (salePrice * royaltyInfo.adminPercentage) / 10000;
        uint256 creatorAmount = (salePrice * royaltyInfo.creatorPercentage) / 10000;
        
        require(totalRoyalty == adminAmount + creatorAmount, "MinterContract: Royalty calculation error");
        
        // Distribute to admin (Safe wallet)
        if (adminAmount > 0) {
            IERC20(ceoToken).safeTransfer(royaltyInfo.adminRecipient, adminAmount);
        }
        
        // Distribute to creator
        address creatorRecipient = creator != address(0) ? creator : royaltyInfo.adminRecipient;
        if (creatorAmount > 0) {
            IERC20(ceoToken).safeTransfer(creatorRecipient, creatorAmount);
        }
        
        emit RoyaltyDistributed(tokenId, royaltyInfo.adminRecipient, creatorRecipient, adminAmount, creatorAmount);
    }
    
    /**
     * @dev Receive function to accept ETH
     * @notice This allows the contract to receive ETH for recovery testing
     */
    receive() external payable {
        // Contract can receive ETH
    }
}
