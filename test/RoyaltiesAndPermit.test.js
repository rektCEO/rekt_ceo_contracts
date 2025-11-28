const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Royalties, Price Update, and Swap Config", function () {
  let ceoToken, pfp, meme, minter, usdc, owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const CEOToken = await ethers.getContractFactory("CEOToken");
    ceoToken = await CEOToken.deploy(owner.address);
    await ceoToken.waitForDeployment();

    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    pfp = await NFTCollection.deploy("PFP", "PFP", owner.address, owner.address, 999, 2, 210);
    await pfp.waitForDeployment();

    meme = await NFTCollection.deploy("MEME", "MEME", owner.address, owner.address, 9999, 9, 210);
    await meme.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("MockUSDC", "USDC");
    await usdc.waitForDeployment();

    const Minter = await ethers.getContractFactory("MinterContract");
    minter = await Minter.deploy(
      await ceoToken.getAddress(),
      await pfp.getAddress(),
      await meme.getAddress(),
      await usdc.getAddress(),
      owner.address,
      owner.address
    );
    await minter.waitForDeployment();

    // Deploy Mock Uniswap Router
    const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
    const mockRouter = await MockUniswapRouter.deploy();
    await mockRouter.waitForDeployment();

    // Configure Uniswap router in MinterContract
    const swapPath = [await ceoToken.getAddress(), await usdc.getAddress()];
    await minter.setUniswapConfig(await mockRouter.getAddress(), swapPath, 100); // 1% slippage

    await pfp.setMinterContract(await minter.getAddress());
    await meme.setMinterContract(await minter.getAddress());
    await minter.grantRole(await minter.APPROVER_ROLE(), owner.address);
  });

  it("should return ERC-2981 royalty info from PFP", async function () {
    await ceoToken.approve(await minter.getAddress(), ethers.parseEther("1000"));
    await minter.mintNFT(0, "ipfs://pfp/1");
    const info = await pfp.royaltyInfo(1, ethers.parseEther("100"));
    expect(info[0]).to.equal(owner.address);
    expect(info[1]).to.equal(ethers.parseEther("2.1"));
  });

  it("should return correct CEO price from mock oracle", async function () {
    const ceoPrice = await minter.queryCEOPriceFromDEX();
    expect(ceoPrice).to.equal(BigInt(567000)); // Mock price: 0.567 USDC (6 decimals)
  });

  it("should emit swap event when USDC swap is enabled", async function () {
    await ceoToken.approve(await minter.getAddress(), ethers.parseEther("1000"));
    await expect(minter.mintNFT(1, "ipfs://meme/1")).to.emit(minter, "CEOToUSDC");
  });
});


