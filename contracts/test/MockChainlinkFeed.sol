/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockChainlinkFeed is AggregatorV3Interface {
    int256 private _price;
    uint256 private _updatedAt;
    uint80 private _roundId;
    
    constructor() {
        _price = 300000000000; // $3000 with 8 decimals
        _updatedAt = block.timestamp;
        _roundId = 1;
    }
    
    function setPrice(int256 price) external {
        _price = price;
        _updatedAt = block.timestamp;
        _roundId++;
    }
    
    function setUpdatedAt(uint256 timestamp) external {
        _updatedAt = timestamp;
    }
    
    function decimals() external pure override returns (uint8) {
        return 8;
    }
    
    function description() external pure override returns (string memory) {
        return "ETH / USD";
    }
    
    function version() external pure override returns (uint256) {
        return 1;
    }
    
    function getRoundData(uint80 _roundId) external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }
    
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
*/