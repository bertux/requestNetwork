import { PaymentTypes } from '@requestnetwork/types';
import { IPaymentRetriever } from '../types';
import { BigNumber, ethers } from 'ethers';
import { getDefaultProvider } from '../provider';
import { parseLogArgs } from '../utils';

// The Ethereum proxy smart contract ABI fragment containing TransferWithReference event
const ethProxyContractAbiFragment = [
  'event TransferWithReference(address to,uint256 amount,bytes indexed paymentReference)',
  'event TransferWithReferenceAndFee(address to,uint256 amount,bytes indexed paymentReference,uint256 feeAmount,address feeAddress)',
];

/** TransferWithReference event */
type TransferWithReferenceArgs = {
  to: string;
  amount: BigNumber;
  paymentReference: string;
};

/** TransferWithReferenceAndFee event */
type TransferWithReferenceAndFeeArgs = TransferWithReferenceArgs & {
  feeAmount: BigNumber;
  feeAddress: string;
};

/**
 * Retrieves a list of payment events from a payment reference, a destination address, a token address and a proxy contract
 */
export class EthProxyInfoRetriever
  implements IPaymentRetriever<PaymentTypes.ETHPaymentNetworkEvent> {
  public contractProxy: ethers.Contract;
  public provider: ethers.providers.Provider;

  /**
   * @param paymentReference The reference to identify the payment
   * @param proxyContractAddress The address of the proxy contract
   * @param proxyCreationBlockNumber The block that created the proxy contract
   * @param toAddress Address of the balance we want to check
   * @param eventName Indicate if it is an address for payment or refund
   * @param network The Ethereum network to use
   */
  constructor(
    private paymentReference: string,
    private proxyContractAddress: string,
    private proxyCreationBlockNumber: number,
    private toAddress: string,
    private eventName: PaymentTypes.EVENTS_NAMES,
    private network: string,
  ) {
    // Creates a local or default provider
    this.provider = getDefaultProvider(this.network);

    // Setup the Ethereum proxy contract interface
    this.contractProxy = new ethers.Contract(
      this.proxyContractAddress,
      ethProxyContractAbiFragment,
      this.provider,
    );
  }

  /**
   * Retrieves transfer events for the current contract, address and network.
   */
  public async getTransferEvents(): Promise<PaymentTypes.ETHPaymentNetworkEvent[]> {
    // Create a filter to find all the Transfer logs for the toAddress
    const filter = this.contractProxy.filters.TransferWithReference(
      null,
      null,
      '0x' + this.paymentReference,
    ) as ethers.providers.Filter;
    filter.fromBlock = this.proxyCreationBlockNumber;
    filter.toBlock = 'latest';

    // Get the event logs
    const proxyLogs = await this.provider.getLogs(filter);

    // Create a filter to find all the Fee Transfer logs with the payment reference
    const feeFilter = this.contractProxy.filters.TransferWithReferenceAndFee(
      null,
      null,
      '0x' + this.paymentReference,
      null,
      null,
    ) as ethers.providers.Filter;
    feeFilter.fromBlock = this.proxyCreationBlockNumber;
    feeFilter.toBlock = 'latest';

    // Get the fee proxy contract event logs
    const feeProxyLogs = await this.provider.getLogs(feeFilter);

    // Merge both events
    const logs = [...proxyLogs, ...feeProxyLogs];

    // Parses, filters and creates the events from the logs of the proxy contract
    const eventPromises = logs
      // Parses the logs
      .map((log) => {
        const parsedLog = this.contractProxy.interface.parseLog(log);
        return {
          parsedLog: parseLogArgs<TransferWithReferenceAndFeeArgs>(parsedLog),
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        };
      })
      // Keeps only the log with the right token and the right destination address
      .filter(({ parsedLog }) => parsedLog.to.toLowerCase() === this.toAddress.toLowerCase())
      // Creates the balance events
      .map(async ({ parsedLog, blockNumber, transactionHash }) => ({
        amount: parsedLog.amount.toString(),
        name: this.eventName,
        parameters: {
          block: blockNumber,
          txHash: transactionHash,
          to: this.toAddress,
          feeAddress: parsedLog.feeAddress,
          feeAmount: parsedLog.feeAmount?.toString() || undefined,
        },
        timestamp: (await this.provider.getBlock(blockNumber || 0)).timestamp,
      }));

    return Promise.all(eventPromises);
  }
}
