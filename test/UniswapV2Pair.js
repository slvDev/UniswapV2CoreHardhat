const { expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero } = ethers.constants;
const { Contract, BigNumber } = ethers;
const { expandTo18Decimals, mineBlock, encodePrice } = require('./shared/utilities');

const UniswapV2PairArtifact = hre.artifacts.readArtifact("UniswapV2Pair");

const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3)

describe('UniswapV2Pair', () => {
    let owner, addr1, UniswapV2Factory,
        factory, token0, token1,
        pair

    beforeEach(async () => {
        [owner, addr1] = await ethers.getSigners()
        UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
        factory = await UniswapV2Factory.deploy(owner.address)
        await factory.deployed()
        
        const tokenAContract = await ethers.getContractFactory("ERC20")
        const tokenA = await tokenAContract.deploy(expandTo18Decimals(10000))
        await tokenA.deployed()
        const tokenBContract = await ethers.getContractFactory("ERC20")
        const tokenB = await tokenBContract.deploy(expandTo18Decimals(10000))
        await tokenB.deployed()

        await factory.createPair(tokenA.address, tokenB.address)
        const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
        const UniswapV2PairAbi = (await UniswapV2PairArtifact).abi
        pair = new Contract(pairAddress, UniswapV2PairAbi, ethers.provider).connect(owner)

        // Remove ().address since it will be always undefined, looks like a bug
        // const token0Address = (await pair.token0()).address
        const token0Address = await pair.token0()
        token0 = tokenA.address === token0Address ? tokenA : tokenB
        token1 = tokenA.address === token0Address ? tokenB : tokenA
    })
    
    it('mint', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
    
        const expectedLiquidity = expandTo18Decimals(2)
        await expect(pair.mint(owner.address))
            .to.emit(pair, 'Transfer')
            .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
            .to.emit(pair, 'Transfer')
            .withArgs(AddressZero, owner.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount, token1Amount)
            .to.emit(pair, 'Mint')
            .withArgs(owner.address, token0Amount, token1Amount)
    
        expect(await pair.totalSupply()).to.eq(expectedLiquidity)
        expect(await pair.balanceOf(owner.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount)
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount)
        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount)
        expect(reserves[1]).to.eq(token1Amount)
    })

    const addLiquidity = async (token0Amount, token1Amount) => {
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
        await pair.mint(owner.address)
    }

    const swapTestCases = [
        [1, 5, 10, '1662497915624478906'],
        [1, 10, 5, '453305446940074565'],
    
        [2, 5, 10, '2851015155847869602'],
        [2, 10, 5, '831248957812239453'],
    
        [1, 10, 10, '906610893880149131'],
        [1, 100, 100, '987158034397061298'],
        [1, 1000, 1000, '996006981039903216']
    ].map(a => a.map(n => (typeof n === 'string' ? BigNumber.from(n) : expandTo18Decimals(n))))

    swapTestCases.forEach((swapTestCase, i) => {
        it(`getInputPrice:${i}`, async () => {
            const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
            
            await addLiquidity(token0Amount, token1Amount)
            await token0.transfer(pair.address, swapAmount)
            await expect(pair.swap(0, expectedOutputAmount.add(1), owner.address, '0x'))
                    .to.be.revertedWith('UniswapV2: K')
            await pair.swap(0, expectedOutputAmount, owner.address, '0x')
        })
    })

    const optimisticTestCases = [
            ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
            ['997000000000000000', 10, 5, 1],
            ['997000000000000000', 5, 5, 1],
            [1, 5, 5, '1003009027081243732'] // given amountOut, amountIn = ceiling(amountOut / .997)
        ].map(a => a.map(n => (typeof n === 'string' ? BigNumber.from(n) : expandTo18Decimals(n))))

    optimisticTestCases.forEach((optimisticTestCase, i) => {
        it(`optimistic:${i}`, async () => {
            const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
            await addLiquidity(token0Amount, token1Amount)
            await token0.transfer(pair.address, inputAmount)
            await expect(pair.swap(outputAmount.add(1), 0, owner.address, '0x'))
                .to.be.revertedWith('UniswapV2: K')
            await pair.swap(outputAmount, 0, owner.address, '0x')
        })
    })

    it('swap:token0', async () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        await addLiquidity(token0Amount, token1Amount)
    
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = BigNumber.from('1662497915624478906')
        await token0.transfer(pair.address, swapAmount)
        await expect(pair.swap(0, expectedOutputAmount, owner.address, '0x'))
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, owner.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(owner.address, swapAmount, 0, 0, expectedOutputAmount, owner.address)
    
        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount.add(swapAmount))
        expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount))
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount))
        expect(await token1.balanceOf(owner.address)).to.eq(totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount))
    })

    it('swap:token1', async () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        await addLiquidity(token0Amount, token1Amount)
    
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = BigNumber.from('453305446940074565')
        await token1.transfer(pair.address, swapAmount)
        await expect(pair.swap(expectedOutputAmount, 0, owner.address, '0x'))
          .to.emit(token0, 'Transfer')
          .withArgs(pair.address, owner.address, expectedOutputAmount)
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount.sub(expectedOutputAmount), token1Amount.add(swapAmount))
          .to.emit(pair, 'Swap')
          .withArgs(owner.address, 0, swapAmount, expectedOutputAmount, 0, owner.address)
    
        const reserves = await pair.getReserves()
        expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount))
        expect(reserves[1]).to.eq(token1Amount.add(swapAmount))
        expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount))
        expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount))
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount))
        expect(await token1.balanceOf(owner.address)).to.eq(totalSupplyToken1.sub(token1Amount).sub(swapAmount))
    })
    
    // Test to gas is not a constant
    // it('swap:gas', async () => {
    //         const token0Amount = expandTo18Decimals(5)
    //         const token1Amount = expandTo18Decimals(10)
    //         await addLiquidity(token0Amount, token1Amount)
        
    //         // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    //         await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    //         await pair.sync()
        
    //         const swapAmount = expandTo18Decimals(1)
    //         const expectedOutputAmount = bigNumberify('453305446940074565')
    //         await token1.transfer(pair.address, swapAmount)
    //         await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    //         const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')
    //         const receipt = await tx.wait()
    //         expect(receipt.gasUsed).to.eq(73462)
    // })

    it('burn', async () => {
        const token0Amount = expandTo18Decimals(3)
        const token1Amount = expandTo18Decimals(3)
        await addLiquidity(token0Amount, token1Amount)
    
        const expectedLiquidity = expandTo18Decimals(3)
        await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        await expect(pair.burn(owner.address))
          .to.emit(pair, 'Transfer')
          .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(token0, 'Transfer')
          .withArgs(pair.address, owner.address, token0Amount.sub(1000))
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, owner.address, token1Amount.sub(1000))
          .to.emit(pair, 'Sync')
          .withArgs(1000, 1000)
          .to.emit(pair, 'Burn')
          .withArgs(owner.address, token0Amount.sub(1000), token1Amount.sub(1000), owner.address)
    
        expect(await pair.balanceOf(owner.address)).to.eq(0)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
        expect(await token0.balanceOf(pair.address)).to.eq(1000)
        expect(await token1.balanceOf(pair.address)).to.eq(1000)
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(owner.address)).to.eq(totalSupplyToken0.sub(1000))
        expect(await token1.balanceOf(owner.address)).to.eq(totalSupplyToken1.sub(1000))
    })

    it('price{0,1}CumulativeLast', async () => {
        const token0Amount = expandTo18Decimals(3)
        const token1Amount = expandTo18Decimals(3)
        await addLiquidity(token0Amount, token1Amount)
    
        const blockTimestamp = (await pair.getReserves())[2]
        // Hardhat mine block automatically, no need to force mine one block
        // await mineBlock(ethers.provider, blockTimestamp + 1)
        await pair.sync()
    
        const initialPrice = encodePrice(token0Amount, token1Amount)
        expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
        expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
        expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 1)
    
        const swapAmount = expandTo18Decimals(3)
        await token0.transfer(pair.address, swapAmount)
        // Minus one block since we in HardHat env
        await mineBlock(ethers.provider, blockTimestamp + 10 - 1)
        // swap to a new price eagerly instead of syncing
        await pair.swap(0, expandTo18Decimals(1), owner.address, '0x') // make the price nice
    
        expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10))
        expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10))
        expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10)

        // Minus one block since we in HardHat env
        await mineBlock(ethers.provider, blockTimestamp + 20 - 1)
        await pair.sync()
    
        const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
        expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10).add(newPrice[0].mul(10)))
        expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10).add(newPrice[1].mul(10)))
        expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20)
    })

    it('feeTo:off', async () => {
        const token0Amount = expandTo18Decimals(1000)
        const token1Amount = expandTo18Decimals(1000)
        await addLiquidity(token0Amount, token1Amount)
    
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = BigNumber.from('996006981039903216')
        await token1.transfer(pair.address, swapAmount)
        await pair.swap(expectedOutputAmount, 0, owner.address, '0x')
    
        const expectedLiquidity = expandTo18Decimals(1000)
        await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        await pair.burn(owner.address)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
    })
    
    it('feeTo:on', async () => {
        await factory.setFeeTo(addr1.address)

        const token0Amount = expandTo18Decimals(1000)
        const token1Amount = expandTo18Decimals(1000)
        await addLiquidity(token0Amount, token1Amount)

        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = BigNumber.from('996006981039903216')
        await token1.transfer(pair.address, swapAmount)
        await pair.swap(expectedOutputAmount, 0, owner.address, '0x')

        const expectedLiquidity = expandTo18Decimals(1000)
        await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
        await pair.burn(owner.address)
        expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add('249750499251388'))
        expect(await pair.balanceOf(addr1.address)).to.eq('249750499251388')

        // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
        // ...because the initial liquidity amounts were equal
        expect(await token0.balanceOf(pair.address)).to.eq(BigNumber.from(1000).add('249501683697445'))
        expect(await token1.balanceOf(pair.address)).to.eq(BigNumber.from(1000).add('250000187312969'))
    })
})