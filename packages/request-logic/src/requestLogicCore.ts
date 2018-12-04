import { RequestLogic as Types } from '@requestnetwork/types';
import Utils from '@requestnetwork/utils';
import Action from './action';
import Request from './request';

import AcceptAction from './actions/accept';
import CancelAction from './actions/cancel';
import CreateAction from './actions/create';
import IncreaseExpectedAmountAction from './actions/increaseExpectedAmount';
import ReduceExpectedAmountAction from './actions/reduceExpectedAmount';

/**
 * Implementation of the request logic specification
 */
export default {
  applyActionToRequest,
  formatAccept: AcceptAction.format,
  formatCancel: CancelAction.format,
  formatCreate: CreateAction.format,
  formatIncreaseExpectedAmount: IncreaseExpectedAmountAction.format,
  formatReduceExpectedAmount: ReduceExpectedAmountAction.format,
  getRequestIdFromAction,
};

/**
 * Function Entry point to apply any action to a request
 *
 * @param Types.IRequestLogicRequest request The request before update, null for creation - will not be modified
 * @param Types.IRequestLogicAction action The action to apply
 *
 * @returns Types.IRequestLogicRequest  The request updated
 */
function applyActionToRequest(
  request: Types.IRequestLogicRequest | null,
  action: Types.IRequestLogicAction,
): Types.IRequestLogicRequest {
  if (!Action.isActionVersionSupported(action)) {
    throw new Error('action version not supported');
  }

  // we don't want to modify the original request state
  const requestCopied: Types.IRequestLogicRequest | null = request ? Utils.deepCopy(request) : null;

  // Creation request
  if (action.data.name === Types.REQUEST_LOGIC_ACTION_NAME.CREATE) {
    if (requestCopied) {
      throw new Error('no request is expected at the creation');
    }
    return CreateAction.createRequest(action);
  }

  // Update request
  if (!requestCopied) {
    throw new Error('request is expected');
  }

  // Will throw if the request is not valid
  Request.checkRequest(requestCopied);

  if (action.data.name === Types.REQUEST_LOGIC_ACTION_NAME.ACCEPT) {
    return AcceptAction.applyActionToRequest(action, requestCopied);
  }

  if (action.data.name === Types.REQUEST_LOGIC_ACTION_NAME.CANCEL) {
    return CancelAction.applyActionToRequest(action, requestCopied);
  }

  if (action.data.name === Types.REQUEST_LOGIC_ACTION_NAME.INCREASE_EXPECTED_AMOUNT) {
    return IncreaseExpectedAmountAction.applyActionToRequest(action, requestCopied);
  }

  if (action.data.name === Types.REQUEST_LOGIC_ACTION_NAME.REDUCE_EXPECTED_AMOUNT) {
    return ReduceExpectedAmountAction.applyActionToRequest(action, requestCopied);
  }

  throw new Error(`Unknown action ${action.data.name}`);
}

/**
 * Function to create a requestId from the creation action or get the requestId parameter otherwise
 *
 * @param IRequestLogicAction action action
 *
 * @returns RequestIdTYpe the requestId
 */
function getRequestIdFromAction(action: Types.IRequestLogicAction): Types.RequestLogicRequestId {
  return Action.getRequestId(action);
}
