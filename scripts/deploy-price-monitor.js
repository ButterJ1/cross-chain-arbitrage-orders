const { ethers, network } = require("hardhat");

// Chainlink ETH/USD Price Feed Addresses
const CHAINLINK_FEEDS = {
    ethereum: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // ETH/USD on Ethereum Mainnet
    sepolia: "0x694AA1769357215DE4FAC081bf1f309aDC325306",   // ETH/USD on Sepolia
    arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // ETH/USD on Arbitrum
    arbitrumSepolia: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165" // ETH/USD on Arbitrum Sepolia
};

async function main() {
    console.log(`\n🚀 Deploying BasicPriceMonitor to ${network.name}...\n`);
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Deploy the contract
    const BasicPriceMonitor = await ethers.getContractFactory("BasicPriceMonitor");
    const priceMonitor = await BasicPriceMonitor.deploy();
    await priceMonitor.deployed();

    console.log("✅ BasicPriceMonitor deployed to:", priceMonitor.address);

    // Initialize oracles based on network
    let ethereumFeed, arbitrumFeed;
    
    if (network.name === "sepolia") {
        ethereumFeed = CHAINLINK_FEEDS.sepolia;
        arbitrumFeed = CHAINLINK_FEEDS.arbitrumSepolia; // Will use same for demo
        console.log("📊 Using Sepolia testnet feeds");
    } else if (network.name === "arbitrumSepolia") {
        ethereumFeed = CHAINLINK_FEEDS.sepolia;
        arbitrumFeed = CHAINLINK_FEEDS.arbitrumSepolia;
        console.log("📊 Using Arbitrum Sepolia testnet feeds");
    } else if (network.name === "mainnet") {
        ethereumFeed = CHAINLINK_FEEDS.ethereum;
        arbitrumFeed = CHAINLINK_FEEDS.arbitrum;
        console.log("📊 Using mainnet feeds");
    } else {
        console.log("⚠️  Unknown network, skipping oracle initialization");
        return;
    }

    // Initialize oracles
    console.log("🔧 Initializing oracles...");
    const initTx = await priceMonitor.initializeOracles(ethereumFeed, arbitrumFeed);
    await initTx.wait();
    console.log("✅ Oracles initialized");

    // Verify the deployment
    console.log("\n📋 Deployment Summary:");
    console.log("Contract Address:", priceMonitor.address);
    console.log("Network:", network.name);
    console.log("Ethereum Feed:", ethereumFeed);
    console.log("Arbitrum Feed:", arbitrumFeed);
    console.log("Deployer:", deployer.address);
    
    // Test the deployment
    console.log("\n🧪 Testing deployment...");
    try {
        // Test price update (might fail on mainnet due to gas costs)
        if (network.name.includes("sepolia")) {
            console.log("📈 Testing price update...");
            const updateTx = await priceMonitor.updateETHPrices();
            const receipt = await updateTx.wait();
            console.log("✅ Price update successful, gas used:", receipt.gasUsed.toString());
            
            // Check price data
            const priceData = await priceMonitor.getTokenPriceData("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
            console.log("📊 ETH Prices:");
            console.log("  Ethereum:", ethers.formatEther(priceData.ethereumPrice));
            console.log("  Arbitrum:", ethers.formatEther(priceData.arbitrumPrice));
            console.log("  Spread:", priceData.spread.toString(), "basis points");
        }
    } catch (error) {
        console.log("⚠️  Test failed (expected on mainnet):", error.message);
    }

    console.log("\n🎉 Deployment complete!");
    
    // Save deployment info
    const deploymentInfo = {
        address: priceMonitor.address,
        network: network.name,
        deployer: deployer.address,
        ethereumFeed,
        arbitrumFeed,
        deployedAt: new Date().toISOString(),
        transactionHash: priceMonitor.deployTransaction.hash
    };
    
    console.log("\n💾 Save this deployment info:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
