// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title MidasToken (GOLD)
/// @notice The native value token of the Midas protocol on OPN Chain. It is the reward
///         streamed by MidasVault and the asset distributed by MidasAirdrop, so loyalty
///         (NeoPoints) staked through the vault converts into GOLD over time.
/// @dev Fixed supply minted once to the treasury at deploy. ERC20Permit enables gasless
///      approvals for a smoother staking UX; ERC20Burnable lets holders/ protocol retire supply.
contract MidasToken is ERC20, ERC20Permit, ERC20Burnable {
    /// @dev Total supply: 100,000,000 GOLD (18 decimals), minted once at deploy.
    uint256 public constant MAX_SUPPLY = 100_000_000 ether;

    constructor(address treasury)
        ERC20("Midas Gold", "GOLD")
        ERC20Permit("Midas Gold")
    {
        _mint(treasury, MAX_SUPPLY);
    }
}
