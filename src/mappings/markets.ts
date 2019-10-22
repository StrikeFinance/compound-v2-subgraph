/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts/index'
import { Market, Comptroller } from '../types/schema'
// PriceOracle is valid from Comptroller deployment until block 8498421
import { PriceOracle } from '../types/cREP/PriceOracle'
// PriceOracle2 is valid from 8498422 until present block (until another proxy upgrade)
import { PriceOracle2 } from '../types/cREP/PriceOracle2'
import { ERC20 } from '../types/cREP/ERC20'
import { CToken } from '../types/cREP/CToken'

import {
  exponentToBigDecimal,
  mantissaFactor,
  mantissaFactorBD,
  cTokenDecimalsBD,
} from './helpers'

let cUSDCAddress = '0x39aa39c021dfbae8fac545936693ac917d5e7563'
let cETHAddress = '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5'

// Used for all cERC20 contracts
function getTokenPrice(
  blockNumber: i32,
  eventAddress: Address,
  underlyingAddress: Address,
  underlyingDecimals: i32,
): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let tokenPerEthRatio: BigDecimal
  let priceOracle1Address = Address.fromString('02557a5e05defeffd4cae6d83ea3d173b272c904')

  /* PriceOracle2 is used at the block the Comptroller starts using it.
   * see here https://etherscan.io/address/0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b#events
   * Search for event topic 0xd52b2b9b7e9ee655fcb95d2e5b9e0c9f69e7ef2b8e9d2d0ea78402d576d22e22,
   * and see block 7715908.
   *
   * This must use the cToken address.
   *
   * Note this returns the value without factoring in token decimals and wei, so we must divide
   * the number by (ethDecimals - tokenDecimals) and again by the mantissa.
   * USDC would be 10 ^ ((18 - 6) + 18) = 10 ^ 30
   *
   * Note that they deployed 3 different PriceOracles at the beginning of the Comptroller,
   * and that they handle the decimals different, which can break the subgraph. So we actually
   * defer to Oracle 1 before block 7715908, which works,
   * until this one is deployed, which was used for 121 days */
  if (blockNumber > 7715908) {
    let mantissaDecimalFactor = 18 - underlyingDecimals + 18
    let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
    let oracle2 = PriceOracle2.bind(oracleAddress)
    tokenPerEthRatio = oracle2
      .getUnderlyingPrice(eventAddress)
      .toBigDecimal()
      .div(bdFactor)

    /* PriceOracle(1) is used (only for the first ~100 blocks of Comptroller. Annoying but we must
     * handle this. We use it for more than 100 blocks, see reason at top of if statement
     * of PriceOracle2.
     *
     * This must use the token address, not the cToken address.
     *
     * Note this returns the value already factoring in token decimals and wei, therefore
     * we only need to divide by the mantissa, 10^18 */
  } else {
    let oracle1 = PriceOracle.bind(priceOracle1Address)
    tokenPerEthRatio = oracle1
      .getPrice(underlyingAddress)
      .toBigDecimal()
      .div(mantissaFactorBD)
  }
  return tokenPerEthRatio
}

// Returns the price of USDC in eth. i.e. 0.005 would mean ETH is $200
function getUSDCpriceETH(blockNumber: i32): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let priceOracle1Address = Address.fromString('02557a5e05defeffd4cae6d83ea3d173b272c904')
  let USDCAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 '
  let usdPrice: BigDecimal

  // See notes on block number if statement in getTokenPrices()
  if (blockNumber > 7715908) {
    let oracle2 = PriceOracle2.bind(oracleAddress)
    let mantissaDecimalFactorUSDC = 18 - 6 + 18
    let bdFactorUSDC = exponentToBigDecimal(mantissaDecimalFactorUSDC)
    usdPrice = oracle2
      .getUnderlyingPrice(Address.fromString(cUSDCAddress))
      .toBigDecimal()
      .div(bdFactorUSDC)
  } else {
    let oracle1 = PriceOracle.bind(priceOracle1Address)
    usdPrice = oracle1
      .getPrice(Address.fromString(USDCAddress))
      .toBigDecimal()
      .div(mantissaFactorBD)
  }
  return usdPrice
}

export function createMarket(marketAddress: string): Market {
  let market: Market
  let contract = CToken.bind(Address.fromString(marketAddress))
  // It is CETH, which has a slightly different interface
  if (marketAddress == cETHAddress) {
    market = new Market(marketAddress)
    market.underlyingAddress = Address.fromString(
      '0x0000000000000000000000000000000000000000',
    )
    market.underlyingDecimals = 18
    market.tokenPerEthRatio = BigDecimal.fromString('1')

    // It is all other CERC20 contracts
  } else {
    market = new Market(marketAddress)
    market.underlyingAddress = contract.underlying()
    let underlyingContract = ERC20.bind(market.underlyingAddress as Address)
    market.underlyingDecimals = underlyingContract.decimals()
    if (marketAddress == cUSDCAddress) {
      market.tokenPerUSDRatio = BigDecimal.fromString('1')
    }
  }
  market.symbol = contract.symbol()
  market.usersEntered = []
  market.reserveFactor = BigInt.fromI32(0)
  market.accrualBlockNumber = 0
  return market
}

export function updateMarket(marketAddress: Address, blockNumber: i32): Market {
  let marketID = marketAddress.toHexString()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(marketID)
  }

  // Only updateMarket if it has not been updated this block
  if (market.accrualBlockNumber != blockNumber) {
    let contractAddress = Address.fromString(market.id)
    let contract = CToken.bind(contractAddress)
    let usdPriceInEth = getUSDCpriceETH(blockNumber)

    // if cETH, we only update USD price
    if (market.id == cETHAddress) {
      market.tokenPerUSDRatio = market.tokenPerEthRatio
        .div(usdPriceInEth)
        .truncate(market.underlyingDecimals)
    } else {
      let tokenPriceEth = getTokenPrice(
        blockNumber,
        contractAddress,
        market.underlyingAddress as Address,
        market.underlyingDecimals,
      )
      market.tokenPerEthRatio = tokenPriceEth.truncate(market.underlyingDecimals)
      // if USDC, we only update ETH price
      if (market.id != cUSDCAddress) {
        market.tokenPerUSDRatio = market.tokenPerEthRatio
          .div(usdPriceInEth)
          .truncate(market.underlyingDecimals)
      }
    }

    market.accrualBlockNumber = contract.accrualBlockNumber().toI32()
    market.totalSupply = contract
      .totalSupply()
      .toBigDecimal()
      .div(cTokenDecimalsBD)

    // If you call the cDAI contract on etherscan it comes back (2.0 * 10^26)
    // If you call the cUSDC contract on etherscan it comes back (2.0 * 10^14)
    // The real value is 0.02. So cDAI is off by 10^28, and cUSDC 10^16
    // Must div by tokenDecimals, 10^market.underlyingDecimals
    // Must multiple by ctokenDecimals, 10^8
    // Must div by mantissa, 10^18
    market.exchangeRate = contract
      .exchangeRateStored()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .times(cTokenDecimalsBD)
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)
    market.borrowIndex = contract
      .borrowIndex()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    market.totalReserves = contract
      .totalReserves()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.totalBorrows = contract
      .totalBorrows()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.totalCash = contract
      .getCash()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.totalDeposits = market.totalCash
      .plus(market.totalBorrows)
      .minus(market.totalReserves)

    // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Compound Solidity
    market.perBlockBorrowInterest = contract
      .borrowRatePerBlock()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    // TODO make the below more robust. technically if it fails, we can calculate
    //  on our side the value , since supply rate is a derivative of borrow
    let supplyRatePerBlock = contract.try_supplyRatePerBlock()
    if (supplyRatePerBlock.reverted) {
      log.info('***CALL FAILED*** : cERC20 supplyRatePerBlock() reverted', [])
      market.perBlockSupplyInterest = BigDecimal.fromString('0')
    } else {
      market.perBlockSupplyInterest = supplyRatePerBlock.value
        .toBigDecimal()
        .div(mantissaFactorBD)
        .truncate(mantissaFactor)
    }
    market.save()
  }
  return market as Market
}
