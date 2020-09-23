import { PaymentTypes } from '@requestnetwork/types';
import { ethers } from 'ethers';

// The ERC20 proxy smart contract ABI fragment containing TransferWithReference event
// TODO This is just a quick POC
const erc20proxyContractAbiFragment = [
//   'event TransferWithReference(address tokenAddress,address to,uint256 amount,bytes indexed paymentReference)',
//   'event TransferWithReferenceAndFee(address tokenAddress, address to,uint256 amount,bytes indexed paymentReference,uint256 feeAmount,address feeAddress);',
  'event EscrowUnlocked(bytes indexed paymentReference, uint256 amount, address payee)',
  'event EscrowLocked(bytes indexed paymentReference, uint256 amount, address payee)'
];

/**
 * Retrieves a list of payment events from a payment reference, a destination address, a token address and a proxy contract
 */
export default class ProxyERC20InfoRetriever
  implements PaymentTypes.IPaymentNetworkInfoRetriever<PaymentTypes.ERC20PaymentNetworkEvent> {
  public contractProxy: ethers.Contract;
  public provider: ethers.providers.Provider;

  /**
   * @param paymentReference The reference to identify the payment
   * @param proxyContractAddress The address of the proxy contract
   * @param proxyCreationBlockNumber The block that created the proxy contract
   * @param tokenContractAddress The address of the ERC20 contract
   * @param toAddress Address of the balance we want to check
   * @param eventName Indicate if it is an address for payment or refund
   * @param network The Ethereum network to use
   */
  constructor(
    private paymentReference: string,
    private proxyContractAddress: string,
    private proxyCreationBlockNumber: number,
    private tokenContractAddress: string,
    private toAddress: string,
    private eventName: PaymentTypes.EVENTS_NAMES,
    private network: string,
  ) {
    // Creates a local or default provider
    this.provider =
      this.network === 'private'
        ? new ethers.providers.JsonRpcProvider()
        : ethers.getDefaultProvider(this.network);

    // Setup the ERC20 proxy contract interface
    this.contractProxy = new ethers.Contract(
      this.proxyContractAddress,
      erc20proxyContractAbiFragment,
      this.provider,
    );
  }

  /**
   * Retrieves transfer events for the current contract, address and network.
   */
  public async getTransferEvents(): Promise<PaymentTypes.ERC20PaymentNetworkEvent[]> {
    console.log(`Will fetch nothing if ${this.tokenContractAddress} is not FAU`);
    // Create a filter to find all the Transfer logs for the toAddress
    let filter: ethers.providers.Filter;
    if (this.eventName === PaymentTypes.EVENTS_NAMES.COMMITTED) {
      filter = this.contractProxy.filters.EscrowLocked(
        '0x' + this.paymentReference,
        null,
        null,
      ) as ethers.providers.Filter;
    } else {
      filter = this.contractProxy.filters.EscrowUnlocked(
        '0x' + this.paymentReference,
        null,
        null,
      ) as ethers.providers.Filter;
    }
    filter.fromBlock = this.proxyCreationBlockNumber;
    filter.toBlock = 'latest';

    // Get the proxy contract event logs
    const logs = await this.provider.getLogs(filter);

    // Parses, filters and creates the events from the logs with the payment reference
    const eventPromises = logs
      // Parses the logs
      .map(log => {
        const parsedLog = this.contractProxy.interface.parseLog(log);
        return { parsedLog, log };
      })
      // Keeps only the log with the right token and the right destination address
      .filter(
        log => {
          // TODO: add back for more currencies
          // log.parsedLog.values.tokenAddress.toLowerCase() ===
          //   this.tokenContractAddress.toLowerCase() &&
          log.parsedLog.values.payee.toLowerCase() === this.toAddress.toLowerCase(),
        }
      )
      // Creates the balance events
      .map(async t => ({
        amount: t.parsedLog.values.amount.toString(),
        name: this.eventName,
        parameters: {
          block: t.log.blockNumber,
          to: this.toAddress,
          txHash: t.log.transactionHash,
        },
        timestamp: (await this.provider.getBlock(t.log.blockNumber || 0)).timestamp,
      }));

    return Promise.all(eventPromises);
  }
}
