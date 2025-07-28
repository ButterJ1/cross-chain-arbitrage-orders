// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IPriceMonitor
 * @dev Interface for our price monitoring system
 * @notice This interface will be used by limit order extensions
 */
interface IPriceMonitor {
    struct ArbitrageOpportunity {
        uint256 spreadBasisPoints;
        uint256 estimatedProfit;
        uint256 gasEstimate;
        bool isProfitable;
        bool isEthToArb;
    }
    
    struct PriceData {
        uint256 ethereumPrice;
        uint256 arbitrumPrice;
        uint256 timestamp;
        uint256 spread;
        bool isEthereumHigher;
    }
    
    // Core functions that limit orders will call
    function getArbitrageOpportunity() external view returns (ArbitrageOpportunity memory);
    function isProfitableArbitrage() external view returns (bool isProfitable, uint256 spreadBasisPoints);
    function getTokenPriceData(address token) external view returns (PriceData memory);
    function isPriceDataFresh(address token, uint256 maxAge) external view returns (bool);
    
    // Events limit orders can listen to
    event ArbitrageOpportunityDetected(
        address indexed token,
        uint256 spreadBasisPoints,
        uint256 estimatedProfit,
        bool isEthToArb,
        uint256 timestamp
    );
}

/**
 * @title IUniswapV3Oracle  
 * @dev Interface for Uniswap V3 TWAP oracle integration (future enhancement)
 */
interface IUniswapV3Oracle {
    function getTimeWeightedAveragePrice(
        address pool,
        uint32 secondsAgo
    ) external view returns (uint256 price);
}

/**
 * @title IGasEstimator
 * @dev Interface for gas cost estimation (future enhancement)
 */
interface IGasEstimator {
    function estimateCrossChainGasCost(
        address token,
        uint256 amount,
        uint256 sourceChain,
        uint256 destChain
    ) external view returns (uint256 gasCost);
}