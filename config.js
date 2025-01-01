module.exports = {
    ethAmountRange: {
        min: 0.00000001, // Minimum amount of ETH to use in random transactions
        max: 0.0000001 // Maximum amount of ETH to use in random transactions
    },
    delay: 21600000, // Delay in milliseconds (6 hours) between cycles if using the delay option
    unwarpPercentage: 0.95, // Percentage of WETH to unwrap during the unwrapping process
    usdtAmounts: {
        borrowAmount: '0.16', // Amount of USDT to borrow in the borrow process
        repayAmount: '0.16' // Amount of USDT to repay in the repay process
    },
    usdcAmounts: {
        supplyAmount: '0.5', // One-time supply amount USDC
        supplyAmount71Times: '0.0001' // 71-time supply amount USDC
    }
};
