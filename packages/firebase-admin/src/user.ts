import { getFirestore } from 'firebase-admin/firestore';
import app from './app';
import { userConverter } from '@cred/shared';

const db = getFirestore(app);

export const getUserByAddress = async (address: `0x${string}`) => {
  const user = await db
    .collection('users')
    .withConverter(userConverter)
    .where('privyAddress', '==', address)
    .get();

  const data = user.docs.map(doc => doc.data());

  if (data.length === 0) {
    return null;
  }

  return data[0];
};
