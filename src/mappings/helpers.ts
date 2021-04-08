/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { BigDecimal, BigInt, Bytes, Address } from '@graphprotocol/graph-ts'
import { AccountSToken, Account, AccountSTokenTransaction } from '../types/schema'

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export let mantissaFactor = 18
export let sTokenDecimals = 8
export let mantissaFactorBD: BigDecimal = exponentToBigDecimal(18)
export let sTokenDecimalsBD: BigDecimal = exponentToBigDecimal(8)
export let zeroBD = BigDecimal.fromString('0')

export function createAccountSToken(
  sTokenStatsID: string,
  symbol: string,
  account: string,
  marketID: string,
): AccountSToken {
  let sTokenStats = new AccountSToken(sTokenStatsID)
  sTokenStats.symbol = symbol
  sTokenStats.market = marketID
  sTokenStats.account = account
  sTokenStats.accrualBlockNumber = BigInt.fromI32(0)
  sTokenStats.sTokenBalance = zeroBD
  sTokenStats.totalUnderlyingSupplied = zeroBD
  sTokenStats.totalUnderlyingRedeemed = zeroBD
  sTokenStats.accountBorrowIndex = zeroBD
  sTokenStats.totalUnderlyingBorrowed = zeroBD
  sTokenStats.totalUnderlyingRepaid = zeroBD
  sTokenStats.storedBorrowBalance = zeroBD
  sTokenStats.enteredMarket = false
  return sTokenStats
}

export function createAccount(accountID: string): Account {
  let account = new Account(accountID)
  account.countLiquidated = 0
  account.countLiquidator = 0
  account.hasBorrowed = false
  account.save()
  return account
}

export function updateCommonSTokenStats(
  marketID: string,
  marketSymbol: string,
  accountID: string,
  tx_hash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
): AccountSToken {
  let sTokenStatsID = marketID.concat('-').concat(accountID)
  let sTokenStats = AccountSToken.load(sTokenStatsID)
  if (sTokenStats == null) {
    sTokenStats = createAccountSToken(sTokenStatsID, marketSymbol, accountID, marketID)
  }
  getOrCreateAccountSTokenTransaction(
    sTokenStatsID,
    tx_hash,
    timestamp,
    blockNumber,
    logIndex,
  )
  sTokenStats.accrualBlockNumber = blockNumber
  return sTokenStats as AccountSToken
}

export function getOrCreateAccountSTokenTransaction(
  accountID: string,
  tx_hash: Bytes,
  timestamp: BigInt,
  block: BigInt,
  logIndex: BigInt,
): AccountSTokenTransaction {
  let id = accountID
    .concat('-')
    .concat(tx_hash.toHexString())
    .concat('-')
    .concat(logIndex.toString())
  let transaction = AccountSTokenTransaction.load(id)

  if (transaction == null) {
    transaction = new AccountSTokenTransaction(id)
    transaction.account = accountID
    transaction.tx_hash = tx_hash
    transaction.timestamp = timestamp
    transaction.block = block
    transaction.logIndex = logIndex
    transaction.save()
  }

  return transaction as AccountSTokenTransaction
}
