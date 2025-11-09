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

  const PFP_PRICES = [ethers.parseEther("50"), ethers.parseEther("150"), ethers.parseEther("250")];
  const MEME_PRICES = [ethers.parseEther("5"), ethers.parseEther("15"), ethers.parseEther("25")];
  const CEO_PRICE_USD = ethers.parseEther("1"); // $1 per CEO token

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
      owner.address,
      owner.address
    );
    await minterContract.waitForDeployment();

    // Configure contracts
    await pfpCollection.setMinterContract(await minterContract.getAddress());
    await memeCollection.setMinterContract(await minterContract.getAddress());
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), approver.address);
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), user1.address);
    await minterContract.grantRole(await minterContract.RESCUER_ROLE(), rescuer.address);

    // Set CEO price
    await minterContract.setCEOPrice(CEO_PRICE_USD);

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

    it("Should initialize default tiers", async function () {
      // Check PFP tiers
      for (let i = 1; i <= 3; i++) {
        const tier = await minterContract.tiers(0, i); // 0 = PFP
        expect(tier.priceUSD).to.equal(PFP_PRICES[i-1]);
        expect(tier.active).to.be.true;
      }

      // Check Meme tiers
      for (let i = 1; i <= 3; i++) {
        const tier = await minterContract.tiers(1, i); // 1 = MEME
        expect(tier.priceUSD).to.equal(MEME_PRICES[i-1]);
        expect(tier.active).to.be.true;
      }
    });

    it("Should set default active tiers", async function () {
      expect(await minterContract.activeTier(0)).to.equal(1); // PFP
      expect(await minterContract.activeTier(1)).to.equal(1); // MEME
    });
  });

  describe("CEO Price Management", function () {
    it("Should allow admin to set CEO price", async function () {
      const newPrice = ethers.parseEther("2");
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine");
      await minterContract.setCEOPrice(newPrice);
      expect(await minterContract.ceoPriceUSD()).to.equal(newPrice);
    });

    it("Should not allow non-admin to set CEO price", async function () {
      await expect(minterContract.connect(user1).setCEOPrice(ethers.parseEther("2")))
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.PRICE_UPDATER_ROLE());
    });

    it("Should not allow setting zero price", async function () {
      await expect(minterContract.setCEOPrice(0))
        .to.be.revertedWith("MinterContract: Price must be greater than 0");
    });
  });

  describe("Tier Management", function () {
    it("Should allow admin to update tier", async function () {
      const newPrice = ethers.parseEther("100");
      await minterContract.updateTier(0, 1, newPrice, true); // PFP tier 1
      
      const tier = await minterContract.tiers(0, 1);
      expect(tier.priceUSD).to.equal(newPrice);
      expect(tier.active).to.be.true;
    });

    it("Should allow admin to deactivate tier", async function () {
      await minterContract.updateTier(0, 1, PFP_PRICES[0], false); // PFP tier 1
      
      const tier = await minterContract.tiers(0, 1);
      expect(tier.active).to.be.false;
    });

    it("Should not allow invalid tier ID", async function () {
      await expect(minterContract.updateTier(0, 0, ethers.parseEther("100"), true))
        .to.be.revertedWith("MinterContract: Invalid tier ID");
      
      await expect(minterContract.updateTier(0, 4, ethers.parseEther("100"), true))
        .to.be.revertedWith("MinterContract: Invalid tier ID");
    });

    it("Should allow admin to set active tier", async function () {
      await minterContract.setActiveTier(0, 2); // PFP tier 2
      expect(await minterContract.activeTier(0)).to.equal(2);
    });

    it("Should not allow setting inactive tier as active", async function () {
      await minterContract.updateTier(0, 2, PFP_PRICES[1], false); // Deactivate PFP tier 2
      await expect(minterContract.setActiveTier(0, 2))
        .to.be.revertedWith("MinterContract: Tier is not active");
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
    it("Should calculate correct CEO price for PFP tier 1", async function () {
      const priceCEO = await minterContract.getPriceInCEO(0, 1); // PFP tier 1
      expect(priceCEO).to.equal(PFP_PRICES[0]); // $50 / $1 = 50 CEO tokens
    });

    it("Should calculate correct CEO price for Meme tier 1", async function () {
      const priceCEO = await minterContract.getPriceInCEO(1, 1); // MEME tier 1
      expect(priceCEO).to.equal(MEME_PRICES[0]); // $5 / $1 = 5 CEO tokens
    });

    it("Should use active tier when tier ID is 0", async function () {
      const priceCEO = await minterContract.getPriceInCEO(0, 0); // PFP active tier
      expect(priceCEO).to.equal(PFP_PRICES[0]); // Should use tier 1
    });

    it("Should return correct active tier info", async function () {
      const [tierId, priceUSD, priceCEO] = await minterContract.getActiveTierInfo(0); // PFP
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(PFP_PRICES[0]);
      expect(priceCEO).to.equal(PFP_PRICES[0]);
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
      const priceCEO = await minterContract.getPriceInCEO(0, 1); // PFP tier 1
      
      await minterContract.connect(user1).mintNFT(0, 1, metadataURI);
      
      expect(await pfpCollection.ownerOf(1)).to.equal(user1.address);
      expect(await pfpCollection.tokenURI(1)).to.equal(metadataURI);
    });

    it("Should allow approver to mint Meme NFT", async function () {
      const metadataURI = "https://example.com/meme/metadata/1";
      const priceCEO = await minterContract.getPriceInCEO(1, 1); // MEME tier 1
      
      await minterContract.connect(user1).mintNFT(1, 1, metadataURI);
      
      expect(await memeCollection.ownerOf(1)).to.equal(user1.address);
      expect(await memeCollection.tokenURI(1)).to.equal(metadataURI);
    });

    it("Should use active tier when tier ID is 0", async function () {
      const metadataURI = "https://example.com/pfp/metadata/1";
      
      await minterContract.connect(user1).mintNFT(0, 0, metadataURI);
      
      expect(await pfpCollection.ownerOf(1)).to.equal(user1.address);
    });

    it("Should not allow minting with inactive tier", async function () {
      await minterContract.updateTier(0, 1, PFP_PRICES[0], false); // Deactivate PFP tier 1
      
      await expect(minterContract.connect(user1).mintNFT(0, 1, "metadata"))
        .to.be.revertedWith("MinterContract: Tier is not active");
    });

    it("Should not allow non-approver to mint", async function () {
      await expect(minterContract.connect(user2).mintNFT(0, 1, "metadata"))
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
      await minterContract.connect(user1).mintNFT(0, 1, "metadata1");
      await minterContract.connect(user1).mintNFT(0, 1, "metadata2");
      
      expect(await minterContract.canUserMint(user1.address, 0)).to.be.false;
    });

    it("Should correctly check if user can mint Meme", async function () {
      expect(await minterContract.canUserMint(user1.address, 1)).to.be.true; // MEME
      
      // Mint 9 Memes (max limit)
      for (let i = 1; i <= 9; i++) {
        await minterContract.connect(user1).mintNFT(1, 1, `metadata${i}`);
      }
      
      expect(await minterContract.canUserMint(user1.address, 1)).to.be.false;
    });

    it("Should return correct user mint count", async function () {
      expect(await minterContract.getUserMintCount(user1.address, 0)).to.equal(0); // PFP
      expect(await minterContract.getUserMintCount(user1.address, 1)).to.equal(0); // MEME
      
      await minterContract.connect(user1).mintNFT(0, 1, "metadata");
      expect(await minterContract.getUserMintCount(user1.address, 0)).to.equal(1);
      
      await minterContract.connect(user1).mintNFT(1, 1, "metadata");
      expect(await minterContract.getUserMintCount(user1.address, 1)).to.equal(1);
    });
  });

  describe("Fund Management", function () {
    beforeEach(async function () {
      await ceoToken.connect(user1).approve(await minterContract.getAddress(), ethers.parseEther("10000"));
    });

    it("Should allow admin to withdraw funds", async function () {
      // Mint an NFT to generate funds
      await minterContract.connect(user1).mintNFT(0, 1, "metadata");
      
      const balanceBefore = await ceoToken.balanceOf(treasury.address);
      await minterContract.withdrawFunds();
      const balanceAfter = await ceoToken.balanceOf(treasury.address);
      
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should not allow non-admin to withdraw funds", async function () {
      await expect(minterContract.connect(user1).withdrawFunds())
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.ADMIN_ROLE());
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

    it("Should not allow recovering CEO tokens", async function () {
      await expect(minterContract.connect(rescuer).recoverStuckTokens(await ceoToken.getAddress(), ethers.parseEther("1000")))
        .to.be.revertedWith("MinterContract: Cannot recover CEO tokens");
    });

    it("Should not allow non-rescuer to recover tokens", async function () {
      await expect(minterContract.connect(user1).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1")))
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.RESCUER_ROLE());
    });
  });
});

// (No Truffle-style contract() blocks; using Hardhat + ethers v6.)
