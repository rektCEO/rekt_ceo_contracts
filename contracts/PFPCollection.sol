// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title PFPCollection
 * @dev ERC-721 NFT collection for Profile Picture NFTs
 * @notice This contract manages the PFP NFT collection with a maximum supply of 999 NFTs
 */
contract PFPCollection is ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, ReentrancyGuard {
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
    
    // Mapping to track user mint counts
    mapping(address => uint256) public userMintCount;
    
    // Events
    event MinterContractSet(address indexed minterContract);
    event NFTMinted(address indexed to, uint256 indexed tokenId, string metadataURI);
    
    /**
     * @dev Constructor
     * @param _name The name of the NFT collection
     * @param _symbol The symbol of the NFT collection
     * @param _admin The address that will have admin role
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _admin
    ) ERC721(_name, _symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        
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
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);
        
        emit NFTMinted(to, tokenId, metadataURI);
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
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
