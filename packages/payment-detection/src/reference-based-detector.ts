import { ExtensionTypes, PaymentTypes, RequestLogicTypes, TypesUtils } from '@requestnetwork/types';
import Utils from '@requestnetwork/utils';
import { BalanceError } from './balance-error';
import PaymentReferenceCalculator from './payment-reference-calculator';

import { DeclarativePaymentDetectorBase } from './declarative';
import { DeploymentInformation } from '@requestnetwork/smart-contracts';

/**
 * Abstract class to extend to get the payment balance of reference based requests
 */
export abstract class ReferenceBasedDetector<
  TExtension extends ExtensionTypes.PnReferenceBased.IReferenceBased,
  TPaymentEventParameters
> extends DeclarativePaymentDetectorBase<
  TExtension,
  TPaymentEventParameters | PaymentTypes.IDeclarativePaymentEventParameters
> {
  /**
   * @param paymentNetworkId Example : PaymentTypes.PAYMENT_NETWORK_ID.ETH_INPUT_DATA
   * @param extension The advanced logic payment network extension, reference based
   */

  public constructor(paymentNetworkId: PaymentTypes.PAYMENT_NETWORK_ID, extension: TExtension) {
    super(paymentNetworkId, extension);
    if (!TypesUtils.isPaymentNetworkId(paymentNetworkId)) {
      throw new Error(
        `Cannot detect payment for extension type '${paymentNetworkId}', it is not a payment network ID.`,
      );
    }
  }

  /**
   * Creates the extensions data for the creation of this extension.
   * Will set a salt if none is already given
   *
   * @param paymentNetworkCreationParameters Parameters to create the extension
   * @returns The extensionData object
   */
  public async createExtensionsDataForCreation(
    paymentNetworkCreationParameters: ExtensionTypes.PnReferenceBased.ICreationParameters,
  ): Promise<ExtensionTypes.IAction> {
    // If no salt is given, generate one
    paymentNetworkCreationParameters.salt =
      paymentNetworkCreationParameters.salt || (await Utils.crypto.generate8randomBytes());

    return this.extension.createCreationAction({
      paymentAddress: paymentNetworkCreationParameters.paymentAddress,
      refundAddress: paymentNetworkCreationParameters.refundAddress,
      ...paymentNetworkCreationParameters,
    });
  }

  /**
   * Creates the extensions data to add payment address
   *
   * @param parameters to add payment address
   * @returns The extensionData object
   */
  public createExtensionsDataForAddPaymentAddress(
    parameters: ExtensionTypes.PnReferenceBased.IAddPaymentAddressParameters,
  ): ExtensionTypes.IAction {
    return this.extension.createAddPaymentAddressAction({
      paymentAddress: parameters.paymentAddress,
    });
  }

  /**
   * Creates the extensions data to add refund address
   *
   * @param Parameters to add refund address
   * @returns The extensionData object
   */
  public createExtensionsDataForAddRefundAddress(
    parameters: ExtensionTypes.PnReferenceBased.IAddRefundAddressParameters,
  ): ExtensionTypes.IAction {
    return this.extension.createAddRefundAddressAction({
      refundAddress: parameters.refundAddress,
    });
  }

  protected async getEvents(
    request: RequestLogicTypes.IRequest,
  ): Promise<
    PaymentTypes.IPaymentNetworkEvent<
      TPaymentEventParameters | PaymentTypes.IDeclarativePaymentEventParameters
    >[]
  > {
    const paymentExtension = this.getPaymentExtension(request);
    const paymentChain = this.getPaymentChain(request);

    const supportedNetworks = this.extension.supportedNetworks;
    if (!supportedNetworks.includes(paymentChain)) {
      throw new BalanceError(
        `Payment network ${paymentChain} not supported by ${
          this.paymentNetworkId
        } payment detection. Supported networks: ${supportedNetworks.join(', ')}`,
        PaymentTypes.BALANCE_ERROR_CODE.NETWORK_NOT_SUPPORTED,
      );
    }
    this.checkRequiredParameter(paymentExtension.values.salt, 'salt');
    this.checkRequiredParameter(paymentExtension.values.paymentAddress, 'paymentAddress');

    const [paymentEvents, refundEvents] = await Promise.all([
      this.extractEvents(
        PaymentTypes.EVENTS_NAMES.PAYMENT,
        paymentExtension.values.paymentAddress,
        this.getPaymentReference(request),
        request.currency,
        paymentChain,
        paymentExtension,
      ),
      this.extractEvents(
        PaymentTypes.EVENTS_NAMES.REFUND,
        paymentExtension.values.refundAddress,
        request.requestId,
        request.currency,
        paymentChain,
        paymentExtension,
      ),
    ]);

    const declaredEvents = this.getDeclarativeEvents(request);
    return [...declaredEvents, ...paymentEvents, ...refundEvents];
  }

  /**
   * Extracts payment events of an address matching an address and a payment reference
   *
   * @param eventName Indicate if it is an address for payment or refund
   * @param address Address to check
   * @param paymentReference The reference to identify the payment
   * @param requestCurrency The request currency
   * @param paymentChain the payment network
   * @param paymentExtension the payment network
   * @returns The balance
   */
  protected abstract extractEvents(
    eventName: PaymentTypes.EVENTS_NAMES,
    address: string | undefined,
    paymentReference: string,
    requestCurrency: RequestLogicTypes.ICurrency,
    paymentChain: string,
    paymentNetwork: TExtension extends ExtensionTypes.IExtension<infer X>
      ? ExtensionTypes.IState<X>
      : never,
  ): Promise<PaymentTypes.IPaymentNetworkEvent<TPaymentEventParameters>[]>;

  /**
   * Get the network of the payment
   * @returns The network of payment
   */
  protected getPaymentChain(request: RequestLogicTypes.IRequest): string {
    const network = request.currency.network;
    if (!network) {
      throw Error(`request.currency.network must be defined for ${this.paymentNetworkId}`);
    }
    return network;
  }

  protected getPaymentReference(request: RequestLogicTypes.IRequest): string {
    const { paymentAddress, salt } = this.getPaymentExtension(request).values;
    this.checkRequiredParameter(paymentAddress, 'paymentAddress');
    this.checkRequiredParameter(salt, 'salt');
    return PaymentReferenceCalculator.calculate(request.requestId, salt, paymentAddress);
  }

  protected abstract getProxyDeploymentInformation(
    networkName: string,
    version: string,
  ): DeploymentInformation;
}
