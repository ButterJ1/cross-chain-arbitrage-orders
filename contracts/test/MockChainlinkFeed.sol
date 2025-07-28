// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockChainlinkFeed
 * @dev Mock Chainlink price feed for testing purposes
 * @notice This contract simulates Chainlink price feed behavior for unit tests
 */
contract MockChainlinkFeed is AggregatorV3Interface {
    int256 private _price;
    uint256 private _updatedAt;
    uint80 private _roundId;
    
    constructor() {
        _price = 300000000000; // $3000 with 8 decimals
        _updatedAt = block.timestamp;
        _roundId = 1;
    }
    
    /**
     * @dev Set the mock price
     * @param price New price to return (with 8 decimals for ETH/USD)
     */
    function setPrice(int256 price) external {
        _price = price;
        _updatedAt = block.timestamp;
        _roundId++;
    }
    
    /**
     * @dev Set the mock updated timestamp (for testing stale data)
     * @param timestamp Timestamp to use for updatedAt
     */
    function setUpdatedAt(uint256 timestamp) external {
        _updatedAt = timestamp;
        // Don't increment round ID when just setting timestamp for staleness testing
    }
    
    /**
     * @dev Returns the number of decimals for the price feed
     * @return Number of decimals (8 for ETH/USD feeds)
     */
    function decimals() external pure override returns (uint8) {
        return 8;
    }
    
    /**
     * @dev Returns the description of the price feed
     * @return Description string
     */
    function description() external pure override returns (string memory) {
        return "ETH / USD";
    }
    
    /**
     * @dev Returns the version of the price feed
     * @return Version number
     */
    function version() external pure override returns (uint256) {
        return 1;
    }
    
    /**
     * @dev Get data from a specific round
     * @param roundId_ The round ID to get data for
     * @return roundId The round ID
     * @return answer The price answer
     * @return startedAt When the round started
     * @return updatedAt When the round was updated
     * @return answeredInRound The round ID when the answer was computed
     */
    function getRoundData(uint80 roundId_) external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (roundId_, _price, _updatedAt, _updatedAt, roundId_);
    }
    
    /**
     * @dev Get the latest round data
     * @return roundId The round ID
     * @return answer The price answer
     * @return startedAt When the round started
     * @return updatedAt When the round was updated
     * @return answeredInRound The round ID when the answer was computed
     */
    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }
}