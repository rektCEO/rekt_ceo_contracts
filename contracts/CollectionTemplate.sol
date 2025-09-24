// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/**
 * @title CollectionTemplate
 * @dev Template contract for NFT collections that can be cloned
 * @notice This contract serves as a template for creating new NFT collections
 * @notice It's designed to be cloned by the CollectionFactory for gas efficiency
 */
contract CollectionTemplate is ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, ReentrancyGuard, IERC2981 {
    using Counters for Counters.Counter;
    
    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // State variables
    Counters.Counter private _tokenIdCounter;
    address public minterContract;
    address public safeWallet;
    address public creator;
    
    // Collection configuration
    uint256 public maxSupply;
    uint256 public maxMintPerUser;
    
    // Royalty configuration
    address public royaltyRecipient;
    uint256 public royaltyPercentage = 210; // 2.1% in basis points
    
    // Mapping to track user mint counts
    mapping(address => uint256) public userMintCount;
    
    // Mapping to track first minter (creator) for each token
    mapping(uint256 => address) public tokenCreator;
    
    // Initialization flag
    bool private _initialized;
    
    // Events
    event CollectionInitialized(
        string name,
        string symbol,
        uint256 maxSupply,
        uint256 maxMintPerUser,
        address creator
    );
    event MinterContractSet(address indexed minterContract);
    event SafeWalletSet(address indexed safeWallet);
    event RoyaltyInfoUpdated(address indexed recipient, uint256 percentage);
    event NFTMinted(address indexed to, uint256 indexed tokenId, string metadataURI, address indexed creator);
    
    /**
     * @dev Constructor (empty for cloning)
     */
    constructor() ERC721("", "") {
        // Empty constructor for cloning
    }
    
    /**
     * @dev Initialize the cloned contract
     * @param _name The name of the NFT collection
     * @param _symbol The symbol of the NFT collection
     * @param _maxSupply Maximum supply of NFTs
     * @param _maxMintPerUser Maximum NFTs per user
     * @param _minterContract Address of the minter contract
     * @param _safeWallet Address of the Safe wallet
     * @param _creator Address of the creator
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply,
        uint256 _maxMintPerUser,
        address _minterContract,
        address _safeWallet,
        address _creator
    ) external {
        require(!_initialized, "CollectionTemplate: Already initialized");
        require(_minterContract != address(0), "CollectionTemplate: Invalid minter contract");
        require(_safeWallet != address(0), "CollectionTemplate: Invalid Safe wallet");
        require(_creator != address(0), "CollectionTemplate: Invalid creator");
        
        _initialized = true;
        
        // Set collection details
        maxSupply = _maxSupply;
        maxMintPerUser = _maxMintPerUser;
        minterContract = _minterContract;
        safeWallet = _safeWallet;
        creator = _creator;
        royaltyRecipient = _safeWallet;
        
        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _creator);
        _grantRole(ADMIN_ROLE, _creator);
        _grantRole(MINTER_ROLE, _minterContract);
        
        // Start token IDs from 1
        _tokenIdCounter.increment();
        
        emit CollectionInitialized(_name, _symbol, _maxSupply, _maxMintPerUser, _creator);
    }
    
    /**
     * @dev Set the minter contract address
     * @param _minterContract The address of the minter contract
     * @notice Can only be called by admin
     */
    function setMinterContract(address _minterContract) external onlyRole(ADMIN_ROLE) {
        require(_minterContract != address(0), "CollectionTemplate: Invalid minter contract address");
        minterContract = _minterContract;
        _grantRole(MINTER_ROLE, _minterContract);
        
        emit MinterContractSet(_minterContract);
    }
    
    /**
     * @dev Set the Safe multisig wallet address
     * @param _safeWallet The address of the Safe wallet
     * @notice Can only be called by admin
     */
    function setSafeWallet(address _safeWallet) external onlyRole(ADMIN_ROLE) {
        require(_safeWallet != address(0), "CollectionTemplate: Invalid Safe wallet address");
        safeWallet = _safeWallet;
        emit SafeWalletSet(_safeWallet);
    }
    
    /**
     * @dev Update royalty information
     * @param _recipient Address to receive royalties
     * @param _percentage Royalty percentage in basis points
     * @notice Can only be called by admin
     */
    function updateRoyaltyInfo(address _recipient, uint256 _percentage) external onlyRole(ADMIN_ROLE) {
        require(_recipient != address(0), "CollectionTemplate: Invalid recipient address");
        require(_percentage <= 1000, "CollectionTemplate: Royalty percentage too high"); // Max 10%
        
        royaltyRecipient = _recipient;
        royaltyPercentage = _percentage;
        emit RoyaltyInfoUpdated(_recipient, _percentage);
    }
    
    /**
     * @dev Mint NFT to a user
     * @param to The address to mint the NFT to
     * @param metadataURI The metadata URI for the NFT
     * @notice Can only be called by the minter contract
     */
    function mintForUser(address to, string memory metadataURI) external onlyRole(MINTER_ROLE) nonReentrant {
        require(to != address(0), "CollectionTemplate: Cannot mint to zero address");
        require(_tokenIdCounter.current() <= maxSupply, "CollectionTemplate: Max supply reached");
        require(userMintCount[to] < maxMintPerUser, "CollectionTemplate: User mint limit reached");
        
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        userMintCount[to]++;
        
        // Track the creator (first minter)
        tokenCreator[tokenId] = to;
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);
        
        emit NFTMinted(to, tokenId, metadataURI, to);
    }
    
    /**
     * @dev Get the current token ID counter
     * @return The current token ID
     */
    function getCurrentTokenId() external view returns (uint256) {
        return _tokenIdCounter.current();
    }
    
    /**
     * @dev Get the remaining supply
     * @return The number of NFTs that can still be minted
     */
    function getRemainingSupply() external view returns (uint256) {
        uint256 currentSupply = _tokenIdCounter.current() - 1;
        return maxSupply - currentSupply;
    }
    
    /**
     * @dev Check if a user can mint more NFTs
     * @param user The user address to check
     * @return bool True if user can mint more NFTs
     */
    function canUserMint(address user) external view returns (bool) {
        return userMintCount[user] < maxMintPerUser && _tokenIdCounter.current() <= maxSupply;
    }
    
    /**
     * @dev Get user's mint count
     * @param user The user address
     * @return The number of NFTs minted by the user
     */
    function getUserMintCount(address user) external view returns (uint256) {
        return userMintCount[user];
    }
    
    // Required overrides for multiple inheritance
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }
    
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
    
    /**
     * @dev Get royalty information for a token (ERC-2981)
     * @param tokenId The token ID
     * @param salePrice The sale price
     * @return receiver The address to receive royalties
     * @return royaltyAmount The royalty amount
     */
    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view override returns (address receiver, uint256 royaltyAmount) {
        receiver = royaltyRecipient;
        royaltyAmount = (salePrice * royaltyPercentage) / 10000;
    }
    
    /**
     * @dev Get the creator of a specific token
     * @param tokenId The token ID
     * @return The address of the creator
     */
    function getTokenCreator(uint256 tokenId) external view returns (address) {
        require(_exists(tokenId), "CollectionTemplate: Token does not exist");
        return tokenCreator[tokenId];
    }
    
    /**
     * @dev Check if contract is initialized
     * @return bool True if initialized
     */
    function initialized() external view returns (bool) {
        return _initialized;
    }
}
