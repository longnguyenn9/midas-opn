// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRepOracle} from "./interfaces/IRepOracle.sol";

/// @title MidasMultiVault
/// @notice A multi-pool staking vault: stake any whitelisted OPN asset (NeoPoints, WOPN, USDT,
///         GOLD, ...) into its pool and earn a shared GOLD emission. Each pool gets a slice of
///         the global GOLD-per-second emission proportional to its allocation points, and every
///         staker's share within a pool is boosted by their on-chain REP score (up to 2.5x).
/// @dev MasterChef-style accounting (accRewardPerShare per pool), but pool share totals and
///      per-user shares are REP-"boosted" units rather than raw token amounts. Reward math runs
///      in 1e12 fixed-point. GOLD is funded once into this contract and streamed via rewardRate.
contract MidasMultiVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* --------------------------------- Errors -------------------------------- */
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance();
    error PoolExists();
    error BadPool();

    /* --------------------------------- Events -------------------------------- */
    event PoolAdded(uint256 indexed pid, address indexed token, uint256 allocPoint);
    event PoolAllocUpdated(uint256 indexed pid, uint256 allocPoint);
    event Deposited(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdrawn(address indexed user, uint256 indexed pid, uint256 amount);
    event Harvested(address indexed user, uint256 indexed pid, uint256 amount);
    event BoostRefreshed(address indexed user, uint256 indexed pid, uint256 oldShares, uint256 newShares);
    event RewardRateUpdated(uint256 rewardPerSecond);
    event RepOracleUpdated(address indexed oracle);

    /* -------------------------------- Constants ------------------------------ */
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_BOOST_BPS = 25_000; // 2.5x
    uint256 public constant REP_PER_BP = 100;
    uint256 private constant ACC_PRECISION = 1e12;

    /* ---------------------------------- Types -------------------------------- */
    struct PoolInfo {
        IERC20 token;            // staked asset for this pool
        uint256 allocPoint;      // share of global emission
        uint256 lastRewardTime;  // last timestamp rewards were accrued
        uint256 accRewardPerShare; // accumulated GOLD per boosted share, scaled by ACC_PRECISION
        uint256 totalShares;     // sum of all boosted shares in this pool
    }

    struct UserInfo {
        uint256 amount;       // raw token amount the user deposited
        uint256 shares;       // REP-boosted shares derived from amount
        uint256 rewardDebt;   // bookkeeping for accRewardPerShare accounting
    }

    /* --------------------------------- State --------------------------------- */
    IERC20 public immutable rewardToken; // GOLD
    IRepOracle public repOracle;

    uint256 public rewardPerSecond;      // global GOLD emission per second
    uint256 public totalAllocPoint;      // sum of all pools' allocPoint

    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    mapping(address => bool) public poolExists; // token => already has a pool

    constructor(address rewardToken_, address repOracle_, uint256 rewardPerSecond_, address owner_)
        Ownable(owner_)
    {
        if (rewardToken_ == address(0) || repOracle_ == address(0)) revert ZeroAddress();
        rewardToken = IERC20(rewardToken_);
        repOracle = IRepOracle(repOracle_);
        rewardPerSecond = rewardPerSecond_;
    }

    /* -------------------------------- Views ---------------------------------- */

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /// @notice REP-derived multiplier in basis points (>= 1x), same curve everywhere in Midas.
    function boostBps(address account) public view returns (uint256) {
        uint256 score = repOracle.repOf(account);
        uint256 bps = BPS + (score / REP_PER_BP);
        return bps > MAX_BOOST_BPS ? MAX_BOOST_BPS : bps;
    }

    function _boosted(address account, uint256 rawAmount) internal view returns (uint256) {
        return (rawAmount * boostBps(account)) / BPS;
    }

    /// @notice Pending GOLD for `user` in pool `pid`, including not-yet-accrued emission.
    function pendingReward(uint256 pid, address user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage u = userInfo[pid][user];
        uint256 acc = pool.accRewardPerShare;
        if (block.timestamp > pool.lastRewardTime && pool.totalShares != 0 && totalAllocPoint != 0) {
            uint256 elapsed = block.timestamp - pool.lastRewardTime;
            uint256 reward = (elapsed * rewardPerSecond * pool.allocPoint) / totalAllocPoint;
            acc += (reward * ACC_PRECISION) / pool.totalShares;
        }
        return (u.shares * acc) / ACC_PRECISION - u.rewardDebt;
    }

    /* ----------------------------- Pool admin -------------------------------- */

    /// @notice Add a new staking pool for `token`. Each token can only have one pool.
    function addPool(address token, uint256 allocPoint) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (poolExists[token]) revert PoolExists();
        _massUpdatePools();

        totalAllocPoint += allocPoint;
        poolInfo.push(
            PoolInfo({
                token: IERC20(token),
                allocPoint: allocPoint,
                lastRewardTime: block.timestamp,
                accRewardPerShare: 0,
                totalShares: 0
            })
        );
        poolExists[token] = true;
        emit PoolAdded(poolInfo.length - 1, token, allocPoint);
    }

    /// @notice Adjust a pool's allocation points (its slice of the global emission).
    function setAlloc(uint256 pid, uint256 allocPoint) external onlyOwner {
        if (pid >= poolInfo.length) revert BadPool();
        _massUpdatePools();
        totalAllocPoint = totalAllocPoint - poolInfo[pid].allocPoint + allocPoint;
        poolInfo[pid].allocPoint = allocPoint;
        emit PoolAllocUpdated(pid, allocPoint);
    }

    function setRewardPerSecond(uint256 rewardPerSecond_) external onlyOwner {
        _massUpdatePools();
        rewardPerSecond = rewardPerSecond_;
        emit RewardRateUpdated(rewardPerSecond_);
    }

    function setRepOracle(address oracle) external onlyOwner {
        if (oracle == address(0)) revert ZeroAddress();
        repOracle = IRepOracle(oracle);
        emit RepOracleUpdated(oracle);
    }

    /* ----------------------------- Accrual ----------------------------------- */

    function _massUpdatePools() internal {
        uint256 len = poolInfo.length;
        for (uint256 pid = 0; pid < len; ++pid) {
            _updatePool(pid);
        }
    }

    function updatePool(uint256 pid) external {
        if (pid >= poolInfo.length) revert BadPool();
        _updatePool(pid);
    }

    function _updatePool(uint256 pid) internal {
        PoolInfo storage pool = poolInfo[pid];
        if (block.timestamp <= pool.lastRewardTime) return;
        if (pool.totalShares == 0 || totalAllocPoint == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - pool.lastRewardTime;
        uint256 reward = (elapsed * rewardPerSecond * pool.allocPoint) / totalAllocPoint;
        pool.accRewardPerShare += (reward * ACC_PRECISION) / pool.totalShares;
        pool.lastRewardTime = block.timestamp;
    }

    /* ----------------------------- User actions ------------------------------ */

    /// @dev Settle any pending reward to the user, paying it out in GOLD.
    function _harvest(uint256 pid, address user) internal {
        UserInfo storage u = userInfo[pid][user];
        if (u.shares == 0) return;
        uint256 pending = (u.shares * poolInfo[pid].accRewardPerShare) / ACC_PRECISION - u.rewardDebt;
        if (pending > 0) {
            rewardToken.safeTransfer(user, pending);
            emit Harvested(user, pid, pending);
        }
    }

    function deposit(uint256 pid, uint256 amount) external nonReentrant {
        if (pid >= poolInfo.length) revert BadPool();
        if (amount == 0) revert ZeroAmount();
        _updatePool(pid);
        _harvest(pid, msg.sender);

        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage u = userInfo[pid][msg.sender];

        uint256 newRaw = u.amount + amount;
        uint256 oldShares = u.shares;
        uint256 newShares = _boosted(msg.sender, newRaw);

        pool.totalShares = pool.totalShares - oldShares + newShares;
        u.amount = newRaw;
        u.shares = newShares;
        u.rewardDebt = (newShares * pool.accRewardPerShare) / ACC_PRECISION;

        pool.token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, pid, amount);
    }

    function withdraw(uint256 pid, uint256 amount) public nonReentrant {
        if (pid >= poolInfo.length) revert BadPool();
        if (amount == 0) revert ZeroAmount();
        UserInfo storage u = userInfo[pid][msg.sender];
        if (amount > u.amount) revert InsufficientBalance();
        _updatePool(pid);
        _harvest(pid, msg.sender);

        PoolInfo storage pool = poolInfo[pid];
        uint256 newRaw = u.amount - amount;
        uint256 oldShares = u.shares;
        uint256 newShares = _boosted(msg.sender, newRaw);

        pool.totalShares = pool.totalShares - oldShares + newShares;
        u.amount = newRaw;
        u.shares = newShares;
        u.rewardDebt = (newShares * pool.accRewardPerShare) / ACC_PRECISION;

        pool.token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, pid, amount);
    }

    /// @notice Claim pending GOLD from a pool without changing the staked principal.
    function harvest(uint256 pid) external nonReentrant {
        if (pid >= poolInfo.length) revert BadPool();
        _updatePool(pid);
        _harvest(pid, msg.sender);
        UserInfo storage u = userInfo[pid][msg.sender];
        u.rewardDebt = (u.shares * poolInfo[pid].accRewardPerShare) / ACC_PRECISION;
    }

    /// @notice Re-sync the caller's boosted shares in a pool to their latest REP score.
    function refreshBoost(uint256 pid) external nonReentrant {
        if (pid >= poolInfo.length) revert BadPool();
        _updatePool(pid);
        _harvest(pid, msg.sender);

        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage u = userInfo[pid][msg.sender];
        uint256 oldShares = u.shares;
        uint256 newShares = _boosted(msg.sender, u.amount);
        if (newShares != oldShares) {
            pool.totalShares = pool.totalShares - oldShares + newShares;
            u.shares = newShares;
            emit BoostRefreshed(msg.sender, pid, oldShares, newShares);
        }
        u.rewardDebt = (u.shares * pool.accRewardPerShare) / ACC_PRECISION;
    }

    /// @notice Withdraw everything from a pool and harvest in one call.
    function exit(uint256 pid) external {
        withdraw(pid, userInfo[pid][msg.sender].amount);
    }
}
