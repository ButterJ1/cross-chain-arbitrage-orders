const { ethers, network } = require("hardhat");

// Chainlink ETH/USD Price Feed Addresses
const CHAINLINK_FEEDS = {
    ethereum: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // ETH/USD on Ethereum Mainnet
    sepolia: "0x694AA1769357215DE4FAC081bf1f309aDC325306",   // ETH/USD on Sepolia
    arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // ETH/USD on Arbitrum
    arbitrumSepolia: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165" // ETH/USD on Arbitrum Sepolia
};

async function main() {
    console.log(`\nDeploying BasicPriceMonitor to ${network.name}...\n`);
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");

    // Deploy the contract
    const BasicPriceMonitor = await ethers.getContractFactory("BasicPriceMonitor");
    const priceMonitor = await BasicPriceMonitor.deploy();
    await priceMonitor.waitForDeployment();

    const contractAddress = await priceMonitor.getAddress();
    console.log("BasicPriceMonitor deployed to:", contractAddress);

    // Initialize oracles based on network - FIXED LOGIC
    let ethereumFeed, arbitrumFeed;
    
    if (network.name === "sepolia") {
        // TESTNET FIX: Use the SAME Sepolia feed for both "chains"
        ethereumFeed = CHAINLINK_FEEDS.sepolia;
        arbitrumFeed = CHAINLINK_FEEDS.sepolia; // Same feed for both!
        console.log("Using SAME Sepolia feed for both chains (testnet mode)");
        console.log("This simulates cross-chain with identical prices");
    } else if (network.name === "arbitrumSepolia") {
        // TESTNET FIX: Use the SAME Arbitrum Sepolia feed for both "chains"
        ethereumFeed = CHAINLINK_FEEDS.arbitrumSepolia;
        arbitrumFeed = CHAINLINK_FEEDS.arbitrumSepolia; // Same feed for both!
        console.log("Using SAME Arbitrum Sepolia feed for both chains (testnet mode)");
    } else if (network.name === "mainnet") {
        // REAL CROSS-CHAIN: Different feeds for real arbitrage
        ethereumFeed = CHAINLINK_FEEDS.ethereum;
        arbitrumFeed = CHAINLINK_FEEDS.arbitrum;
        console.log("Using REAL cross-chain feeds (mainnet)");
    } else if (network.name === "localhost" || network.name === "hardhat") {
        // FORK MODE: Real cross-chain feeds
        ethereumFeed = CHAINLINK_FEEDS.ethereum;
        arbitrumFeed = CHAINLINK_FEEDS.arbitrum;
        console.log("Using mainnet feeds (forked network with real data)");
    } else {
        console.log("Unknown network, skipping oracle initialization");
        return;
    }

    // Initialize oracles
    console.log("Initializing oracles...");
    console.log("  Ethereum Chain Feed:", ethereumFeed);
    console.log("  Arbitrum Chain Feed:", arbitrumFeed);
    
    try {
        const initTx = await priceMonitor.initializeOracles(ethereumFeed, arbitrumFeed);
        await initTx.wait();
        console.log("Oracles initialized successfully");
    } catch (error) {
        console.error("Oracle initialization failed:", error.message);
        return;
    }
    
    // Test the deployment
    console.log("\nTesting deployment...");
    try {
        console.log("Testing price update...");
        const updateTx = await priceMonitor.updateETHPrices({
            gasLimit: 500000 // Increase gas limit for safety
        });
        const receipt = await updateTx.wait();
        console.log("Price update successful, gas used:", receipt.gasUsed.toString());
        
        // Check price data
        const priceData = await priceMonitor.getTokenPriceData("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
        console.log("\nETH Prices:");
        console.log("  Ethereum Price: $", ethers.formatEther(priceData.ethereumPrice));
        console.log("  Arbitrum Price: $", ethers.formatEther(priceData.arbitrumPrice));
        console.log("  Spread:", priceData.spread.toString(), "basis points");
        console.log("  Ethereum Higher:", priceData.isEthereumHigher);
        
        // Check arbitrage opportunity
        const opportunity = await priceMonitor.getArbitrageOpportunity();
        console.log("\nArbitrage Opportunity:");
        console.log("  Is Profitable:", opportunity.isProfitable);
        console.log("  Spread:", opportunity.spreadBasisPoints.toString(), "basis points");
        console.log("  Estimated Profit:", ethers.formatEther(opportunity.estimatedProfit), "ETH");
        console.log("  Direction:", opportunity.isEthToArb ? "ETH → ARB" : "ARB → ETH");
        
        if (network.name.includes("sepolia")) {
            console.log("Both prices come from SAME oracle feed");
        }
        
    } catch (error) {
        console.log("Test failed:", error.message);
        console.log("\nDebug info:");
        
        try {
            // Try to check oracle configuration
            const ethOracle = await priceMonitor.oracles(1, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
            const arbOracle = await priceMonitor.oracles(42161, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
            console.log("  Ethereum oracle active:", ethOracle.isActive);
            console.log("  Arbitrum oracle active:", arbOracle.isActive);
        } catch (debugError) {
            console.log("  Could not read oracle config:", debugError.message);
        }
    }

    console.log("\nDeployment complete!");
    
    // Save deployment info
    const deploymentInfo = {
        address: contractAddress,
        network: network.name,
        deployer: deployer.address,
        ethereumFeed,
        arbitrumFeed,
        deployedAt: new Date().toISOString(),
        blockNumber: await ethers.provider.getBlockNumber(),
        chainId: network.config.chainId || await ethers.provider.getNetwork().then(n => n.chainId)
    };
    
    console.log("\nDeployment Info:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    });