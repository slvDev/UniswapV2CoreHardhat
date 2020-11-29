const { expect } = require("chai");
const { ethers } = require("hardhat");
const { keccak256, hexlify, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { MaxUint256 } = ethers.constants;
const { BigNumber } = ethers;
const { ecsign } = require("ethereumjs-util");
const { expandTo18Decimals, getApprovalDigest } = require('./shared/utilities');

const TOTAL_SUPPLY = expandTo18Decimals(10000)
const TEST_AMOUNT = expandTo18Decimals(10)

describe("UniswapV2ERC20", function() {
    let Token, erc20, owner, addr1

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        Token = await ethers.getContractFactory("ERC20")
        erc20 = await Token.deploy(TOTAL_SUPPLY)
        await erc20.deployed()
    })

    it("initial variables", async function() {
        const name = await erc20.name()
        expect(name).to.eq('Uniswap V2')
        expect(await erc20.symbol()).to.eq('UNI-V2')
        expect(await erc20.decimals()).to.eq(18)
        expect(await erc20.totalSupply()).to.eq(TOTAL_SUPPLY)
        expect(await erc20.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY)
        expect(await erc20.DOMAIN_SEPARATOR()).to.eq(
            keccak256(
                defaultAbiCoder.encode(
                    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
                    [
                    keccak256(
                        toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
                    ),
                    keccak256(toUtf8Bytes(name)),
                    keccak256(toUtf8Bytes('1')),
                    31337,
                    erc20.address
                    ])
                )
            )
        expect(await erc20.PERMIT_TYPEHASH()).to.eq(
            keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
        )
    })

    it('approve', async () => {
        await expect(erc20.approve(addr1.address, TEST_AMOUNT))
            .to.emit(erc20, 'Approval')
            .withArgs(owner.address, addr1.address, TEST_AMOUNT)

        expect(await erc20.allowance(owner.address, addr1.address)).to.eq(TEST_AMOUNT)
    })

    it('transfer', async () => {
        await expect(erc20.transfer(addr1.address, TEST_AMOUNT))
            .to.emit(erc20, 'Transfer')
            .withArgs(owner.address, addr1.address, TEST_AMOUNT)
        expect(await erc20.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
        expect(await erc20.balanceOf(addr1.address)).to.eq(TEST_AMOUNT)
    })

    it('transfer:fail', async () => {
        await expect(erc20.transfer(addr1.address, TOTAL_SUPPLY.add(1))).to.be.reverted // ds-math-sub-underflow
        await expect(erc20.connect(addr1).transfer(owner.address, 1)).to.be.reverted // ds-math-sub-underflow
    })

    it('transferFrom', async () => {
        await erc20.approve(addr1.address, TEST_AMOUNT)
        await expect(erc20.connect(addr1).transferFrom(owner.address, addr1.address, TEST_AMOUNT))
            .to.emit(erc20, 'Transfer')
            .withArgs(owner.address, addr1.address, TEST_AMOUNT)
        expect(await erc20.allowance(owner.address, addr1.address)).to.eq(0)
        expect(await erc20.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
        expect(await erc20.balanceOf(addr1.address)).to.eq(TEST_AMOUNT)
    })

    it('transferFrom:max', async () => {
        await erc20.approve(addr1.address, MaxUint256)
        await expect(erc20.connect(addr1).transferFrom(owner.address, addr1.address, TEST_AMOUNT))
            .to.emit(erc20, 'Transfer')
            .withArgs(owner.address, addr1.address, TEST_AMOUNT)
        expect(await erc20.allowance(owner.address, addr1.address)).to.eq(MaxUint256)
        expect(await erc20.balanceOf(owner.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT))
        expect(await erc20.balanceOf(addr1.address)).to.eq(TEST_AMOUNT)
    })

    it('permit', async () => {
        const walletWithPK = ethers.Wallet.createRandom()
        const nonce = await erc20.nonces(walletWithPK.address)
        const deadline = MaxUint256
        const digest = await getApprovalDigest(
            erc20,
            { owner: walletWithPK.address, spender: addr1.address, value: TEST_AMOUNT },
            nonce,
            deadline
        )
        
        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(walletWithPK.privateKey.slice(2), 'hex'))
    
        await expect(erc20.permit(walletWithPK.address, addr1.address, TEST_AMOUNT, deadline, v, hexlify(r), hexlify(s)))
            .to.emit(erc20, 'Approval')
            .withArgs(walletWithPK.address, addr1.address, TEST_AMOUNT)
        expect(await erc20.allowance(walletWithPK.address, addr1.address)).to.eq(TEST_AMOUNT)
        expect(await erc20.nonces(walletWithPK.address)).to.eq(BigNumber.from(1))
    })

})
