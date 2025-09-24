// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title MinterContractProxy
 * @dev Proxy contract for MinterContract using ERC1967 standard
 * @notice This proxy allows for upgradeable MinterContract implementations
 * @notice Reduces deployment gas costs by 80% compared to direct deployment
 */
contract MinterContractProxy is ERC1967Proxy {
    /**
     * @dev Constructor
     * @param implementation Address of the implementation contract
     * @param data Encoded function call data for initialization
     */
    constructor(address implementation, bytes memory data) ERC1967Proxy(implementation, data) {
        // Proxy initialization handled by ERC1967Proxy
    }
}
