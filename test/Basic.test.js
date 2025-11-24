const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Rekt CEO Basic Tests", function () {
  let ceoToken;
  let pfpCollection;
  let memeCollection;
  let minterContract;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

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

    // Deploy Mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("MockUSDC", "USDC");
    await usdc.waitForDeployment();

    // Deploy Minter Contract
    const MinterContract = await ethers.getContractFactory("MinterContract");
    minterContract = await MinterContract.deploy(
      await ceoToken.getAddress(),
      await pfpCollection.getAddress(),
      await memeCollection.getAddress(),
      await usdc.getAddress(),
      owner.address, // treasury
      owner.address  // admin
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
    await minterContract.grantRole(await minterContract.APPROVER_ROLE(), owner.address);
  });

  describe("Deployment", function () {
    it("Should deploy all contracts successfully", async function () {
      expect(await ceoToken.getAddress()).to.be.properAddress;
      expect(await pfpCollection.getAddress()).to.be.properAddress;
      expect(await memeCollection.getAddress()).to.be.properAddress;
      expect(await minterContract.getAddress()).to.be.properAddress;
    });

    it("Should set correct token name and symbol", async function () {
      expect(await ceoToken.name()).to.equal("Rekt CEO");
      expect(await ceoToken.symbol()).to.equal("CEO");
    });

    it("Should set correct collection names", async function () {
      expect(await pfpCollection.name()).to.equal("Rekt CEO PFPs");
      expect(await pfpCollection.symbol()).to.equal("RCPFP");
      expect(await memeCollection.name()).to.equal("Rekt CEO Memes");
      expect(await memeCollection.symbol()).to.equal("RCMEME");
    });
  });

  describe("CEO Token", function () {
    it("Should have correct max supply", async function () {
      const maxSupply = await ceoToken.MAX_SUPPLY();
      expect(maxSupply).to.equal(ethers.parseEther("21000000"));
    });

    it("Should mint initial supply to owner", async function () {
      const totalSupply = await ceoToken.totalSupply();
      const expectedSupply = (await ceoToken.MAX_SUPPLY() * BigInt(97)) / BigInt(100);
      expect(totalSupply).to.equal(expectedSupply);
    });

    it("Should allow setting dev wallet", async function () {
      await ceoToken.setDevWallet(user1.address);
      expect(await ceoToken.devWallet()).to.equal(user1.address);
    });
  });

  describe("NFT Collections", function () {
    it("Should have correct max supplies", async function () {
      expect(await pfpCollection.MAX_SUPPLY()).to.equal(999);
      expect(await memeCollection.MAX_SUPPLY()).to.equal(9999);
    });

    it("Should have correct mint limits", async function () {
      expect(await pfpCollection.MAX_MINT_PER_USER()).to.equal(2);
      expect(await memeCollection.MAX_MINT_PER_USER()).to.equal(9);
    });

    it("Should start with token ID 1", async function () {
      expect(await pfpCollection.getCurrentTokenId()).to.equal(1);
      expect(await memeCollection.getCurrentTokenId()).to.equal(1);
    });
  });

  describe("Minter Contract", function () {
    it("Should have correct CEO price", async function () {
      const ceoPrice = await minterContract.queryCEOPriceFromDEX();
      expect(ceoPrice).to.equal(BigInt(567000)); // Mock price: 0.567 USDC (6 decimals)
    });

    it("Should have default tiers with supply limits", async function () {
      const pfpTier1 = await minterContract.tiers(0, 1); // PFP tier 1
      expect(pfpTier1.priceUSD).to.equal(BigInt(50 * 1e6)); // $50 in USDC decimals (6)
      expect(pfpTier1.supplyLimit).to.equal(500);
      expect(pfpTier1.startSupply).to.equal(0);

      const memeTier1 = await minterContract.tiers(1, 1); // MEME tier 1
      expect(memeTier1.priceUSD).to.equal(BigInt(5 * 1e6)); // $5 in USDC decimals (6)
      expect(memeTier1.supplyLimit).to.equal(5000);
      expect(memeTier1.startSupply).to.equal(0);
    });

    it("Should calculate correct prices", async function () {
      const [, , pfpPrice] = await minterContract.getCurrentTierInfo(0); // PFP - extract priceCEO
      // $50 (50 * 10^6 USDC) * 10^18 CEO decimals / 567000 USDC per CEO = ~88.18 CEO tokens (in 18 decimals)
      const expectedPfpPrice = (BigInt(50 * 1e6) * ethers.parseEther("1")) / BigInt(567000);
      expect(pfpPrice).to.equal(expectedPfpPrice);

      const [, , memePrice] = await minterContract.getCurrentTierInfo(1); // MEME - extract priceCEO
      // $5 (5 * 10^6 USDC) * 10^18 CEO decimals / 567000 USDC per CEO = ~8.818 CEO tokens (in 18 decimals)
      const expectedMemePrice = (BigInt(5 * 1e6) * ethers.parseEther("1")) / BigInt(567000);
      expect(memePrice).to.equal(expectedMemePrice);
    });
  });

  describe("Basic Minting Flow", function () {
    beforeEach(async function () {
      // Owner already has CEO tokens from deployment, just need to approve
      await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("1000"));
    });

    it("Should allow minting PFP NFT", async function () {
      const metadataURI = "https://example.com/pfp/metadata/1";

      // Owner (who has APPROVER_ROLE) calls mintNFT for owner
      await minterContract.mintNFT(0, metadataURI);

      expect(await pfpCollection.ownerOf(1)).to.equal(owner.address);
      expect(await pfpCollection.tokenURI(1)).to.equal(metadataURI);
    });

    it("Should allow minting Meme NFT", async function () {
      const metadataURI = "https://example.com/meme/metadata/1";

      // Owner (who has APPROVER_ROLE) calls mintNFT for owner
      await minterContract.mintNFT(1, metadataURI);

      expect(await memeCollection.ownerOf(1)).to.equal(owner.address);
      expect(await memeCollection.tokenURI(1)).to.equal(metadataURI);
    });

    it("Should enforce mint limits", async function () {
      const metadataURI = "https://example.com/pfp/metadata/";

      // Mint 2 PFPs (max limit) - owner calls for owner
      await minterContract.mintNFT(0, metadataURI + "1");
      await minterContract.mintNFT(0, metadataURI + "2");

      // Try to mint third (should fail)
      await expect(minterContract.mintNFT(0, metadataURI + "3"))
        .to.be.revertedWith("NFTCollection: User mint limit reached");
    });
  });
});
