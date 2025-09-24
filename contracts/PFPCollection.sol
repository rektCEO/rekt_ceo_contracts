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
 * @title PFPCollection
 * @dev ERC-721 NFT collection for Profile Picture NFTs with royalty support
 * @notice This contract manages the PFP NFT collection with a maximum supply of 999 NFTs
 * @notice Enhanced with Safe multisig integration and royalty management
 */
contract PFPCollection is ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, ReentrancyGuard, IERC2981 {
    using Counters for Counters.Counter;
    
    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // Constants
    uint256 public constant MAX_SUPPLY = 999;
    uint256 public constant MAX_MINT_PER_USER = 2;
    
    // State variables
    Counters.Counter private _tokenIdCounter;
    address public minterContract;
    address public safeWallet;
    
    // Royalty configuration - Split between admin and creator
    address public adminRecipient;    // Safe wallet (50% of royalties)
    uint256 public totalRoyaltyPercentage = 210; // 2.1% total in basis points
    uint256 public adminRoyaltyPercentage = 105; // 1.05% admin in basis points
    uint256 public creatorRoyaltyPercentage = 105; // 1.05% creator in basis points
    
    // Mapping to track user mint counts
    mapping(address => uint256) public userMintCount;
    
    // Mapping to track first minter (creator) for each token
    mapping(uint256 => address) public tokenCreator;
    
    // Events
    event MinterContractSet(address indexed minterContract);
    event SafeWalletSet(address indexed safeWallet);
    event RoyaltyInfoUpdated(address indexed recipient, uint256 percentage);
    event NFTMinted(address indexed to, uint256 indexed tokenId, string metadataURI, address indexed creator);
    
    /**
     * @dev Constructor
     * @param _name The name of the NFT collection
     * @param _symbol The symbol of the NFT collection
     * @param _admin The address that will have admin role
     * @param _safeWallet The Safe multisig wallet address
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _admin,
        address _safeWallet
    ) ERC721(_name, _symbol) {
        require(_admin != address(0), "PFPCollection: Invalid admin address");
        require(_safeWallet != address(0), "PFPCollection: Invalid Safe wallet address");
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        
        safeWallet = _safeWallet;
        adminRecipient = _safeWallet;
        
        // Start token IDs from 1
        _tokenIdCounter.increment();
    }
    
    /**
     * @dev Set the minter contract address
     * @param _minterContract The address of the minter contract
     * @notice Can only be called by admin
     */
    function setMinterContract(address _minterContract) external onlyRole(ADMIN_ROLE) {
        require(_minterContract != address(0), "PFPCollection: Invalid minter contract address");
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
        require(_safeWallet != address(0), "PFPCollection: Invalid Safe wallet address");
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
        require(_adminRecipient != address(0), "PFPCollection: Invalid admin recipient address");
        require(_totalPercentage <= 1000, "PFPCollection: Royalty percentage too high"); // Max 10%
        require(_totalPercentage % 2 == 0, "PFPCollection: Total percentage must be even for 50/50 split");
        
        uint256 halfPercentage = _totalPercentage / 2;
        
        adminRecipient = _adminRecipient;
        totalRoyaltyPercentage = _totalPercentage;
        adminRoyaltyPercentage = halfPercentage;
        creatorRoyaltyPercentage = halfPercentage;
        
        emit RoyaltyInfoUpdated(_adminRecipient, _totalPercentage);
    }
    
    /**
     * @dev Mint NFT to a user
     * @param to The address to mint the NFT to
     * @param metadataURI The metadata URI for the NFT
     * @notice Can only be called by the minter contract
     */
    function mintForUser(address to, string memory metadataURI) external onlyRole(MINTER_ROLE) nonReentrant {
        require(to != address(0), "PFPCollection: Cannot mint to zero address");
        require(_tokenIdCounter.current() <= MAX_SUPPLY, "PFPCollection: Max supply reached");
        require(userMintCount[to] < MAX_MINT_PER_USER, "PFPCollection: User mint limit reached");
        
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
        return MAX_SUPPLY - currentSupply;
    }
    
    /**
     * @dev Check if a user can mint more NFTs
     * @param user The user address to check
     * @return bool True if user can mint more NFTs
     */
    function canUserMint(address user) external view returns (bool) {
        return userMintCount[user] < MAX_MINT_PER_USER && _tokenIdCounter.current() <= MAX_SUPPLY;
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
     * @return receiver The address to receive royalties (admin for now, creator per token in future)
     * @return royaltyAmount The royalty amount
     */
    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view override returns (address receiver, uint256 royaltyAmount) {
        receiver = adminRecipient; // For now, return admin recipient
        royaltyAmount = (salePrice * totalRoyaltyPercentage) / 10000;
    }
    
    /**
     * @dev Get split royalty information for a token
     * @param tokenId The token ID
     * @param salePrice The sale price
     * @return adminReceiver The admin address to receive royalties
     * @return creatorReceiver The creator address to receive royalties
     * @return adminAmount The admin royalty amount
     * @return creatorAmount The creator royalty amount
     */
    function getSplitRoyaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (
        address adminReceiver,
        address creatorReceiver,
        uint256 adminAmount,
        uint256 creatorAmount
    ) {
        adminReceiver = adminRecipient;
        creatorReceiver = tokenCreator[tokenId] != address(0) ? tokenCreator[tokenId] : adminRecipient; // Fallback to admin if no creator
        adminAmount = (salePrice * adminRoyaltyPercentage) / 10000;
        creatorAmount = (salePrice * creatorRoyaltyPercentage) / 10000;
    }
    
    /**
     * @dev Get the creator of a specific token
     * @param tokenId The token ID
     * @return The address of the creator
     */
    function getTokenCreator(uint256 tokenId) external view returns (address) {
        require(_exists(tokenId), "PFPCollection: Token does not exist");
        return tokenCreator[tokenId];
    }
}
