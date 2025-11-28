const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MinterContract", function () {
  let ceoToken;
  let pfpCollection;
  let memeCollection;
  let minterContract;
  let owner;
  let approver;
  let rescuer;
  let treasury;
  let user1;
  let user2;

  // Prices in USDC decimals (6 decimals for USDC)
  const PFP_PRICES = [BigInt(50 * 1e6), BigInt(150 * 1e6), BigInt(250 * 1e6)];
  const MEME_PRICES = [BigInt(5 * 1e6), BigInt(15 * 1e6), BigInt(25 * 1e6)];
  const CEO_PRICE_USDC = BigInt(567000); // 0.567 USDC (6 decimals) per CEO token

  beforeEach(async function () {
    [owner, approver, rescuer, treasury, user1, user2] = await ethers.getSigners();

    // Deploy CEO Token
    const CEOToken = await ethers.getContractFactory("CEOToken");
    ceoToken = await CEOToken.deploy(owner.address);
    await ceoToken.waitForDeployment();

    // Deploy PFP Collection
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    pfpCollection = await NFTCollection.deploy("Rekt CEO PFPs", "RCPFP", owner.address, owner.address, 999, 2, 210);
    await pfpCollection.waitForDeployment();

    // Deploy Meme Collection
    memeCollection = await NFTCollection.deploy("Rekt CEO Memes", "RCMEME", owner.address, owner.address, 9999, 9, 210);
    await memeCollection.waitForDeployment();

    // Deploy Minter Contract
    const MinterContract = await ethers.getContractFactory("MinterContract");
    const usdcFactory = await ethers.getContractFactory("MockERC20");
    const usdc = await usdcFactory.deploy("MockUSDC", "USDC");
    await usdc.waitForDeployment();

    minterContract = await MinterContract.deploy(
      await ceoToken.getAddress(),
      await pfpCollection.getAddress(),
      await memeCollection.getAddress(),
      await usdc.getAddress(),
      treasury.address,
      owner.address
    );
    await minterContract.waitForDeployment();

    // Deploy Mock Uniswap Router
    const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
    const mockRouter = await MockUniswapRouter.deploy();
    await mockRouter.waitForDeployment();

    // Configure Uniswap router in MinterContract
    const swapPath = [await ceoToken.getAddress(), await usdc.getAddress()];
    await minterContract.setUniswapConfig(await mockRouter.getAddress(), swapPath, 100); // 1% slippage

    // Configure contracts
    await pfpCollection.setMinterContract(await minterContract.getAddress());
    await memeCollection.setMinterContract(await minterContract.getAddress());
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), approver.address);
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), user1.address);
    await minterContract.grantRole(await minterContract.RESCUER_ROLE(), rescuer.address);

    // Give users some CEO tokens
    await ceoToken.transfer(user1.address, ethers.parseEther("10000"));
    await ceoToken.transfer(user2.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set correct contract addresses", async function () {
      expect(await minterContract.ceoToken()).to.equal(await ceoToken.getAddress());
      expect(await minterContract.pfpCollection()).to.equal(await pfpCollection.getAddress());
      expect(await minterContract.memeCollection()).to.equal(await memeCollection.getAddress());
      expect(await minterContract.treasury()).to.equal(treasury.address);
    });

    it("Should set correct roles", async function () {
      expect(await minterContract.hasRole(await minterContract.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await minterContract.hasRole(await minterContract.ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await minterContract.hasRole(await minterContract.APPROVER_ROLE(), approver.address)).to.be.true;
      expect(await minterContract.hasRole(await minterContract.RESCUER_ROLE(), rescuer.address)).to.be.true;
    });

    it("Should initialize default tiers with supply limits", async function () {
      // Check PFP tiers (500, 309, 190 = 999 total)
      const pfpTier1 = await minterContract.tiers(0, 1);
      expect(pfpTier1.priceUSD).to.equal(PFP_PRICES[0]);
      expect(pfpTier1.supplyLimit).to.equal(500);
      expect(pfpTier1.startSupply).to.equal(0);

      const pfpTier2 = await minterContract.tiers(0, 2);
      expect(pfpTier2.priceUSD).to.equal(PFP_PRICES[1]);
      expect(pfpTier2.supplyLimit).to.equal(309);
      expect(pfpTier2.startSupply).to.equal(500);

      const pfpTier3 = await minterContract.tiers(0, 3);
      expect(pfpTier3.priceUSD).to.equal(PFP_PRICES[2]);
      expect(pfpTier3.supplyLimit).to.equal(190);
      expect(pfpTier3.startSupply).to.equal(809);

      // Check Meme tiers (5000, 3090, 1909 = 9999 total)
      const memeTier1 = await minterContract.tiers(1, 1);
      expect(memeTier1.priceUSD).to.equal(MEME_PRICES[0]);
      expect(memeTier1.supplyLimit).to.equal(5000);
      expect(memeTier1.startSupply).to.equal(0);

      const memeTier2 = await minterContract.tiers(1, 2);
      expect(memeTier2.priceUSD).to.equal(MEME_PRICES[1]);
      expect(memeTier2.supplyLimit).to.equal(3090);
      expect(memeTier2.startSupply).to.equal(5000);

      const memeTier3 = await minterContract.tiers(1, 3);
      expect(memeTier3.priceUSD).to.equal(MEME_PRICES[2]);
      expect(memeTier3.supplyLimit).to.equal(1909);
      expect(memeTier3.startSupply).to.equal(8090);
    });
  });

  describe("CEO Price", function () {
    it("Should return correct mock CEO price", async function () {
      const ceoPrice = await minterContract.queryCEOPriceFromDEX();
      expect(ceoPrice).to.equal(CEO_PRICE_USDC); // Mock price in USDC decimals (6)
    });
  });

  describe("Treasury Management", function () {
    it("Should allow admin to set treasury", async function () {
      await minterContract.setTreasury(user1.address);
      expect(await minterContract.treasury()).to.equal(user1.address);
    });

    it("Should not allow setting zero address as treasury", async function () {
      await expect(minterContract.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("MinterContract: Invalid treasury address");
    });
  });

  describe("Price Calculation", function () {
    it("Should calculate correct CEO price for current PFP tier", async function () {
      // Formula: (tierPrice in USDC * 10^ceoDecimals) / ceoPriceInUSDC
      // (50 * 10^6 * 10^18) / 567000 = 88,183,421,516,754,850,088
      const expectedPrice = (PFP_PRICES[0] * ethers.parseEther("1")) / CEO_PRICE_USDC;
      const [, , , priceCEO] = await minterContract.getCurrentTierInfo(0); // PFP - extract priceCEO (4th value)
      expect(priceCEO).to.equal(expectedPrice);
    });

    it("Should calculate correct CEO price for current Meme tier", async function () {
      // Formula: (tierPrice in USDC * 10^ceoDecimals) / ceoPriceInUSDC
      // (5 * 10^6 * 10^18) / 567000 = 8,818,342,151,675,485,008
      const expectedPrice = (MEME_PRICES[0] * ethers.parseEther("1")) / CEO_PRICE_USDC;
      const [, , , priceCEO] = await minterContract.getCurrentTierInfo(1); // MEME - extract priceCEO (4th value)
      expect(priceCEO).to.equal(expectedPrice);
    });

    it("Should return correct current tier info for PFP", async function () {
      const [currentSupply, tierId, priceUSD, priceCEO, remainingInTier] = await minterContract.getCurrentTierInfo(0); // PFP
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(PFP_PRICES[0]);
      expect(remainingInTier).to.equal(500); // Tier 1 has 500 NFTs
    });

    it("Should return correct current tier info for Meme", async function () {
      const [currentSupply, tierId, priceUSD, priceCEO, remainingInTier] = await minterContract.getCurrentTierInfo(1); // MEME
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(MEME_PRICES[0]);
      expect(remainingInTier).to.equal(5000); // Tier 1 has 5000 NFTs
    });
  });

  describe("NFT Minting", function () {
    beforeEach(async function () {
      // Approve minter contract to spend user's CEO tokens
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
      await ceoToken.connect(user2).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
    });

    it("Should allow approver to mint PFP NFT", async function () {
      const metadataURI = "https://example.com/pfp/metadata/1";
      
      await minterContract.connect(user1).mintNFT(0, metadataURI);
      
      expect(await pfpCollection.ownerOf(1)).to.equal(user1.address);
      expect(await pfpCollection.tokenURI(1)).to.equal(metadataURI);
    });

    it("Should allow approver to mint Meme NFT", async function () {
      const metadataURI = "https://example.com/meme/metadata/1";
      
      await minterContract.connect(user1).mintNFT(1, metadataURI);
      
      expect(await memeCollection.ownerOf(1)).to.equal(user1.address);
      expect(await memeCollection.tokenURI(1)).to.equal(metadataURI);
    });

    it("Should automatically use correct tier based on supply", async function () {
      const metadataURI = "https://example.com/pfp/metadata/1";
      
      // First mint should use tier 1
      await minterContract.connect(user1).mintNFT(0, metadataURI);
      
      expect(await pfpCollection.ownerOf(1)).to.equal(user1.address);
      
      // Check that tier 1 is still active (only 1 of 25 minted)
      const [currentSupply, tierId] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
    });

    it("Should not allow non-approver to mint", async function () {
      await expect(minterContract.connect(user2).mintNFT(0, "metadata"))
        .to.be.revertedWith("AccessControl: account " + user2.address.toLowerCase() + " is missing role " + await minterContract.APPROVER_ROLE());
    });
  });

  describe("User Mint Limits", function () {
    beforeEach(async function () {
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
    });

    it("Should correctly check if user can mint PFP", async function () {
      expect(await minterContract.canUserMint(user1.address, 0)).to.be.true; // PFP
      
      // Mint 2 PFPs (max limit)
      await minterContract.connect(user1).mintNFT(0, "metadata1");
      await minterContract.connect(user1).mintNFT(0, "metadata2");
      
      expect(await minterContract.canUserMint(user1.address, 0)).to.be.false;
    });

    it("Should correctly check if user can mint Meme", async function () {
      expect(await minterContract.canUserMint(user1.address, 1)).to.be.true; // MEME
      
      // Mint 9 Memes (max limit)
      for (let i = 1; i <= 9; i++) {
        await minterContract.connect(user1).mintNFT(1, `metadata${i}`);
      }
      
      expect(await minterContract.canUserMint(user1.address, 1)).to.be.false;
    });

    it("Should return correct user mint count", async function () {
      expect(await minterContract.getUserMintCount(user1.address, 0)).to.equal(0); // PFP
      expect(await minterContract.getUserMintCount(user1.address, 1)).to.equal(0); // MEME
      
      await minterContract.connect(user1).mintNFT(0, "metadata");
      expect(await minterContract.getUserMintCount(user1.address, 0)).to.equal(1);
      
      await minterContract.connect(user1).mintNFT(1, "metadata");
      expect(await minterContract.getUserMintCount(user1.address, 1)).to.equal(1);
    });
  });

  describe("Fund Management", function () {
    beforeEach(async function () {
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
    });

    it("Should allow admin to withdraw funds when USDC swap is disabled", async function () {
      // Disable USDC swap so tokens remain in contract
      await minterContract.updateUSDCSwapConfig(false, 0);
      
      // Mint an NFT to generate funds
      await minterContract.connect(user1).mintNFT(0, "metadata");
      
      const balanceBefore = await ceoToken.balanceOf(treasury.address);
      await minterContract.withdrawFunds();
      const balanceAfter = await ceoToken.balanceOf(treasury.address);
      
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should have no funds to withdraw when USDC swap is enabled", async function () {
      // USDC swap is enabled by default, all funds go to treasury immediately
      await minterContract.connect(user1).mintNFT(0, "metadata");
      
      // No funds should remain in contract
      const contractBalance = await ceoToken.balanceOf(await minterContract.getAddress());
      expect(contractBalance).to.equal(0);
      
      // Attempting to withdraw should fail
      await expect(minterContract.withdrawFunds())
        .to.be.revertedWith("MinterContract: No funds to withdraw");
    });

    it("Should not allow non-admin to withdraw funds", async function () {
      await expect(minterContract.connect(user1).withdrawFunds())
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.ADMIN_ROLE());
    });
  });

  describe("Automatic Tier Progression", function () {
    it("Should start in tier 1 for PFP", async function () {
      const [currentSupply, tierId, priceUSD] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(PFP_PRICES[0]); // $50
    });

    it("Should stay in tier 1 after few mints", async function () {
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
      
      // Mint 2 PFPs (max per user)
      await minterContract.connect(user1).mintNFT(0, "metadata1");
      await minterContract.connect(user1).mintNFT(0, "metadata2");
      
      // Should still be in tier 1 (only 2 of 500 minted)
      const [currentSupply, tierId, priceUSD, priceCEO, remainingInTier] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(PFP_PRICES[0]);
      expect(remainingInTier).to.equal(498); // 500 - 2 = 498 remaining
    });

    it("Should correctly calculate remaining NFTs in tier", async function () {
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
      
      // Mint 1 PFP
      await minterContract.connect(user1).mintNFT(0, "metadata1");
      
      const [currentSupply, tierId, priceUSD, priceCEO, remainingInTier] = await minterContract.getCurrentTierInfo(0);
      expect(remainingInTier).to.equal(499); // 500 - 1 = 499 remaining
    });

    it("Should track tier progression across multiple users", async function () {
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
      await ceoToken.connect(user2).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
      await minterContract.grantRole(await minterContract.APPROVER_ROLE(), user2.address);
      
      // User1 mints 2 (max)
      await minterContract.connect(user1).mintNFT(0, "metadata_user1_1");
      await minterContract.connect(user1).mintNFT(0, "metadata_user1_2");
      
      // User2 mints 2 (max)
      await minterContract.connect(user2).mintNFT(0, "metadata_user2_1");
      await minterContract.connect(user2).mintNFT(0, "metadata_user2_2");
      
      // Total: 4 minted, still in tier 1
      const [currentSupply, tierId, priceUSD, priceCEO, remainingInTier] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
      expect(remainingInTier).to.equal(496); // 500 - 4 = 496 remaining
      expect(await pfpCollection.getCurrentTokenId()).to.equal(5); // Next token ID
    });
  });

  describe("Token Recovery", function () {
    it("Should allow rescuer to recover stuck tokens", async function () {
      // Deploy a mock ERC-20 token
      const MockToken = await ethers.getContractFactory("MockERC20");
      const mockToken = await MockToken.deploy("Mock Token", "MOCK");
      await mockToken.waitForDeployment();

      // Send tokens to minter contract
      await mockToken.transfer(await minterContract.getAddress(), ethers.parseEther("1000"));

      await minterContract.connect(rescuer).recoverStuckTokens(await mockToken.getAddress(), ethers.parseEther("1000"));
      expect(await mockToken.balanceOf(rescuer.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should allow rescuer to recover any ERC20 tokens including CEO tokens (emergency feature)", async function () {
      // With USDC swap disabled, tokens remain in contract
      await minterContract.updateUSDCSwapConfig(false, 0);
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
      await minterContract.connect(user1).mintNFT(0, "metadata");
      
      const contractBalance = await ceoToken.balanceOf(await minterContract.getAddress());
      expect(contractBalance).to.be.gt(0);
      
      // Rescuer can now recover CEO tokens (fixed vulnerability)
      await minterContract.connect(rescuer).recoverStuckTokens(await ceoToken.getAddress(), contractBalance);
      expect(await ceoToken.balanceOf(rescuer.address)).to.equal(contractBalance);
    });

    it("Should not allow non-rescuer to recover tokens", async function () {
      const MockToken = await ethers.getContractFactory("MockERC20");
      const mockToken = await MockToken.deploy("Mock Token", "MOCK");
      await mockToken.waitForDeployment();

      await expect(minterContract.connect(user1).recoverStuckTokens(await mockToken.getAddress(), ethers.parseEther("1")))
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.RESCUER_ROLE());
    });

    it("Should not allow recovering with zero address", async function () {
      await expect(minterContract.connect(rescuer).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1")))
        .to.be.revertedWith("MinterContract: Invalid token address");
    });
  });
});