import {
  PORTAL_CONTRACT_ADDRESS as _PORTAL_CONTRACT_ADDRESS,
  PORTAL_SEPOLIA_CONTRACT_ADDRESS,
} from '@cred/shared';
import { getChain } from './utils';
import { baseSepolia } from 'viem/chains';
import { parseAbiItem } from 'viem';

export const TRANSFER_SINGLE_EVENT = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'
);

export const PORTAL_CONTRACT_ADDRESS =
  getChain().id === baseSepolia.id
    ? PORTAL_SEPOLIA_CONTRACT_ADDRESS
    : _PORTAL_CONTRACT_ADDRESS;
