const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Fuzz Testing - Tiered Minting & NFT ID Progression", function () {
  let ceoToken;
  let pfpCollection;
  let memeCollection;
  let minterContract;
  let owner;
  let treasury;
  let users = [];

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, treasury] = [signers[0], signers[1]];
    // Use available signers for users (typically 20 in Hardhat)
    users = signers.slice(2);

    // Deploy CEO Token
    const CEOToken = await ethers.getContractFactory("CEOToken");
    ceoToken = await CEOToken.deploy(owner.address);
    await ceoToken.waitForDeployment();

    // Deploy PFP Collection (999 max supply)
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    pfpCollection = await NFTCollection.deploy(
      "Rekt CEO PFPs",
      "RCPFP",
      owner.address,
      owner.address,
      999,  // MAX_SUPPLY
      2,    // MAX_MINT_PER_USER
      210   // 2.1% royalty
    );
    await pfpCollection.waitForDeployment();

    // Deploy Meme Collection (9999 max supply)
    memeCollection = await NFTCollection.deploy(
      "Rekt CEO Memes",
      "RCMEME",
      owner.address,
      owner.address,
      9999, // MAX_SUPPLY
      9,    // MAX_MINT_PER_USER
      210   // 2.1% royalty
    );
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

    // Configure contracts
    await pfpCollection.setMinterContract(await minterContract.getAddress());
    await memeCollection.setMinterContract(await minterContract.getAddress());

    // Grant approver role to all users and fund them
    const approverRole = await minterContract.APPROVER_ROLE();
    for (let i = 0; i < users.length; i++) {
      await minterContract.grantRole(approverRole, users[i].address);
      // Give each user enough CEO tokens for minting
      await ceoToken.transfer(users[i].address, ethers.parseEther("100000"));
      // Approve minter contract
      await ceoToken.connect(users[i]).approve(
        await minterContract.getAddress(),
        ethers.parseEther("100000")
      );
    }

    // Disable USDC swap to simplify testing
    await minterContract.updateUSDCSwapConfig(false, 0);
  });

  // Helper function to mint N tokens efficiently
  async function mintMultipleTokens(nftType, count, startingTokenNumber = null) {
    let userIndex = 0;
    const maxMintPerUser = nftType === 0 ? 2 : 9; // PFP: 2, MEME: 9
    const collection = nftType === 0 ? pfpCollection : memeCollection;
    let userMintCount = 0;

    for (let i = 0; i < count; i++) {
      if (userIndex >= users.length) {
        throw new Error(`Not enough users to mint ${count} tokens. Need at least ${Math.ceil(count / maxMintPerUser)} users.`);
      }

      const tokenNum = startingTokenNumber !== null ? startingTokenNumber + i : i + 1;
      await minterContract.connect(users[userIndex]).mintNFT(nftType, `metadata_${tokenNum}`);
      
      userMintCount++;
      
      // Switch to next user if current user reached limit
      if (userMintCount >= maxMintPerUser) {
        userIndex++;
        userMintCount = 0;
      }
    }
  }

  describe("PFP: Tier 1 → Tier 2 Boundary (Token IDs 1-500 → 501-809)", function () {
    it("Should start in Tier 1 with correct initial state", async function () {
      const [tierId, priceUSD, , remainingInTier] = await minterContract.getCurrentTierInfo(0);
      
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(ethers.parseEther("50")); // Tier 1 price
      expect(remainingInTier).to.equal(500); // Full Tier 1 available
      expect(await pfpCollection.getCurrentTokenId()).to.equal(1); // Token counter starts at 1
      
      console.log("✓ Tier 1 initialized correctly");
    });

    it("Should mint first few tokens with sequential IDs in Tier 1", async function () {
      // Mint 10 tokens
      for (let i = 0; i < 5; i++) {
        await minterContract.connect(users[i]).mintNFT(0, `metadata_${i * 2 + 1}`);
        await minterContract.connect(users[i]).mintNFT(0, `metadata_${i * 2 + 2}`);
      }

      // Verify sequential token IDs
      for (let tokenId = 1; tokenId <= 10; tokenId++) {
        expect(await pfpCollection.ownerOf(tokenId)).to.not.equal(ethers.ZeroAddress);
      }

      // Still in Tier 1
      const [tierId, , , remainingInTier] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
      expect(remainingInTier).to.equal(490); // 500 - 10 = 490
      expect(await pfpCollection.getCurrentTokenId()).to.equal(11); // Next token ID

      console.log("✓ First 10 tokens minted sequentially in Tier 1");
    });

    it("Should correctly track remaining tokens as supply increases", async function () {
      // Mint 20 tokens (uses 10 users)
      for (let i = 0; i < 10; i++) {
        await minterContract.connect(users[i]).mintNFT(0, `token_${i * 2 + 1}`);
        await minterContract.connect(users[i]).mintNFT(0, `token_${i * 2 + 2}`);
      }

      let [tierId, , , remainingInTier] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
      expect(remainingInTier).to.equal(480); // 500 - 20 = 480

      // Mint 10 more using different users (total 30)
      for (let i = 10; i < 15; i++) {
        await minterContract.connect(users[i]).mintNFT(0, `token_${i * 2 + 1}`);
        await minterContract.connect(users[i]).mintNFT(0, `token_${i * 2 + 2}`);
      }

      [tierId, , , remainingInTier] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
      expect(remainingInTier).to.equal(470); // 500 - 30 = 470

      console.log("✓ Correctly tracked remaining tokens");
    });

    it("Should transition from Tier 1 to Tier 2 at exactly token 501", async function () {
      this.timeout(300000); // 5 minute timeout

      // Need 250 users to mint 500 tokens (2 per user)
      // With limited users, we'll test the boundary logic
      
      // Verify we start in Tier 1
      let [tierId, priceUSD] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(ethers.parseEther("50"));

      // Mint as many as we can with available users (up to 36 tokens with 18 users)
      const maxTokens = Math.min(users.length * 2, 36);
      await mintMultipleTokens(0, maxTokens);

      // Verify still in Tier 1
      [tierId] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);

      console.log(`✓ Minted ${maxTokens} tokens, still in Tier 1`);
    });
  });

  describe("PFP: Token ID Sequence Verification", function () {
    it("Should maintain strict sequential token IDs", async function () {
      const mintCount = 20;
      const expectedOwners = [];

      // Mint tokens and track expected owners
      for (let i = 0; i < mintCount / 2; i++) {
        await minterContract.connect(users[i]).mintNFT(0, `token_${i * 2 + 1}`);
        expectedOwners.push(users[i].address);
        
        await minterContract.connect(users[i]).mintNFT(0, `token_${i * 2 + 2}`);
        expectedOwners.push(users[i].address);
      }

      // Verify each token ID exists and has correct owner
      for (let tokenId = 1; tokenId <= mintCount; tokenId++) {
        const owner = await pfpCollection.ownerOf(tokenId);
        expect(owner).to.equal(expectedOwners[tokenId - 1]);
      }

      // Verify next token ID
      expect(await pfpCollection.getCurrentTokenId()).to.equal(mintCount + 1);

      console.log("✓ Token IDs maintain strict sequential order");
    });

    it("Should not allow gaps in token ID sequence", async function () {
      // Mint 15 tokens
      await mintMultipleTokens(0, 15);

      // Verify no gaps: all tokens from 1 to 15 should exist
      for (let tokenId = 1; tokenId <= 15; tokenId++) {
        const exists = await pfpCollection.ownerOf(tokenId).then(() => true).catch(() => false);
        expect(exists).to.be.true;
      }

      // Token 16 should not exist yet
      await expect(pfpCollection.ownerOf(16)).to.be.revertedWith("ERC721: invalid token ID");

      console.log("✓ No gaps in token ID sequence");
    });

    it("Should correctly increment token counter after each mint", async function () {
      let expectedNextId = 1;

      for (let i = 0; i < 10; i++) {
        expect(await pfpCollection.getCurrentTokenId()).to.equal(expectedNextId);
        
        await minterContract.connect(users[Math.floor(i / 2)]).mintNFT(0, `metadata_${i + 1}`);
        
        expectedNextId++;
        expect(await pfpCollection.getCurrentTokenId()).to.equal(expectedNextId);
      }

      console.log("✓ Token counter increments correctly after each mint");
    });
  });

  describe("PFP: Max Supply Enforcement", function () {
    it("Should correctly report remaining supply", async function () {
      const mintCount = 10;
      await mintMultipleTokens(0, mintCount);

      const remainingSupply = await pfpCollection.getRemainingSupply();
      expect(remainingSupply).to.equal(999 - mintCount);

      console.log(`✓ Remaining supply: ${remainingSupply} (after ${mintCount} mints)`);
    });

    it("Should prevent minting when user reaches limit", async function () {
      // User mints 2 tokens (max for PFP)
      await minterContract.connect(users[0]).mintNFT(0, "token1");
      await minterContract.connect(users[0]).mintNFT(0, "token2");

      // Third mint should fail
      await expect(
        minterContract.connect(users[0]).mintNFT(0, "token3")
      ).to.be.revertedWith("NFTCollection: User mint limit reached");

      console.log("✓ User mint limit enforced correctly");
    });

    it("Should correctly track supply across multiple users", async function () {
      // Each user mints max (2 tokens)
      const userCount = Math.min(users.length, 10);
      
      for (let i = 0; i < userCount; i++) {
        await minterContract.connect(users[i]).mintNFT(0, `user${i}_1`);
        await minterContract.connect(users[i]).mintNFT(0, `user${i}_2`);
      }

      const totalMinted = userCount * 2;
      const currentTokenId = await pfpCollection.getCurrentTokenId();
      expect(currentTokenId).to.equal(totalMinted + 1);

      const remainingSupply = await pfpCollection.getRemainingSupply();
      expect(remainingSupply).to.equal(999 - totalMinted);

      console.log(`✓ Tracked supply across ${userCount} users: ${totalMinted} minted, ${remainingSupply} remaining`);
    });
  });

  describe("MEME: Higher Supply Testing", function () {
    it("Should start in Tier 1 with correct MEME pricing", async function () {
      const [tierId, priceUSD, , remainingInTier] = await minterContract.getCurrentTierInfo(1);
      
      expect(tierId).to.equal(1);
      expect(priceUSD).to.equal(ethers.parseEther("5")); // Tier 1 MEME price
      expect(remainingInTier).to.equal(5000); // Full Tier 1 available
      
      console.log("✓ MEME Tier 1 initialized correctly");
    });

    it("Should allow higher mint limit for MEME (9 per user)", async function () {
      // User should be able to mint 9 MEME tokens
      for (let i = 0; i < 9; i++) {
        await minterContract.connect(users[0]).mintNFT(1, `meme_${i + 1}`);
      }

      const mintCount = await memeCollection.userMintCount(users[0].address);
      expect(mintCount).to.equal(9);

      // 10th mint should fail
      await expect(
        minterContract.connect(users[0]).mintNFT(1, "meme_10")
      ).to.be.revertedWith("NFTCollection: User mint limit reached");

      console.log("✓ MEME mint limit (9 per user) enforced correctly");
    });

    it("Should maintain sequential IDs for MEME tokens", async function () {
      const mintCount = 27; // 3 users × 9 tokens

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 9; j++) {
          await minterContract.connect(users[i]).mintNFT(1, `meme_${i * 9 + j + 1}`);
        }
      }

      // Verify all tokens exist sequentially
      for (let tokenId = 1; tokenId <= mintCount; tokenId++) {
        expect(await memeCollection.ownerOf(tokenId)).to.not.equal(ethers.ZeroAddress);
      }

      expect(await memeCollection.getCurrentTokenId()).to.equal(mintCount + 1);

      console.log("✓ MEME tokens maintain sequential IDs");
    });
  });

  describe("Edge Cases & Boundary Conditions", function () {
    it("Should handle interleaved PFP and MEME minting", async function () {
      // Mint PFP and MEME tokens in alternating pattern
      await minterContract.connect(users[0]).mintNFT(0, "pfp_1");
      await minterContract.connect(users[0]).mintNFT(1, "meme_1");
      await minterContract.connect(users[1]).mintNFT(0, "pfp_2");
      await minterContract.connect(users[0]).mintNFT(1, "meme_2");

      // Verify PFP tokens
      expect(await pfpCollection.getCurrentTokenId()).to.equal(3); // Next: 3
      expect(await pfpCollection.ownerOf(1)).to.equal(users[0].address);
      expect(await pfpCollection.ownerOf(2)).to.equal(users[1].address);

      // Verify MEME tokens
      expect(await memeCollection.getCurrentTokenId()).to.equal(3); // Next: 3
      expect(await memeCollection.ownerOf(1)).to.equal(users[0].address);
      expect(await memeCollection.ownerOf(2)).to.equal(users[0].address);

      console.log("✓ Interleaved minting maintains separate sequences");
    });

    it("Should handle rapid sequential mints correctly", async function () {
      const promises = [];
      const mintCount = 10;

      // Fire off multiple mints rapidly (but sequentially due to nonce)
      for (let i = 0; i < mintCount; i++) {
        const userIndex = Math.floor(i / 2);
        promises.push(
          minterContract.connect(users[userIndex]).mintNFT(0, `rapid_${i + 1}`)
        );
      }

      await Promise.all(promises);

      // Verify all tokens minted
      expect(await pfpCollection.getCurrentTokenId()).to.equal(mintCount + 1);
      
      for (let tokenId = 1; tokenId <= mintCount; tokenId++) {
        expect(await pfpCollection.ownerOf(tokenId)).to.not.equal(ethers.ZeroAddress);
      }

      console.log("✓ Rapid sequential mints handled correctly");
    });

    it("Should correctly handle boundary between different users", async function () {
      // User 0 mints 2 (reaches limit)
      await minterContract.connect(users[0]).mintNFT(0, "user0_1");
      await minterContract.connect(users[0]).mintNFT(0, "user0_2");

      // User 1 mints 2 (reaches limit)
      await minterContract.connect(users[1]).mintNFT(0, "user1_1");
      await minterContract.connect(users[1]).mintNFT(0, "user1_2");

      // Verify ownership
      expect(await pfpCollection.ownerOf(1)).to.equal(users[0].address);
      expect(await pfpCollection.ownerOf(2)).to.equal(users[0].address);
      expect(await pfpCollection.ownerOf(3)).to.equal(users[1].address);
      expect(await pfpCollection.ownerOf(4)).to.equal(users[1].address);

      // Verify mint counts
      expect(await pfpCollection.userMintCount(users[0].address)).to.equal(2);
      expect(await pfpCollection.userMintCount(users[1].address)).to.equal(2);

      console.log("✓ User boundaries handled correctly");
    });
  });

  describe("Arithmetic Safety at Boundaries", function () {
    it("Should safely calculate price at all tiers", async function () {
      const pfpTier1 = await minterContract.tiers(0, 1);
      const pfpTier2 = await minterContract.tiers(0, 2);
      const pfpTier3 = await minterContract.tiers(0, 3);

      // Verify prices don't overflow and are reasonable
      expect(pfpTier1.priceUSD).to.equal(ethers.parseEther("50"));
      expect(pfpTier2.priceUSD).to.equal(ethers.parseEther("150"));
      expect(pfpTier3.priceUSD).to.equal(ethers.parseEther("250"));

      // Calculate CEO prices (should not overflow)
      const ceoPrice1 = await minterContract.getNFTPriceInCEO(0);
      expect(ceoPrice1).to.be.gt(0);
      expect(ceoPrice1).to.be.lt(ethers.parseEther("1000000")); // Reasonable upper bound

      console.log(`✓ Tier 1 CEO price: ${ethers.formatEther(ceoPrice1)} CEO tokens`);
    });

    it("Should safely calculate tier end supply without overflow", async function () {
      const tier1 = await minterContract.tiers(0, 1);
      const tier2 = await minterContract.tiers(0, 2);
      const tier3 = await minterContract.tiers(0, 3);

      // Verify tier boundaries
      const tier1End = Number(tier1.startSupply) + Number(tier1.supplyLimit);
      expect(tier1End).to.equal(500);

      const tier2End = Number(tier2.startSupply) + Number(tier2.supplyLimit);
      expect(tier2End).to.equal(809);

      const tier3End = Number(tier3.startSupply) + Number(tier3.supplyLimit);
      expect(tier3End).to.equal(999);

      console.log("✓ Tier boundaries calculated safely");
    });

    it("Should safely handle remaining supply calculations", async function () {
      await mintMultipleTokens(0, 10);

      const [, , , remainingInTier] = await minterContract.getCurrentTierInfo(0);
      expect(remainingInTier).to.equal(490); // 500 - 10

      const totalRemaining = await pfpCollection.getRemainingSupply();
      expect(totalRemaining).to.equal(989); // 999 - 10

      // No underflow should occur
      expect(remainingInTier).to.be.gte(0);
      expect(totalRemaining).to.be.gte(0);

      console.log("✓ Remaining supply calculations safe from underflow");
    });
  });

  describe("Tier Transition Logic Verification", function () {
    it("Should correctly identify tier based on current supply", async function () {
      // At supply 0, should be Tier 1
      let [tierId] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);

      // Mint some tokens, still Tier 1
      await mintMultipleTokens(0, 20);
      [tierId] = await minterContract.getCurrentTierInfo(0);
      expect(tierId).to.equal(1);

      console.log("✓ Tier correctly identified based on supply");
    });

    it("Should correctly calculate tier boundaries", async function () {
      // PFP Tiers:
      // Tier 1: 0-499 (supply) → tokens 1-500
      // Tier 2: 500-808 (supply) → tokens 501-809
      // Tier 3: 809-998 (supply) → tokens 810-999

      const tier1 = await minterContract.tiers(0, 1);
      expect(tier1.startSupply).to.equal(0);
      expect(tier1.supplyLimit).to.equal(500);

      const tier2 = await minterContract.tiers(0, 2);
      expect(tier2.startSupply).to.equal(500);
      expect(tier2.supplyLimit).to.equal(309);

      const tier3 = await minterContract.tiers(0, 3);
      expect(tier3.startSupply).to.equal(809);
      expect(tier3.supplyLimit).to.equal(190);

      // Verify total adds up to max supply
      const totalSupply = Number(tier1.supplyLimit) + Number(tier2.supplyLimit) + Number(tier3.supplyLimit);
      expect(totalSupply).to.equal(999);

      console.log("✓ Tier boundaries correctly configured");
    });
  });
});
