# lisk auto

## Description
This script automated Send, wrap, unwrap ETH and claim task in Lisk blockchain and airdrop.

## Features
- **Send, wrap, unwrap ETH and claim task of Lisk airdrop**

## Prerequisites
- [Node.js](https://nodejs.org/) (version 12 or higher)

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
2. Modify `priv.txt` with your private key of your wallet with format like this:
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
   ```
   module.exports = {
      ethAmountRange: {
         min: 0.00000001,
         max: 0.0000001
         }, // range of ETH amount that will be used and randomize
         delay: 21600000, // 6 hour in milliseconds
         unwarpPercentage: 0.95 // 95% of the wrapped amounts
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
