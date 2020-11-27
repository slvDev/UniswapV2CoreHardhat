const { expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero } = ethers.constants;
const { Contract, BigNumber } = ethers;
const UniswapV2PairArtifact = hre.artifacts.readArtifact("UniswapV2Pair");

const { getCreate2Address } = require('./shared/utilities');

describe("UniswapV2Factory", async function() {
    let UniswapV2Factory, factory, owner, addr1
    const TEST_ADDRESSES = [
        '0x1000000000000000000000000000000000000000',
        '0x2000000000000000000000000000000000000000'
    ]
   
    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
        factory = await UniswapV2Factory.deploy(owner.address)
        await factory.deployed()
    })

    it('feeTo, feeToSetter, allPairsLength', async function() {
        expect(await factory.feeTo()).to.eq(AddressZero)
        expect(await factory.feeToSetter()).to.eq(owner.address)
        expect(await factory.allPairsLength()).to.eq(0)
    })

    async function createPair(tokens) {
        const UniswapV2Pair = await UniswapV2PairArtifact
        const { bytecode, abi } = UniswapV2Pair
        const create2Address = getCreate2Address(factory.address, tokens, bytecode)
        await expect(factory.createPair(...tokens))
            .to.emit(factory, 'PairCreated')
            .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, BigNumber.from(1))
    
        await expect(factory.createPair(...tokens)).to.be.reverted // UniswapV2: PAIR_EXISTS
        await expect(factory.createPair(...tokens.slice().reverse())).to.be.reverted // UniswapV2: PAIR_EXISTS
        expect(await factory.getPair(...tokens)).to.eq(create2Address)
        expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address)
        expect(await factory.allPairs(0)).to.eq(create2Address)
        expect(await factory.allPairsLength()).to.eq(1)

        const pair = new Contract(create2Address, abi, ethers.provider)
        expect(await pair.factory()).to.eq(factory.address)
        expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
        expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
    }

    it('createPair', async () => {
        await createPair(TEST_ADDRESSES)
    })

    it('createPair:reverse', async () => {
        await createPair(Array.from(TEST_ADDRESSES.slice().reverse()))
    })

    // it('createPair:gas', async () => {
    //     const tx = await factory.createPair(...TEST_ADDRESSES)
    //     const receipt = await tx.wait()
    //     console.log(receipt)
    //     expect(receipt.gasUsed).to.eq(2512920)
    // })

    it('setFeeTo', async () => {
        await expect(factory.connect(addr1).setFeeTo(addr1.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
        await factory.setFeeTo(owner.address)
        expect(await factory.feeTo()).to.eq(owner.address)
    })

    it('setFeeToSetter', async () => {
        await expect(factory.connect(addr1).setFeeToSetter(addr1.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
        await factory.setFeeToSetter(addr1.address)
        expect(await factory.feeToSetter()).to.eq(addr1.address)
        await expect(factory.setFeeToSetter(owner.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    })

})