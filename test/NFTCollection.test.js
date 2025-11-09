const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTCollection", function () {
  let owner;
  let minter;
  let user1;
  let user2;

  // Test with both PFP and Meme configurations
  const testConfigs = [
    {
      name: "PFP Collection",
      collectionName: "Rekt CEO PFPs",
      collectionSymbol: "RCPFP",
      maxSupply: 999,
      maxMintPerUser: 2,
      royaltyPercentage: 210 // 2.1% total
    },
    {
      name: "Meme Collection",
      collectionName: "Rekt CEO Memes",
      collectionSymbol: "RCMEME",
      maxSupply: 9999,
      maxMintPerUser: 9,
      royaltyPercentage: 210 // 2.1% total
    }
  ];

  testConfigs.forEach(config => {
    describe(`${config.name}`, function () {
      let nftCollection;

      beforeEach(async function () {
        [owner, minter, user1, user2] = await ethers.getSigners();

        const NFTCollection = await ethers.getContractFactory("NFTCollection");
        nftCollection = await NFTCollection.deploy(
          config.collectionName,
          config.collectionSymbol,
          owner.address,
          owner.address,
          config.maxSupply,
          config.maxMintPerUser,
          config.royaltyPercentage
        );
        await nftCollection.waitForDeployment();
      });

      describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
          expect(await nftCollection.name()).to.equal(config.collectionName);
          expect(await nftCollection.symbol()).to.equal(config.collectionSymbol);
        });

        it("Should set the correct admin role", async function () {
          expect(await nftCollection.hasRole(await nftCollection.ADMIN_ROLE(), owner.address)).to.be.true;
        });

        it("Should have correct max supply", async function () {
          expect(await nftCollection.MAX_SUPPLY()).to.equal(config.maxSupply);
        });

        it("Should have correct max mint per user", async function () {
          expect(await nftCollection.MAX_MINT_PER_USER()).to.equal(config.maxMintPerUser);
        });

        it("Should start with token ID 1", async function () {
          expect(await nftCollection.getCurrentTokenId()).to.equal(1);
        });

        it("Should reject zero admin address", async function () {
          const NFTCollection = await ethers.getContractFactory("NFTCollection");
          await expect(
            NFTCollection.deploy(
              config.collectionName,
              config.collectionSymbol,
              ethers.ZeroAddress,
              owner.address,
              config.maxSupply,
              config.maxMintPerUser,
              config.royaltyPercentage
            )
          ).to.be.revertedWith("NFTCollection: Invalid admin address");
        });

        it("Should reject zero safe wallet address", async function () {
          const NFTCollection = await ethers.getContractFactory("NFTCollection");
          await expect(
            NFTCollection.deploy(
              config.collectionName,
              config.collectionSymbol,
              owner.address,
              ethers.ZeroAddress,
              config.maxSupply,
              config.maxMintPerUser,
              config.royaltyPercentage
            )
          ).to.be.revertedWith("NFTCollection: Invalid Safe wallet address");
        });

        it("Should reject zero max supply", async function () {
          const NFTCollection = await ethers.getContractFactory("NFTCollection");
          await expect(
            NFTCollection.deploy(
              config.collectionName,
              config.collectionSymbol,
              owner.address,
              owner.address,
              0,
              config.maxMintPerUser,
              config.royaltyPercentage
            )
          ).to.be.revertedWith("NFTCollection: Max supply must be greater than 0");
        });

        it("Should reject zero max mint per user", async function () {
          const NFTCollection = await ethers.getContractFactory("NFTCollection");
          await expect(
            NFTCollection.deploy(
              config.collectionName,
              config.collectionSymbol,
              owner.address,
              owner.address,
              config.maxSupply,
              0,
              config.royaltyPercentage
            )
          ).to.be.revertedWith("NFTCollection: Max mint per user must be greater than 0");
        });

        it("Should reject royalty percentage over 10%", async function () {
          const NFTCollection = await ethers.getContractFactory("NFTCollection");
          await expect(
            NFTCollection.deploy(
              config.collectionName,
              config.collectionSymbol,
              owner.address,
              owner.address,
              config.maxSupply,
              config.maxMintPerUser,
              1001 // Over 10%
            )
          ).to.be.revertedWith("NFTCollection: Royalty percentage too high");
        });

        it("Should reject odd royalty percentage", async function () {
          const NFTCollection = await ethers.getContractFactory("NFTCollection");
          await expect(
            NFTCollection.deploy(
              config.collectionName,
              config.collectionSymbol,
              owner.address,
              owner.address,
              config.maxSupply,
              config.maxMintPerUser,
              301 // Odd number, can't split 50/50
            )
          ).to.be.revertedWith("NFTCollection: Total percentage must be even for 50/50 split");
        });
      });

      describe("Minter Contract Management", function () {
        it("Should allow admin to set minter contract", async function () {
          await nftCollection.setMinterContract(minter.address);
          expect(await nftCollection.minterContract()).to.equal(minter.address);
          expect(await nftCollection.hasRole(await nftCollection.MINTER_ROLE(), minter.address)).to.be.true;
        });

        it("Should not allow setting zero address as minter", async function () {
          await expect(nftCollection.setMinterContract(ethers.ZeroAddress))
            .to.be.revertedWith("NFTCollection: Invalid minter contract address");
        });

        it("Should not allow non-admin to set minter contract", async function () {
          await expect(nftCollection.connect(user1).setMinterContract(minter.address))
            .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await nftCollection.ADMIN_ROLE());
        });
      });

      describe("NFT Minting", function () {
        beforeEach(async function () {
          await nftCollection.setMinterContract(minter.address);
        });

        it("Should allow minter to mint NFT", async function () {
          const metadataURI = "https://example.com/metadata/1";
          
          await nftCollection.connect(minter).mintForUser(user1.address, metadataURI);
          
          expect(await nftCollection.ownerOf(1)).to.equal(user1.address);
          expect(await nftCollection.tokenURI(1)).to.equal(metadataURI);
          expect(await nftCollection.getCurrentTokenId()).to.equal(2);
          expect(await nftCollection.userMintCount(user1.address)).to.equal(1);
        });

        it("Should not allow minting to zero address", async function () {
          await expect(nftCollection.connect(minter).mintForUser(ethers.ZeroAddress, "metadata"))
            .to.be.revertedWith("NFTCollection: Cannot mint to zero address");
        });

        it("Should enforce user mint limit", async function () {
          const metadataURI = "https://example.com/metadata/";
          
          // Mint up to the limit
          for (let i = 1; i <= config.maxMintPerUser; i++) {
            await nftCollection.connect(minter).mintForUser(user1.address, metadataURI + i);
            expect(await nftCollection.userMintCount(user1.address)).to.equal(i);
          }
          
          // Try to mint one more (should fail)
          await expect(nftCollection.connect(minter).mintForUser(user1.address, metadataURI + (config.maxMintPerUser + 1)))
            .to.be.revertedWith("NFTCollection: User mint limit reached");
        });

        it("Should not allow non-minter to mint", async function () {
          await expect(nftCollection.connect(user1).mintForUser(user2.address, "metadata"))
            .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await nftCollection.MINTER_ROLE());
        });

        it("Should track token creators correctly", async function () {
          await nftCollection.connect(minter).mintForUser(user1.address, "metadata1");
          await nftCollection.connect(minter).mintForUser(user2.address, "metadata2");
          
          expect(await nftCollection.getTokenCreator(1)).to.equal(user1.address);
          expect(await nftCollection.getTokenCreator(2)).to.equal(user2.address);
        });
      });

      describe("View Functions", function () {
        beforeEach(async function () {
          await nftCollection.setMinterContract(minter.address);
        });

        it("Should return correct remaining supply", async function () {
          expect(await nftCollection.getRemainingSupply()).to.equal(config.maxSupply);
          
          // Mint one NFT
          await nftCollection.connect(minter).mintForUser(user1.address, "metadata");
          expect(await nftCollection.getRemainingSupply()).to.equal(config.maxSupply - 1);
        });

        it("Should correctly check if user can mint", async function () {
          expect(await nftCollection.canUserMint(user1.address)).to.be.true;
          
          // Mint up to limit
          for (let i = 1; i <= config.maxMintPerUser; i++) {
            await nftCollection.connect(minter).mintForUser(user1.address, `metadata${i}`);
          }
          
          expect(await nftCollection.canUserMint(user1.address)).to.be.false;
        });

        it("Should return correct user mint count", async function () {
          expect(await nftCollection.getUserMintCount(user1.address)).to.equal(0);
          
          await nftCollection.connect(minter).mintForUser(user1.address, "metadata1");
          expect(await nftCollection.getUserMintCount(user1.address)).to.equal(1);
          
          await nftCollection.connect(minter).mintForUser(user1.address, "metadata2");
          expect(await nftCollection.getUserMintCount(user1.address)).to.equal(2);
        });
      });

      describe("ERC721 Functionality", function () {
        beforeEach(async function () {
          await nftCollection.setMinterContract(minter.address);
          await nftCollection.connect(minter).mintForUser(user1.address, "https://example.com/metadata/1");
        });

        it("Should support ERC721Enumerable", async function () {
          expect(await nftCollection.totalSupply()).to.equal(1);
          expect(await nftCollection.tokenByIndex(0)).to.equal(1);
          expect(await nftCollection.tokenOfOwnerByIndex(user1.address, 0)).to.equal(1);
        });

        it("Should allow token transfers", async function () {
          await nftCollection.connect(user1).transferFrom(user1.address, user2.address, 1);
          expect(await nftCollection.ownerOf(1)).to.equal(user2.address);
        });

        it("Should support approval", async function () {
          await nftCollection.connect(user1).approve(user2.address, 1);
          expect(await nftCollection.getApproved(1)).to.equal(user2.address);
        });

        it("Should support setApprovalForAll", async function () {
          await nftCollection.connect(user1).setApprovalForAll(user2.address, true);
          expect(await nftCollection.isApprovedForAll(user1.address, user2.address)).to.be.true;
        });
      });

      describe("Royalty Management", function () {
        beforeEach(async function () {
          await nftCollection.setMinterContract(minter.address);
          await nftCollection.connect(minter).mintForUser(user1.address, "metadata");
        });

        it("Should return correct royalty info", async function () {
          const salePrice = ethers.parseEther("100");
          const [receiver, royaltyAmount] = await nftCollection.royaltyInfo(1, salePrice);
          
          expect(receiver).to.equal(owner.address);
          expect(royaltyAmount).to.equal(ethers.parseEther("100") * 210n / 10000n); // 2.1%
        });

        it("Should allow admin to update royalty info", async function () {
          await nftCollection.updateRoyaltyInfo(user2.address, 400); // 4%
          
          const salePrice = ethers.parseEther("100");
          const [receiver, royaltyAmount] = await nftCollection.royaltyInfo(1, salePrice);
          
          expect(receiver).to.equal(user2.address);
          expect(royaltyAmount).to.equal(ethers.parseEther("100") * 400n / 10000n); // 4%
        });

        it("Should return correct split royalty info", async function () {
          const salePrice = ethers.parseEther("100");
          const [adminReceiver, creatorReceiver, adminAmount, creatorAmount] = 
            await nftCollection.getSplitRoyaltyInfo(1, salePrice);
          
          expect(adminReceiver).to.equal(owner.address);
          expect(creatorReceiver).to.equal(user1.address);
          expect(adminAmount).to.equal(ethers.parseEther("100") * 105n / 10000n); // 1.05%
          expect(creatorAmount).to.equal(ethers.parseEther("100") * 105n / 10000n); // 1.05%
        });

        it("Should not allow royalty percentage over 10%", async function () {
          await expect(nftCollection.updateRoyaltyInfo(owner.address, 1001))
            .to.be.revertedWith("NFTCollection: Royalty percentage too high");
        });

        it("Should require even total percentage for 50/50 split", async function () {
          await expect(nftCollection.updateRoyaltyInfo(owner.address, 301))
            .to.be.revertedWith("NFTCollection: Total percentage must be even for 50/50 split");
        });
      });

      describe("Access Control", function () {
        it("Should support role-based access control", async function () {
          expect(await nftCollection.hasRole(await nftCollection.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
          expect(await nftCollection.hasRole(await nftCollection.ADMIN_ROLE(), owner.address)).to.be.true;
        });

        it("Should support interface detection", async function () {
          // ERC721 interface
          expect(await nftCollection.supportsInterface("0x80ac58cd")).to.be.true;
          // ERC721Enumerable interface
          expect(await nftCollection.supportsInterface("0x780e9d63")).to.be.true;
          // AccessControl interface
          expect(await nftCollection.supportsInterface("0x7965db0b")).to.be.true;
          // ERC2981 interface
          expect(await nftCollection.supportsInterface("0x2a55205a")).to.be.true;
        });
      });

      describe("Safe Wallet Management", function () {
        it("Should allow admin to update safe wallet", async function () {
          await nftCollection.setSafeWallet(user1.address);
          expect(await nftCollection.safeWallet()).to.equal(user1.address);
        });

        it("Should not allow setting zero address as safe wallet", async function () {
          await expect(nftCollection.setSafeWallet(ethers.ZeroAddress))
            .to.be.revertedWith("NFTCollection: Invalid Safe wallet address");
        });

        it("Should not allow non-admin to set safe wallet", async function () {
          await expect(nftCollection.connect(user1).setSafeWallet(user2.address))
            .to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await nftCollection.ADMIN_ROLE());
        });
      });

      describe("Multiple Users Minting", function () {
        beforeEach(async function () {
          await nftCollection.setMinterContract(minter.address);
        });

        it("Should allow multiple users to mint independently", async function () {
          const metadataURI = "https://example.com/metadata/";
          
          // User1 mints half of their limit
          const user1Mints = Math.min(3, config.maxMintPerUser);
          for (let i = 1; i <= user1Mints; i++) {
            await nftCollection.connect(minter).mintForUser(user1.address, metadataURI + `user1_${i}`);
          }
          
          // User2 mints all of their limit
          for (let i = 1; i <= config.maxMintPerUser; i++) {
            await nftCollection.connect(minter).mintForUser(user2.address, metadataURI + `user2_${i}`);
          }
          
          expect(await nftCollection.getUserMintCount(user1.address)).to.equal(user1Mints);
          expect(await nftCollection.getUserMintCount(user2.address)).to.equal(config.maxMintPerUser);
          expect(await nftCollection.totalSupply()).to.equal(user1Mints + config.maxMintPerUser);
        });
      });
    });
  });
});

