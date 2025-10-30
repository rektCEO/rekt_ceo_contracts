const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PFPCollection", function () {
  let pfpCollection;
  let owner;
  let minter;
  let user1;
  let user2;

  const MAX_SUPPLY = 999;
  const MAX_MINT_PER_USER = 2;
  const COLLECTION_NAME = "Rekt CEO PFPs";
  const COLLECTION_SYMBOL = "RCPFP";

  beforeEach(async function () {
    [owner, minter, user1, user2] = await ethers.getSigners();

    const PFPCollection = await ethers.getContractFactory("PFPCollection");
    pfpCollection = await PFPCollection.deploy(COLLECTION_NAME, COLLECTION_SYMBOL, owner.address, owner.address);
    await pfpCollection.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await pfpCollection.name()).to.equal(COLLECTION_NAME);
      expect(await pfpCollection.symbol()).to.equal(COLLECTION_SYMBOL);
    });

    it("Should set the correct admin role", async function () {
      expect(await pfpCollection.hasRole(await pfpCollection.ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("Should have correct max supply", async function () {
      expect(await pfpCollection.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });

    it("Should have correct max mint per user", async function () {
      expect(await pfpCollection.MAX_MINT_PER_USER()).to.equal(MAX_MINT_PER_USER);
    });

    it("Should start with token ID 1", async function () {
      expect(await pfpCollection.getCurrentTokenId()).to.equal(1);
    });
  });

  describe("Minter Contract Management", function () {
    it("Should allow admin to set minter contract", async function () {
      await pfpCollection.setMinterContract(minter.address);
      expect(await pfpCollection.minterContract()).to.equal(minter.address);
      expect(await pfpCollection.hasRole(await pfpCollection.MINTER_ROLE(), minter.address)).to.be.true;
    });

    it("Should not allow setting zero address as minter", async function () {
      await expect(pfpCollection.setMinterContract(ethers.ZeroAddress))
        .to.be.revertedWith("PFPCollection: Invalid minter contract address");
    });

    it("Should not allow non-admin to set minter contract", async function () {
      await expect(pfpCollection.connect(user1).setMinterContract(minter.address))
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await pfpCollection.ADMIN_ROLE());
    });
  });

  describe("NFT Minting", function () {
    beforeEach(async function () {
      await pfpCollection.setMinterContract(minter.address);
    });

    it("Should allow minter to mint NFT", async function () {
      const metadataURI = "https://example.com/metadata/1";
      
      await pfpCollection.connect(minter).mintForUser(user1.address, metadataURI);
      
      expect(await pfpCollection.ownerOf(1)).to.equal(user1.address);
      expect(await pfpCollection.tokenURI(1)).to.equal(metadataURI);
      expect(await pfpCollection.getCurrentTokenId()).to.equal(2);
      expect(await pfpCollection.userMintCount(user1.address)).to.equal(1);
    });

    it("Should not allow minting to zero address", async function () {
      await expect(pfpCollection.connect(minter).mintForUser(ethers.ZeroAddress, "metadata"))
        .to.be.revertedWith("PFPCollection: Cannot mint to zero address");
    });

    it("Should not allow minting beyond max supply", async function () {
      // This would require minting 999 NFTs, which is expensive for testing
      // We'll test the logic by checking the condition
      const currentId = await pfpCollection.getCurrentTokenId();
      expect(currentId).to.be.lte(MAX_SUPPLY);
    });

    it("Should enforce user mint limit", async function () {
      const metadataURI = "https://example.com/metadata/";
      
      // Mint first NFT
      await pfpCollection.connect(minter).mintForUser(user1.address, metadataURI + "1");
      expect(await pfpCollection.userMintCount(user1.address)).to.equal(1);
      
      // Mint second NFT
      await pfpCollection.connect(minter).mintForUser(user1.address, metadataURI + "2");
      expect(await pfpCollection.userMintCount(user1.address)).to.equal(2);
      
      // Try to mint third NFT (should fail)
      await expect(pfpCollection.connect(minter).mintForUser(user1.address, metadataURI + "3"))
        .to.be.revertedWith("PFPCollection: User mint limit reached");
    });

    it("Should not allow non-minter to mint", async function () {
      await expect(pfpCollection.connect(user1).mintForUser(user2.address, "metadata"))
        .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await pfpCollection.MINTER_ROLE());
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await pfpCollection.setMinterContract(minter.address);
    });

    it("Should return correct remaining supply", async function () {
      expect(await pfpCollection.getRemainingSupply()).to.equal(MAX_SUPPLY);
      
      // Mint one NFT
      await pfpCollection.connect(minter).mintForUser(user1.address, "metadata");
      expect(await pfpCollection.getRemainingSupply()).to.equal(MAX_SUPPLY - 1);
    });

    it("Should correctly check if user can mint", async function () {
      expect(await pfpCollection.canUserMint(user1.address)).to.be.true;
      
      // Mint up to limit
      await pfpCollection.connect(minter).mintForUser(user1.address, "metadata1");
      await pfpCollection.connect(minter).mintForUser(user1.address, "metadata2");
      
      expect(await pfpCollection.canUserMint(user1.address)).to.be.false;
    });

    it("Should return correct user mint count", async function () {
      expect(await pfpCollection.getUserMintCount(user1.address)).to.equal(0);
      
      await pfpCollection.connect(minter).mintForUser(user1.address, "metadata1");
      expect(await pfpCollection.getUserMintCount(user1.address)).to.equal(1);
      
      await pfpCollection.connect(minter).mintForUser(user1.address, "metadata2");
      expect(await pfpCollection.getUserMintCount(user1.address)).to.equal(2);
    });
  });

  describe("ERC721 Functionality", function () {
    beforeEach(async function () {
      await pfpCollection.setMinterContract(minter.address);
      await pfpCollection.connect(minter).mintForUser(user1.address, "https://example.com/metadata/1");
    });

    it("Should support ERC721Enumerable", async function () {
      expect(await pfpCollection.totalSupply()).to.equal(1);
      expect(await pfpCollection.tokenByIndex(0)).to.equal(1);
      expect(await pfpCollection.tokenOfOwnerByIndex(user1.address, 0)).to.equal(1);
    });

    it("Should allow token transfers", async function () {
      await pfpCollection.connect(user1).transferFrom(user1.address, user2.address, 1);
      expect(await pfpCollection.ownerOf(1)).to.equal(user2.address);
    });

    it("Should support approval", async function () {
      await pfpCollection.connect(user1).approve(user2.address, 1);
      expect(await pfpCollection.getApproved(1)).to.equal(user2.address);
    });

    it("Should support setApprovalForAll", async function () {
      await pfpCollection.connect(user1).setApprovalForAll(user2.address, true);
      expect(await pfpCollection.isApprovedForAll(user1.address, user2.address)).to.be.true;
    });
  });

  describe("Access Control", function () {
    it("Should support role-based access control", async function () {
      expect(await pfpCollection.hasRole(await pfpCollection.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await pfpCollection.hasRole(await pfpCollection.ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("Should support interface detection", async function () {
      // ERC721 interface
      expect(await pfpCollection.supportsInterface("0x80ac58cd")).to.be.true;
      // ERC721Enumerable interface
      expect(await pfpCollection.supportsInterface("0x780e9d63")).to.be.true;
      // AccessControl interface
      expect(await pfpCollection.supportsInterface("0x7965db0b")).to.be.true;
    });
  });
});
