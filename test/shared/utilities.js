const { BigNumber } = require("ethers");
const { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack, getAddress } = require("ethers").utils;

const expandTo18Decimals = n => {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

const PERMIT_TYPEHASH = keccak256(
        toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
    )

const getDomainSeparator = (name, tokenAddress) => {
    return keccak256(
      defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
          keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
          keccak256(toUtf8Bytes(name)),
          keccak256(toUtf8Bytes('1')),
          31337,
          tokenAddress
        ]
      )
    )
  }

const getApprovalDigest = async (token, approve, nonce, deadline) => {
    const name = await token.name()
    const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
    return keccak256(
      solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          DOMAIN_SEPARATOR,
          keccak256(
            defaultAbiCoder.encode(
                    ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
                    [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
                )
            )
        ]
        )
    )
}

const getCreate2Address = (factoryAddress, [tokenA, tokenB], bytecode) => {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    keccak256(solidityPack(['address', 'address'], [token0, token1])),
    keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

const mineBlock = async (provider, timestamp) => {
  await new Promise(async (resolve, reject) => {
    provider._hardhatProvider.sendAsync(
      { jsonrpc: '2.0', method: 'evm_mine', params: [timestamp] },
      (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      }
    )
  })
}

const encodePrice = (reserve0, reserve1) => {
  return [reserve1.mul(BigNumber.from(2).pow(112)).div(reserve0), reserve0.mul(BigNumber.from(2).pow(112)).div(reserve1)]
}

module.exports = {
    getApprovalDigest,
    getCreate2Address,
    expandTo18Decimals,
    mineBlock,
    encodePrice
}