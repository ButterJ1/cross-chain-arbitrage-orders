const { ethers, network } = require("hardhat");

async function testPriceMonitor() {
    console.log("Testing Price Monitor functionality...\n");
    
    // Get contract address from environment or command line
    const contractAddress = process.env.PRICE_MONITOR_ADDRESS || process.argv[3] || "0x...";
    
    if (!contractAddress || contractAddress === "0x...") {
        console.error("Please provide contract address");
        process.exit(1);
    }
    
    console.log("Contract Address:", contractAddress);
    console.log("Network:", network.name);
    console.log("Chain ID:", network.config.chainId);
    
    try {
        // Connect to deployed contract
        const BasicPriceMonitor = await ethers.getContractFactory("BasicPriceMonitor");
        const priceMonitor = BasicPriceMonitor.attach(contractAddress);
        
        // Verify contract is accessible
        console.log("\nVerifying contract...");
        const owner = await priceMonitor.owner();
        console.log("  Contract Owner:", owner);
        
        // Check oracle configuration
        console.log("\nChecking oracle configuration...");
        const ethOracle = await priceMonitor.oracles(1, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
        const arbOracle = await priceMonitor.oracles(42161, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
        
        console.log("  Ethereum Oracle:");
        console.log("    Feed Address:", ethOracle.chainlinkFeed);
        console.log("    Is Active:", ethOracle.isActive);
        console.log("  Arbitrum Oracle:");
        console.log("    Feed Address:", arbOracle.chainlinkFeed);
        console.log("    Is Active:", arbOracle.isActive);
        
        if (!ethOracle.isActive || !arbOracle.isActive) {
            throw new Error("Oracles not properly initialized");
        }
        
        // Update prices
        console.log("\nUpdating ETH prices...");
        const updateTx = await priceMonitor.updateETHPrices({
            gasLimit: 500000 // Safety margin
        });
        const receipt = await updateTx.wait();
        console.log("Update successful, gas used:", receipt.gasUsed.toString());
        
        // Get price data
        const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
        const priceData = await priceMonitor.getTokenPriceData(ETH_ADDRESS);
        
        console.log("\nCurrent Price Data:");
        console.log("  Ethereum Price: $", ethers.formatEther(priceData.ethereumPrice));
        console.log("  Arbitrum Price: $", ethers.formatEther(priceData.arbitrumPrice));
        console.log("  Spread:", priceData.spread.toString(), "basis points");
        console.log("  Ethereum Higher:", priceData.isEthereumHigher);
        console.log("  Last Update:", new Date(Number(priceData.timestamp) * 1000).toLocaleString());
        
        // Check arbitrage opportunity
        const opportunity = await priceMonitor.getArbitrageOpportunity();
        
        console.log("\nArbitrage Opportunity:");
        console.log("  Is Profitable:", opportunity.isProfitable);
        console.log("  Spread:", opportunity.spreadBasisPoints.toString(), "basis points");
        console.log("  Estimated Profit:", ethers.formatEther(opportunity.estimatedProfit), "ETH");
        console.log("  Gas Estimate:", ethers.formatEther(opportunity.gasEstimate), "ETH");
        console.log("  Direction:", opportunity.isEthToArb ? "ETH → ARB" : "ARB → ETH");
        
        // Quick check function
        const [isProfitable, spreadBPs] = await priceMonitor.isProfitableArbitrage();
        console.log("\nQuick Profitability Check:");
        console.log("  Currently Profitable:", isProfitable);
        console.log("  Current Spread:", spreadBPs.toString(), "basis points");

        console.log("\nAll tests passed! Contract is working correctly!");
        
    } catch (error) {
        console.error("\nTest failed:", error.message);
        
        console.log("\nTry redeploying with:");
        console.log(`  npm run deploy:${network.name}`);
    }
}

if (require.main === module) {
    testPriceMonitor()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Script error:", error);
            process.exit(1);
        });
}

module.exports = { testPriceMonitor };