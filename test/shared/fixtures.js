
const overrides = {
        gasLimit: 9999999
    }

const factoryFixture = async ([wallet], _) => {
        const factory = await deployContract(wallet, UniswapV2Factory, [wallet.address], overrides)
        return { factory }
    }

module.exports = {
    factoryFixture
}