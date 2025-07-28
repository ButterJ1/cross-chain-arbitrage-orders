
// test/BasicPriceMonitor.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("BasicPriceMonitor", function () {
    // Test constants
    const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const ETHEREUM_CHAIN_ID = 1;
    const ARBITRUM_CHAIN_ID = 42161;

    async function deployPriceMonitorFixture() {
        const [owner, user1] = await ethers.getSigners();

        // Deploy mock Chainlink price feeds
        const MockChainlinkFeed = await ethers.getContractFactory("MockChainlinkFeed");
        const mockChainlinkEth = await MockChainlinkFeed.deploy();
        const mockChainlinkArb = await MockChainlinkFeed.deploy();

        // Deploy BasicPriceMonitor
        const BasicPriceMonitor = await ethers.getContractFactory("BasicPriceMonitor");
        const priceMonitor = await BasicPriceMonitor.deploy();

        // Initialize oracles
        await priceMonitor.initializeOracles(
            await mockChainlinkEth.getAddress(),
            await mockChainlinkArb.getAddress()
        );

        return {
            priceMonitor,
            mockChainlinkEth,
            mockChainlinkArb,
            owner,
            user1
        };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { priceMonitor, owner } = await loadFixture(deployPriceMonitorFixture);
            expect(await priceMonitor.owner()).to.equal(owner.address);
        });

        it("Should initialize with correct constants", async function () {
            const { priceMonitor } = await loadFixture(deployPriceMonitorFixture);
            expect(await priceMonitor.ETH()).to.equal(ETH_ADDRESS);
            expect(await priceMonitor.ETHEREUM_CHAIN_ID()).to.equal(ETHEREUM_CHAIN_ID);
            expect(await priceMonitor.ARBITRUM_CHAIN_ID()).to.equal(ARBITRUM_CHAIN_ID);
        });
    });

    describe("Oracle Configuration", function () {
        it("Should initialize oracles correctly", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            const ethOracle = await priceMonitor.oracles(ETHEREUM_CHAIN_ID, ETH_ADDRESS);
            const arbOracle = await priceMonitor.oracles(ARBITRUM_CHAIN_ID, ETH_ADDRESS);

            expect(ethOracle.chainlinkFeed).to.equal(await mockChainlinkEth.getAddress());
            expect(arbOracle.chainlinkFeed).to.equal(await mockChainlinkArb.getAddress());
            expect(ethOracle.isActive).to.be.true;
            expect(arbOracle.isActive).to.be.true;
        });

        it("Should only allow owner to initialize oracles", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb, user1 } = await loadFixture(deployPriceMonitorFixture);
            
            await expect(
                priceMonitor.connect(user1).initializeOracles(
                    await mockChainlinkEth.getAddress(),
                    await mockChainlinkArb.getAddress()
                )
            ).to.be.reverted; // Generic revert check - will work with any error
        });
    });

    describe("Price Updates", function () {
        it("Should update prices correctly", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set initial prices: ETH = $3000, ARB = $3050 (1.67% spread)
            await mockChainlinkEth.setPrice(300000000000n); // $3000 with 8 decimals
            await mockChainlinkArb.setPrice(305000000000n); // $3050 with 8 decimals
            
            await priceMonitor.updateETHPrices();

            const priceData = await priceMonitor.getTokenPriceData(ETH_ADDRESS);
            
            // Prices should be converted to 18 decimals
            expect(priceData.ethereumPrice).to.equal(ethers.parseEther("3000"));
            expect(priceData.arbitrumPrice).to.equal(ethers.parseEther("3050"));
            expect(priceData.isEthereumHigher).to.be.false;
            expect(priceData.spread).to.be.closeTo(167n, 5n); // ~1.67% in basis points
        });

        it("Should emit PricesUpdated event", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set initial prices: ETH = $3000, ARB = $3050 (1.67% spread)
            await mockChainlinkEth.setPrice(300000000000n); // $3000 with 8 decimals
            await mockChainlinkArb.setPrice(305000000000n); // $3050 with 8 decimals

            await expect(priceMonitor.updateETHPrices())
                .to.emit(priceMonitor, "PricesUpdated");
        });

        it("Should detect arbitrage opportunity when spread is significant", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set larger spread: ETH = $3000, ARB = $3100 (3.33% spread)
            await mockChainlinkEth.setPrice(300000000000n);
            await mockChainlinkArb.setPrice(310000000000n);

            await expect(priceMonitor.updateETHPrices())
                .to.emit(priceMonitor, "ArbitrageOpportunityDetected");
        });

        it("Should not detect arbitrage when spread is too small", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set small spread: ETH = $3000, ARB = $3010 (0.33% spread)
            await mockChainlinkEth.setPrice(300000000000n);
            await mockChainlinkArb.setPrice(301000000000n);

            await expect(priceMonitor.updateETHPrices())
                .to.not.emit(priceMonitor, "ArbitrageOpportunityDetected");
        });
    });

    describe("Arbitrage Opportunity Detection", function () {
        it("Should calculate arbitrage opportunity correctly", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set profitable spread: ETH = $3000, ARB = $3100
            await mockChainlinkEth.setPrice(300000000000n);
            await mockChainlinkArb.setPrice(310000000000n);
            await priceMonitor.updateETHPrices();

            const opportunity = await priceMonitor.getArbitrageOpportunity();

            expect(opportunity.isProfitable).to.be.true;
            expect(opportunity.isEthToArb).to.be.true; // Buy ETH, sell on ARB
            expect(opportunity.spreadBasisPoints).to.be.closeTo(333n, 10n); // ~3.33%
            expect(opportunity.estimatedProfit).to.be.gt(0);
        });

        it("Should account for gas costs in profitability", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set profitable spread first
            await mockChainlinkEth.setPrice(300000000000n);
            await mockChainlinkArb.setPrice(310000000000n);
            
            // Set very high gas price to make arbitrage unprofitable
            await priceMonitor.updateGasPrice(ethers.parseUnits("500", "gwei"));

            const opportunity = await priceMonitor.getArbitrageOpportunity();
            expect(opportunity.isProfitable).to.be.false;
        });

        it("Should return correct arbitrage direction", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // ETH higher on Ethereum: should arbitrage ARB -> ETH
            await mockChainlinkEth.setPrice(310000000000n); // $3100
            await mockChainlinkArb.setPrice(300000000000n); // $3000
            await priceMonitor.updateETHPrices();

            const opportunity = await priceMonitor.getArbitrageOpportunity();
            expect(opportunity.isEthToArb).to.be.false; // Buy on ARB, sell on ETH
        });
    });

    describe("Gas Price Management", function () {
        it("Should update gas price correctly", async function () {
            const { priceMonitor } = await loadFixture(deployPriceMonitorFixture);
            
            const newGasPrice = ethers.parseUnits("100", "gwei");
            
            await expect(priceMonitor.updateGasPrice(newGasPrice))
                .to.emit(priceMonitor, "GasPriceUpdated")
                .withArgs(ethers.parseUnits("20", "gwei"), newGasPrice);

            expect(await priceMonitor.gasPrice()).to.equal(newGasPrice);
        });

        it("Should only allow owner to update gas price", async function () {
            const { priceMonitor, user1 } = await loadFixture(deployPriceMonitorFixture);
            
            await expect(
                priceMonitor.connect(user1).updateGasPrice(ethers.parseUnits("100", "gwei"))
            ).to.be.reverted; // Generic revert check - will work with any error
        });
    });

    describe("Price Data Freshness", function () {
        it("Should return true for fresh data", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            await mockChainlinkEth.setPrice(300000000000n);
            await mockChainlinkArb.setPrice(305000000000n);
            await priceMonitor.updateETHPrices();
            
            const isFresh = await priceMonitor.isPriceDataFresh(ETH_ADDRESS, 300); // 5 minutes
            expect(isFresh).to.be.true;
        });

        it("Should return false for stale data", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set normal prices first
            await mockChainlinkEth.setPrice(300000000000n);
            await mockChainlinkArb.setPrice(305000000000n);
            
            // Simulate stale price data (2 hours ago)
            const staleTimestamp = Math.floor(Date.now() / 1000) - 7200;
            await mockChainlinkEth.setUpdatedAt(staleTimestamp);

            await expect(priceMonitor.updateETHPrices())
                .to.be.revertedWith("Price data too stale");
        });
    });

    describe("Edge Cases", function () {
        it("Should handle zero price gracefully", async function () {
            const { priceMonitor, mockChainlinkEth } = await loadFixture(deployPriceMonitorFixture);
            
            await mockChainlinkEth.setPrice(0);
            await expect(priceMonitor.updateETHPrices()).to.be.revertedWith("Invalid price from Chainlink");
        });

        it("Should handle equal prices", async function () {
            const { priceMonitor, mockChainlinkEth, mockChainlinkArb } = await loadFixture(deployPriceMonitorFixture);
            
            // Set equal prices
            await mockChainlinkEth.setPrice(300000000000n);
            await mockChainlinkArb.setPrice(300000000000n);
            await priceMonitor.updateETHPrices();

            const priceData = await priceMonitor.getTokenPriceData(ETH_ADDRESS);
            expect(priceData.spread).to.equal(0);
            expect(priceData.ethereumPrice).to.equal(priceData.arbitrumPrice);

            const opportunity = await priceMonitor.getArbitrageOpportunity();
            expect(opportunity.isProfitable).to.be.false;
            expect(opportunity.spreadBasisPoints).to.equal(0);
            expect(opportunity.estimatedProfit).to.equal(0);
        });
    });
});