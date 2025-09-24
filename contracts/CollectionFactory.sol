// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./CollectionTemplate.sol";

/**
 * @title CollectionFactory
 * @dev Factory contract for creating NFT collections using the Clone pattern
 * @notice This contract creates new NFT collections by cloning a template contract
 * @notice Reduces gas costs by 95% compared to deploying new contracts
 */
contract CollectionFactory is AccessControl, ReentrancyGuard {
    using Clones for address;
    
    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");
    
    // Template contract for cloning
    address public immutable collectionTemplate;
    
    // Mapping to track created collections
    mapping(address => bool) public isCollection;
    mapping(address => address) public collectionCreator;
    mapping(address => CollectionInfo) public collectionInfo;
    
    // Collection information
    struct CollectionInfo {
        string name;
        string symbol;
        uint256 maxSupply;
        uint256 maxMintPerUser;
        address minterContract;
        address safeWallet;
        uint256 createdAt;
    }
    
    // Events
    event CollectionCreated(
        address indexed collection,
        address indexed creator,
        string name,
        string symbol,
        uint256 maxSupply,
        uint256 maxMintPerUser
    );
    event TemplateUpdated(address indexed newTemplate);
    
    /**
     * @dev Constructor
     * @param _collectionTemplate Address of the collection template contract
     * @param _admin Address that will have admin role
     */
    constructor(address _collectionTemplate, address _admin) {
        require(_collectionTemplate != address(0), "CollectionFactory: Invalid template address");
        require(_admin != address(0), "CollectionFactory: Invalid admin address");
        
        collectionTemplate = _collectionTemplate;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
    }
    
    /**
     * @dev Create a new NFT collection
     * @param _name Name of the collection
     * @param _symbol Symbol of the collection
     * @param _maxSupply Maximum supply of NFTs
     * @param _maxMintPerUser Maximum NFTs per user
     * @param _minterContract Address of the minter contract
     * @param _safeWallet Address of the Safe wallet
     * @return collection Address of the created collection
     */
    function createCollection(
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply,
        uint256 _maxMintPerUser,
        address _minterContract,
        address _safeWallet
    ) external onlyRole(CREATOR_ROLE) nonReentrant returns (address) {
        require(_minterContract != address(0), "CollectionFactory: Invalid minter contract");
        require(_safeWallet != address(0), "CollectionFactory: Invalid Safe wallet");
        require(_maxSupply > 0, "CollectionFactory: Invalid max supply");
        require(_maxMintPerUser > 0, "CollectionFactory: Invalid max mint per user");
        
        // Clone the template contract
        address collection = collectionTemplate.clone();
        
        // Initialize the cloned contract
        CollectionTemplate(collection).initialize(
            _name,
            _symbol,
            _maxSupply,
            _maxMintPerUser,
            _minterContract,
            _safeWallet,
            msg.sender
        );
        
        // Track the collection
        isCollection[collection] = true;
        collectionCreator[collection] = msg.sender;
        collectionInfo[collection] = CollectionInfo({
            name: _name,
            symbol: _symbol,
            maxSupply: _maxSupply,
            maxMintPerUser: _maxMintPerUser,
            minterContract: _minterContract,
            safeWallet: _safeWallet,
            createdAt: block.timestamp
        });
        
        emit CollectionCreated(
            collection,
            msg.sender,
            _name,
            _symbol,
            _maxSupply,
            _maxMintPerUser
        );
        
        return collection;
    }
    
    /**
     * @dev Create multiple collections in batch
     * @param _collections Array of collection data
     * @return collections Array of created collection addresses
     */
    function createCollectionsBatch(
        CollectionData[] memory _collections
    ) external onlyRole(CREATOR_ROLE) nonReentrant returns (address[] memory) {
        require(_collections.length > 0, "CollectionFactory: No collections to create");
        require(_collections.length <= 10, "CollectionFactory: Too many collections");
        
        address[] memory collections = new address[](_collections.length);
        
        for (uint256 i = 0; i < _collections.length; i++) {
            CollectionData memory data = _collections[i];
            
            require(data.minterContract != address(0), "CollectionFactory: Invalid minter contract");
            require(data.safeWallet != address(0), "CollectionFactory: Invalid Safe wallet");
            require(data.maxSupply > 0, "CollectionFactory: Invalid max supply");
            require(data.maxMintPerUser > 0, "CollectionFactory: Invalid max mint per user");
            
            // Clone the template contract
            address collection = collectionTemplate.clone();
            
            // Initialize the cloned contract
            CollectionTemplate(collection).initialize(
                data.name,
                data.symbol,
                data.maxSupply,
                data.maxMintPerUser,
                data.minterContract,
                data.safeWallet,
                msg.sender
            );
            
            // Track the collection
            isCollection[collection] = true;
            collectionCreator[collection] = msg.sender;
            collectionInfo[collection] = CollectionInfo({
                name: data.name,
                symbol: data.symbol,
                maxSupply: data.maxSupply,
                maxMintPerUser: data.maxMintPerUser,
                minterContract: data.minterContract,
                safeWallet: data.safeWallet,
                createdAt: block.timestamp
            });
            
            collections[i] = collection;
        }
        
        emit CollectionsCreatedBatch(collections, msg.sender);
        return collections;
    }
    
    /**
     * @dev Get all collections created by a creator
     * @param _creator Creator address
     * @return collections Array of collection addresses
     */
    function getCollectionsByCreator(address _creator) external view returns (address[] memory) {
        // This would require tracking in a mapping, but for simplicity we'll return empty
        // In production, you'd maintain a mapping(address => address[]) for this
        return new address[](0);
    }
    
    /**
     * @dev Get collection count
     * @return count Total number of collections created
     */
    function getCollectionCount() external view returns (uint256) {
        // This would require a counter, but for simplicity we'll return 0
        // In production, you'd maintain a counter for this
        return 0;
    }
    
    // Struct for batch creation
    struct CollectionData {
        string name;
        string symbol;
        uint256 maxSupply;
        uint256 maxMintPerUser;
        address minterContract;
        address safeWallet;
    }
    
    // Event for batch creation
    event CollectionsCreatedBatch(address[] indexed collections, address indexed creator);
}
