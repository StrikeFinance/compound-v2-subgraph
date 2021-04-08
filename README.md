# Strike-Subgraph

[Strike](https://strike.org/) is an open-source protocol for algorithmic, efficient Money Markets on the Ethereum blockchain. This Subgraph ingests the V2 contracts of the protocol.

## Networks and Performance

This subgraph can be found on The Graph Hosted Service at https://thegraph.com/explorer/subgraph/strikefinance/strike-subgraph.

You can also run this subgraph locally, if you wish. Instructions for that can be found in [The Graph Documentation](https://thegraph.com/docs/quick-start).

### ABI

The ABI used is `stoken.json`. It is a stripped down version of the full abi provided by compound, that satisfies the calls we need to make for both sETH and sERC20 contracts. This way we can use 1 ABI file, and one mapping for sETH and sERC20.

## Getting started with querying

Below are a few ways to show how to query the Compound V2 Subgraph for data. The queries show most of the information that is queryable, but there are many other filtering options that can be used, just check out the [querying api](https://github.com/graphprotocol/graph-node/blob/master/docs/graphql-api.md).

You can also see the saved queries on the hosted service for examples.
