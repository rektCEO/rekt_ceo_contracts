// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./CEOToken.sol";
import "./NFTCollection.sol";

/**
 * @title MinterContract
 * @dev Central contract for handling NFT minting with $CEO token payments
 * @notice This contract manages tiered pricing, payment processing, and mint limit enforcement
 */
contract MinterContract is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    enum NFTType { PFP, MEME }
    
    struct Tier {
        uint256 priceUSD;    // Price in USD (scaled by 1e18)
        uint256 supplyLimit; // Number of NFTs that can be minted in this tier
        uint256 startSupply; // Cumulative supply at the start of this tier
    }

    struct PermitData {
        address owner;
        address spender;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");
    
    // Mock DEX price - TODO: Replace with actual DEX integration
    uint256 private constant MOCK_CEO_PRICE_USD = 567e15; // $0.567 per CEO token (18 decimals)
    uint256 private constant USDC_PRICE_USD = 1e18; // USDC is pegged to $1 (18 decimals)

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public ceoToken;
    IERC20 public usdcToken;
    NFTCollection public pfpCollection;
    NFTCollection public memeCollection;
    address public treasury;
    
    // Pricing tiers (USD prices scaled by 1e18)
    // Tier ID 1, 2, 3 with supply limits: 25, 25, 50
    mapping(NFTType => mapping(uint256 => Tier)) public tiers;
    
    // USDC swap configuration
    bool public usdcSwapEnabled;
    uint256 public usdcSwapPercentage; // Basis points (e.g., 5000 = 50%)

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event TierProgressed(NFTType nftType, uint256 fromTier, uint256 toTier, uint256 currentSupply);
    event TreasuryUpdated(address indexed newTreasury);
    event USDCSwapConfigUpdated(bool enabled, uint256 percentage);
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
    event CEOToUSDC(uint256 ceoAmount, uint256 usdcAmount);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @dev Constructor
     * @param _ceoToken Address of the CEO token contract
     * @param _pfpCollection Address of the PFP collection contract
     * @param _memeCollection Address of the Meme collection contract
     * @param _usdcToken Address of the USDC token contract
     * @param _treasury Address of the treasury wallet
     * @param _admin Address that will have admin role
     */
    constructor(
        address _ceoToken,
        address _pfpCollection,
        address _memeCollection,
        address _usdcToken,
        address _treasury,
        address _admin
    ) {
        require(_ceoToken != address(0), "MinterContract: Invalid CEO token address");
        require(_pfpCollection != address(0), "MinterContract: Invalid PFP collection address");
        require(_memeCollection != address(0), "MinterContract: Invalid Meme collection address");
        require(_usdcToken != address(0), "MinterContract: Invalid USDC token address");
        require(_treasury != address(0), "MinterContract: Invalid treasury address");
        require(_admin != address(0), "MinterContract: Invalid admin address");
        
        ceoToken = IERC20(_ceoToken);
        pfpCollection = NFTCollection(_pfpCollection);
        memeCollection = NFTCollection(_memeCollection);
        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;
        
        usdcSwapEnabled = true;
        usdcSwapPercentage = 5000; // 50% (basis points)
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        
        _initializeDefaultTiers();
    }

    /**
     * @dev Initialize default pricing tiers with supply limits
     * PFP: Tier 1 (500 NFTs), Tier 2 (309 NFTs), Tier 3 (190 NFTs) = 999 total
     * MEME: Tier 1 (5000 NFTs), Tier 2 (3090 NFTs), Tier 3 (1909 NFTs) = 9999 total
     */
    function _initializeDefaultTiers() internal {
        // PFP Tiers (supply: 500, 309, 190 = 999 total)
        tiers[NFTType.PFP][1] = Tier({
            priceUSD: 50e18,      // $50
            supplyLimit: 500,
            startSupply: 0
        });
        tiers[NFTType.PFP][2] = Tier({
            priceUSD: 150e18,     // $150
            supplyLimit: 309,
            startSupply: 500      // Starts after first 500
        });
        tiers[NFTType.PFP][3] = Tier({
            priceUSD: 250e18,     // $250
            supplyLimit: 190,
            startSupply: 809      // Starts after first 809 (500 + 309)
        });
        
        // Meme Tiers (supply: 5000, 3090, 1909 = 9999 total)
        tiers[NFTType.MEME][1] = Tier({
            priceUSD: 5e18,       // $5
            supplyLimit: 5000,
            startSupply: 0
        });
        tiers[NFTType.MEME][2] = Tier({
            priceUSD: 15e18,      // $15
            supplyLimit: 3090,
            startSupply: 5000     // Starts after first 5000
        });
        tiers[NFTType.MEME][3] = Tier({
            priceUSD: 25e18,      // $25
            supplyLimit: 1909,
            startSupply: 8090     // Starts after first 8090 (5000 + 3090)
        });
    }

    /*//////////////////////////////////////////////////////////////
                        MINTING FUNCTIONS
    //////////////////////////////////////////////////////////////*/ 

    /**
     * @dev Purchase and mint NFT
     * @param _nftType The type of NFT to mint (PFP or MEME)
     * @param _metadataURI The metadata URI for the NFT
     * @notice Can only be called by approver role (backend)
     * @notice Tier is automatically determined based on current minted supply
     */
    function mintNFT(
        NFTType _nftType,
        string memory _metadataURI
    ) external onlyRole(APPROVER_ROLE) nonReentrant {
        // Get current supply from NFT collection contract
        uint256 currentSupply = _getCurrentSupply(_nftType);
        
        // Determine current tier based on supply
        uint256 currentTier = _getCurrentTier(_nftType, currentSupply);
        require(currentTier > 0, "MinterContract: All tiers exhausted");
        
        Tier memory tier = tiers[_nftType][currentTier];
        
        uint256 ceoPriceUSD = getCEOUSDCPrice();
        uint256 priceCEO = (tier.priceUSD * 1e18) / ceoPriceUSD;
        
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
        
        emit NFTPurchased(msg.sender, _nftType, currentTier, priceCEO, tokenId, _metadataURI);
    }

    /**
     * @dev Purchase and mint NFT with ERC20 permit for gasless approval
     * @param _nftType The type of NFT to mint (PFP or MEME)
     * @param _metadataURI The metadata URI for the NFT
     * @param _permitData Permit signature data for gasless approval
     * @notice Can only be called by approver role (backend)
     * @notice Tier is automatically determined based on current minted supply
     */
    function mintNFTWithPermit(
        NFTType _nftType,
        string memory _metadataURI,
        PermitData memory _permitData
    ) external onlyRole(APPROVER_ROLE) nonReentrant {
        // Get current supply from NFT collection contract
        uint256 currentSupply = _getCurrentSupply(_nftType);
        
        // Determine current tier based on supply
        uint256 currentTier = _getCurrentTier(_nftType, currentSupply);
        require(currentTier > 0, "MinterContract: All tiers exhausted");
        
        Tier memory tier = tiers[_nftType][currentTier];
        
        uint256 ceoPriceUSD = getCEOUSDCPrice();
        uint256 priceCEO = (tier.priceUSD * 1e18) / ceoPriceUSD;

        require(_permitData.value >= priceCEO, "MinterContract: Insufficient permit value");
        require(_permitData.spender == address(this), "MinterContract: Permit spender must be this contract");

        // Execute permit for gasless approval
        IERC20Permit(address(ceoToken)).permit(
            _permitData.owner,
            _permitData.spender,
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
        
        emit NFTPurchased(_permitData.owner, _nftType, currentTier, priceCEO, tokenId, _metadataURI);
    }

    /*//////////////////////////////////////////////////////////////
                    ADMIN CONFIGURATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/ 
    
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
     * @dev Update USDC swap configuration
     * @param _enabled Whether USDC swapping is enabled
     * @param _percentage Percentage of CEO tokens to swap (in basis points)
     * @notice Can only be called by admin
     */
    function updateUSDCSwapConfig(bool _enabled, uint256 _percentage) external onlyRole(ADMIN_ROLE) {
        require(_percentage <= 10000, "MinterContract: Percentage cannot exceed 100%");
        usdcSwapEnabled = _enabled;
        usdcSwapPercentage = _percentage;
        emit USDCSwapConfigUpdated(_enabled, _percentage);
    }

    /*//////////////////////////////////////////////////////////////
                    TREASURY & WITHDRAWAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

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
     * @dev Recover stuck ERC-20 tokens
     * @param _token The token address to recover
     * @param _amount The amount to recover
     * @notice Can only be called by rescuer role
     * @notice This contract cannot receive ETH (no receive/fallback), so ETH recovery is not needed
     */
    function recoverStuckTokens(address _token, uint256 _amount) external onlyRole(RESCUER_ROLE) nonReentrant {
        require(_token != address(0), "MinterContract: Invalid token address");
        
        // Recover ERC-20 tokens (including CEO tokens if needed for emergency)
        IERC20(_token).safeTransfer(msg.sender, _amount);
        
        emit StuckTokensRecovered(_token, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Get CEO/USDC swap price from DEX
     * @return The current CEO price in USD (scaled by 1e18)
     * @notice Mock implementation - TODO: Integrate with actual DEX (e.g., Uniswap V3 TWAP oracle)
     */
    function getCEOUSDCPrice() public pure returns (uint256) {
        // Mock hardcoded value for now
        // In production, this should fetch from DEX oracle (e.g., Uniswap V3 TWAP)
        return MOCK_CEO_PRICE_USD;
    }

    /**
     * @dev Get current price in CEO tokens for current tier based on supply
     * @param _nftType The type of NFT (PFP or MEME)
     * @return The price in CEO tokens
     */
    function getNFTPriceInCEO(NFTType _nftType) external view returns (uint256) {
        uint256 currentSupply = _getCurrentSupply(_nftType);
        uint256 currentTier = _getCurrentTier(_nftType, currentSupply);
        require(currentTier > 0, "MinterContract: All tiers exhausted");
        
        uint256 priceUSD = tiers[_nftType][currentTier].priceUSD;
        uint256 ceoPriceUSD = getCEOUSDCPrice();
        return (priceUSD * 1e18) / ceoPriceUSD;
    }
    
    /**
     * @dev Get current tier information based on minted supply
     * @param _nftType The type of NFT (PFP or MEME)
     * @return tierId The current tier ID
     * @return priceUSD The price in USD
     * @return priceCEO The price in CEO tokens
     * @return remainingInTier Number of NFTs remaining in current tier
     */
    function getCurrentTierInfo(NFTType _nftType) external view returns (
        uint256 tierId,
        uint256 priceUSD,
        uint256 priceCEO,
        uint256 remainingInTier
    ) {
        uint256 currentSupply = _getCurrentSupply(_nftType);
        tierId = _getCurrentTier(_nftType, currentSupply);
        require(tierId > 0, "MinterContract: All tiers exhausted");
        
        Tier memory tier = tiers[_nftType][tierId];
        priceUSD = tier.priceUSD;
        uint256 ceoPriceUSD = getCEOUSDCPrice();
        priceCEO = (priceUSD * 1e18) / ceoPriceUSD;
        
        // Calculate remaining NFTs in current tier
        uint256 tierEndSupply = tier.startSupply + tier.supplyLimit;
        remainingInTier = tierEndSupply - currentSupply;
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

    /*//////////////////////////////////////////////////////////////
                        INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Get current minted supply from NFT collection contract
     * @param _nftType The type of NFT (PFP or MEME)
     * @return The current minted count
     */
    function _getCurrentSupply(NFTType _nftType) internal view returns (uint256) {
        if (_nftType == NFTType.PFP) {
            // getCurrentTokenId returns next token ID, so subtract 1 to get minted count
            return pfpCollection.getCurrentTokenId() - 1;
        } else {
            return memeCollection.getCurrentTokenId() - 1;
        }
    }

    /**
     * @dev Determine current tier based on minted supply
     * @param _nftType The type of NFT (PFP or MEME)
     * @param _currentSupply The current minted supply
     * @return The current tier ID (1, 2, or 3), or 0 if all tiers exhausted
     */
    function _getCurrentTier(NFTType _nftType, uint256 _currentSupply) internal view returns (uint256) {
        // Check tier 1 (0-24)
        Tier memory tier1 = tiers[_nftType][1];
        if (_currentSupply < tier1.startSupply + tier1.supplyLimit) {
            return 1;
        }
        
        // Check tier 2 (25-49)
        Tier memory tier2 = tiers[_nftType][2];
        if (_currentSupply < tier2.startSupply + tier2.supplyLimit) {
            return 2;
        }
        
        // Check tier 3 (50-99)
        Tier memory tier3 = tiers[_nftType][3];
        if (_currentSupply < tier3.startSupply + tier3.supplyLimit) {
            return 3;
        }
        
        // All tiers exhausted
        return 0;
    }

    /**
     * @dev Internal function to swap CEO tokens to USDC and send to treasury
     * @param _ceoAmount Total CEO amount to process
     * @return usdcAmount The amount of USDC received from swap
     * @notice Mock implementation - TODO: Integrate with actual DEX router (e.g., Uniswap V3)
     * 
     * In production, this function should:
     * 1. Calculate swap amount based on usdcSwapPercentage (currently 50%)
     * 2. Approve DEX router to spend CEO tokens
     * 3. Execute swap on DEX (CEO -> USDC)
     * 4. Transfer received USDC to treasury
     * 5. Transfer remaining CEO (50%) to treasury
     */
    function _swapCEOToUSDC(uint256 _ceoAmount) internal returns (uint256) {
        uint256 swapAmount = (_ceoAmount * usdcSwapPercentage) / 10000; // 50% of CEO
        uint256 remainingCEO = _ceoAmount - swapAmount;
        
        // Mock swap calculation - TODO: Replace with actual DEX swap
        uint256 ceoPriceUSD = getCEOUSDCPrice();
        uint256 usdcAmount = (swapAmount * ceoPriceUSD) / USDC_PRICE_USD;
        
        // Transfer remaining 50% CEO to treasury
        ceoToken.safeTransfer(treasury, swapAmount);
        
        // TODO: In production, transfer actual USDC received from swap to treasury
        // usdcToken.safeTransfer(treasury, usdcAmount);
        // For now, just transfer CEO to treasury (mock behavior)
        ceoToken.safeTransfer(treasury, remainingCEO);
        
        emit CEOToUSDC(swapAmount, usdcAmount);
        return usdcAmount;
    }

    /*//////////////////////////////////////////////////////////////
                        RECEIVE FUNCTION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice This contract does NOT accept ETH
     * @dev receive() function intentionally omitted - all payments are in CEO tokens
     * @dev If ETH is accidentally sent, transaction will revert (fail-fast design)
     */
}
