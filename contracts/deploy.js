const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying Escrow contract to Avalanche Fuji Testnet...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    const balance = await deployer.getBalance();
    console.log("Account balance:", ethers.formatEther(balance), "AVAX");
    
    // Deploy with Avalanche-optimized gas settings
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy({
        gasLimit: 8000000,
        gasPrice: ethers.parseUnits("25", "gwei")
    });
    
    console.log("Deployment transaction sent:", escrow.deploymentTransaction().hash);
    
    await escrow.waitForDeployment();
    
    const contractAddress = await escrow.getAddress();
    console.log("Escrow contract deployed to:", contractAddress);
    
    // Verify deployment
    const escrowCount = await escrow.escrowCount();
    console.log("Initial escrow count:", escrowCount.toString());
    
    console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
    console.log("Contract Address:", contractAddress);
    console.log("Update your dApp with this address!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });