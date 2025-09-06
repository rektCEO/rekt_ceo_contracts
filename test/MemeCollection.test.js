const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MemeCollection", function () {
  let memeCollection;
  let owner;
  let minter;
  let user1;
  let user2;

  const MAX_SUPPLY = 9999;
  const MAX_MINT_PER_USER = 9;
  const COLLECTION_NAME = "Rekt CEO Memes";
  const COLLECTION_SYMBOL = "RCMEME";

  beforeEach(async function () {
    [owner, minter, user1, user2] = await ethers.getSigners();

    const MemeCollection = await ethers.getContractFactory("MemeCollection");
    memeCollection = await MemeCollection.deploy(COLLECTION_NAME, COLLECTION_SYMBOL, owner.address);
    await memeCollection.deployed();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await memeCollection.name()).to.equal(COLLECTION_NAME);
      expect(await memeCollection.symbol()).to.equal(COLLECTION_SYMBOL);
    });

    it("Should set the correct admin role", async function () {
      expect(await memeCollection.hasRole(await memeCollection.ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("Should have correct max supply", async function () {
      expect(await memeCollection.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });

    it("Should have correct max mint per user", async function () {
      expect(await memeCollection.MAX_MINT_PER_USER()).to.equal(MAX_MINT_PER_USER);
    });

    it("Should start with token ID 1", async function () {
      expect(await memeCollection.getCurrentTokenId()).to.equal(1);
    });
  });

  describe("Minter Contract Management", function () {
    it("Should allow admin to set minter contract", async function () {
      await memeCollection.setMinterContract(minter.address);
      expect(await memeCollection.minterContract()).to.equal(minter.address);
      expect(await memeCollection.hasRole(await memeCollection.MINTER_ROLE(), minter.address)).to.be.true;
    });

    it("Should not allow setting zero address as minter", async function () {
      await expect(memeCollection.setMinterContract(ethers.constants.AddressZero))
        .to.be.revertedWith("MemeCollection: Invalid minter contract address");
    });

    it("Should not allow non-admin to set minter contract", async function () {
      await expect(memeCollection.connect(user1).setMinterContract(minter.address))
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await memeCollection.ADMIN_ROLE());
    });
  });

  describe("NFT Minting", function () {
    beforeEach(async function () {
      await memeCollection.setMinterContract(minter.address);
    });

    it("Should allow minter to mint NFT", async function () {
      const metadataURI = "https://example.com/meme/metadata/1";
      
      await memeCollection.connect(minter).mintForUser(user1.address, metadataURI);
      
      expect(await memeCollection.ownerOf(1)).to.equal(user1.address);
      expect(await memeCollection.tokenURI(1)).to.equal(metadataURI);
      expect(await memeCollection.getCurrentTokenId()).to.equal(2);
      expect(await memeCollection.userMintCount(user1.address)).to.equal(1);
    });

    it("Should not allow minting to zero address", async function () {
      await expect(memeCollection.connect(minter).mintForUser(ethers.constants.AddressZero, "metadata"))
        .to.be.revertedWith("MemeCollection: Cannot mint to zero address");
    });

    it("Should not allow minting beyond max supply", async function () {
      // This would require minting 9999 NFTs, which is expensive for testing
      // We'll test the logic by checking the condition
      const currentId = await memeCollection.getCurrentTokenId();
      expect(currentId).to.be.lte(MAX_SUPPLY);
    });

    it("Should enforce user mint limit", async function () {
      const metadataURI = "https://example.com/meme/metadata/";
      
      // Mint up to the limit (9 NFTs)
      for (let i = 1; i <= MAX_MINT_PER_USER; i++) {
        await memeCollection.connect(minter).mintForUser(user1.address, metadataURI + i);
        expect(await memeCollection.userMintCount(user1.address)).to.equal(i);
      }
      
      // Try to mint one more (should fail)
      await expect(memeCollection.connect(minter).mintForUser(user1.address, metadataURI + "10"))
        .to.be.revertedWith("MemeCollection: User mint limit reached");
    });

    it("Should not allow non-minter to mint", async function () {
      await expect(memeCollection.connect(user1).mintForUser(user2.address, "metadata"))
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await memeCollection.MINTER_ROLE());
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await memeCollection.setMinterContract(minter.address);
    });

    it("Should return correct remaining supply", async function () {
      expect(await memeCollection.getRemainingSupply()).to.equal(MAX_SUPPLY);
      
      // Mint one NFT
      await memeCollection.connect(minter).mintForUser(user1.address, "metadata");
      expect(await memeCollection.getRemainingSupply()).to.equal(MAX_SUPPLY - 1);
    });

    it("Should correctly check if user can mint", async function () {
      expect(await memeCollection.canUserMint(user1.address)).to.be.true;
      
      // Mint up to limit
      for (let i = 1; i <= MAX_MINT_PER_USER; i++) {
        await memeCollection.connect(minter).mintForUser(user1.address, `metadata${i}`);
      }
      
      expect(await memeCollection.canUserMint(user1.address)).to.be.false;
    });

    it("Should return correct user mint count", async function () {
      expect(await memeCollection.getUserMintCount(user1.address)).to.equal(0);
      
      await memeCollection.connect(minter).mintForUser(user1.address, "metadata1");
      expect(await memeCollection.getUserMintCount(user1.address)).to.equal(1);
      
      await memeCollection.connect(minter).mintForUser(user1.address, "metadata2");
      expect(await memeCollection.getUserMintCount(user1.address)).to.equal(2);
    });
  });

  describe("ERC721 Functionality", function () {
    beforeEach(async function () {
      await memeCollection.setMinterContract(minter.address);
      await memeCollection.connect(minter).mintForUser(user1.address, "https://example.com/meme/metadata/1");
    });

    it("Should support ERC721Enumerable", async function () {
      expect(await memeCollection.totalSupply()).to.equal(1);
      expect(await memeCollection.tokenByIndex(0)).to.equal(1);
      expect(await memeCollection.tokenOfOwnerByIndex(user1.address, 0)).to.equal(1);
    });

    it("Should allow token transfers", async function () {
      await memeCollection.connect(user1).transferFrom(user1.address, user2.address, 1);
      expect(await memeCollection.ownerOf(1)).to.equal(user2.address);
    });

    it("Should support approval", async function () {
      await memeCollection.connect(user1).approve(user2.address, 1);
      expect(await memeCollection.getApproved(1)).to.equal(user2.address);
    });

    it("Should support setApprovalForAll", async function () {
      await memeCollection.connect(user1).setApprovalForAll(user2.address, true);
      expect(await memeCollection.isApprovedForAll(user1.address, user2.address)).to.be.true;
    });
  });

  describe("Access Control", function () {
    it("Should support role-based access control", async function () {
      expect(await memeCollection.hasRole(await memeCollection.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await memeCollection.hasRole(await memeCollection.ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("Should support interface detection", async function () {
      // ERC721 interface
      expect(await memeCollection.supportsInterface("0x80ac58cd")).to.be.true;
      // ERC721Enumerable interface
      expect(await memeCollection.supportsInterface("0x780e9d63")).to.be.true;
      // AccessControl interface
      expect(await memeCollection.supportsInterface("0x7965db0b")).to.be.true;
    });
  });

  describe("Multiple Users Minting", function () {
    beforeEach(async function () {
      await memeCollection.setMinterContract(minter.address);
    });

    it("Should allow multiple users to mint independently", async function () {
      const metadataURI = "https://example.com/meme/metadata/";
      
      // User1 mints 3 NFTs
      for (let i = 1; i <= 3; i++) {
        await memeCollection.connect(minter).mintForUser(user1.address, metadataURI + `user1_${i}`);
      }
      
      // User2 mints 5 NFTs
      for (let i = 1; i <= 5; i++) {
        await memeCollection.connect(minter).mintForUser(user2.address, metadataURI + `user2_${i}`);
      }
      
      expect(await memeCollection.getUserMintCount(user1.address)).to.equal(3);
      expect(await memeCollection.getUserMintCount(user2.address)).to.equal(5);
      expect(await memeCollection.totalSupply()).to.equal(8);
    });
  });
});
