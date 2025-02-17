import { Hex } from 'viem';
import { MerkleTreeSelect } from './api/trees/route';
import { Group } from '@prisma/client';
import { StatusAPIResponse } from '@farcaster/auth-kit';

/**
 * Witness to pass to the prover
 */
export interface WitnessInput {
  s: Uint8Array;
  r: Uint8Array;
  isYOdd: boolean;
  msgHash: Uint8Array;
  siblings: Uint8Array;
  indices: Uint8Array;
  root: Uint8Array;
  signInSigS: Uint8Array;
}

/**
 * Request body of POST /api/attestations
 */
export interface FidAttestationRequestBody {
  groupId: string;
  proof: Hex;
  siwfResponse: StatusAPIResponse;
}

export interface NeynarUserResponse {
  fid: number;
  username: string;
  display_name: string;
  active_status: string;
  pfp_url: string;
}

export interface MerkleProof {
  root: Uint8Array;
  path: Hex[];
  pathIndices: number[];
}

export type EligibleGroup = MerkleTreeSelect['Group'] & {
  address: Hex;
  merkleProof: MerkleProof;
};

/**
 * EIP-6963: Represents the assets needed to display a wallet
 */
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

// EIP-6963 Announce Event dispatched by a Wallet
export interface EIP6963AnnounceProviderEvent extends CustomEvent {
  type: 'eip6963:announceProvider';
  detail: EIP6963ProviderDetail;
}

export interface LeaderBoardRecord {
  user: NeynarUserResponse;
  creddd: Group['displayName'][];
  score: number;
}

export enum AttestationType {
  // eslint-disable-next-line no-unused-vars
  FidAttestation = 1,
}
