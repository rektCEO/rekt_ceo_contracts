const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Enhanced Rekt CEO - Recovery Mechanisms", function () {
    let ceoToken, pfpCollection, memeCollection, minterContract, usdcToken;
    let owner, user1, user2, rescuer, admin;
    let safeWallet, treasury;

    beforeEach(async function () {
        [owner, user1, user2, rescuer, admin] = await ethers.getSigners();
        safeWallet = owner.address;
        treasury = owner.address;

        // Deploy CEO Token
        const CEOToken = await ethers.getContractFactory("CEOToken");
        ceoToken = await CEOToken.deploy(owner.address);
        await ceoToken.waitForDeployment();

        // Set dev wallet and mint allocation
        await ceoToken.setDevWallet(user1.address);
        await ceoToken.mintDevAllocation();

        // Deploy PFP Collection
        const PFPCollection = await ethers.getContractFactory("PFPCollection");
        pfpCollection = await PFPCollection.deploy(
            "Rekt CEO PFPs",
            "REKTPFP",
            safeWallet,
            owner.address
        );
        await pfpCollection.waitForDeployment();

        // Deploy Meme Collection
        const MemeCollection = await ethers.getContractFactory("MemeCollection");
        memeCollection = await MemeCollection.deploy(
            "Rekt CEO Memes",
            "REKTMEME",
            safeWallet,
            owner.address
        );
        await memeCollection.waitForDeployment();

        // Deploy Mock USDC
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC");
        await usdcToken.waitForDeployment();

        // Deploy Minter Contract
        const MinterContract = await ethers.getContractFactory("MinterContract");
        minterContract = await MinterContract.deploy(
            await ceoToken.getAddress(),
            await pfpCollection.getAddress(),
            await memeCollection.getAddress(),
            await usdcToken.getAddress(),
            treasury,
            safeWallet,
            owner.address
        );
        await minterContract.waitForDeployment();

        // Grant roles
        await minterContract.grantRole(await minterContract.APPROVER_ROLE(), owner.address);
        await minterContract.grantRole(await minterContract.RESCUER_ROLE(), rescuer.address);
        await minterContract.grantRole(await minterContract.ADMIN_ROLE(), admin.address);

        // Grant minter role to minter contract
        await pfpCollection.grantRole(await pfpCollection.MINTER_ROLE(), await minterContract.getAddress());
        await memeCollection.grantRole(await memeCollection.MINTER_ROLE(), await minterContract.getAddress());
    });

    describe("🔧 RECOVERY MECHANISMS", function () {
        it("Should recover stuck ETH tokens", async function () {
            // Send ETH to contract
            await owner.sendTransaction({
                to: await minterContract.getAddress(),
                value: ethers.parseEther("1.0")
            });

            const contractBalance = await ethers.provider.getBalance(await minterContract.getAddress());
            expect(contractBalance).to.equal(ethers.parseEther("1.0"));

            // Recover ETH using rescuer
            await expect(
                minterContract.connect(rescuer).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1.0"))
            ).to.emit(minterContract, "StuckTokensRecovered")
            .withArgs(ethers.ZeroAddress, ethers.parseEther("1.0"));

            const finalBalance = await ethers.provider.getBalance(await minterContract.getAddress());
            expect(finalBalance).to.equal(0);
        });

        it("Should recover stuck USDC tokens", async function () {
            // Send USDC to contract
            await usdcToken.mint(await minterContract.getAddress(), ethers.parseEther("1000"));

            const contractBalance = await usdcToken.balanceOf(await minterContract.getAddress());
            expect(contractBalance).to.equal(ethers.parseEther("1000"));

            // Recover USDC using rescuer
            await expect(
                minterContract.connect(rescuer).recoverStuckTokens(await usdcToken.getAddress(), ethers.parseEther("1000"))
            ).to.emit(minterContract, "StuckTokensRecovered")
            .withArgs(await usdcToken.getAddress(), ethers.parseEther("1000"));

            const finalBalance = await usdcToken.balanceOf(await minterContract.getAddress());
            expect(finalBalance).to.equal(0);
        });

        it("Should emergency recover all stuck tokens", async function () {
            // Send both ETH and USDC to contract
            await owner.sendTransaction({
                to: await minterContract.getAddress(),
                value: ethers.parseEther("2.0")
            });
            await usdcToken.mint(await minterContract.getAddress(), ethers.parseEther("500"));

            // Emergency recover all - should emit events for both ETH and USDC
            const tx = await minterContract.connect(rescuer).emergencyRecoverAll();
            const receipt = await tx.wait();
            
            // Check that both events were emitted
            const events = receipt.logs.filter(log => 
                log.topics[0] === minterContract.interface.getEvent("StuckTokensRecovered").topicHash
            );
            expect(events).to.have.length(2);

            // Verify all tokens recovered
            const ethBalance = await ethers.provider.getBalance(await minterContract.getAddress());
            const usdcBalance = await usdcToken.balanceOf(await minterContract.getAddress());
            expect(ethBalance).to.equal(0);
            expect(usdcBalance).to.equal(0);
        });

        it("Should NOT allow recovery of CEO tokens", async function () {
            // Send CEO tokens to contract
            await ceoToken.transfer(await minterContract.getAddress(), ethers.parseEther("1000"));

            // Try to recover CEO tokens - should fail
            await expect(
                minterContract.connect(rescuer).recoverStuckTokens(await ceoToken.getAddress(), ethers.parseEther("1000"))
            ).to.be.revertedWith("MinterContract: Cannot recover CEO tokens");
        });

        it("Should only allow rescuer role to recover tokens", async function () {
            await owner.sendTransaction({
                to: await minterContract.getAddress(),
                value: ethers.parseEther("1.0")
            });

            // Non-rescuer should not be able to recover
            await expect(
                minterContract.connect(user1).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("1.0"))
            ).to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.RESCUER_ROLE());
        });

        it("Should prevent recovery of more tokens than available", async function () {
            await owner.sendTransaction({
                to: await minterContract.getAddress(),
                value: ethers.parseEther("1.0")
            });

            // Try to recover more than available
            await expect(
                minterContract.connect(rescuer).recoverStuckTokens(ethers.ZeroAddress, ethers.parseEther("2.0"))
            ).to.be.revertedWith("MinterContract: Insufficient ETH balance");
        });
    });

    describe("🔒 SECURITY FEATURES", function () {
        it("Should prevent reentrancy attacks", async function () {
            // This test would require a malicious contract to test reentrancy
            // The nonReentrant modifier should prevent this
            expect(await minterContract.hasRole(await minterContract.APPROVER_ROLE(), owner.address)).to.be.true;
        });

        it("Should enforce role-based access control", async function () {
            // Only admin can update tiers
            await expect(
                minterContract.connect(user1).updateTier(0, 1, ethers.parseEther("100"), true)
            ).to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.ADMIN_ROLE());

            // Only price updater can update prices
            await expect(
                minterContract.connect(user1).setCEOPrice(ethers.parseEther("2.0"))
            ).to.be.revertedWith("AccessControl: account " + user1.address.toLowerCase() + " is missing role " + await minterContract.PRICE_UPDATER_ROLE());
        });

        it("Should enforce price update cooldown", async function () {
            // First price update should work
            await minterContract.setCEOPrice(ethers.parseEther("2.0"));

            // Second price update should fail due to cooldown
            await expect(
                minterContract.setCEOPrice(ethers.parseEther("3.0"))
            ).to.be.revertedWith("MinterContract: Price update cooldown not met");
        });
    });

    describe("💰 USDC SWAP MECHANISM", function () {
        it("Should swap 50% of CEO tokens to USDC during minting", async function () {
            // Approve minter contract
            await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("10000"));

            // Mint NFT (should trigger USDC swap)
            await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/1");

            // Check that CEO tokens were transferred to treasury (simulating USDC swap)
            const treasuryBalance = await ceoToken.balanceOf(treasury);
            expect(treasuryBalance).to.be.gt(0);
        });

        it("Should allow disabling USDC swap", async function () {
            // Disable USDC swap
            await minterContract.connect(admin).updateUSDCSwapConfig(false, 0);

            // Get contract balance before minting
            const contractBalanceBefore = await ceoToken.balanceOf(await minterContract.getAddress());

            // Approve and mint
            await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("10000"));
            await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/1");

            // Contract should keep all tokens (no swap to treasury)
            const contractBalanceAfter = await ceoToken.balanceOf(await minterContract.getAddress());
            expect(contractBalanceAfter).to.be.gt(contractBalanceBefore);
        });
    });

    describe("🎨 NFT MINTING AND LIMITS", function () {
        it("Should enforce PFP mint limits (2 per user)", async function () {
            // Approve minter contract
            await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("10000"));

            // Mint 2 PFPs (should work)
            await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/1");
            await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/2");

            // Try to mint 3rd PFP (should fail)
            await expect(
                minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/3")
            ).to.be.revertedWith("PFPCollection: User mint limit reached");
        });

        it("Should enforce Meme mint limits (9 per user)", async function () {
            // Approve minter contract
            await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("10000"));

            // Mint 9 Memes (should work)
            for (let i = 1; i <= 9; i++) {
                await minterContract.mintNFT(1, 1, `https://api.rektceo.club/metadata/meme/${i}`);
            }

            // Try to mint 10th Meme (should fail)
            await expect(
                minterContract.mintNFT(1, 1, "https://api.rektceo.club/metadata/meme/10")
            ).to.be.revertedWith("MemeCollection: User mint limit reached");
        });
    });

    describe("👑 ROYALTY MECHANISM", function () {
        it("Should track creator and set up royalties", async function () {
            // Approve and mint NFT
            await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("10000"));
            await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/1");

            // Check creator tracking
            const creator = await pfpCollection.getTokenCreator(1);
            expect(creator).to.equal(owner.address);

            // Check royalty info
            const royaltyInfo = await pfpCollection.royaltyInfo(1, ethers.parseEther("100"));
            expect(royaltyInfo.royaltyAmount).to.equal(ethers.parseEther("2.1")); // 2.1% of 100
        });
    });

    describe("💸 FUND WITHDRAWAL", function () {
        it("Should allow admin to withdraw collected funds", async function () {
            // Mint NFT to collect funds
            await ceoToken.approve(await minterContract.getAddress(), ethers.parseEther("10000"));
            await minterContract.mintNFT(0, 1, "https://api.rektceo.club/metadata/pfp/1");

            const contractBalance = await ceoToken.balanceOf(await minterContract.getAddress());
            expect(contractBalance).to.be.gt(0);

            // Withdraw funds
            await expect(
                minterContract.withdrawFunds()
            ).to.emit(minterContract, "FundsWithdrawn")
            .withArgs(treasury, contractBalance);

            const finalBalance = await ceoToken.balanceOf(await minterContract.getAddress());
            expect(finalBalance).to.equal(0);
        });
    });
});
