export const dynamic = 'force-dynamic';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import neynar from '@/lib/neynar';
import { NeynarUserResponse } from '@/app/types';

// This is a workaround for the fact that BigInts are not supported by JSON.stringify
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const selectAttestation = {
  MerkleTree: {
    select: {
      Group: {
        select: {
          id: true,
          typeId: true,
          displayName: true,
        },
      },
    },
  },
} satisfies Prisma.FidAttestationSelect;

const selectMintLog = {
  tokenId: true,
} satisfies Prisma.MintLogSelect;

export type FidAttestationSelect = Prisma.FidAttestationGetPayload<{
  select: typeof selectAttestation;
}>;

export type MintLogSelect = Prisma.MintLogGetPayload<{
  select: typeof selectMintLog;
}>;

export type GetUserResponse = NeynarUserResponse & {
  fidAttestations: FidAttestationSelect[];
  score: string;
};

/**
 * Get user data and attestations for a given FID
 */
export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: {
      fid: string;
    };
  }
) {
  const fid = Number(params.fid);

  // Get attestations (i.e. proofs) for the FID
  const fidAttestations = await prisma.fidAttestation.findMany({
    select: selectAttestation,
    where: {
      fid,
    },
  });

  // Get the score of the user
  const userCreddd = await prisma.fidAttestation.findMany({
    select: {
      MerkleTree: {
        select: {
          Group: {
            select: {
              id: true,
              score: true,
            },
          },
        },
      },
    },
    where: {
      fid,
    },
  });

  let userScore = BigInt(0);
  for (const cred of userCreddd) {
    const score = cred.MerkleTree.Group.score;
    if (score) {
      userScore += score;
    }
  }

  // Get user data from Neynar
  const result = await neynar.get<{ users: NeynarUserResponse[] }>(
    `/user/bulk?fids=${fid}`
  );
  const user = result.data.users[0];

  if (!user) {
    return Response.json('User not found', { status: 404 });
  }

  // Return user data and attestations
  return Response.json({
    ...user,
    score: userScore.toString(),
    fidAttestations,
  });
}
