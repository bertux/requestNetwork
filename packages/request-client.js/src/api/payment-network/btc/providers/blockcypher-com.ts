import fetch from 'node-fetch';
import * as Types from '../../../../types';
const bigNumber: any = require('bn.js');

/* eslint-disable spellcheck/spell-checker */

/**
 * The Bitcoin Info retriever give access to the bitcoin blockchain through the api of blockcypher.com
 */
export default class BlockcypherCom implements Types.IBitcoinProvider {
  /**
   * Gets BTC address info using blockcypher.com public API
   *
   * @param bitcoinNetworkId The Bitcoin network ID: 0 (mainnet) or 3 (testnet)
   * @param address BTC address to check
   * @param eventName Indicates if it is an address for payment or refund
   * @returns Object containing address info
   */
  public async getAddressInfo(
    bitcoinNetworkId: number,
    address: string,
    eventName: Types.EVENTS_NAMES,
  ): Promise<Types.IBalanceWithEvents> {
    const baseUrl = this.getBaseUrl(bitcoinNetworkId);

    try {
      const res = await fetch(`${baseUrl}/addrs/${address}`);
      // tslint:disable-next-line:no-magic-numbers
      if (res.status >= 400) {
        throw new Error(
          `Error ${res.status}. Bad response from server ${baseUrl}/addrs/${address}`,
        );
      }
      const addressInfo = await res.json();

      return this.parse(addressInfo, eventName);
    } catch (err) {
      // tslint:disable-next-line:no-console
      console.warn(err);
      return { balance: '-1', events: [] };
    }
  }

  /**
   * Parses the address information from the data of blockcypher.com
   *
   * @param addressInfo Data of blockchain.info
   * @param eventName Indicates if it is an address for payment or refund
   * @returns Balance with events
   */
  public parse(addressInfo: any, eventName: Types.EVENTS_NAMES): Types.IBalanceWithEvents {
    const balance = new bigNumber(addressInfo.total_received).toString();

    const events: Types.IPaymentNetworkEvent[] = addressInfo.txrefs
      // keep only the transaction with this address as output
      .filter((tx: any) => tx.tx_input_n === -1)
      .map(
        (tx: any): Types.IPaymentNetworkEvent => ({
          name: eventName,
          parameters: {
            amount: tx.value.toString(),
            block: tx.block_height,
            // timestamp - not given by this API
            txHash: tx.tx_hash,
          },
        }),
      );

    return { balance, events };
  }

  /**
   * Gets the base url to fetch according to the networkId
   *
   * @param bitcoinNetworkId the Bitcoin network ID: 0 (mainnet) or 3 (testnet)
   * @returns The blockchain info URL
   */
  private getBaseUrl(bitcoinNetworkId: number): string {
    if (bitcoinNetworkId === 0) {
      return 'https://api.blockcypher.com/v1/btc/main/';
    }
    if (bitcoinNetworkId === 3) {
      return 'https://api.blockcypher.com/v1/btc/test3';
    }

    throw new Error(
      `Invalid network 0 (mainnet) or 3 (testnet) was expected but ${bitcoinNetworkId} was given`,
    );
  }
}
