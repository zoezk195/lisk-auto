const fs = require('fs');
const Web3 = require('web3');
const axios = require('axios');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { ethAmountRange, delay, unwarpPercentage, usdtAmounts, usdcAmounts } = require('./config');

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

const BORROW_CONTRACT_ADDRESS = '0x0D72f18BC4b4A2F0370Af6D799045595d806636F';
const BORROW_CONTRACT_ABI = [
    {
        constant: false,
        inputs: [{ name: 'borrowAmount', type: 'uint256' }],
        name: 'borrow',
        outputs: [],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: false,
        inputs: [{ name: 'repayAmount', type: 'uint256' }],
        name: 'repayBorrow',
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

const USDC_CONTRACT_ABI = [
    {
        constant: false,
        inputs: [{ name: 'amount', type: 'uint256' }],
        name: 'mint',
        outputs: [],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    }
];

const COLLATERAL_CONTRACT_ABI = [
    {
        constant: true,
        inputs: [{ name: 'account', type: 'address' }],
        name: 'getAccountLiquidity',
        outputs: [
            { name: 'error', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' },
            { name: 'shortfall', type: 'uint256' }
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        constant: false,
        inputs: [{ name: 'cTokens', type: 'address[]' }],
        name: 'enterMarkets',
        outputs: [{ name: '', type: 'uint256[]' }],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    }
];

const web3 = new Web3('https://rpc.api.lisk.com');

async function askQuestion(query, validAnswers = null) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        const ask = () => {
            rl.question(query, ans => {
                const trimmedAnswer = ans.trim().toLowerCase();
                if (validAnswers && !validAnswers.includes(trimmedAnswer)) {
                    console.log(`${TEXT_COLORS.RED}Invalid answer. Please enter one of the following: ${validAnswers.join(', ')}.${TEXT_COLORS.RESET_COLOR}`);
                    ask();
                } else {
                    rl.close();
                    resolve(trimmedAnswer);
                }
            });
        };
        ask();
    });
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
    console.log(`${TEXT_COLORS.CYAN}${centerAlignText("***********************************", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.CYAN}${centerAlignText("Lisk auto TX and Task Claim", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.GREEN}${centerAlignText("@recitativonika", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.CYAN}${centerAlignText("github.com/recitativonika", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
    console.log(`${TEXT_COLORS.CYAN}${centerAlignText("***********************************", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
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

async function executeWrapETH(account, amount, index, maxRetries) {
    let attempts = 0;
    while (attempts < maxRetries || maxRetries === 0) {
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
            break;
        } catch (error) {
            attempts++;
            console.error(`${TEXT_COLORS.RED}[${index}] Error wrapping ETH: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
            if (attempts >= maxRetries && maxRetries !== 0) {
                console.error(`${TEXT_COLORS.RED}[${index}] Max retries reached for wrapping ETH. Skipping to next process.${TEXT_COLORS.RESET_COLOR}`);
                break;
            }
        }
    }
}

async function unwarpETH(account, amount, index, maxRetries) {
    let attempts = 0;
    while (attempts < maxRetries || maxRetries === 0) {
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
            break;
        } catch (error) {
            attempts++;
            console.error(`${TEXT_COLORS.RED}[${index}] Error unwrapping WETH: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
            if (attempts >= maxRetries && maxRetries !== 0) {
                console.error(`${TEXT_COLORS.RED}[${index}] Max retries reached for unwrapping WETH. Skipping to next process.${TEXT_COLORS.RESET_COLOR}`);
                break;
            }
        }
    }
}

async function transferToSelf(account, amount, index, maxRetries) {
    let attempts = 0;
    while (attempts < maxRetries || maxRetries === 0) {
        try {
            const accountObj = web3.eth.accounts.privateKeyToAccount(account);
            const accountAddress = accountObj.address;
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
            break;
        } catch (error) {
            attempts++;
            console.error(`${TEXT_COLORS.RED}[${index}] Error during self-transfer: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
            if (attempts >= maxRetries && maxRetries !== 0) {
                console.error(`${TEXT_COLORS.RED}[${index}] Max retries reached for self-transfer. Skipping to next process.${TEXT_COLORS.RESET_COLOR}`);
                break;
            }
        }
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

async function checkAllowance(account, tokenAddress, spenderAddress, requiredAmount) {
    const accountObj = web3.eth.accounts.privateKeyToAccount(account);
    const accountAddress = accountObj.address;
    const contract = new web3.eth.Contract(ERC20_ABI, tokenAddress);

    const allowance = await contract.methods.allowance(accountAddress, spenderAddress).call();
    return web3.utils.toBN(allowance).gte(web3.utils.toBN(requiredAmount));
}

async function swapUSDTToUSDC(account, index, maxRetries) {
    let attempts = 0;
    const requiredAllowance = web3.utils.toWei('1', 'mwei');

    while (attempts < maxRetries || maxRetries === 0) {
        try {
            const accountObj = web3.eth.accounts.privateKeyToAccount(account);
            const accountAddress = accountObj.address;

            const usdtBalance = await getUSDTBalance(accountAddress);
            console.log(`${TEXT_COLORS.CYAN}[${index}] USDT balance: ${usdtBalance} USDT${TEXT_COLORS.RESET_COLOR}`);

            if (parseFloat(usdtBalance) < 0.1) {
                console.log(`${TEXT_COLORS.RED}[${index}] Insufficient USDT balance for swap. Required: 0.1 USDT${TEXT_COLORS.RESET_COLOR}`);
                return;
            }

            const hasSufficientAllowance = await checkAllowance(account, USDT_ADDRESS, UNIVERSAL_ROUTER_ADDRESS, requiredAllowance);
            if (!hasSufficientAllowance) {
                console.log(`${TEXT_COLORS.YELLOW}[${index}] Insufficient allowance. Approving USDT...${TEXT_COLORS.RESET_COLOR}`);
                await approveUnlimitedIfNeeded(account, USDT_ADDRESS, UNIVERSAL_ROUTER_ADDRESS, index);
            }

            const contract = new web3.eth.Contract(UNIVERSAL_ROUTER_ABI, UNIVERSAL_ROUTER_ADDRESS);

            console.log(`${TEXT_COLORS.PURPLE}[${index}] Attempting to swap USDT to USDC for address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);

            const commands = '0x00';
            const inputs = [
                `0x000000000000000000000000${accountAddress.slice(2)}000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000007700000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b05d032ac25d322df992303dca074ee7392c117b9000064f242275d3a6527d877f2c927a82d9b057609cc71000000000000000000000000000000000000000000`
            ];
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

            const gasEstimate = await contract.methods.execute(commands, inputs, deadline).estimateGas({ from: accountAddress });
            const gasPrice = await web3.eth.getGasPrice();
            const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

            const tx = {
                from: accountAddress,
                to: UNIVERSAL_ROUTER_ADDRESS,
                gas: gasEstimate,
                gasPrice: gasPrice,
                nonce: nonce,
                data: contract.methods.execute(commands, inputs, deadline).encodeABI()
            };

            const signedTx = await web3.eth.accounts.signTransaction(tx, account);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

            console.log(`${TEXT_COLORS.PURPLE}[${index}] Successfully swapped USDT to USDC. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
            break;
        } catch (swapError) {
            attempts++;
            console.error(`${TEXT_COLORS.RED}[${index}] Swap attempt ${attempts} failed: ${swapError.message}.${TEXT_COLORS.RESET_COLOR}`);

            if (attempts >= maxRetries && maxRetries !== 0) {
                console.error(`${TEXT_COLORS.RED}[${index}] Max retries reached for swap. Skipping to next process.${TEXT_COLORS.RESET_COLOR}`);
                break;
            }

            console.log(`${TEXT_COLORS.YELLOW}[${index}] Retrying swap...${TEXT_COLORS.RESET_COLOR}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function borrowTokens(account, borrowAmount, index, maxRetries) {
    let attempts = 0;
    while (attempts < maxRetries || maxRetries === 0) {
        try {
            const accountObj = web3.eth.accounts.privateKeyToAccount(account);
            const accountAddress = accountObj.address;
            const borrowContract = new web3.eth.Contract(BORROW_CONTRACT_ABI, BORROW_CONTRACT_ADDRESS);
            const usdtContract = new web3.eth.Contract(ERC20_ABI, USDT_ADDRESS);

            const displayAmount = web3.utils.fromWei(borrowAmount, 'mwei');

            console.log(`${TEXT_COLORS.CYAN}[${index}] Attempting to borrow ${displayAmount} USDT for address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);

            const initialBalanceWei = await usdtContract.methods.balanceOf(accountAddress).call();
            const initialBalance = web3.utils.fromWei(initialBalanceWei, 'mwei');
            console.log(`${TEXT_COLORS.YELLOW}[${index}] Initial USDT balance: ${initialBalance}${TEXT_COLORS.RESET_COLOR}`);

            const gasEstimate = await borrowContract.methods.borrow(borrowAmount).estimateGas({ from: accountAddress });
            const gasPrice = await web3.eth.getGasPrice();
            const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

            const tx = {
                from: accountAddress,
                to: BORROW_CONTRACT_ADDRESS,
                gas: gasEstimate,
                gasPrice: gasPrice,
                nonce: nonce,
                data: borrowContract.methods.borrow(borrowAmount).encodeABI()
            };

            const signedTx = await web3.eth.accounts.signTransaction(tx, account);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

            if (receipt.status) {
                await new Promise(resolve => setTimeout(resolve, 5000));

                const finalBalanceWei = await usdtContract.methods.balanceOf(accountAddress).call();
                const finalBalance = web3.utils.fromWei(finalBalanceWei, 'mwei');
                console.log(`${TEXT_COLORS.YELLOW}[${index}] Final USDT balance: ${finalBalance}${TEXT_COLORS.RESET_COLOR}`);
                const balanceIncreased = parseFloat(finalBalance) > parseFloat(initialBalance);

                if (balanceIncreased) {
                    console.log(`${TEXT_COLORS.CYAN}[${index}] Successfully borrowed. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
                    break;
                } else {
                    console.error(`${TEXT_COLORS.RED}[${index}] Borrow transaction was mined, but balance did not increase. Check collateral requirements.${TEXT_COLORS.RESET_COLOR}`);
                }
            } else {
                console.error(`${TEXT_COLORS.RED}[${index}] Borrow transaction failed. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
            }
        } catch (error) {
            const transactionHash = error.receipt ? error.receipt.transactionHash : 'unknown';
            console.error(`${TEXT_COLORS.RED}[${index}] Error borrowing: Transaction reverted. Hash: ${transactionHash}${TEXT_COLORS.RESET_COLOR}`);
        }

        attempts++;
        if (attempts >= maxRetries && maxRetries !== 0) {
            console.error(`${TEXT_COLORS.RED}[${index}] Max retries reached for borrowing. Skipping to next process.${TEXT_COLORS.RESET_COLOR}`);
            break;
        }
    }
}

async function processBorrowAndRepay(account, index, maxRetries) {
    const borrowAmount = web3.utils.toWei(usdtAmounts.borrowAmount, 'mwei');
    await borrowTokens(account, borrowAmount, index, maxRetries);
    await new Promise(resolve => setTimeout(resolve, 5000));
    const repayAmount = web3.utils.toWei(usdtAmounts.repayAmount, 'mwei');
    await repayBorrow(account, repayAmount, index, false, 0, maxRetries);
}

async function repayBorrow(account, repayAmount, index, approvalDone, retryCount, maxRetries) {
    while (retryCount < maxRetries || maxRetries === 0) {
        try {
            const accountObj = web3.eth.accounts.privateKeyToAccount(account);
            const accountAddress = accountObj.address;
            const contract = new web3.eth.Contract(BORROW_CONTRACT_ABI, BORROW_CONTRACT_ADDRESS);

            const displayAmount = web3.utils.fromWei(repayAmount, 'mwei');

            console.log(`${TEXT_COLORS.CYAN}[${index}] Attempting to repay ${displayAmount} USDT for address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);

            const gasEstimate = await contract.methods.repayBorrow(repayAmount).estimateGas({ from: accountAddress });
            const gasPrice = await web3.eth.getGasPrice();
            const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

            const tx = {
                from: accountAddress,
                to: BORROW_CONTRACT_ADDRESS,
                gas: gasEstimate,
                gasPrice: gasPrice,
                nonce: nonce,
                data: contract.methods.repayBorrow(repayAmount).encodeABI()
            };

            const signedTx = await web3.eth.accounts.signTransaction(tx, account);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

            console.log(`${TEXT_COLORS.CYAN}[${index}] Successfully repaid. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
            break;
        } catch (error) {
            console.error(`${TEXT_COLORS.RED}[${index}] Error repaying: ${error.message}${TEXT_COLORS.RESET_COLOR}`);

            if (!approvalDone) {
                console.log(`${TEXT_COLORS.YELLOW}[${index}] Attempting to approve before retrying repay...${TEXT_COLORS.RESET_COLOR}`);
                await approveUnlimitedIfNeeded(account, USDT_ADDRESS, BORROW_CONTRACT_ADDRESS, index);
                approvalDone = true;
            }
        }

        retryCount++;
        if (retryCount >= maxRetries && maxRetries !== 0) {
            console.error(`${TEXT_COLORS.RED}[${index}] Max retries reached for repaying. Skipping further attempts.${TEXT_COLORS.RESET_COLOR}`);
            break;
        }
    }
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

async function getCurrentUTCTime() {
    try {
        const response = await axios.get('http://worldtimeapi.org/api/timezone/Etc/UTC');
        const utcDateTime = new Date(response.data.utc_datetime);
        return utcDateTime;
    } catch (error) {
        return new Date();
    }
}

async function getNextRunTimeInLocal() {
    const now = await getCurrentUTCTime();
    const nextRun = new Date(now);
    nextRun.setUTCHours(0, 30, 0, 0);
    if (now >= nextRun) {
        nextRun.setUTCDate(now.getUTCDate() + 1);
    }

    const localTime = new Intl.DateTimeFormat('default', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    }).format(nextRun);

    return localTime;
}

async function approveUSDC(account, index) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;
        const contract = new web3.eth.Contract(ERC20_ABI, '0xF242275d3a6527d877f2c927a82D9b057609cc71');

        console.log(`${TEXT_COLORS.CYAN}[${index}] Approving USDC for address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);

        const gasEstimate = await contract.methods.approve('0x7682C12F6D1af845479649c77A9E7729F0180D78', '9999999999000000').estimateGas({ from: accountAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

        const tx = {
            from: accountAddress,
            to: '0xF242275d3a6527d877f2c927a82D9b057609cc71',
            gas: gasEstimate,
            gasPrice: gasPrice,
            nonce: nonce,
            data: contract.methods.approve('0x7682C12F6D1af845479649c77A9E7729F0180D78', '9999999999000000').encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.GREEN}[${index}] Successfully approved USDC. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error approving USDC: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function supplyUSDC(account, index, supplyAmountWei) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;
        const contract = new web3.eth.Contract(USDC_CONTRACT_ABI, '0x7682C12F6D1af845479649c77A9E7729F0180D78');

        console.log(`${TEXT_COLORS.CYAN}[${index}] Supplying ${web3.utils.fromWei(supplyAmountWei, 'mwei')} USDC for address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);

        const gasEstimate = await contract.methods.mint(supplyAmountWei).estimateGas({ from: accountAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

        const tx = {
            from: accountAddress,
            to: '0x7682C12F6D1af845479649c77A9E7729F0180D78',
            gas: gasEstimate,
            gasPrice: gasPrice,
            nonce: nonce,
            data: contract.methods.mint(supplyAmountWei).encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.GREEN}[${index}] Successfully supplied USDC. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
        return receipt;
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error supplying USDC${TEXT_COLORS.RESET_COLOR}`);
        throw new Error('Error supplying USDC');
    }
}

async function enableCollateral(account, index) {
    try {
        const accountObj = web3.eth.accounts.privateKeyToAccount(account);
        const accountAddress = accountObj.address;
        const contract = new web3.eth.Contract(COLLATERAL_CONTRACT_ABI, '0xF448A36feFb223B8E46e36FF12091baBa97bdF60');

        console.log(`${TEXT_COLORS.CYAN}[${index}] Enabling collateral for address: ${accountAddress}${TEXT_COLORS.RESET_COLOR}`);

        const gasEstimate = await contract.methods.enterMarkets(['0x7682C12F6D1af845479649c77A9E7729F0180D78']).estimateGas({ from: accountAddress });
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(accountAddress, 'pending');

        const tx = {
            from: accountAddress,
            to: '0xF448A36feFb223B8E46e36FF12091baBa97bdF60',
            gas: gasEstimate,
            gasPrice: gasPrice,
            nonce: nonce,
            data: contract.methods.enterMarkets(['0x7682C12F6D1af845479649c77A9E7729F0180D78']).encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`${TEXT_COLORS.GREEN}[${index}] Successfully enabled collateral. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error enabling collateral: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function checkUSDCAllowance(account, spenderAddress) {
    const accountObj = web3.eth.accounts.privateKeyToAccount(account);
    const accountAddress = accountObj.address;
    const contract = new web3.eth.Contract(ERC20_ABI, '0xF242275d3a6527d877f2c927a82D9b057609cc71');

    const allowance = await contract.methods.allowance(accountAddress, spenderAddress).call();
    return web3.utils.toBN(allowance);
}

async function isCollateralEnabled(account, cTokenAddress) {
    const accountObj = web3.eth.accounts.privateKeyToAccount(account);
    const accountAddress = accountObj.address;
    const contract = new web3.eth.Contract(COLLATERAL_CONTRACT_ABI, '0xF448A36feFb223B8E46e36FF12091baBa97bdF60');

    try {
        const result = await contract.methods.getAccountLiquidity(accountAddress).call();
        const liquidity = web3.utils.toBN(result.liquidity);
        return liquidity.gt(web3.utils.toBN(0));
    } catch (error) {
        console.error(`Error checking collateral status: ${error.message}`);
        return false;
    }
}

async function processSupplyUSDC(account, index, maxRetries, supplyAmount) {
    const spenderAddress = '0x7682C12F6D1af845479649c77A9E7729F0180D78';
    const supplyAmountWei = web3.utils.toWei(supplyAmount, 'mwei');
    let attempts = 0;

    while (attempts < maxRetries || maxRetries === 0) {
        try {
            const allowance = await checkUSDCAllowance(account, spenderAddress);
            if (allowance.lt(web3.utils.toBN(supplyAmountWei))) {
                console.log(`${TEXT_COLORS.YELLOW}[${index}] Insufficient allowance. Approving USDC...${TEXT_COLORS.RESET_COLOR}`);
                await approveUSDC(account, index);
            }

            await supplyUSDC(account, index, supplyAmountWei);

            const cTokenAddress = '0x7682C12F6D1af845479649c77A9E7729F0180D78';
            const collateralEnabled = await isCollateralEnabled(account, cTokenAddress);
            if (!collateralEnabled) {
                console.log(`${TEXT_COLORS.YELLOW}[${index}] Collateral not enabled. Enabling collateral...${TEXT_COLORS.RESET_COLOR}`);
                await enableCollateral(account, index);
            } else {
                console.log(`${TEXT_COLORS.GREEN}[${index}] Collateral already enabled. Skipping enablement.${TEXT_COLORS.RESET_COLOR}`);
            }
            break;
        } catch (error) {
            console.error(`${TEXT_COLORS.RED}[${index}] Error in supply process: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
            attempts++;
            if (attempts >= maxRetries && maxRetries !== 0) {
                console.error(`${TEXT_COLORS.RED}[${index}] Max retries reached for supplying USDC. Skipping to next process.${TEXT_COLORS.RESET_COLOR}`);
                break;
            }
        }
    }
}

async function processSupplyUSDC71Times(account, index, supplyAmount) {
    const spenderAddress = '0x7682C12F6D1af845479649c77A9E7729F0180D78';
    const supplyAmountWei = web3.utils.toWei(supplyAmount, 'mwei');
    let successCount = 0;
    const delayBetweenSupplies = 5000;

    try {
        const allowance = await checkUSDCAllowance(account, spenderAddress);
        if (allowance.lt(web3.utils.toBN(supplyAmountWei))) {
            console.log(`${TEXT_COLORS.YELLOW}[${index}] Insufficient allowance. Approving USDC...${TEXT_COLORS.RESET_COLOR}`);
            await approveUSDC(account, index);
        }

        while (successCount < 71) {
            try {
                const receipt = await supplyUSDC(account, index, supplyAmountWei);
                if (receipt.status) {
                    successCount++;
                    console.log(`${TEXT_COLORS.GREEN}[${index}] Successfully supplied USDC ${successCount}/71 times. Transaction Hash: ${receipt.transactionHash}${TEXT_COLORS.RESET_COLOR}`);
                } else {
                    console.error(`${TEXT_COLORS.RED}[${index}] Transaction failed.${TEXT_COLORS.RESET_COLOR}`);
                }
            } catch (error) {
                console.error(`${TEXT_COLORS.RED}[${index}] Error supplying USDC${TEXT_COLORS.RESET_COLOR}`);
            }

            await new Promise(resolve => setTimeout(resolve, delayBetweenSupplies));
        }

        const cTokenAddress = '0x7682C12F6D1af845479649c77A9E7729F0180D78';
        const collateralEnabled = await isCollateralEnabled(account, cTokenAddress);
        if (!collateralEnabled) {
            console.log(`${TEXT_COLORS.YELLOW}[${index}] Collateral not enabled. Enabling collateral...${TEXT_COLORS.RESET_COLOR}`);
            await enableCollateral(account, index);
        } else {
            console.log(`${TEXT_COLORS.GREEN}[${index}] Collateral already enabled. Skipping enablement.${TEXT_COLORS.RESET_COLOR}`);
        }
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index}] Error in supply process: Error supplying USDC${TEXT_COLORS.RESET_COLOR}`);
    }
}

async function startCycle(filePath) {
    printHeader();

    const useProxyAnswer = await askQuestion(
        `${TEXT_COLORS.GREEN}Do you want to use proxies?, proxy only used in task claim not in TX (y/n): ${TEXT_COLORS.RESET_COLOR}${TEXT_COLORS.CYAN}`,
        ['y', 'n']
    );
    const useProxy = useProxyAnswer === 'y';

    const processOption = await askQuestion(
        `${TEXT_COLORS.GREEN}Process option:${TEXT_COLORS.RESET_COLOR}\n1. TX and Claim Task\n2. TX only\n3. Claim Task only\n${TEXT_COLORS.CYAN}Enter your choice (1/2/3): ${TEXT_COLORS.RESET_COLOR}`,
        ['1', '2', '3']
    );
    const executeTransactions = processOption === '1' || processOption === '2';
    const claimTasks = processOption === '1' || processOption === '3';

    let txOptions = {
        sendToSelf: false,
        wrapUnwrap: false,
        wrapOnly: false,
        unwrapOnly: false,
        swapUSDT: false,
        supplyUSDC: false,
        borrowAndRepay: false,
        borrowOnly: false,
        repayOnly: false,
        supplyUSDC71Times: false
    };

    if (executeTransactions) {
        let validTxChoice = false;
        while (!validTxChoice) {
            const txChoice = await askQuestion(
                `${TEXT_COLORS.GREEN}What TX do you want to process?:${TEXT_COLORS.RESET_COLOR}\n1. Send to self\n2. Wrap and Unwrap ETH\n3. Wrap ETH\n4. Unwrap ETH\n5. Swap USDT\n6. Supply USDC\n7. Borrow and Repay\n8. Borrow only\n9. Repay only\n10. Supply USDC 71 times\n${TEXT_COLORS.CYAN}Enter your choices (e.g., 1/2/3 or 1,3,5 if you want to choose multiple options, or 'all' for all options): ${TEXT_COLORS.RESET_COLOR}`
            );
            const trimmedChoice = txChoice.trim().toLowerCase();

            if (trimmedChoice === 'all') {
                txOptions = {
                    sendToSelf: true,
                    wrapUnwrap: true,
                    wrapOnly: true,
                    unwrapOnly: true,
                    swapUSDT: true,
                    supplyUSDC: true,
                    borrowAndRepay: true,
                    borrowOnly: true,
                    repayOnly: true,
                    supplyUSDC71Times: true
                };
                validTxChoice = true;
            } else {
                const choices = trimmedChoice.split(',').map(choice => choice.trim());
                const validChoices = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
                validTxChoice = choices.every(choice => validChoices.includes(choice));

                if (!validTxChoice) {
                    console.log(`${TEXT_COLORS.RED}Invalid choice(s). Please enter valid options (e.g., 1,3,5) or 'all'.${TEXT_COLORS.RESET_COLOR}`);
                } else {
                    txOptions.sendToSelf = choices.includes('1');
                    txOptions.wrapUnwrap = choices.includes('2');
                    txOptions.wrapOnly = choices.includes('3');
                    txOptions.unwrapOnly = choices.includes('4');
                    txOptions.swapUSDT = choices.includes('5');
                    txOptions.supplyUSDC = choices.includes('6');
                    txOptions.borrowAndRepay = choices.includes('7');
                    txOptions.borrowOnly = choices.includes('8');
                    txOptions.repayOnly = choices.includes('9');
                    txOptions.supplyUSDC71Times = choices.includes('10');
                }
            }
        }
    }

    let proxies = [];
    if (useProxy) {
        proxies = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean).map(proxy => {
            if (!proxy.startsWith('http://') && !proxy.startsWith('https://') && !proxy.startsWith('socks5://')) {
                return `http://${proxy}`;
            }
            return proxy;
        });

        if (proxies.length === 0) {
            console.error(`${TEXT_COLORS.RED}Proxy list is empty. Please add proxies to proxy.txt and try again.${TEXT_COLORS.RESET_COLOR}`);
            return;
        }
    }

    const privateKeys = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

    if (useProxy && proxies.length < privateKeys.length) {
        console.error(`${TEXT_COLORS.RED}Not enough proxies for the number of accounts. Please add more proxies to proxy.txt and try again.${TEXT_COLORS.RESET_COLOR}`);
        return;
    }

    const delayOption = await askQuestion(
        `${TEXT_COLORS.GREEN}Do you want to use the delay from config.js or auto process every day at 00:30 UTC?${TEXT_COLORS.RESET_COLOR}\n1. Use delay from config.js\n2. Auto process at 00:30 UTC\n${TEXT_COLORS.CYAN}Enter your choice (1/2): ${TEXT_COLORS.RESET_COLOR}`,
        ['1', '2']
    );

    const retryCountAnswer = await askQuestion(
        `${TEXT_COLORS.GREEN}Enter the number of retries for TX errors (0 for infinite retries, 'none' for no retries): ${TEXT_COLORS.RESET_COLOR}${TEXT_COLORS.CYAN}`
    );

    let maxRetries;
    if (retryCountAnswer.toLowerCase() === 'none') {
        maxRetries = 0;
    } else {
        maxRetries = parseInt(retryCountAnswer, 10);
        if (isNaN(maxRetries)) {
            console.error(`${TEXT_COLORS.RED}Invalid input. Defaulting to no retries.${TEXT_COLORS.RESET_COLOR}`);
            maxRetries = 0;
        }
    }

    let isFirstCycle = true;

    async function processCycle() {
        if (isFirstCycle) {
            console.log(`${TEXT_COLORS.YELLOW}Starting the script${TEXT_COLORS.RESET_COLOR}`);
            isFirstCycle = false;
        } else {
            console.log(`${TEXT_COLORS.YELLOW}Resuming cycle...${TEXT_COLORS.RESET_COLOR}`);
        }

        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i].trim();
            if (privateKey.length !== 64 && !(privateKey.length === 66 && privateKey.startsWith('0x'))) {
                console.error(`${TEXT_COLORS.RED}[${i + 1}] Invalid private key length: ${privateKey}${TEXT_COLORS.RESET_COLOR}`);
                continue;
            }

            const proxy = useProxy ? proxies[i % proxies.length] : null;
            let axiosInstance;
            if (proxy) {
                const isSocksProxy = proxy.startsWith('socks5://');
                const agent = isSocksProxy ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
                axiosInstance = axios.create({
                    httpsAgent: agent
                });
            } else {
                axiosInstance = axios.create();
            }

            if (txOptions.sendToSelf) {
                const transferAmount = getRandomEthAmount(ethAmountRange.min, ethAmountRange.max);
                await transferToSelf(privateKey, transferAmount, i + 1, maxRetries);
            }

            if (txOptions.wrapUnwrap || txOptions.wrapOnly) {
                const wrapAmount = getRandomEthAmount(ethAmountRange.min, ethAmountRange.max);
                await executeWrapETH(privateKey, wrapAmount, i + 1, maxRetries);
                if (txOptions.wrapUnwrap) {
                    await unwarpETH(privateKey, wrapAmount, i + 1, maxRetries);
                }
            }

            if (txOptions.unwrapOnly) {
                const unwrapAmount = getRandomEthAmount(ethAmountRange.min, ethAmountRange.max);
                await unwarpETH(privateKey, unwrapAmount, i + 1, maxRetries);
            }

            if (txOptions.swapUSDT) {
                await swapUSDTToUSDC(privateKey, i + 1, maxRetries);
            }

            if (txOptions.supplyUSDC) {
                await processSupplyUSDC(privateKey, i + 1, maxRetries, usdcAmounts.supplyAmount);
            }

            if (txOptions.borrowAndRepay) {
                await processBorrowAndRepay(privateKey, i + 1, maxRetries);
            }

            if (txOptions.borrowOnly) {
                const borrowAmount = web3.utils.toWei(usdtAmounts.borrowAmount, 'mwei');
                await borrowTokens(privateKey, borrowAmount, i + 1, maxRetries);
            }

            if (txOptions.repayOnly) {
                const repayAmount = web3.utils.toWei(usdtAmounts.repayAmount, 'mwei');
                await repayBorrow(privateKey, repayAmount, i + 1, false, 0, maxRetries);
            }

            if (claimTasks) {
                const accountObj = web3.eth.accounts.privateKeyToAccount(privateKey);
                await processtask(accountObj.address, i + 1, claimTasks, axiosInstance, proxy);
            }

            if (txOptions.supplyUSDC71Times) {
                await processSupplyUSDC71Times(privateKey, i + 1, usdcAmounts.supplyAmount71Times);
            }
        }
        console.log(`${TEXT_COLORS.GREEN}Script cycle complete${TEXT_COLORS.RESET_COLOR}`);

        let nextDelay;
        if (delayOption === '1') {
            nextDelay = delay;
        } else {
            const now = await getCurrentUTCTime();
            const nextRun = new Date(now);
            nextRun.setUTCHours(0, 30, 0, 0);
            if (now >= nextRun) {
                nextRun.setUTCDate(now.getUTCDate() + 1);
            }
            nextDelay = nextRun - now;
        }

        const delayInMinutes = nextDelay / 60000;
        const delayInHours = delayInMinutes / 60;
        if (delayInMinutes < 60) {
            console.log(`${TEXT_COLORS.CYAN}Waiting for the next cycle in ${delayInMinutes.toFixed(0)} minute(s)...${TEXT_COLORS.RESET_COLOR}`);
        } else {
            console.log(`${TEXT_COLORS.CYAN}Waiting for the next cycle in ${delayInHours.toFixed(0)} hour(s)...${TEXT_COLORS.RESET_COLOR}`);
        }

        const localNextRunTime = await getNextRunTimeInLocal();
        console.log(`${TEXT_COLORS.CYAN}Next cycle will run at local time: ${localNextRunTime}${TEXT_COLORS.RESET_COLOR}`);

        setTimeout(processCycle, nextDelay);
    };

    processCycle();
}

const filePath = 'key.txt';
startCycle(filePath);