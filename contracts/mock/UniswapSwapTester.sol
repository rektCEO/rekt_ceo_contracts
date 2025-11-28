// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IUniswapV2Router02.sol";

/**
 * @title UniswapSwapTester
 * @dev Minimal contract to test Uniswap V2 swaps on mainnet
 * @notice Deploy this to test CEO -> USDC swaps before integrating into main contract
 */
contract UniswapSwapTester {
    using SafeERC20 for IERC20;

    

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    address public owner;
    IERC20 public ceoToken;
    IERC20 public usdcToken;
    IUniswapV2Router02 public uniswapRouter;
    
    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event SwapExecuted(
        uint256 ceoAmountIn,
        uint256 usdcAmountOut,
        address recipient
    );
    
    event TokensDeposited(address token, uint256 amount, address from);
    event TokensWithdrawn(address token, uint256 amount, address to);

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Constructor
     * @param _ceoToken CEO token address
     * @param _usdcToken USDC token address
     * @param _uniswapRouter Uniswap V2 Router address
     */
    constructor(
        address _ceoToken,
        address _usdcToken,
        address _uniswapRouter
    ) {
        require(_ceoToken != address(0), "Invalid CEO token");
        require(_usdcToken != address(0), "Invalid USDC token");
        require(_uniswapRouter != address(0), "Invalid router");
        
        owner = msg.sender;
        ceoToken = IERC20(_ceoToken);
        usdcToken = IERC20(_usdcToken);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
    }

    /*//////////////////////////////////////////////////////////////
                            MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                        SWAP FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Test swap with direct path: CEO -> USDC
     * @param _ceoAmount Amount of CEO tokens to swap
     * @param _recipient Address to receive USDC
     * @param _slippageBps Slippage tolerance in basis points (e.g., 100 = 1%)
     * @return usdcReceived Amount of USDC received
     */
    function testSwapDirect(
        uint256 _ceoAmount,
        address _recipient,
        uint256 _slippageBps
    ) external onlyOwner returns (uint256 usdcReceived) {
        require(_ceoAmount > 0, "Amount must be > 0");
        require(_recipient != address(0), "Invalid recipient");
        require(_slippageBps <= 1000, "Slippage too high (max 10%)");
        
        // Build direct path
        address[] memory path = new address[](2);
        path[0] = address(ceoToken);
        path[1] = address(usdcToken);
        
        return _executeSwap(_ceoAmount, _recipient, path, _slippageBps);
    }


    /**
     * @dev Internal function to execute swap
     * @param _ceoAmount Amount of CEO to swap
     * @param _recipient Recipient of USDC
     * @param _path Swap path
     * @param _slippageBps Slippage tolerance
     */
    function _executeSwap(
        uint256 _ceoAmount,
        address _recipient,
        address[] memory _path,
        uint256 _slippageBps
    ) internal returns (uint256) {
        // Check balance
        uint256 balance = ceoToken.balanceOf(address(this));
        require(balance >= _ceoAmount, "Insufficient CEO balance");
        
        // Approve router
        ceoToken.safeApprove(address(uniswapRouter), 0);
        ceoToken.safeApprove(address(uniswapRouter), _ceoAmount);
        
        // Get expected output with slippage
        uint[] memory amountsOut = uniswapRouter.getAmountsOut(_ceoAmount, _path);
        uint256 expectedUSDC = amountsOut[amountsOut.length - 1];
        uint256 minUSDC = (expectedUSDC * (10000 - _slippageBps)) / 10000;
        
        // Execute swap
        uint[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            _ceoAmount,
            minUSDC,
            _path,
            _recipient,
            block.timestamp + 300 // 300 blocks
        );
        
        uint256 usdcReceived = amounts[amounts.length - 1];
        
        emit SwapExecuted(_ceoAmount, usdcReceived, _recipient);
        return usdcReceived;
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Get expected output for a swap (direct path)
     * @param _ceoAmount Amount of CEO to swap
     * @return expectedUSDC Expected USDC output
     */
    function getExpectedOutputDirect(uint256 _ceoAmount) 
        external 
        view 
        returns (uint256 expectedUSDC) 
    {
        address[] memory path = new address[](2);
        path[0] = address(ceoToken);
        path[1] = address(usdcToken);
        
        uint[] memory amounts = uniswapRouter.getAmountsOut(_ceoAmount, path);
        return amounts[amounts.length - 1];
    }


    /**
     * @dev Check contract balances
     * @return ceoBalance CEO token balance
     * @return usdcBalance USDC token balance
     */
    function getBalances() external view returns (uint256 ceoBalance, uint256 usdcBalance) {
        ceoBalance = ceoToken.balanceOf(address(this));
        usdcBalance = usdcToken.balanceOf(address(this));
    }

    /*//////////////////////////////////////////////////////////////
                        MANAGEMENT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Deposit CEO tokens to test contract
     * @param _amount Amount to deposit
     */
    function depositCEO(uint256 _amount) external {
        ceoToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit TokensDeposited(address(ceoToken), _amount, msg.sender);
    }

    /**
     * @dev Withdraw tokens from contract
     * @param _token Token address
     * @param _amount Amount to withdraw
     */
    function withdrawTokens(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(owner, _amount);
        emit TokensWithdrawn(_token, _amount, owner);
    }

    /**
     * @dev Emergency withdraw all tokens
     */
    function emergencyWithdrawAll() external onlyOwner {
        uint256 ceoBalance = ceoToken.balanceOf(address(this));
        uint256 usdcBalance = usdcToken.balanceOf(address(this));
        
        if (ceoBalance > 0) {
            ceoToken.safeTransfer(owner, ceoBalance);
        }
        if (usdcBalance > 0) {
            usdcToken.safeTransfer(owner, usdcBalance);
        }
    }
}

