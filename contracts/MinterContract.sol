// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./CEOToken.sol";
import "./NFTCollection.sol";
import "./interfaces/IUniswapV2Router02.sol";

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

    enum NFTType {
        PFP,
        MEME
    }

    struct Tier {
        uint256 priceUSD; // Price in USD (scaled by stablecoin decimals - typically 1e6 for USDC)
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

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public ceoToken;
    IERC20 public usdcToken;
    NFTCollection public pfpCollection;
    NFTCollection public memeCollection;
    address public treasury;

    // Token decimals (queried from token contracts)
    uint8 public ceoDecimals;
    uint8 public usdcDecimals;

    // Pricing tiers (USD prices scaled by stablecoin decimals - typically 1e6 for USDC)
    // Tier ID 1, 2, 3, 4 with supply limits based on NFT type
    mapping(NFTType => mapping(uint256 => Tier)) public tiers;

    // USDC swap configuration
    bool public usdcSwapEnabled;
    uint256 public usdcSwapPercentage; // Basis points (e.g., 5000 = 50%)

    // Uniswap V2 integration
    IUniswapV2Router02 public uniswapRouter;
    address[] public swapPath; // Path for CEO -> USDC swap (e.g., [CEO, WETH, USDC])
    uint256 public slippageTolerance; // Basis points (e.g., 100 = 1%)

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event TierProgressed(
        NFTType nftType,
        uint256 fromTier,
        uint256 toTier,
        uint256 currentSupply
    );
    event TreasuryUpdated(address indexed newTreasury);
    event USDCSwapConfigUpdated(bool enabled, uint256 percentage);
    event UniswapConfigUpdated(
        address indexed router,
        address[] path,
        uint256 slippage
    );
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
    event NFTTokenURISet(
        NFTType indexed nftType,
        uint256 indexed tokenId,
        string metadataURI
    );
    event TierPriceUpdated(
        NFTType indexed nftType,
        uint256 indexed tierId,
        uint256 oldPriceUSD,
        uint256 newPriceUSD
    );

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
        require(
            _ceoToken != address(0),
            "MinterContract: Invalid CEO token address"
        );
        require(
            _pfpCollection != address(0),
            "MinterContract: Invalid PFP collection address"
        );
        require(
            _memeCollection != address(0),
            "MinterContract: Invalid Meme collection address"
        );
        require(
            _usdcToken != address(0),
            "MinterContract: Invalid USDC token address"
        );
        require(
            _treasury != address(0),
            "MinterContract: Invalid treasury address"
        );
        require(_admin != address(0), "MinterContract: Invalid admin address");

        ceoToken = IERC20(_ceoToken);
        pfpCollection = NFTCollection(_pfpCollection);
        memeCollection = NFTCollection(_memeCollection);
        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;

        // Query and store token decimals for dynamic calculations
        ceoDecimals = IERC20Metadata(_ceoToken).decimals();
        usdcDecimals = IERC20Metadata(_usdcToken).decimals();
        require(
            ceoDecimals > 0 && ceoDecimals <= 77,
            "MinterContract: Invalid CEO decimals"
        );
        require(
            usdcDecimals > 0 && usdcDecimals <= 77,
            "MinterContract: Invalid USDC decimals"
        );

        usdcSwapEnabled = true;
        usdcSwapPercentage = 5000; // 50% (basis points)
        slippageTolerance = 100; // 1% slippage tolerance (basis points)
        // Note: uniswapRouter and swapPath must be configured via setUniswapConfig after deployment

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);

        _initializeDefaultTiers();
    }

    /**
     * @dev Initialize default pricing tiers with supply limits
     * PFP: Tier 1 (500 NFTs), Tier 2 (300 NFTs), Tier 3 (190 NFTs), Tier 4 (9 NFTs) = 999 total
     * MEME: Tier 1 (5000 NFTs), Tier 2 (3500 NFTs), Tier 3 (1400 NFTs), Tier 4 (99 NFTs) = 9999 total
     * @notice Prices are dynamically scaled based on USDC decimals (typically 6 decimals)
     */
    function _initializeDefaultTiers() internal {
        // Calculate price scaling factor based on USDC decimals
        uint256 priceScale = 10 ** usdcDecimals;

        // PFP Tiers (supply: 500, 300, 190, 9 = 999 total)
        tiers[NFTType.PFP][1] = Tier({
            priceUSD: 50 * priceScale, // $50
            supplyLimit: 500,
            startSupply: 0
        });
        tiers[NFTType.PFP][2] = Tier({
            priceUSD: 150 * priceScale, // $150
            supplyLimit: 300,
            startSupply: 500 // Starts after first 500
        });
        tiers[NFTType.PFP][3] = Tier({
            priceUSD: 450 * priceScale, // $450
            supplyLimit: 190,
            startSupply: 800 // Starts after first 800 (500 + 300)
        });
        tiers[NFTType.PFP][4] = Tier({
            priceUSD: 11000 * priceScale, // $11000
            supplyLimit: 9,
            startSupply: 990 // Starts after first 990 (500 + 300 + 190)
        });

        // Meme Tiers (supply: 5000, 3500, 1400, 99 = 9999 total)
        tiers[NFTType.MEME][1] = Tier({
            priceUSD: 5 * priceScale, // $5
            supplyLimit: 5000,
            startSupply: 0
        });
        tiers[NFTType.MEME][2] = Tier({
            priceUSD: 15 * priceScale, // $15
            supplyLimit: 3500,
            startSupply: 5000 // Starts after first 5000
        });
        tiers[NFTType.MEME][3] = Tier({
            priceUSD: 50 * priceScale, // $50
            supplyLimit: 1400,
            startSupply: 8500 // Starts after first 8500 (5000 + 3500)
        });
        tiers[NFTType.MEME][4] = Tier({
            priceUSD: 1100 * priceScale, // $1100
            supplyLimit: 99,
            startSupply: 9900 // Starts after first 9900 (5000 + 3500 + 1400)
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

        // Get current CEO price from DEX and calculate required CEO amount
        uint256 ceoPriceInUSDC = queryCEOPriceFromDEX();
        uint256 priceCEO = _calculateCEOAmount(tier.priceUSD, ceoPriceInUSDC);

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

        emit NFTPurchased(
            msg.sender,
            _nftType,
            currentTier,
            priceCEO,
            tokenId,
            _metadataURI
        );
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

        // Get current CEO price from DEX and calculate required CEO amount
        uint256 ceoPriceInUSDC = queryCEOPriceFromDEX();
        uint256 priceCEO = _calculateCEOAmount(tier.priceUSD, ceoPriceInUSDC);

        require(
            _permitData.value >= priceCEO,
            "MinterContract: Insufficient permit value"
        );
        require(
            _permitData.spender == address(this),
            "MinterContract: Permit spender must be this contract"
        );

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

        emit NFTPurchased(
            _permitData.owner,
            _nftType,
            currentTier,
            priceCEO,
            tokenId,
            _metadataURI
        );
    }

    /**
     * @dev Set the metadata URI for a minted NFT after IPFS upload.
     * @param _nftType    The NFT collection type (PFP or MEME)
     * @param tokenId     The real tokenId from the NFTPurchased event
     * @param metadataURI The IPFS URI containing the correct tokenId in metadata
     * @notice Can only be called by APPROVER_ROLE (backend signer).
     * @notice Call this immediately after mintNFT / mintNFTWithPermit once the
     *         tokenId is known from the NFTPurchased event and metadata is on IPFS.
     */
    function setNFTTokenURI(
        NFTType _nftType,
        uint256 tokenId,
        string memory metadataURI
    ) external onlyRole(APPROVER_ROLE) nonReentrant {
        require(
            bytes(metadataURI).length > 0,
            "MinterContract: URI cannot be empty"
        );

        if (_nftType == NFTType.PFP) {
            pfpCollection.setTokenURI(tokenId, metadataURI);
        } else {
            memeCollection.setTokenURI(tokenId, metadataURI);
        }

        emit NFTTokenURISet(_nftType, tokenId, metadataURI);
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
        require(
            _treasury != address(0),
            "MinterContract: Invalid treasury address"
        );
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /**
     * @dev Update USDC swap configuration
     * @param _enabled Whether USDC swapping is enabled
     * @param _percentage Percentage of CEO tokens to swap (in basis points)
     * @notice Can only be called by admin
     */
    function updateUSDCSwapConfig(
        bool _enabled,
        uint256 _percentage
    ) external onlyRole(ADMIN_ROLE) {
        require(
            _percentage <= 10000,
            "MinterContract: Percentage cannot exceed 100%"
        );
        usdcSwapEnabled = _enabled;
        usdcSwapPercentage = _percentage;
        emit USDCSwapConfigUpdated(_enabled, _percentage);
    }

    /**
     * @dev Configure Uniswap V2 router and swap path
     * @param _router Address of Uniswap V2 Router
     * @param _path Swap path from CEO to USDC (e.g., [CEO, WETH, USDC] or [CEO, USDC])
     * @param _slippageTolerance Slippage tolerance in basis points (e.g., 100 = 1%)
     * @notice Can only be called by admin
     * @notice Router addresses by network:
     *         - Ethereum Mainnet: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
     *         - Base: 0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24
     *         - Arbitrum: 0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24
     */
    function setUniswapConfig(
        address _router,
        address[] memory _path,
        uint256 _slippageTolerance
    ) external onlyRole(ADMIN_ROLE) {
        require(
            _router != address(0),
            "MinterContract: Invalid router address"
        );
        require(
            _path.length >= 2,
            "MinterContract: Path must have at least 2 tokens"
        );
        require(
            _path[0] == address(ceoToken),
            "MinterContract: Path must start with CEO token"
        );
        require(
            _path[_path.length - 1] == address(usdcToken),
            "MinterContract: Path must end with USDC token"
        );
        require(
            _slippageTolerance <= 1000,
            "MinterContract: Slippage tolerance too high (max 10%)"
        );

        uniswapRouter = IUniswapV2Router02(_router);
        swapPath = _path;
        slippageTolerance = _slippageTolerance;

        emit UniswapConfigUpdated(_router, _path, _slippageTolerance);
    }

    /**
     * @dev Update the USD price for a specific NFT tier.
     * @param _nftType  The NFT collection type (PFP or MEME).
     * @param _tierId   The tier to update (1, 2, 3, or 4).
     * @param _newPriceUSD New price in USD, already scaled to USDC decimals
     *                    (e.g., pass 75 * 10**usdcDecimals for $75).
     * @notice Only updates priceUSD — supplyLimit and startSupply are unchanged,
     *         so tier progression logic is never affected.
     * @notice Can only be called by ADMIN_ROLE (requires community vote off-chain).
     */
    function setTierPrice(
        NFTType _nftType,
        uint256 _tierId,
        uint256 _newPriceUSD
    ) external onlyRole(ADMIN_ROLE) {
        require(
            _tierId >= 1 && _tierId <= 4,
            "MinterContract: Invalid tier ID (must be 1-4)"
        );
        require(
            _newPriceUSD > 0,
            "MinterContract: Price must be greater than zero"
        );

        uint256 oldPrice = tiers[_nftType][_tierId].priceUSD;
        tiers[_nftType][_tierId].priceUSD = _newPriceUSD;

        emit TierPriceUpdated(_nftType, _tierId, oldPrice, _newPriceUSD);
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
    function recoverStuckTokens(
        address _token,
        uint256 _amount
    ) external onlyRole(RESCUER_ROLE) nonReentrant {
        require(_token != address(0), "MinterContract: Invalid token address");

        // Recover ERC-20 tokens (including CEO tokens if needed for emergency)
        IERC20(_token).safeTransfer(msg.sender, _amount);

        emit StuckTokensRecovered(_token, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Query the current price of CEO token from the DEX (Uniswap)
     * @return The current CEO price in USDC (scaled to USDC decimals)
     * @notice Uses Uniswap V2 getAmountsOut to query price of 1 CEO token in USDC
     * @notice Reverts if Uniswap is not properly configured or price query fails
     *
     * Decimal Handling (Dynamic):
     * - CEO Token: ceoDecimals (typically 18)
     * - USDC Token: usdcDecimals (typically 6)
     * - Query: getAmountsOut(10^ceoDecimals, [CEO, USDC]) returns USDC amount
     * - Return: USDC amount in native USDC decimals
     *
     * Example: If CEO has 18 decimals, USDC has 6 decimals, and 1 CEO = 0.567 USDC
     * - Query: getAmountsOut(10^18, path)
     * - Uniswap returns: 567000 (6 decimals = 0.567 USDC)
     * - We return: 567000 (in USDC decimals)
     * - Price calculation: (50 * 10^6 * 10^18) / 567000 ≈ 88.1 * 10^18 CEO tokens for $50 NFT
     */
    function queryCEOPriceFromDEX() public view returns (uint256) {
        // Require Uniswap to be properly configured
        require(
            address(uniswapRouter) != address(0),
            "MinterContract: Uniswap router not configured"
        );
        require(
            swapPath.length >= 2,
            "MinterContract: Swap path not configured"
        );

        // Query Uniswap: How much USDC for 1 CEO token (in CEO's native decimals)?
        uint256 oneCEOToken = 10 ** ceoDecimals;
        uint[] memory amounts = uniswapRouter.getAmountsOut(
            oneCEOToken,
            swapPath
        );

        // amounts[last] = USDC output in USDC's native decimals
        uint256 usdcAmountForOneCEO = amounts[amounts.length - 1];
        require(
            usdcAmountForOneCEO > 0,
            "MinterContract: Invalid price from DEX"
        );

        // Return price in USDC decimals (no scaling needed)
        return usdcAmountForOneCEO;
    }

    /**
     * @dev Get current tier information based on minted supply
     * @param _nftType The type of NFT (PFP or MEME)
     * @return currentSupply The current supply of the NFT type
     * @return tierId The current tier ID
     * @return priceUSD The price in USD
     * @return priceCEO The price in CEO tokens
     * @return remainingInTier Number of NFTs remaining in current tier
     */
    function getCurrentTierInfo(
        NFTType _nftType
    )
        external
        view
        returns (
            uint256 currentSupply,
            uint256 tierId,
            uint256 priceUSD,
            uint256 priceCEO,
            uint256 remainingInTier
        )
    {
        currentSupply = _getCurrentSupply(_nftType);
        tierId = _getCurrentTier(_nftType, currentSupply);
        require(tierId > 0, "MinterContract: All tiers exhausted");

        Tier memory tier = tiers[_nftType][tierId];
        priceUSD = tier.priceUSD;

        // Get current CEO price from DEX and calculate required CEO amount
        uint256 ceoPriceInUSDC = queryCEOPriceFromDEX();
        priceCEO = _calculateCEOAmount(priceUSD, ceoPriceInUSDC);

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
    function canUserMint(
        address _user,
        NFTType _nftType
    ) external view returns (bool) {
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
    function getUserMintCount(
        address _user,
        NFTType _nftType
    ) external view returns (uint256) {
        if (_nftType == NFTType.PFP) {
            return pfpCollection.getUserMintCount(_user);
        } else {
            return memeCollection.getUserMintCount(_user);
        }
    }

    /**
     * @dev Get Uniswap configuration and swap path
     * @return router Address of the Uniswap V2 Router
     * @return path Array of token addresses in the swap path
     * @return slippage Slippage tolerance in basis points
     * @return isConfigured Whether Uniswap is properly configured
     */
    function getUniswapConfig()
        external
        view
        returns (
            address router,
            address[] memory path,
            uint256 slippage,
            bool isConfigured
        )
    {
        router = address(uniswapRouter);
        path = swapPath;
        slippage = slippageTolerance;
        isConfigured = (router != address(0) && path.length >= 2);
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Calculate the amount of CEO tokens required for a given USD price
     * @param _tierPrice The price in USD (scaled to USDC decimals)
     * @param _ceoPriceInUSDC The current price of 1 CEO token in USDC (scaled to USDC decimals)
     * @return The amount of CEO tokens needed (scaled to CEO decimals)
     * @notice This function handles dynamic decimal conversions to prevent overflow/underflow
     *
     * Formula: CEO Amount = (NFT Price in USDC × 10^ceoDecimals) ÷ (CEO Price in USDC)
     *
     * Example with typical decimals (CEO=18, USDC=6):
     * - NFT costs $50 = 50 × 10^6 = 50,000,000
     * - 1 CEO = $0.567 = 0.567 × 10^6 = 567,000
     * - CEO needed = (50,000,000 × 10^18) ÷ 567,000 = 88,183,421,516,754,176,610 (~88.18 CEO tokens)
     */
    function _calculateCEOAmount(
        uint256 _tierPrice,
        uint256 _ceoPriceInUSDC
    ) internal view returns (uint256) {
        require(_ceoPriceInUSDC > 0, "MinterContract: Invalid CEO price");

        // Calculate: (priceUSD × 10^ceoDecimals) ÷ ceoPriceUSDC
        // Both priceUSD and ceoPriceUSDC are in USDC decimals
        // Result will be in CEO decimals
        uint256 ceoDecimalScale = 10 ** ceoDecimals;

        // Using checked math to prevent overflow (Solidity 0.8+)
        // If overflow would occur, transaction will revert with panic
        uint256 numerator = _tierPrice * ceoDecimalScale;
        uint256 ceoAmount = numerator / _ceoPriceInUSDC;

        require(ceoAmount > 0, "MinterContract: Calculated CEO amount is zero");
        return ceoAmount;
    }

    /**
     * @dev Get current minted supply from NFT collection contract
     * @param _nftType The type of NFT (PFP or MEME)
     * @return The current minted count
     */
    function _getCurrentSupply(
        NFTType _nftType
    ) internal view returns (uint256) {
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
     * @return The current tier ID (1, 2, 3, or 4), or 0 if all tiers exhausted
     */
    function _getCurrentTier(
        NFTType _nftType,
        uint256 _currentSupply
    ) internal view returns (uint256) {
        // Check tier 1
        Tier memory tier1 = tiers[_nftType][1];
        if (_currentSupply < tier1.startSupply + tier1.supplyLimit) {
            return 1;
        }

        // Check tier 2
        Tier memory tier2 = tiers[_nftType][2];
        if (_currentSupply < tier2.startSupply + tier2.supplyLimit) {
            return 2;
        }

        // Check tier 3
        Tier memory tier3 = tiers[_nftType][3];
        if (_currentSupply < tier3.startSupply + tier3.supplyLimit) {
            return 3;
        }

        // Check tier 4
        Tier memory tier4 = tiers[_nftType][4];
        if (_currentSupply < tier4.startSupply + tier4.supplyLimit) {
            return 4;
        }

        // All tiers exhausted
        return 0;
    }

    /**
     * @dev Internal function to swap CEO tokens to USDC and send to treasury
     * @param _ceoAmount Total CEO amount to process
     * @return usdcAmount The amount of USDC received from swap
     * @notice This function:
     *         1. Calculates swap amount based on usdcSwapPercentage (default 50%)
     *         2. Approves Uniswap router to spend CEO tokens
     *         3. Executes swap on IUniswapV2Router02 (CEO -> USDC)
     *         4. Transfers received USDC to treasury
     *         5. Transfers remaining CEO (50%) to treasury
     */
    function _swapCEOToUSDC(uint256 _ceoAmount) internal returns (uint256) {
        uint256 swapAmount = (_ceoAmount * usdcSwapPercentage) / 10000; // Default 50% of CEO
        uint256 remainingCEO = _ceoAmount - swapAmount;

        // Transfer remaining CEO (not being swapped) directly to treasury
        if (remainingCEO > 0) {
            ceoToken.safeTransfer(treasury, remainingCEO);
        }

        // Check if Uniswap is configured
        if (address(uniswapRouter) == address(0) || swapPath.length < 2) {
            // Fallback: If Uniswap not configured, send CEO to treasury instead
            ceoToken.safeTransfer(treasury, swapAmount);
            emit CEOToUSDC(swapAmount, 0);
            return 0;
        }

        // Approve Uniswap router to spend CEO tokens
        ceoToken.safeApprove(address(uniswapRouter), 0);
        ceoToken.safeApprove(address(uniswapRouter), swapAmount + 1);

        // Get expected output amount with slippage protection
        uint[] memory amountsOut = uniswapRouter.getAmountsOut(
            swapAmount,
            swapPath
        );
        uint256 expectedUSDC = amountsOut[amountsOut.length - 1];
        uint256 minUSDC = (expectedUSDC * (10000 - slippageTolerance)) / 10000;

        // Execute swap: CEO -> USDC
        uint[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            swapAmount, // amountIn: exact amount of CEO to swap
            minUSDC, // amountOutMin: minimum USDC to receive (with slippage)
            swapPath, // path: e.g., [CEO, WETH, USDC]
            treasury, // to: send USDC directly to treasury
            block.timestamp + 300 // deadline: 5 minutes from now
        );

        uint256 usdcReceived = amounts[amounts.length - 1];

        emit CEOToUSDC(swapAmount, usdcReceived);
        return usdcReceived;
    }
}
