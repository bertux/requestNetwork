import '@nomiclabs/hardhat-ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  chainlinkConversionPath as chainlinkConversionPathArtifact,
  ContractArtifact,
  erc20FeeProxyArtifact,
  erc20SwapToPayArtifact,
  ethereumFeeProxyArtifact,
  ethereumProxyArtifact,
} from '../src/lib';
import { deploySwapConversion } from './erc20-swap-to-conversion';
import { deployERC20ConversionProxy, deployETHConversionProxy } from './conversion-proxy';
import { DeploymentResult, deployOne } from './deploy-one';
import { uniswapV2RouterAddresses, jumpToNonce } from './utils';
import { Contract } from 'ethers';
// eslint-disable-next-line
// @ts-ignore Cannot find module
import { ChainlinkConversionPath } from '../src/types/ChainlinkConversionPath';
import { CurrencyManager } from '@requestnetwork/currency';
import { RequestLogicTypes } from '@requestnetwork/types';

/**
 * Script ensuring all payment contracts are deployed and usable on a live chain.
 *
 * For a given chain, in the absence of `args.simulate` and `args.force`, the script is responsible for:
 * - Deploying contracts in the exact same sequence on every chain, to keep the same addresses
 * - Deploying only contracts which, according to the artifacts in `src/lib/artifacts`, are not yet deployed on the chain
 * - Doing the minimum required administration tasks (typically: handover administration to other wallets)
 * - Verifying the contract code of deployed contracts on the appropriate explorer, when relevant
 * - Switching to simulation mode if any deployment cannot be made (in order to keep the sequence)
 *
 * `args.force = true` to force deployments even if addresses are found in the artifacts (eg. on private network)
 * `args.simulate = true` to prevent deployments and contract verification
 *
 */
export async function deployAllPaymentContracts(
  args: any,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const deploymentResults: (DeploymentResult | undefined)[] = [];
  let simulationSuccess: boolean | undefined;

  try {
    simulationSuccess = args.simulate ? true : undefined;
    const [deployer] = await hre.ethers.getSigners();

    console.log(
      `*** Deploying with the account: ${deployer.address} on the network ${hre.network.name} (${hre.network.config.chainId}) ***`,
    );

    // #region NATIVE TOKEN
    const nativeTokenNetwork = hre.network.name === 'private' ? 'mainnet' : hre.network.name;
    const nativeTokenHash = CurrencyManager.getDefault().getNativeCurrency(
      RequestLogicTypes.CURRENCY.ETH,
      nativeTokenNetwork,
    )?.hash;

    if (!nativeTokenHash) {
      throw new Error(`Could not guess native token hash for network ${hre.network.name}`);
    }
    // #endregion

    // #region EASY DEPLOYMENTS UTIL

    // Utility to run a straight-forward deployment with deployOne()
    const runEasyDeployment = async <TContract extends Contract>(deployment: {
      contractName: string;
      constructorArguments?: string[];
      artifact: ContractArtifact<TContract>;
      nonceCondition?: number;
    }): Promise<DeploymentResult<TContract>> => {
      deployment.constructorArguments = deployment.constructorArguments ?? [];
      const result = await deployOne<TContract>(args, hre, deployment.contractName, {
        ...deployment,
      });
      deploymentResults.push(result);
      console.log(`Contract ${deployment.contractName} ${result.type}: ${result.address}`);
      if (result.type === 'skipped') {
        switchToSimulation();
      }
      return result;
    };
    // #endregion

    // #region NON-EASY BATCHES DEFINITION

    const switchToSimulation = () => {
      if (!args.simulate) {
        console.log('[!] Switching to simulated mode');
        args.simulate = true;
        simulationSuccess = simulationSuccess ?? true;
      }
    };

    /*
     * Batch 2
     *   - ERC20ConversionProxy
     *   - ERC20SwapToPay
     *   - ERC20SwapToConversion
     */
    const runDeploymentBatch_2 = async (
      chainlinkInstance: ChainlinkConversionPath,
      erc20FeeProxyAddress: string,
    ) => {
      let chainlinkConversionPathAddress = chainlinkInstance?.address;
      if (!chainlinkConversionPathAddress) {
        switchToSimulation();
        chainlinkConversionPathAddress = 'simulated';
      }

      // Deploy ERC20 Conversion
      const erc20ConversionResult = await deployERC20ConversionProxy(
        {
          ...args,
          chainlinkConversionPathAddress,
          erc20FeeProxyAddress,
        },
        hre,
      );
      deploymentResults.push(erc20ConversionResult);
      const erc20ConversionAddress = erc20ConversionResult?.address;

      // Add whitelist admin to chainlink path
      const currentNonce = await deployer.getTransactionCount();
      if (chainlinkInstance && currentNonce === 4) {
        if (!process.env.ADMIN_WALLET_ADDRESS) {
          throw new Error('Chainlink was deployed but no ADMIN_WALLET_ADDRESS was provided.');
        }
        if (args.simulate === false) {
          await chainlinkInstance.addWhitelistAdmin(process.env.ADMIN_WALLET_ADDRESS);
        } else {
          console.log('[i] Simulating addWhitelistAdmin to chainlinkInstance');
        }
      }

      // ERC20SwapToPay & ERC20SwapToConversion
      const swapRouterAddress = uniswapV2RouterAddresses[hre.network.name];
      if (swapRouterAddress) {
        const swapRouterAddressResult = await deployOne(args, hre, 'ERC20SwapToPay', {
          constructorArguments: [swapRouterAddress, erc20FeeProxyAddress],
          artifact: erc20SwapToPayArtifact,
          nonceCondition: 5,
        });
        deploymentResults.push(swapRouterAddressResult);

        if (erc20ConversionAddress) {
          const swapConversionResult = await deploySwapConversion(
            {
              ...args,
              conversionProxyAddress: erc20ConversionAddress,
              swapProxyAddress: swapRouterAddress,
            },
            hre,
          );
          deploymentResults.push(swapConversionResult);
        } else {
          console.log(
            `      ${'ERC20SwapToConversion:'.padEnd(30, ' ')}(ERC20 Conversion missing)`,
          );
          switchToSimulation();
        }
      } else {
        console.log(`      ${'ERC20SwapToPay:'.padEnd(30, ' ')}(swap router missing)`);
        console.log(`      ${'ERC20SwapToConversion:'.padEnd(30, ' ')}(swap router missing)`);
        switchToSimulation();
        simulationSuccess = false;
      }
      return deploymentResults;
    };

    /*
     * Batch 4
     *   - ETHConversionProxy
     */
    const runDeploymentBatch_4 = async (
      chainlinkConversionPathAddress: string,
      ethFeeProxyAddress: string,
    ) => {
      // Deploy ETH Conversion
      const ethConversionResult = await deployETHConversionProxy(
        {
          ...args,
          chainlinkConversionPathAddress,
          ethFeeProxyAddress,
        },
        hre,
      );
      deploymentResults.push(ethConversionResult);

      // Administrate again whitelist admins for nonce consistency (due to 1 failing tx on Fantom)
      const chainlinkAdminNonce = 12;
      const currentNonce = await deployer.getTransactionCount();
      if (currentNonce === chainlinkAdminNonce && chainlinkInstance) {
        if (!process.env.ADMIN_WALLET_ADDRESS) {
          throw new Error(
            'Chainlink was deployed but no ADMIN_WALLET_ADDRESS was provided, cannot addWhitelistAdmin.',
          );
        }
        if (args.simulate === false) {
          await chainlinkInstance.addWhitelistAdmin(process.env.ADMIN_WALLET_ADDRESS);
        } else {
          console.log('[i] Simulating addWhitelistAdmin to chainlinkInstance');
        }
      } else if (currentNonce < chainlinkAdminNonce) {
        console.warn(`Warning: got nonce ${currentNonce} instead of ${chainlinkAdminNonce}`);
        switchToSimulation();
      }
    };

    // #endregion

    // #region MAIN - Deployments

    // Batch 1
    await runEasyDeployment({
      contractName: 'EthereumProxy',
      artifact: ethereumProxyArtifact,
      nonceCondition: 0,
    });
    const { address: erc20FeeProxyAddress } = await runEasyDeployment({
      contractName: 'ERC20FeeProxy',
      artifact: erc20FeeProxyArtifact,
      nonceCondition: 1,
    });

    // Batch 3
    const nonceForBatch3 = 7;
    await jumpToNonce(args, hre, nonceForBatch3);

    const { address: ethFeeProxyAddress } = await runEasyDeployment({
      contractName: 'EthereumFeeProxy',
      artifact: ethereumFeeProxyArtifact,
      nonceCondition: nonceForBatch3,
    });

    // Batch 4
    const nonceForBatch4 = 10;
    await jumpToNonce(args, hre, nonceForBatch4);

    const {
      instance: chainlinkInstance,
      address: chainlinkInstanceAddress,
    } = await runEasyDeployment({
      contractName: 'ChainlinkConversionPath',
      constructorArguments: [nativeTokenHash],
      artifact: chainlinkConversionPathArtifact,
      nonceCondition: nonceForBatch4,
    });

    await runDeploymentBatch_4(chainlinkInstanceAddress, ethFeeProxyAddress);

    if (!args.simulate) {
      throw new Error('Missing implementation new version of ERC20 Conversion Proxy');
    }

    // Batch 2
    await runDeploymentBatch_2(chainlinkInstance, erc20FeeProxyAddress);

    // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    // Add future batches above this line

    console.log('Done deploying. Summary:');
    deploymentResults
      .filter((x): x is DeploymentResult => !!x)
      .forEach((res) => {
        console.log(`      ${res.contractName.concat(':').padEnd(30, ' ')}${res.address}`);
      });
    // #endregion
  } catch (e) {
    console.error(e);
  }

  const nbDeployments = deploymentResults.filter((val) => val?.type === 'deployed').length;
  const verificationPromises = deploymentResults
    .map((val) => val?.verificationPromise)
    .filter(Boolean);

  // #region MAIN - Conclusion and verification
  if (nbDeployments > 0) {
    console.log(
      `--- ${nbDeployments} deployements were made. ---`,
      hre.network.name === 'private'
        ? ''
        : [
            ``,
            `TODO:`,
            `*  CRITICAL: update src/lib/artifacts files, and push changes NOW !`,
            `* IMPORTANT: execute updateAggregatorsList() on conversionPaths`,
            `*          : then update the lib with chainlinkPath util in toolbox and push changes`,
            `*     OTHER: run \`yarn hardhat prepare-live-payments --network ${hre.network.name}\``,
            `*     OTHER: execute administration tasks: approveRouterToSpend(), approvePaymentProxyToSpend() on swaps`,
            `*     OTHER: deploy subgraphes where needed`,
          ].join('\r\n'),
    );
    if (verificationPromises.length > 0) {
      let nbSuccessfulVerifications = 0;
      console.log('Contracts verifications in progress...');
      await Promise.all(
        verificationPromises.map((verificationPromise) => {
          return verificationPromise
            ? verificationPromise.then((success) => {
                nbSuccessfulVerifications += success ? 1 : 0;
                console.log(`${nbSuccessfulVerifications} / ${nbDeployments}...`);
              })
            : Promise.resolve();
        }),
      );
      console.log(`${nbSuccessfulVerifications} verification successes !`);
      if (nbSuccessfulVerifications < nbDeployments) {
        console.log(`Some verifications failed, check logs and do them manually.`);
      }
    }
  } else {
    console.log(`--- No deployment was made. ---`);
  }
  if (simulationSuccess === false) {
    console.log('--- DO NOT PROCEED ---');
  }
  // #endregion
}
