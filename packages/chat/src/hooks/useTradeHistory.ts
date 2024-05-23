'use client';
import { useQuery } from '@tanstack/react-query';
import { PublicClient, Hex, parseAbiItem, GetLogsReturnType } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { CRED_CONTRACT_ADDRESS } from '@/lib/contract';

const CRED_SEPOLIA_CONTRACT_DEPLOY_BLOCK = BigInt(10167164);
const TRANSFER_SINGLE_EVENT = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'
);

export type TradeLog = GetLogsReturnType<typeof TRANSFER_SINGLE_EVENT>[number];

const getTradeHistory = async (
  client: PublicClient,
  address: Hex
): Promise<TradeLog[]> => {
  const purchaseLogs = await client.getLogs({
    address: CRED_CONTRACT_ADDRESS,
    event: TRANSFER_SINGLE_EVENT,
    fromBlock: CRED_SEPOLIA_CONTRACT_DEPLOY_BLOCK,
    toBlock: 'latest',
    args: {
      from: address,
    },
  });

  const sellLogs = await client.getLogs({
    address: CRED_CONTRACT_ADDRESS,
    event: TRANSFER_SINGLE_EVENT,
    fromBlock: CRED_SEPOLIA_CONTRACT_DEPLOY_BLOCK,
    toBlock: 'latest',
    args: {
      to: address,
    },
  });

  const logs = [...purchaseLogs, ...sellLogs].sort((a, b) => {
    return a.blockNumber > b.blockNumber ? -1 : 1;
  });

  return logs;
};

const useTradeHistory = () => {
  const client = usePublicClient();
  const account = useAccount();

  return useQuery({
    queryKey: ['trade-history'],
    queryFn: async () => {
      const trades = await getTradeHistory(client!, account.address!);
      return trades;
    },
    enabled: !!account.address,
  });
};

export default useTradeHistory;
