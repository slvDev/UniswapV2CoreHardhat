const { expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero } = ethers.constants;
const { BigNumber } = ethers;
const { createFixtureLoader } = require('ethereum-waffle');
const { factoryFixture } = require('./shared/fixtures');

describe("UniswapV2ERC20", function() {
    let factory
    const TEST_ADDRESSES = [
        '0x1000000000000000000000000000000000000000',
        '0x2000000000000000000000000000000000000000'
    ]
    const [owner, addr1] = await ethers.getSigners()
    const loadFixture = createFixtureLoader([owner, addr1])

    beforeEach(async function () {
        const fixture = await loadFixture(factoryFixture)
        factory = fixture.factory
        // Token = await ethers.getContractFactory("UniswapV2Factory")
        // factory = await Token.deploy(owner.address)
        // await factory.deployed()
    })

    it('feeTo, feeToSetter, allPairsLength', async () => {
        expect(await factory.feeTo()).to.eq(AddressZero)
        expect(await factory.feeToSetter()).to.eq(owner.address)
        expect(await factory.allPairsLength()).to.eq(0)
    })

})