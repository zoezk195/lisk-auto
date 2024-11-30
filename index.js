const fs = require('fs');
const Web3 = require('web3');
const { ethAmountRange, delay, unwarpPercentage } = require('./config');

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const WETH_ABI = [
    {
        constant: false,
        inputs: [],
        name: 'deposit',
        outputs: [],
        payable: true,
        stateMutability: 'payable',
        type: 'function'
    },
    {
        constant: false,
        inputs: [{ name: 'wad', type: 'uint256' }],
        name: 'withdraw',
        outputs: [],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    }
];

const web3 = new Web3('https://rpc.api.lisk.com');

function getRandomEthAmount(min, max) {
    return (Math.random() * (max - min) + min).toFixed(9);
}

function centerAlignText(text, width) {
    const padding = Math.floor((width - text.length) / 2);
    return ' '.repeat(padding) + text + ' '.repeat(padding);
}

const TEXT_COLORS = {
    YELLOW: '\x1b[33m',
    PURPLE: '\x1b[35m',
    CYAN: '\x1b[36m',
    GREEN: '\x1b[32m',
    RED: '\x1b[31m',
    RESET_COLOR: '\x1b[0m'
};

function printHeader() {
    const terminalWidth = process.stdout.columns || 80;
    console.log("");
    console.log(`${TEXT_COLORS.YELLOW}${centerAlignText("****************************************", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.YELLOW}${centerAlignText("Lisk auto TX", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.YELLOW}${centerAlignText("github.com/recitativonika", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.YELLOW}${centerAlignText("****************************************", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log("");
}

async function executeWrapETH(account, amount, index) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;
        const contract = new web3.eth.Contract(WETH_ABI, WETH_ADDRESS);
        console.log(`${TEXT_COLORS.PURPLE}[${index}] Wrapping ETH for address: ${accountAddress}, Amount: ${amount} ETH${TEXT_COLORS.RESET_COLOR}`);

        const valueInWei = web3.utils.toWei(amount.toString(), 'ether');
        const gasEstimate = await contract.methods.deposit().estimateGas({ from: accountAddress, value: valueInWei });
        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
            from: accountAddress,
            to: WETH_ADDRESS,
            value: valueInWei,
            gas: gasEstimate,
            gasPrice: gasPrice,
            data: contract.methods.deposit().encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.PURPLE}[${index}] Successfully wrapped ETH. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error wrapping ETH: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function unwarpETH(account, amount, index) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;
        const contract = new web3.eth.Contract(WETH_ABI, WETH_ADDRESS);
        const unwarpAmount = (amount * unwarpPercentage).toFixed(9);
        console.log(`${TEXT_COLORS.GREEN}[${index}] Unwrapping ${unwarpPercentage * 100}% of WETH for address: ${accountAddress}, Amount: ${unwarpAmount} ETH${TEXT_COLORS.RESET_COLOR}`);

        const valueInWei = web3.utils.toWei(unwarpAmount.toString(), 'ether');
        const gasEstimate = await contract.methods.withdraw(valueInWei).estimateGas({ from: accountAddress });
        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
            from: accountAddress,
            to: WETH_ADDRESS,
            gas: gasEstimate,
            gasPrice: gasPrice,
            data: contract.methods.withdraw(valueInWei).encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.GREEN}[${index}] Successfully unwrapped WETH. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error unwrapping WETH: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function transferToSelf(account, amount, index) {
    const accountObj = web3.eth.accounts.privateKeyToAccount(account);
    const accountAddress = accountObj.address;
    try {
        console.log(`${TEXT_COLORS.CYAN}[${index}] Transferring ${amount} ETH to self: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);

        const valueInWei = web3.utils.toWei(amount.toString(), 'ether');
        const gasEstimate = await web3.eth.estimateGas({ from: accountAddress, to: accountAddress, value: valueInWei });
        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
            from: accountAddress,
            to: accountAddress,
            value: valueInWei,
            gas: gasEstimate,
            gasPrice: gasPrice
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.CYAN}[${index}] Transfer to self successful. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error during self-transfer: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

function startCycle(filePath) {
    const processCycle = async () => {
        console.log(`${TEXT_COLORS.YELLOW}Starting the script${TEXT_COLORS.RESET_COLOR}`);
        const privateKeys = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i].trim();
            if (privateKey.length !== 64 && !(privateKey.length === 66 && privateKey.startsWith('0x'))) {
                console.error(`${TEXT_COLORS.RED}[${i + 1}] Invalid private key length: ${privateKey}${TEXT_COLORS.RESET_COLOR}`);
                continue;
            }
            const wrapAmount = getRandomEthAmount(ethAmountRange.min, ethAmountRange.max);
            const transferAmount = getRandomEthAmount(ethAmountRange.min, ethAmountRange.max);
            await executeWrapETH(privateKey, wrapAmount, i + 1);
            await transferToSelf(privateKey, transferAmount, i + 1);
            await unwarpETH(privateKey, wrapAmount, i + 1);
        }
        console.log(`${TEXT_COLORS.GREEN}Script cycle complete${TEXT_COLORS.RESET_COLOR}`);

        const delayInMinutes = delay / 60000;
        const delayInHours = delayInMinutes / 60;
        if (delayInMinutes < 60) {
            console.log(`${TEXT_COLORS.CYAN}Waiting for the next cycle in ${delayInMinutes.toFixed(0)} minute(s)...${TEXT_COLORS.RESET_COLOR}`);
        } else {
            console.log(`${TEXT_COLORS.CYAN}Waiting for the next cycle in ${delayInHours.toFixed(0)} hour(s)...${TEXT_COLORS.RESET_COLOR}`);
        }

        setTimeout(() => {
            console.log(`${TEXT_COLORS.YELLOW}Resuming cycle...${TEXT_COLORS.RESET_COLOR}`);
            processCycle();
        }, delay);
    };

    printHeader();
    processCycle();
}

const filePath = 'key.txt';
startCycle(filePath);
