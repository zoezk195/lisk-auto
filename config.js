module.exports = {
    ethAmountRange: {
        min: 0.00000001, // minimum ETH amount
        max: 0.0000001 // maximum ETH amount
    },
    delay: 21600000, // // 6 hour in milliseconds
    unwarpPercentage: 0.95 // 95% of the wrapped amounts
    usdtAmounts: {
        borrowAmount: '0.16', // Custom borrow amount in USDT (must be more than 0.16)
        repayAmount: '0.16'   // Custom repay amount in USDT (must be more than 0.16)
    }
};
