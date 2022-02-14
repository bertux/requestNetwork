import {
  AdvancedLogicTypes,
  ExtensionTypes,
  IdentityTypes,
  PaymentTypes,
  RequestLogicTypes,
} from '@requestnetwork/types';
import { CurrencyManager } from '@requestnetwork/currency';
import { CustomProxyDetector } from '../../src/erc20/custom-detector';

let escrowProxyContract: CustomProxyDetector;

const createAddPaymentAddressAction = jest.fn();
const createAddRefundAddressAction = jest.fn();
const createCreationAction = jest.fn();
const createAddFeeAction = jest.fn();
const createAddPaymentInstructionAction = jest.fn();
const createAddRefundInstructionAction = jest.fn();

const mockAdvancedLogic: AdvancedLogicTypes.IAdvancedLogic = {
  applyActionToExtensions(): any {
    return;
  },
  extensions: {
    feeProxyContractErc20: {
      supportedNetworks: ['mainnet', 'private'],
      createAddPaymentAddressAction,
      createAddRefundAddressAction,
      createCreationAction,
      createAddFeeAction,
      // inherited from declarative
      createAddPaymentInstructionAction,
      createAddRefundInstructionAction,
    },
  },
};

const currencyManager = CurrencyManager.getDefault();

/* eslint-disable @typescript-eslint/no-unused-expressions */
describe('api/erc20/escrow-proxy-contract', () => {
  beforeEach(() => {
    escrowProxyContract = new CustomProxyDetector({
      advancedLogic: mockAdvancedLogic,
      currencyManager,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('can createExtensionsDataForCreation', async () => {
    await escrowProxyContract.createExtensionsDataForCreation({
      paymentAddress: 'ethereum address',
      salt: 'ea3bc7caf64110ca',
    });

    expect(createCreationAction).toHaveBeenCalledWith({
      feeAddress: undefined,
      feeAmount: undefined,
      paymentAddress: 'ethereum address',
      refundAddress: undefined,
      salt: 'ea3bc7caf64110ca',
    });
  });

  it('can createExtensionsDataForCreation with fee amount and address', async () => {
    await escrowProxyContract.createExtensionsDataForCreation({
      feeAddress: 'fee address',
      feeAmount: '2000',
      paymentAddress: 'ethereum address',
      salt: 'ea3bc7caf64110ca',
    });

    expect(createCreationAction).toHaveBeenCalledWith({
      feeAddress: 'fee address',
      feeAmount: '2000',
      paymentAddress: 'ethereum address',
      refundAddress: undefined,
      salt: 'ea3bc7caf64110ca',
    });
  });

  it('can createExtensionsDataForCreation without salt', async () => {
    await escrowProxyContract.createExtensionsDataForCreation({
      paymentAddress: 'ethereum address',
    });

    // Can't check parameters since salt is generated in createExtensionsDataForCreation
    expect(createCreationAction).toHaveBeenCalled();
  });

  it('can createExtensionsDataForAddPaymentInformation', async () => {
    escrowProxyContract.createExtensionsDataForAddPaymentInformation({
      paymentInfo: 'ethereum address',
    });

    expect(createAddPaymentInstructionAction).toHaveBeenCalledWith({
      paymentInfo: 'ethereum address',
    });
  });

  it('can createExtensionsDataForAddPaymentAddress', async () => {
    escrowProxyContract.createExtensionsDataForAddPaymentAddress({
      paymentAddress: 'ethereum address',
    });

    expect(createAddPaymentAddressAction).toHaveBeenCalledWith({
      paymentAddress: 'ethereum address',
    });
  });

  it('can createExtensionsDataForAddRefundAddress', async () => {
    escrowProxyContract.createExtensionsDataForAddRefundAddress({
      refundAddress: 'ethereum address',
    });

    expect(createAddRefundAddressAction).toHaveBeenCalledWith({
      refundAddress: 'ethereum address',
    });
  });

  it('can createExtensionsDataForAddRefundInformation', async () => {
    escrowProxyContract.createExtensionsDataForAddRefundInformation({
      refundInfo: 'ethereum address',
    });

    expect(createAddRefundInstructionAction).toHaveBeenCalledWith({
      refundInfo: 'ethereum address',
    });
  });

  it('can createExtensionsDataForAddFeeInformation', async () => {
    escrowProxyContract.createExtensionsDataForAddFeeInformation({
      feeAddress: 'ethereum address',
      feeAmount: '2000',
    });

    expect(createAddFeeAction).toHaveBeenCalledWith({
      feeAddress: 'ethereum address',
      feeAmount: '2000',
    });
  });

  it('should not throw when getBalance fail', async () => {
    expect(
      await escrowProxyContract.getBalance({ extensions: {} } as RequestLogicTypes.IRequest),
    ).toEqual({
      balance: null,
      error: {
        code: PaymentTypes.BALANCE_ERROR_CODE.WRONG_EXTENSION,
        message: 'The request does not have the extension: pn-erc20-fee-proxy-contract',
      },
      events: [],
    });
  });

  it('can get the fees out of payment events', async () => {
    const mockRequest: RequestLogicTypes.IRequest = {
      creator: { type: IdentityTypes.TYPE.ETHEREUM_ADDRESS, value: '0x2' },
      currency: {
        network: 'private',
        type: RequestLogicTypes.CURRENCY.ERC20,
        value: '0x9FBDa871d559710256a2502A2517b794B482Db40', // local ERC20 token
      },
      events: [],
      expectedAmount: '1000',
      extensions: {
        [ExtensionTypes.ID.PAYMENT_NETWORK_ERC20_FEE_PROXY_CONTRACT]: {
          events: [],
          id: ExtensionTypes.ID.PAYMENT_NETWORK_ERC20_FEE_PROXY_CONTRACT,
          type: ExtensionTypes.TYPE.PAYMENT_NETWORK,
          values: {
            feeAddress: '0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef',
            feeAmount: '5',
            paymentAddress: '0xf17f52151EbEF6C7334FAD080c5704D77216b732',
            refundAddress: '0xrefundAddress',
            salt: 'abcd',
          },
          version: '0',
        },
      },
      extensionsData: [],
      requestId: '0x1',
      state: RequestLogicTypes.STATE.CREATED,
      timestamp: 0,
      version: '0.2',
    };

    const mockExtractTransferEvents = (eventName: any) => {
      if (eventName === 'refund') {
        return Promise.resolve([
          // wrong fee address, ignore
          {
            amount: '10',
            name: PaymentTypes.EVENTS_NAMES.REFUND,
            parameters: {
              block: 1,
              feeAddress: 'fee address',
              feeAmount: '0',
              to: '0xrefundAddress',
            },
          },
          // valid refund
          {
            amount: '10',
            name: PaymentTypes.EVENTS_NAMES.REFUND,
            parameters: {
              block: 1,
              feeAddress: '0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef',
              feeAmount: '0',
              to: '0xrefundAddress',
            },
          },
        ]);
      }
      return Promise.resolve([
        // Wrong fee address
        {
          amount: '100',
          name: PaymentTypes.EVENTS_NAMES.PAYMENT,
          parameters: {
            block: 1,
            feeAddress: 'fee address',
            feeAmount: '5',
            to: '0xf17f52151EbEF6C7334FAD080c5704D77216b732',
            txHash: '0xABC',
          },
          timestamp: 10,
        },
        // Correct fee address and a fee value
        {
          amount: '500',
          name: PaymentTypes.EVENTS_NAMES.PAYMENT,
          parameters: {
            block: 1,
            feeAddress: '0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef',
            feeAmount: '5',
            to: '0xf17f52151EbEF6C7334FAD080c5704D77216b732',
            txHash: '0xABCD',
          },
          timestamp: 11,
        },
        // No fee
        {
          amount: '500',
          name: PaymentTypes.EVENTS_NAMES.PAYMENT,
          parameters: {
            block: 1,
            feeAddress: '',
            feeAmount: '0',
            to: '0xf17f52151EbEF6C7334FAD080c5704D77216b732',
            txHash: '0xABCDE',
          },
          timestamp: 12,
        },
      ]);
    };
    escrowProxyContract = new CustomProxyDetector({
      advancedLogic: mockAdvancedLogic,
      currencyManager,
    });

    jest
      .spyOn(escrowProxyContract as any, 'extractEvents')
      .mockImplementation(mockExtractTransferEvents);

    const balance = await escrowProxyContract.getBalance(mockRequest);

    expect(balance.error).toBeUndefined();
    // 500 + 500 (2 payments) - 10 (1 refund) = 990
    expect(balance.balance).toBe('990');
    expect(
      mockRequest.extensions[ExtensionTypes.ID.PAYMENT_NETWORK_ERC20_FEE_PROXY_CONTRACT].values
        .feeBalance.balance,
    ).toBe('5');
  });
});
