import { PortalAbi } from '@cred/shared';
import { Hex, encodeFunctionData, formatEther } from 'viem';
import axios from '@/lib/axios';
import { DialogType, SyncRoomRequestBody } from '@/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoomTokenId } from '@/lib/utils';
import { PORTAL_CONTRACT_ADDRESS } from '@/lib/contract';
import { toast } from 'sonner';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import useRoom from './useRoom';
import wagmiConfig from '../lib/wagmiConfig';
import { readContract } from '@wagmi/core';
import { useDialog } from '@/contexts/DialogContext';
import useSignedInUser from './useSignedInUser';

const sendTransactionId = async ({
  roomId,
  txId,
}: {
  roomId: string;
  txId: Hex;
}) => {
  const body: SyncRoomRequestBody = {
    buyTransactionHash: txId,
  };

  await axios.post(`/api/rooms/${roomId}/sync`, body);
};

const getProtocolFee = async (price: bigint): Promise<bigint> => {
  return await readContract(wagmiConfig, {
    abi: PortalAbi,
    address: PORTAL_CONTRACT_ADDRESS,
    functionName: 'getProtocolFee',
    args: [price],
  });
};

const getCurrentSellPrice = async (roomIdBigInt: bigint) => {
  const amount = BigInt(1);
  return await readContract(wagmiConfig, {
    abi: PortalAbi,
    address: PORTAL_CONTRACT_ADDRESS,
    functionName: 'getSellPrice',
    args: [roomIdBigInt, amount],
  });
};

const useSellKey = (roomId: string) => {
  const queryClient = useQueryClient();
  const { sendTransaction } = useSendTransaction();
  const { data: room } = useRoom(roomId);
  const { wallets } = useWallets();
  const { setOpenedSheet, closeDialog } = useDialog();
  const { data: signedInUser } = useSignedInUser();

  const result = useMutation({
    mutationFn: async () => {
      const roomIdBigInt = getRoomTokenId(roomId);

      const embeddedWallet = wallets.find(
        wallet => wallet.walletClientType === 'privy'
      );

      if (!embeddedWallet) {
        throw new Error('No embedded wallet found.');
      }

      const amount = BigInt(1);
      const data = encodeFunctionData({
        abi: PortalAbi,
        functionName: 'sellKeys',
        args: [roomIdBigInt, amount],
      });

      const sellPrice = await getCurrentSellPrice(roomIdBigInt);
      const protocolFee = await getProtocolFee(sellPrice);

      const formattedSalesValue = formatEther(sellPrice - protocolFee);

      const txReceipt = await sendTransaction(
        {
          from: embeddedWallet.address,
          to: PORTAL_CONTRACT_ADDRESS,
          data,
        },
        {
          header: `Sell ${room?.name} key`,
          description: `You will receive ${formattedSalesValue} ETH (estimated)  (1% protocol fee)`,
          buttonText: 'Sell key',
        }
      );

      setOpenedSheet(DialogType.PROCESSING_TX);
      await sendTransactionId({
        roomId,
        txId: txReceipt.transactionHash as Hex,
      });

      closeDialog();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['key-price', roomId] });
      queryClient.invalidateQueries({
        queryKey: ['key-balance', { address: signedInUser?.wallet?.address }],
      });
      queryClient.invalidateQueries({ queryKey: ['joined-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['all-rooms'] });

      toast.success('Sold key');
    },
  });

  return { ...result };
};

export default useSellKey;
