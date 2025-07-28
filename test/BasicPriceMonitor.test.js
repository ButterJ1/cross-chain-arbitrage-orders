const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BasicPriceMonitor", function () {
    let priceMonitor;
    let mockChainlinkEth, mockChainlinkArb;
    let owner, user1;

    // Test constants
    const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const ETHEREUM_CHAIN_ID = 1;
    const ARBITRUM_CHAIN_ID = 42161;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        // Deploy mock Chainlink price feeds
        const MockChainlinkFeed = await ethers.getContractFactory("MockChainlinkFeed");
        mockChainlinkEth = await MockChainlinkFeed.deploy();
        mockChainlinkArb = await MockChainlinkFeed.deploy();

        // Deploy BasicPriceMonitor
        const BasicPriceMonitor = await ethers.getContractFactory("BasicPriceMonitor");
        priceMonitor = await BasicPriceMonitor.deploy();

        // Initialize oracles
        await priceMonitor.initializeOracles(
            mockChainlinkEth.address,
            mockChainlinkArb.address
        );
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await priceMonitor.owner()).to.equal(owner.address);
        });

        it("Should initialize with correct constants", async function () {
            expect(await priceMonitor.ETH()).to.equal(ETH_ADDRESS);
            expect(await priceMonitor.ETHEREUM_CHAIN_ID()).to.equal(ETHEREUM_CHAIN_ID);
            expect(await priceMonitor.ARBITRUM_CHAIN_ID()).to.equal(ARBITRUM_CHAIN_ID);
        });
    });

    describe("Oracle Configuration", function () {
        it("Should initialize oracles correctly", async function () {
            const ethOracle = await priceMonitor.oracles(ETHEREUM_CHAIN_ID, ETH_ADDRESS);
            const arbOracle = await priceMonitor.oracles(ARBITRUM_CHAIN_ID, ETH_ADDRESS);

            expect(ethOracle.chainlinkFeed).to.equal(mockChainlinkEth.address);
            expect(arbOracle.chainlinkFeed).to.equal(mockChainlinkArb.address);
            expect(ethOracle.isActive).to.be.true;
            expect(arbOracle.isActive).to.be.true;
        });

        it("Should only allow owner to initialize oracles", async function () {
            await expect(
                priceMonitor.connect(user1).initializeOracles(
                    mockChainlinkEth.address,
                    mockChainlinkArb.address
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Price Updates", function () {
        beforeEach(async function () {
            // Set initial prices: ETH = $3000, ARB = $3050 (1.67% spread)
            await mockChainlinkEth.setPrice(300000000000); // $3000 with 8 decimals
            await mockChainlinkArb.setPrice(305000000000); // $3050 with 8 decimals
        });

        it("Should update prices correctly", async function () {
            await priceMonitor.updateETHPrices();

            const priceData = await priceMonitor.getTokenPriceData(ETH_ADDRESS);
            
            // Prices should be converted to 18 decimals
            expect(priceData.ethereumPrice).to.equal(ethers.utils.parseEther("3000"));
            expect(priceData.arbitrumPrice).to.equal(ethers.utils.parseEther("3050"));
            expect(priceData.isEthereumHigher).to.be.false;
            expect(priceData.spread).to.be.closeTo(167, 5); // ~1.67% in basis points
        });

        it("Should emit PricesUpdated event", async function () {
            await expect(priceMonitor.updateETHPrices())
                .to.emit(priceMonitor, "PricesUpdated")
                .withArgs(
                    ETH_ADDRESS,
                    ethers.utils.parseEther("3000"),
                    ethers.utils.parseEther("3050"),
                    167, // basis points
                    await ethers.provider.getBlock("latest").then(b => b.timestamp + 1)
                );
        });

        it("Should detect arbitrage opportunity when spread is significant", async function () {
            // Set larger spread: ETH = $3000, ARB = $3100 (3.33% spread)
            await mockChainlinkArb.setPrice(310000000000);

            await expect(priceMonitor.updateETHPrices())
                .to.emit(priceMonitor, "ArbitrageOpportunityDetected");
        });

        it("Should not detect arbitrage when spread is too small", async function () {
            // Set small spread: ETH = $3000, ARB = $3010 (0.33% spread)
            await mockChainlinkArb.setPrice(301000000000);

            await expect(priceMonitor.updateETHPrices())
                .to.not.emit(priceMonitor, "ArbitrageOpportunityDetected");
        });
    });

    describe("Arbitrage Opportunity Detection", function () {
        beforeEach(async function () {
            // Set profitable spread: ETH = $3000, ARB = $3100
            await mockChainlinkEth.setPrice(300000000000);
            await mockChainlinkArb.setPrice(310000000000);
            await priceMonitor.updateETHPrices();
        });

        it("Should calculate arbitrage opportunity correctly", async function () {
            const opportunity = await priceMonitor.getArbitrageOpportunity();

            expect(opportunity.isProfitable).to.be.true;
            expect(opportunity.isEthToArb).to.be.true; // Buy ETH, sell on ARB
            expect(opportunity.spreadBasisPoints).to.be.closeTo(333, 10); // ~3.33%
            expect(opportunity.estimatedProfit).to.be.gt(0);
        });

        it("Should account for gas costs in profitability", async function () {
            // Set very high gas price to make arbitrage unprofitable
            await priceMonitor.updateGasPrice(ethers.utils.parseUnits("500", "gwei"));

            const opportunity = await priceMonitor.getArbitrageOpportunity();
            expect(opportunity.isProfitable).to.be.false;
        });

        it("Should return correct arbitrage direction", async function () {
            // ETH higher on Ethereum: should arbitrage ARB -> ETH
            await mockChainlinkEth.setPrice(310000000000); // $3100
            await mockChainlinkArb.setPrice(300000000000); // $3000
            await priceMonitor.updateETHPrices();

            const opportunity = await priceMonitor.getArbitrageOpportunity();
            expect(opportunity.isEthToArb).to.be.false; // Buy on ARB, sell on ETH
        });
    });

    describe("Gas Price Management", function () {
        it("Should update gas price correctly", async function () {
            const newGasPrice = ethers.utils.parseUnits("100", "gwei");
            
            await expect(priceMonitor.updateGasPrice(newGasPrice))
                .to.emit(priceMonitor, "GasPriceUpdated")
                .withArgs(ethers.utils.parseUnits("20", "gwei"), newGasPrice);

            expect(await priceMonitor.gasPrice()).to.equal(newGasPrice);
        });

        it("Should only allow owner to update gas price", async function () {
            await expect(
                priceMonitor.connect(user1).updateGasPrice(ethers.utils.parseUnits("100", "gwei"))
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Price Data Freshness", function () {
        it("Should return true for fresh data", async function () {
            await priceMonitor.updateETHPrices();
            const isFresh = await priceMonitor.isPriceDataFresh(ETH_ADDRESS, 300); // 5 minutes
            expect(isFresh).to.be.true;
        });

        it("Should return false for stale data", async function () {
            // Simulate stale price data
            await mockChainlinkEth.setUpdatedAt(
                Math.floor(Date.now() / 1000) - 7200 // 2 hours ago
            );

            await expect(priceMonitor.updateETHPrices()).to.be.revertedWith("Price data too stale");
        });
    });

    describe("Edge Cases", function () {
        it("Should handle zero price gracefully", async function () {
            await mockChainlinkEth.setPrice(0);
            await expect(priceMonitor.updateETHPrices()).to.be.revertedWith("Invalid price from Chainlink");
        });

        it("Should handle equal prices", async function () {
            await mockChainlinkEth.setPrice(300000000000);
            await mockChainlinkArb.setPrice(300000000000);
            await priceMonitor.updateETHPrices();

            const priceData = await priceMonitor.getTokenPriceData(ETH_ADDRESS);
            expect(priceData.spread).to.equal(0);

            const opportunity = await priceMonitor.getArbitrageOpportunity();
            expect(opportunity.isProfitable).to.be.false;
        });
    });
});