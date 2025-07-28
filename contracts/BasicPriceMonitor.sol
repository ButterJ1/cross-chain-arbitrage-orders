// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title BasicPriceMonitor
 * @dev Monitors ETH prices across Ethereum and Arbitrum to detect arbitrage opportunities
 * @notice This is the foundation for our cross-chain arbitrage limit orders
 */
contract BasicPriceMonitor is Ownable, ReentrancyGuard {
    
    // ═══════════════════════════════════════════════════════════════════
    // STRUCTS & ENUMS
    // ═══════════════════════════════════════════════════════════════════
    
    struct PriceData {
        uint256 ethereumPrice;      // ETH price on Ethereum (18 decimals)
        uint256 arbitrumPrice;      // ETH price on Arbitrum (18 decimals)
        uint256 timestamp;          // Last update timestamp
        uint256 spread;             // Price difference in basis points (10000 = 100%)
        bool isEthereumHigher;      // True if Ethereum price > Arbitrum price
    }
    
    struct ArbitrageOpportunity {
        uint256 spreadBasisPoints;  // Price spread in basis points
        uint256 estimatedProfit;    // Estimated profit after gas costs (18 decimals)
        uint256 gasEstimate;        // Estimated gas cost in wei
        bool isProfitable;          // True if profit > gas costs
        bool isEthToArb;           // True for ETH->ARB arbitrage, false for ARB->ETH
    }
    
    struct OracleConfig {
        AggregatorV3Interface chainlinkFeed;
        address uniswapV3Pool;      // For future TWAP implementation
        uint256 maxStaleness;       // Maximum acceptable data age in seconds
        bool isActive;              // Whether this oracle is currently used
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════
    
    // Core price tracking
    mapping(address => PriceData) public tokenPrices;  // token => latest price data
    
    // Oracle configurations for each chain
    mapping(uint256 => mapping(address => OracleConfig)) public oracles; // chainId => token => oracle
    
    // Gas cost estimation parameters
    uint256 public constant ARBITRAGE_GAS_LIMIT = 350000; // Estimated gas for cross-chain arbitrage
    uint256 public gasPrice = 20 gwei; // Current gas price estimate
    uint256 public minProfitBasisPoints = 50; // Minimum 0.5% profit required
    
    // Supported tokens (starting with ETH)
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    
    // Chain IDs
    uint256 public constant ETHEREUM_CHAIN_ID = 1;
    uint256 public constant ARBITRUM_CHAIN_ID = 42161;
    
    // ═══════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════
    
    /**
     * @dev Emitted when a profitable arbitrage opportunity is detected
     */
    event ArbitrageOpportunityDetected(
        address indexed token,
        uint256 spreadBasisPoints,
        uint256 estimatedProfit,
        bool isEthToArb,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted when prices are updated
     */
    event PricesUpdated(
        address indexed token,
        uint256 ethereumPrice,
        uint256 arbitrumPrice,
        uint256 spread,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted when gas price is updated
     */
    event GasPriceUpdated(uint256 oldPrice, uint256 newPrice);
    
    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════
    
    constructor() {
        // Initialize with Chainlink ETH/USD price feeds
        // Ethereum Mainnet ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
        // Arbitrum ETH/USD: 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
        
        // We'll set these up in initialize function for flexibility
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // EXTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    /**
     * @dev Initialize oracle configurations
     * @param ethereumChainlinkFeed Chainlink ETH/USD feed on Ethereum
     * @param arbitrumChainlinkFeed Chainlink ETH/USD feed on Arbitrum
     */
    function initializeOracles(
        address ethereumChainlinkFeed,
        address arbitrumChainlinkFeed
    ) external onlyOwner {
        // Ethereum oracle config
        oracles[ETHEREUM_CHAIN_ID][ETH] = OracleConfig({
            chainlinkFeed: AggregatorV3Interface(ethereumChainlinkFeed),
            uniswapV3Pool: address(0), // Will add later
            maxStaleness: 3600, // 1 hour
            isActive: true
        });
        
        // Arbitrum oracle config  
        oracles[ARBITRUM_CHAIN_ID][ETH] = OracleConfig({
            chainlinkFeed: AggregatorV3Interface(arbitrumChainlinkFeed),
            uniswapV3Pool: address(0), // Will add later
            maxStaleness: 3600, // 1 hour
            isActive: true
        });
    }
    
    /**
     * @dev Update ETH prices from both chains and detect arbitrage opportunities
     * @notice This function will be called by our monitoring system
     */
    function updateETHPrices() external nonReentrant {
        _updateTokenPrices(ETH);
    }
    
    /**
     * @dev Get the latest arbitrage opportunity for ETH
     * @return opportunity Detailed arbitrage opportunity data
     */
    function getArbitrageOpportunity() external view returns (ArbitrageOpportunity memory opportunity) {
        return _calculateArbitrageOpportunity(ETH);
    }
    
    /**
     * @dev Check if there's currently a profitable arbitrage opportunity
     * @return isProfitable True if arbitrage is profitable after gas costs
     * @return spreadBasisPoints The price spread in basis points
     */
    function isProfitableArbitrage() external view returns (bool isProfitable, uint256 spreadBasisPoints) {
        ArbitrageOpportunity memory opp = _calculateArbitrageOpportunity(ETH);
        return (opp.isProfitable, opp.spreadBasisPoints);
    }
    
    /**
     * @dev Update gas price estimate (important for profitability calculations)
     * @param newGasPrice New gas price in wei
     */
    function updateGasPrice(uint256 newGasPrice) external onlyOwner {
        uint256 oldPrice = gasPrice;
        gasPrice = newGasPrice;
        emit GasPriceUpdated(oldPrice, newGasPrice);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    /**
     * @dev Internal function to update prices for a specific token
     * @param token Token address to update prices for
     */
    function _updateTokenPrices(address token) internal {
        // Get Ethereum price
        uint256 ethPrice = _getChainlinkPrice(ETHEREUM_CHAIN_ID, token);
        
        // Get Arbitrum price
        uint256 arbPrice = _getChainlinkPrice(ARBITRUM_CHAIN_ID, token);
        
        // Calculate spread
        uint256 spread;
        bool isEthereumHigher;
        
        if (ethPrice > arbPrice) {
            spread = ((ethPrice - arbPrice) * 10000) / arbPrice;
            isEthereumHigher = true;
        } else if (arbPrice > ethPrice) {
            spread = ((arbPrice - ethPrice) * 10000) / ethPrice;
            isEthereumHigher = false;
        } else {
            // Prices are equal
            spread = 0;
            isEthereumHigher = false; // Doesn't matter when equal
        }
        
        // Update stored data
        tokenPrices[token] = PriceData({
            ethereumPrice: ethPrice,
            arbitrumPrice: arbPrice,
            timestamp: block.timestamp,
            spread: spread,
            isEthereumHigher: isEthereumHigher
        });
        
        emit PricesUpdated(token, ethPrice, arbPrice, spread, block.timestamp);
        
        // Check for arbitrage opportunity
        ArbitrageOpportunity memory opportunity = _calculateArbitrageOpportunity(token);
        
        if (opportunity.isProfitable) {
            emit ArbitrageOpportunityDetected(
                token,
                opportunity.spreadBasisPoints,
                opportunity.estimatedProfit,
                opportunity.isEthToArb,
                block.timestamp
            );
        }
    }
    
    /**
     * @dev Get price from Chainlink oracle
     * @param chainId Chain ID to get price from
     * @param token Token to get price for
     * @return price Token price in 18 decimals
     */
    function _getChainlinkPrice(uint256 chainId, address token) internal view returns (uint256 price) {
        OracleConfig memory config = oracles[chainId][token];
        require(config.isActive, "Oracle not active");
        
        (
            , // roundId - not needed for basic price fetching
            int256 price256,
            , // startedAt - not needed for basic price fetching
            uint256 updatedAt,
            // answeredInRound - not needed for basic price fetching
        ) = config.chainlinkFeed.latestRoundData();
        
        require(price256 > 0, "Invalid price from Chainlink");
        require(block.timestamp - updatedAt <= config.maxStaleness, "Price data too stale");
        
        // Convert to 18 decimals (Chainlink ETH/USD is 8 decimals)
        uint8 decimals = config.chainlinkFeed.decimals();
        price = uint256(price256) * (10 ** (18 - decimals));
    }
    
    /**
     * @dev Calculate detailed arbitrage opportunity
     * @param token Token to calculate arbitrage for
     * @return opportunity Complete arbitrage opportunity data
     */
    function _calculateArbitrageOpportunity(address token) internal view returns (ArbitrageOpportunity memory opportunity) {
        PriceData memory prices = tokenPrices[token];
        
        if (prices.timestamp == 0) {
            // No price data available
            return opportunity;
        }
        
        // Calculate gas cost in wei
        uint256 gasCostWei = gasPrice * ARBITRAGE_GAS_LIMIT;
        opportunity.gasEstimate = gasCostWei;
        
        // Determine arbitrage direction and calculate profit (with overflow protection)
        if (prices.isEthereumHigher) {
            // Buy on Arbitrum, sell on Ethereum
            opportunity.isEthToArb = false;
            opportunity.spreadBasisPoints = prices.spread;
            
            // Safe profit calculation - check for underflow
            uint256 totalCost = prices.arbitrumPrice + gasCostWei;
            if (prices.ethereumPrice > totalCost) {
                opportunity.estimatedProfit = prices.ethereumPrice - totalCost;
            } else {
                opportunity.estimatedProfit = 0; // Would result in loss
            }
        } else {
            // Buy on Ethereum, sell on Arbitrum  
            opportunity.isEthToArb = true;
            opportunity.spreadBasisPoints = prices.spread;
            
            // Safe profit calculation - check for underflow
            uint256 totalCost = prices.ethereumPrice + gasCostWei;
            if (prices.arbitrumPrice > totalCost) {
                opportunity.estimatedProfit = prices.arbitrumPrice - totalCost;
            } else {
                opportunity.estimatedProfit = 0; // Would result in loss
            }
        }
        
        opportunity.isProfitable = (
            opportunity.estimatedProfit > 0 && 
            opportunity.spreadBasisPoints >= minProfitBasisPoints
        );
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    /**
     * @dev Get latest price data for a token
     * @param token Token address
     * @return priceData Complete price information
     */
    function getTokenPriceData(address token) external view returns (PriceData memory priceData) {
        return tokenPrices[token];
    }
    
    /**
     * @dev Check if price data is fresh enough for trading
     * @param token Token to check
     * @param maxAge Maximum acceptable age in seconds
     * @return isFresh True if data is recent enough
     */
    function isPriceDataFresh(address token, uint256 maxAge) external view returns (bool isFresh) {
        PriceData memory prices = tokenPrices[token];
        return (block.timestamp - prices.timestamp) <= maxAge;
    }
}