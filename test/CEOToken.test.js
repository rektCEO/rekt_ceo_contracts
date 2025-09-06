const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CEOToken", function () {
  let ceoToken;
  let owner;
  let devWallet;
  let user1;
  let user2;

  const MAX_SUPPLY = ethers.parseEther("21000000"); // 21 million tokens
  const DEV_ALLOCATION_PERCENTAGE = 3; // 3%
  const DEV_ALLOCATION = (MAX_SUPPLY * BigInt(DEV_ALLOCATION_PERCENTAGE)) / BigInt(100);
  const COMMUNITY_SUPPLY = (MAX_SUPPLY * BigInt(97)) / BigInt(100);

  beforeEach(async function () {
    [owner, devWallet, user1, user2] = await ethers.getSigners();

    const CEOToken = await ethers.getContractFactory("CEOToken");
    ceoToken = await CEOToken.deploy(owner.address);
    await ceoToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await ceoToken.name()).to.equal("Rekt CEO");
      expect(await ceoToken.symbol()).to.equal("CEO");
    });

    it("Should set the correct owner", async function () {
      expect(await ceoToken.owner()).to.equal(owner.address);
    });

    it("Should mint 97% of supply to owner", async function () {
      expect(await ceoToken.totalSupply()).to.equal(COMMUNITY_SUPPLY);
      expect(await ceoToken.balanceOf(owner.address)).to.equal(COMMUNITY_SUPPLY);
    });

    it("Should have correct max supply", async function () {
      expect(await ceoToken.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });

    it("Should have correct dev allocation percentage", async function () {
      expect(await ceoToken.DEV_ALLOCATION_PERCENTAGE()).to.equal(DEV_ALLOCATION_PERCENTAGE);
    });
  });

  describe("Dev Wallet Management", function () {
    it("Should allow owner to set dev wallet", async function () {
      await ceoToken.setDevWallet(devWallet.address);
      expect(await ceoToken.devWallet()).to.equal(devWallet.address);
      expect(await ceoToken.devAllocation()).to.equal(DEV_ALLOCATION);
    });

    it("Should not allow setting dev wallet twice", async function () {
      await ceoToken.setDevWallet(devWallet.address);
      await expect(ceoToken.setDevWallet(user1.address))
        .to.be.revertedWith("CEOToken: Dev wallet already set");
    });

    it("Should not allow setting zero address as dev wallet", async function () {
      await expect(ceoToken.setDevWallet(ethers.ZeroAddress))
        .to.be.revertedWith("CEOToken: Invalid dev wallet address");
    });

    it("Should not allow non-owner to set dev wallet", async function () {
      await expect(ceoToken.connect(user1).setDevWallet(devWallet.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Dev Allocation Minting", function () {
    beforeEach(async function () {
      await ceoToken.setDevWallet(devWallet.address);
    });

    it("Should allow owner to mint dev allocation", async function () {
      await ceoToken.mintDevAllocation();
      expect(await ceoToken.balanceOf(devWallet.address)).to.equal(DEV_ALLOCATION);
      expect(await ceoToken.totalSupply()).to.equal(MAX_SUPPLY);
      expect(await ceoToken.devAllocationMinted()).to.be.true;
    });

    it("Should not allow minting dev allocation twice", async function () {
      await ceoToken.mintDevAllocation();
      await expect(ceoToken.mintDevAllocation())
        .to.be.revertedWith("CEOToken: Dev allocation already minted");
    });

    it("Should not allow minting before dev wallet is set", async function () {
      const CEOToken = await ethers.getContractFactory("CEOToken");
      const newCeoToken = await CEOToken.deploy(owner.address);
      await newCeoToken.deployed();

      await expect(newCeoToken.mintDevAllocation())
        .to.be.revertedWith("CEOToken: Dev wallet not set");
    });

    it("Should not allow non-owner to mint dev allocation", async function () {
      await expect(ceoToken.connect(user1).mintDevAllocation())
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Dev Allocation Lock", function () {
    beforeEach(async function () {
      await ceoToken.setDevWallet(devWallet.address);
      await ceoToken.mintDevAllocation();
    });

    it("Should prevent dev wallet from transferring during lock period", async function () {
      await expect(ceoToken.connect(devWallet).transfer(user1.address, ethers.parseEther("1000")))
        .to.be.revertedWith("CEOToken: Dev allocation is locked for 3 years");
    });

    it("Should allow dev wallet to transfer after lock period", async function () {
      // Fast forward time by 3 years + 1 day
      await ethers.provider.send("evm_increaseTime", [3 * 365 * 24 * 60 * 60 + 86400]);
      await ethers.provider.send("evm_mine");

      await ceoToken.connect(devWallet).transfer(user1.address, ethers.parseEther("1000"));
      expect(await ceoToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should correctly report lock status", async function () {
      expect(await ceoToken.isDevAllocationLocked()).to.be.true;

      // Fast forward time by 3 years + 1 day
      await ethers.provider.send("evm_increaseTime", [3 * 365 * 24 * 60 * 60 + 86400]);
      await ethers.provider.send("evm_mine");

      expect(await ceoToken.isDevAllocationLocked()).to.be.false;
    });
  });

  describe("Token Recovery", function () {
    it("Should allow owner to recover stuck ETH", async function () {
      // Send ETH to contract
      await user1.sendTransaction({
        to: await ceoToken.getAddress(),
        value: ethers.parseEther("1")
      });

      const balanceBefore = await owner.provider.getBalance(owner.address);
      await ceoToken.recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1"));
      const balanceAfter = await owner.provider.getBalance(owner.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should allow owner to recover stuck ERC-20 tokens", async function () {
      // Deploy a mock ERC-20 token
      const MockToken = await ethers.getContractFactory("MockERC20");
      const mockToken = await MockToken.deploy("Mock Token", "MOCK");
      await mockToken.waitForDeployment();

      // Send tokens to CEO contract
      await mockToken.transfer(await ceoToken.getAddress(), ethers.parseEther("1000"));

      await ceoToken.recoverStuckTokens(await mockToken.getAddress(), ethers.parseEther("1000"));
      expect(await mockToken.balanceOf(owner.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should not allow recovering CEO tokens", async function () {
      await expect(ceoToken.recoverStuckTokens(await ceoToken.getAddress(), ethers.parseEther("1000")))
        .to.be.revertedWith("CEOToken: Cannot recover CEO tokens");
    });

    it("Should not allow non-owner to recover tokens", async function () {
      await expect(ceoToken.connect(user1).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1")))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Permit Functionality", function () {
    it("Should support permit function", async function () {
      const domain = {
        name: "Rekt CEO",
        version: "1",
        chainId: await owner.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await ceoToken.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        owner: owner.address,
        spender: user1.address,
        value: ethers.parseEther("1000"),
        nonce: await ceoToken.nonces(owner.address),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await ceoToken.permit(
        owner.address,
        user1.address,
        ethers.parseEther("1000"),
        value.deadline,
        v,
        r,
        s
      );

      expect(await ceoToken.allowance(owner.address, user1.address))
        .to.equal(ethers.parseEther("1000"));
    });
  });
});

// Mock ERC-20 contract for testing
contract("MockERC20", function () {
  // This would be a separate contract file in a real project
});
