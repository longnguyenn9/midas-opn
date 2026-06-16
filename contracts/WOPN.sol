// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title WOPN — Wrapped OPN
/// @notice Canonical wrapper for OPN Chain's native gas coin, mirroring the WETH9 interface.
///         The MasterChef-style MidasMultiVault only understands ERC20 pools, so native OPN is
///         wrapped 1:1 into WOPN before it can be staked. 1 WOPN is always redeemable for 1 OPN.
/// @dev Holds native OPN as backing; total supply equals the contract's native balance.
contract WOPN is ERC20 {
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    error InsufficientBalance();
    error NativeTransferFailed();

    constructor() ERC20("Wrapped OPN", "WOPN") {}

    /// @notice Wrap native OPN sent with this call into an equal amount of WOPN.
    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Burn WOPN and receive the same amount of native OPN back.
    function withdraw(uint256 amount) external {
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();
        _burn(msg.sender, amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    /// @notice Wrap by sending OPN directly to the contract.
    receive() external payable {
        deposit();
    }
}
