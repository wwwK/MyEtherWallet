import axios from 'axios';
import BigNumber from 'bignumber.js';
const HOST_URL = 'https://qa.mewwallet.dev/v2';
const GET_LIST = '/swap/list';
const GET_QUOTE = '/swap/quote';
const GET_TRADE = '/swap/trade';
class MEWPClass {
  constructor(providerName, web3) {
    this.web3 = web3;
    this.provider = providerName;
  }
  getSupportedTokens() {
    return axios.get(`${HOST_URL}${GET_LIST}`).then(response => {
      const data = response.data;
      return data.map(d => {
        return {
          contract_address: d.contract_address.toLowerCase(),
          decimals: parseInt(d.decimals),
          icon: d.icon,
          icon_png: d.icon_png,
          name: d.name,
          symbol: d.symbol
        };
      });
    });
  }
  getQuote({ fromT, toT, fromAmount }) {
    const fromAmountBN = new BigNumber(fromAmount);
    const queryAmount = fromAmountBN.div(
      new BigNumber(10).pow(new BigNumber(fromT.decimals))
    );
    return axios
      .get(`${HOST_URL}${GET_QUOTE}`, {
        params: {
          fromContractAddress: fromT.contract_address,
          toContractAddress: toT.contract_address,
          amount: queryAmount.toFixed(fromT.decimals)
        }
      })
      .then(response => {
        const quotes = response.data.quotes.filter(
          q => q.dex === this.provider
        );
        return quotes.map(q => {
          return {
            dex: q.exchange,
            provider: q.dex,
            amount: q.amount
          };
        });
      });
  }
  getTrade({ fromAddress, toAddress, dex, fromT, toT, fromAmount }) {
    const fromAmountBN = new BigNumber(fromAmount);
    const queryAmount = fromAmountBN.div(
      new BigNumber(10).pow(new BigNumber(fromT.decimals))
    );
    return axios
      .get(`${HOST_URL}${GET_TRADE}`, {
        params: {
          address: fromAddress,
          recipient: toAddress,
          dex: this.provider,
          exchange: dex,
          platform: 'ios',
          fromContractAddress: fromT.contract_address,
          toContractAddress: toT.contract_address,
          amount: queryAmount.toFixed(fromT.decimals)
        }
      })
      .then(response => {
        return {
          provider: this.provider,
          transactions: response.data.transactions
        };
      });
  }
  async executeTrade(tradeObj) {
    const from = await this.web3.eth.getCoinbase();
    const gasPrice = await this.web3.eth.getGasPrice();
    if (tradeObj.transactions.length === 1) {
      return new Promise((resolve, reject) => {
        this.web3.eth
          .sendTransaction(
            Object.assign(tradeObj.transactions[0], {
              from,
              gasPrice
            })
          )
          .on('transactionHash', hash => {
            return resolve({ hashes: [hash] });
          })
          .catch(reject);
      });
    }
    const txs = [];
    tradeObj.transactions.forEach(tx => {
      tx.from = from;
      tx.gasPrice = gasPrice;
      txs.push(tx);
    });

    return new Promise((resolve, reject) => {
      let counter = 0;
      const hashes = [];
      this.web3.mew
        .sendBatchTransactions(txs)
        .then(promises => {
          promises.forEach(p => {
            p.on('transactionHash', hash => {
              hashes.push(hash);
              counter++;
              if (counter === promises.length) resolve({ hashes });
            });
          });
        })
        .catch(reject);
    });
  }
  getStatus(statusObj) {
    let isSuccess = true;
    let isPending = false;
    const hashes = statusObj.hashes;
    const promises = [];
    hashes.forEach(h => {
      promises.push(
        this.web3.eth.getTransactionReceipt(h).then(receipt => {
          if (!receipt.blockNumber) {
            isPending = true;
            return;
          }
          if (!receipt.status) {
            isSuccess = false;
          }
        })
      );
    });
    return Promise.all(promises).then(() => {
      if (isPending)
        return {
          isPending,
          isSuccess: false
        };
      return {
        isPending,
        isSuccess
      };
    });
  }
}
export default MEWPClass;