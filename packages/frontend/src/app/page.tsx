'use client';
import { useRouter } from 'next/navigation';
import { SignInButton } from '@farcaster/auth-kit';
import { useUser } from '@/context/UserContext';
import { useState, useEffect } from 'react';
import { Hex } from 'viem';

export default function Home() {
  const router = useRouter();

  const { user, loginWithFarcaster, userStateInitialized } = useUser();

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Are we already logged in load, from local storage?
  useEffect(() => {
    // If we got a user, either from login or however it was pulled up from local storage,
    // then we're logged in and we can move on to the account page.
    if (user) {
      setIsLoggedIn(true);
      router.push('/account');
    }
  }, [router, user]);

  return (
    <div className="flex flex-col justify-center items-center h-[80vh] gap-10">
      <h2 className="text-3xl font-bold mb-2">Welcome</h2>
      <div
        className={`${userStateInitialized ? '' : 'opacity-50 pointer-events-none'} transition-opacity`}
      >
        {!isLoggedIn && (
          <SignInButton
            // @ts-ignore
            disabled={!userStateInitialized}
            onSuccess={data => {
              if (isLoggedIn) {
                return;
              }
              console.log('success', data);
              loginWithFarcaster({
                fid: data.fid,
                displayName: data.username || 'anon',
                pfpUrl: data.pfpUrl,
                custody: data.custody as `0x${string}`,
                signature: data.signature as Hex,
                nonce: data.nonce,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
