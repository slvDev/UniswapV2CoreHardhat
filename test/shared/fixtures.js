const { ethers, waffle } = require("hardhat");

const factoryFixture = async ([owner, addr1]) => {
        const Token = await ethers.getContractFactory("UniswapV2Factory")
        const factory = await Token.deploy(owner.address)
        return factory
    }

module.exports = {
    factoryFixture
}