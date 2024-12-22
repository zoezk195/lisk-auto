const fs = require('fs');
const Web3 = require('web3');
const axios = require('axios');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
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

const UNIVERSAL_ROUTER_ADDRESS = '0x447B8E40B0CdA8e55F405C86bC635D02d0540aB8';
const UNIVERSAL_ROUTER_ABI = [
    {
        "constant": false,
        "inputs": [
            { "name": "commands", "type": "bytes" },
            { "name": "inputs", "type": "bytes[]" },
            { "name": "deadline", "type": "uint256" }
        ],
        "name": "execute",
        "outputs": [],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

const ERC20_ABI = [
    {
        constant: false,
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' }
        ],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
        ],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            { name: 'account', type: 'address' }
        ],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    }
];

const web3 = new Web3('https://rpc.api.lisk.com');

async function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

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
    console.log(`${TEXT_COLORS.YELLOW}${centerAlignText("Lisk auto", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.YELLOW}${centerAlignText("github.com/recitativonika", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.YELLOW}${centerAlignText("****************************************", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log("");
}

const fetchtask = async (address, axiosInstance) => {
    try {
        const taskPayload = gettask(address);
        const response = await axiosInstance.post("https://portal-api.lisk.com/graphql", taskPayload, {
            'headers': {
                'Content-Type': "application/json",
                'Accept': "application/json",
                'User-Agent': "Mozilla/5.0"
            }
        });
        const tasks = response.data?.data?.userdrop?.user?.tasks?.flatMap(taskGroup => taskGroup.tasks) || [];
        return tasks.filter(task => !task.progress.isCompleted);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}Error fetching tasks: ${error.response?.data || error.message}${TEXT_COLORS.RESET_COLOR}`);
        return [];
    }
};

const gettask = address => ({
    'query': `
    query AirdropUser($filter: UserFilter!, $tasksFilter: QueryFilter) {
      userdrop {
        user(filter: $filter) {
          tasks(filter: $tasksFilter) {
            tasks {
              id
              description
              progress {
                isCompleted
              }
            }
          }
        }
      }
    }
  `,
    'variables': {
        'filter': {
            'address': address
        }
    }
});

const taskclaim = async (address, taskId, taskDescription, index, axiosInstance) => {
    try {
        console.log(`${TEXT_COLORS.CYAN}[${index}] Claiming task: ${taskDescription} (${taskId})${TEXT_COLORS.RESET_COLOR}`);
        const taskPayload = claimpayload(address, taskId);
        const response = await axiosInstance.post("https://portal-api.lisk.com/graphql", taskPayload, {
            'headers': {
                'Content-Type': "application/json",
                'Accept': "application/json",
                'User-Agent': "Mozilla/5.0"
            }
        });
        const updateStatus = response.data?.data?.userdrop?.updateTaskStatus;
        if (updateStatus?.success) {
            console.log(`${TEXT_COLORS.GREEN}[${index}] Task ${taskDescription} (${taskId}) successfully claimed!${TEXT_COLORS.RESET_COLOR}`);
        } else {
            console.log(`${TEXT_COLORS.RED}[${index}] Failed to claim task ${taskDescription} (${taskId})${TEXT_COLORS.RESET_COLOR}`);
        }
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error claiming task ${taskDescription} (${taskId}): ${error.response?.data || error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
};

const claimpayload = (address, taskId) => ({
    'query': `
    mutation UpdateAirdropTaskStatus($input: UpdateTaskStatusInputData!) {
      userdrop {
        updateTaskStatus(input: $input) {
          success
          progress {
            isCompleted
            completedAt
          }
        }
      }
    }
  `,
    'variables': {
        'input': {
            'address': address,
            'taskID': taskId
        }
    }
});

async function executeWrapETH(account, amount, index) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;
        const contract = new web3.eth.Contract(WETH_ABI, WETH_ADDRESS);
        console.log(`${TEXT_COLORS.PURPLE}[${index}] Wrapping ETH for address: ${accountAddress}, Amount: ${amount} ETH${TEXT_COLORS.RESET_COLOR}`);

        const valueInWei = web3.utils.toWei(amount.toString(), 'ether');
        const gasEstimate = await contract.methods.deposit().estimateGas({ from: accountAddress, value: valueInWei });
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

        const tx = {
            from: accountAddress,
            to: WETH_ADDRESS,
            value: valueInWei,
            gas: gasEstimate,
            gasPrice: gasPrice,
            nonce: nonce,
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
        const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

        const tx = {
            from: accountAddress,
            to: WETH_ADDRESS,
            gas: gasEstimate,
            gasPrice: gasPrice,
            nonce: nonce,
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
        const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

        const tx = {
            from: accountAddress,
            to: accountAddress,
            value: valueInWei,
            gas: gasEstimate,
            gasPrice: gasPrice,
            nonce: nonce
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.CYAN}[${index}] Transfer to self successful. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error during self-transfer: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

const USDT_ADDRESS = '0x05D032ac25d322df992303dCa074EE7392C117b9';
async function approveUnlimitedIfNeeded(account, tokenAddress, spenderAddress, index) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;
        const contract = new web3.eth.Contract(ERC20_ABI, tokenAddress);

        const currentAllowance = await contract.methods.allowance(accountAddress, spenderAddress).call();
        const maxUint256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

        if (currentAllowance === maxUint256) {
            console.log(`${TEXT_COLORS.GREEN}[${index}] Unlimited approval already set for spender: ${spenderAddress}${TEXT_COLORS.RESET_COLOR}`);
            return;
        }

        if (currentAllowance > 0) {
            console.log(`${TEXT_COLORS.YELLOW}[${index}] Current allowance is ${currentAllowance}. Approving unlimited amount for spender: ${spenderAddress} from address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);
        } else {
            console.log(`${TEXT_COLORS.YELLOW}[${index}] No allowance set. Approving unlimited amount for spender: ${spenderAddress} from address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);
        }

        const gasEstimate = await contract.methods.approve(spenderAddress, maxUint256).estimateGas({ from: accountAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

        const tx = {
            from: accountAddress,
            to: tokenAddress,
            gas: gasEstimate,
            gasPrice: gasPrice,
            nonce: nonce,
            data: contract.methods.approve(spenderAddress, maxUint256).encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.GREEN}[${index}] Successfully approved unlimited amount. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error approving unlimited amount: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function getUSDTBalance(accountAddress) {
    const contract = new web3.eth.Contract(ERC20_ABI, USDT_ADDRESS);
    const balance = await contract.methods.balanceOf(accountAddress).call();

    return web3.utils.fromWei(balance, 'mwei');
}

async function swapUSDTToUSDC(account, index) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;

        const usdtBalance = await getUSDTBalance(accountAddress);
        console.log(`${TEXT_COLORS.CYAN}[${index}] Retrieved USDT balance: ${usdtBalance} USDT${TEXT_COLORS.RESET_COLOR}`);
        if (parseFloat(usdtBalance) < 0.05) {
            console.log(`${TEXT_COLORS.RED}[${index}] USDT balance is less than 0.05. Swap will not be processed.${TEXT_COLORS.RESET_COLOR}`);
            return;
        }

        const contract = new web3.eth.Contract(UNIVERSAL_ROUTER_ABI, UNIVERSAL_ROUTER_ADDRESS);
        const processedAddress = accountAddress.toLowerCase().replace(/^0x/, '');

        const inputMapping = {
            0.000008: `0x000000000000000000000000${processedAddress}000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002bf242275d3a6527d877f2c927a82d9b057609cc7100006405d032ac25d322df992303dca074ee7392c117b9000000000000000000000000000000000000000000`,
            0.002231: `0x000000000000000000000000${processedAddress}00000000000000000000000000000000000000000000000000000000000008b700000000000000000000000000000000000000000000000000000000000008a000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b05d032ac25d322df992303dca074ee7392c117b9000064f242275d3a6527d877f2c927a82d9b057609cc71000000000000000000000000000000000000000000`,
            0.000319: `0x000000000000000000000000${processedAddress}0000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000013b00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b05d032ac25d322df992303dca074ee7392c117b9000064f242275d3a6527d877f2c927a82d9b057609cc71000000000000000000000000000000000000000000`,
            0.000199: `0x000000000000000000000000${processedAddress}00000000000000000000000000000000000000000000000000000000000000c800000000000000000000000000000000000000000000000000000000000000c500000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b05d032ac25d322df992303dca074ee7392c117b9000064f242275d3a6527d877f2c927a82d9b057609cc71000000000000000000000000000000000000000000`
        };

        const amounts = Object.keys(inputMapping);
        const randomIndex = Math.floor(Math.random() * amounts.length);
        const amountIn = parseFloat(amounts[randomIndex]);

        console.log(`${TEXT_COLORS.PURPLE}[${index}] Attempting to swap USDT to USDC for address: ${accountAddress}, Amount: ${amountIn} USDT${TEXT_COLORS.RESET_COLOR}`);

        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const inputs = [inputMapping[amountIn]];

        try {
            await executeSwap(contract, accountAddress, inputs, deadline, index, account);
        } catch (swapError) {
            console.error(`${TEXT_COLORS.RED}[${index}] Swap failed: ${swapError.message}. Attempting to set allowance and retry...${TEXT_COLORS.RESET_COLOR}`);

            await approveUnlimitedIfNeeded(account, USDT_ADDRESS, UNIVERSAL_ROUTER_ADDRESS, index);

            try {
                await executeSwap(contract, accountAddress, inputs, deadline, index, account);
            } catch (retryError) {
                console.error(`${TEXT_COLORS.RED}[${index}] Swap failed again after setting allowance: ${retryError.message}. Skipping to next process.${TEXT_COLORS.RESET_COLOR}`);
            }
        }
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error in swapUSDTToUSDC: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function executeSwap(contract, accountAddress, inputs, deadline, index, account) {
    const gasEstimate = await contract.methods.execute('0x00', inputs, deadline).estimateGas({ from: accountAddress });
    const gasPrice = await web3.eth.getGasPrice();
    const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

    const tx = {
        from: accountAddress,
        to: UNIVERSAL_ROUTER_ADDRESS,
        gas: gasEstimate,
        gasPrice: gasPrice,
        nonce: nonce,
        data: contract.methods.execute('0x00', inputs, deadline).encodeABI()
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, account);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log(`${TEXT_COLORS.PURPLE}[${index}] Successfully swapped USDT to USDC. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
}

async function processtask(address, index, claimTasks, axiosInstance, proxy) {
    const proxyInfo = proxy ? ` (Proxy: ${proxy})` : '';
    if (proxy) {
        console.log(`${TEXT_COLORS.CYAN}[${index}] Fetching tasks for address: ${address}${proxyInfo}${TEXT_COLORS.RESET_COLOR}`);
    }
    const tasks = await fetchtask(address, axiosInstance);

    if (tasks.length === 0) {
        console.log(`${TEXT_COLORS.YELLOW}[${index}] No tasks to claim for address: ${address}${TEXT_COLORS.RESET_COLOR}`);
        return;
    }

    if (claimTasks) {
        for (const task of tasks) {
            await taskclaim(address, task.id, task.description, index, axiosInstance);
        }
        console.log(`${TEXT_COLORS.GREEN}[${index}] Finished processing tasks for address: ${address}${TEXT_COLORS.RESET_COLOR}`);
    } else {
        console.log(`${TEXT_COLORS.YELLOW}[${index}] Skipped processing tasks for address: ${address}${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function startCycle(filePath) {
    printHeader();

    console.log("");
    const actionAnswer = await askQuestion(`${TEXT_COLORS.YELLOW}Please choose an option:\n1. Execute both transactions (TX) and claim tasks\n2. Execute only transactions (TX)\n3. Execute only task claims\n4. Execute only USDT to USDC swap\nEnter your choice (1/2/3/4): ${TEXT_COLORS.RESET_COLOR}`);
    const executeTransactions = actionAnswer.trim() === '1' || actionAnswer.trim() === '2';
    const claimTasks = actionAnswer.trim() === '1' || actionAnswer.trim() === '3';
    const swapOnly = actionAnswer.trim() === '4';

    const useProxyAnswer = await askQuestion(`${TEXT_COLORS.YELLOW}Do you want to use proxies?, proxy only used in task claim not in TX (1 for Yes, 2 for No): ${TEXT_COLORS.RESET_COLOR}`);
    const useProxy = useProxyAnswer.trim() === '1';

    let proxies = [];
    if (useProxy) {
        proxies = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean).map(proxy => {
            if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
                return `http://${proxy}`;
            }
            return proxy;
        });
    }

    let isFirstCycle = true;

    async function processCycle() {
        if (isFirstCycle) {
            console.log(`${TEXT_COLORS.YELLOW}Starting the script${TEXT_COLORS.RESET_COLOR}`);
            isFirstCycle = false;
        } else {
            console.log(`${TEXT_COLORS.YELLOW}Resuming cycle...${TEXT_COLORS.RESET_COLOR}`);
        }

        const privateKeys = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i].trim();
            if (privateKey.length !== 64 && !(privateKey.length === 66 && privateKey.startsWith('0x'))) {
                console.error(`${TEXT_COLORS.RED}[${i + 1}] Invalid private key length: ${privateKey}${TEXT_COLORS.RESET_COLOR}`);
                continue;
            }

            const proxy = useProxy ? proxies[i % proxies.length] : null;
            const axiosInstance = axios.create({
                ...(proxy && { httpsAgent: new HttpsProxyAgent(proxy) })
            });

            if (executeTransactions) {
                const wrapAmount = getRandomEthAmount(ethAmountRange.min, ethAmountRange.max);
                const transferAmount = getRandomEthAmount(ethAmountRange.min, ethAmountRange.max);

                await executeWrapETH(privateKey, wrapAmount, i + 1);
                await transferToSelf(privateKey, transferAmount, i + 1);
                await unwarpETH(privateKey, wrapAmount, i + 1);
            }

            if (swapOnly || executeTransactions) {
                await swapUSDTToUSDC(privateKey, i + 1);
            }

            if (claimTasks) {
                const accountObj = web3.eth.accounts.privateKeyToAccount(privateKey);
                await processtask(accountObj.address, i + 1, claimTasks, axiosInstance, proxy);
            }
        }
        console.log(`${TEXT_COLORS.GREEN}Script cycle complete${TEXT_COLORS.RESET_COLOR}`);

        const delayInMinutes = delay / 60000;
        const delayInHours = delayInMinutes / 60;
        if (delayInMinutes < 60) {
            console.log(`${TEXT_COLORS.CYAN}Waiting for the next cycle in ${delayInMinutes.toFixed(0)} minute(s)...${TEXT_COLORS.RESET_COLOR}`);
        } else {
            console.log(`${TEXT_COLORS.CYAN}Waiting for the next cycle in ${delayInHours.toFixed(0)} hour(s)...${TEXT_COLORS.RESET_COLOR}`);
        }

        setTimeout(processCycle, delay);
    };

    processCycle();
}

const filePath = 'key.txt';
startCycle(filePath);
