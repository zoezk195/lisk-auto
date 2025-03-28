# lisk auto

## Description
This script automated Send, Swap, Borrow, Repay, wrap, unwrap, supply and claim task in Lisk blockchain and airdrop.

## Features
- **Send, Swap, Borrow, Repay, wrap, unwrap, supply and claim task of Lisk airdrop**

## Prerequisites
- [Node.js](https://nodejs.org/) (version 12 or higher)
- Lisk ETH, [Bridge here](https://www.relay.link/bridge/lisk?fromChainId=1)
- USDT and USDC, [Swap here](https://oku.trade/?inputChain=lisk&inToken=0x0000000000000000000000000000000000000000&outToken=0x05D032ac25d322df992303dCa074EE7392C117b9&outTokenAmount=%220.0002593012318621867%22&inTokenAmount=%220.0002593012318621867%22)

## Important notes
- Site used to supply/borrow [in here](https://app.ionic.money/market?chain=1135&pool=0)

## Installation

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/recitativonika/lisk-auto.git
   ```
2. Navigate to the project directory:
   ```bash
   cd lisk-auto
   ```
3. Install the necessary dependencies:
   ```bash
   npm install
   ```

## Usage
1. Register to lisk airdrop page first and complete the mandatory taks, you can [register here](https://portal.lisk.com/airdrop) and use my code if you want :) : `oHRCaR` and please check how to complete the mandatory task in [their website here](https://lisk.com/blog/posts/lisk-lsk-airdrop/)
2. Modify `key.txt` with your private key of your wallet with format like this:
   ```bash
   privkey1
   privkey2
   ```
   if you want to use proxy, add proxy in `proxy.txt` with this format:
   ```
   proxy1
   proxy2
   ```
   proxy is used only when you choose to use and only in claim task.
4. Edit `config.js` for change the delay, ETH range and percentage of unwrap ETH.
   ```bash
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
   ```
5. Run the script:
   ```bash
   node index.js
   ```

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

## Note
This script is for testing purposes only, using this script may violate ToS and may get your account permanently banned and I am not responsible for anything that happens with your account/wallet.

My reff code if you want to use :) :
```bash
oHRCaR
```
