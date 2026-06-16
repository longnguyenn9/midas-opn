// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Reads a wallet's on-chain REP (reputation) score on OPN Chain.
/// @dev Adapter for IOPn's NeoID system. NeoID (soulbound identity + ERC-6551) exposes a wallet's
///      REP score; this interface is the read side of that. NeoID is "coming soon" on OPN Chain, so
///      testnet uses a mock. When the native REP registry ships, point Midas at it via setRepOracle()
///      on the vault/airdrop — no other code changes needed.
interface IRepOracle {
    /// @return score The reputation score for `account` (0 = no reputation).
    function repOf(address account) external view returns (uint256 score);
}
