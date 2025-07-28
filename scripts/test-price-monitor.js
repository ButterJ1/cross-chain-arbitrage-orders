async function testPriceMonitor() {
    console.log("🧪 Testing Price Monitor functionality...\n");
    
    // Replace with your deployed contract address
    const contractAddress = process.env.PRICE_MONITOR_ADDRESS || "0x...";
    
    if (!contractAddress || contractAddress === "0x...") {
        console.error("❌ Please set PRICE_MONITOR_ADDRESS environment variable");
        process.exit(1);
    }
    
    const BasicPriceMonitor = await ethers.getContractFactory("BasicPriceMonitor");
    const priceMonitor = BasicPriceMonitor.attach(contractAddress);
    
    console.log("📊 Contract Address:", contractAddress);
    console.log("🌐 Network:", network.name);
    
    try {
        // Update prices
        console.log("\n📈 Updating ETH prices...");
        const updateTx = await priceMonitor.updateETHPrices();
        const receipt = await updateTx.wait();
        console.log("✅ Update successful, gas used:", receipt.gasUsed.toString());
        
        // Get price data
        const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
        const priceData = await priceMonitor.getTokenPriceData(ETH_ADDRESS);
        
        console.log("\n📊 Current Price Data:");
        console.log("  Ethereum Price: $", ethers.utils.formatEther(priceData.ethereumPrice));
        console.log("  Arbitrum Price: $", ethers.utils.formatEther(priceData.arbitrumPrice));
        console.log("  Spread:", priceData.spread.toString(), "basis points");
        console.log("  Ethereum Higher:", priceData.isEthereumHigher);
        console.log("  Last Update:", new Date(priceData.timestamp * 1000).toLocaleString());
        
        // Check arbitrage opportunity
        const opportunity = await priceMonitor.getArbitrageOpportunity();
        
        console.log("\n🎯 Arbitrage Opportunity:");
        console.log("  Is Profitable:", opportunity.isProfitable);
        console.log("  Spread:", opportunity.spreadBasisPoints.toString(), "basis points");
        console.log("  Estimated Profit:", ethers.utils.formatEther(opportunity.estimatedProfit), "ETH");
        console.log("  Gas Estimate:", ethers.utils.formatEther(opportunity.gasEstimate), "ETH");
        console.log("  Direction:", opportunity.isEthToArb ? "ETH → ARB" : "ARB → ETH");
        
        // Check if profitable
        const [isProfitable, spreadBPs] = await priceMonitor.isProfitableArbitrage();
        console.log("\n💡 Quick Check:");
        console.log("  Currently Profitable:", isProfitable);
        console.log("  Current Spread:", spreadBPs.toString(), "basis points");
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
    }
}

if (require.main === module) {
    testPriceMonitor()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { testPriceMonitor };