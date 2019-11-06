import { assert } from 'chai';
import 'mocha';
import {
  getErc20FromAddress,
  getErc20FromSymbol,
  validERC20Address,
} from '../../../src/api/currency/erc20';

describe('api/currency/erc20', () => {
  describe('validERC20Address', () => {
    it('returns true for a correct checksum address', async () => {
      assert.isTrue(validERC20Address('0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359'));
    });

    it('returns false for a non-checksum address', async () => {
      assert.isFalse(validERC20Address('0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359'));
    });

    it('returns false for a wrong', async () => {
      assert.isFalse(validERC20Address('0x0000006b4ccb1b6faa2625fe562bdd9a23260359'));
    });
  });

  describe('getErc20FromSymbol', () => {
    it('get TokenDescription object from DAI string', async () => {
      assert.deepEqual(getErc20FromSymbol('DAI'), {
        address: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
        decimals: 18,
        erc20: true,
        logo: 'dai.svg',
        name: 'Dai Stablecoin v1.0',
        symbol: 'DAI',
      });
    });
  });

  describe('getErc20FromAddress', () => {
    it('get TokenDescription object from DAI string', async () => {
      assert.deepEqual(getErc20FromAddress('0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359'), {
        address: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
        decimals: 18,
        erc20: true,
        logo: 'dai.svg',
        name: 'Dai Stablecoin v1.0',
        symbol: 'DAI',
      });
    });
  });
});
