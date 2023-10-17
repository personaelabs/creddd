// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { Hex, bytesToHex, hashMessage, hexToBytes, keccak256 } from 'viem';
import prisma from '@/lib/prisma';
// @ts-ignore
import * as circuit from 'circuit-node/circuits_embedded';

import { ROOT_TO_SET } from '@/lib/sets';
import { toPrefixedHex } from '@/lib/utils';

let verifiedInitialized = false;

// Merkle roots copied from json files
const VALID_ROOTS: Hex[] = Object.keys(ROOT_TO_SET).map((root) =>
  toPrefixedHex(BigInt(root).toString(16)),
);

const TEST_PROOF: Hex = '0x';

export default async function submitProof(req: NextApiRequest, res: NextApiResponse) {
  const proof: Hex = req.body.proof;
  console.log('Proof', proof.length);

  // The signed message
  const message: string = req.body.message;

  // If we're not in production, we allow the TEST_PROOF to be submitted.
  // This is useful for testing the UI without having to generate a proof
  // every time.
  if (process.env.NODE_ENV !== 'production') {
    if (proof === TEST_PROOF) {
      const proofHash = keccak256(proof);
      res.send({ proofHash });
      return;
    }
  }

  if (!verifiedInitialized) {
    // Initialize the verifier's wasm
    circuit.prepare();
    circuit.init_panic_hook();
    verifiedInitialized = true;
  }

  // Verify the proof
  console.time('verify');
  // const verified = await CircuitV3.verify(proof);
  const proofBytes = hexToBytes(proof);
  const verified = circuit.verify_membership(proofBytes);
  console.timeEnd('verify');
  if (!verified) {
    res.status(400).send({ error: 'Invalid proof' });
    return;
  }

  const merkleRoot = bytesToHex(circuit.get_root(proofBytes));
  // Check if the merkle root is valid
  if (!VALID_ROOTS.includes(merkleRoot)) {
    res.status(400).send({ error: 'Invalid merkle root' });
    return;
  }

  const msgHash = bytesToHex(circuit.get_msg_hash(proofBytes));
  // Check if the message hash is valid
  if (msgHash !== hashMessage(message)) {
    res.status(400).send({ error: 'Invalid message hash' });
    return;
  }

  // Compute the proof hash
  let proofHash: Hex = keccak256(proof);

  // Save the proof to the database. We save the proof the public input in hex format.
  await prisma.membershipProof.upsert({
    where: {
      merkleRoot,
      message,
      proofHash,
    },
    update: {
      proof,
      publicInput: '',
      proofHash,
      proofVersion: 'v3', // We expect the submitted proof to be a V2 proof
    },
    create: {
      message,
      proof,
      merkleRoot,
      publicInput: '',
      proofHash,
      proofVersion: 'v3', // We expect the submitted proof to be a V2 proof
    },
  });

  res.send({ proofHash });
}
