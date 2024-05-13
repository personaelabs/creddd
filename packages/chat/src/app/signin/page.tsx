'use client';
import '@farcaster/auth-kit/styles.css';
import { SignInButton } from '@farcaster/auth-kit';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSignIn from '@/hooks/useSignIn';
import { useHeaderOptions } from '@/contexts/HeaderContext';
import { Loader2 } from 'lucide-react';
import theme from '@/lib/theme';

const SignIn = () => {
  const router = useRouter();
  const { signIn } = useSignIn();
  const { setOptions } = useHeaderOptions();
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    setOptions({
      title: 'Sign In',
      showBackButton: false,
      headerRight: null,
    });
  }, [setOptions]);

  return (
    <div className="flex flex-col items-center justify-center h-[100%] bg-background">
      {isSigningIn ? (
        <div className="flex flex-row items-center">
          <Loader2
            className="mr-2 animate-spin"
            size={16}
            color={theme.orange}
          ></Loader2>
          <div>Signing in</div>
        </div>
      ) : (
        <SignInButton
          onSuccess={async statusApiResponse => {
            setIsSigningIn(true);
            await signIn(statusApiResponse);
            router.replace('/');
            setIsSigningIn(false);
          }}
        />
      )}
    </div>
  );
};

export default SignIn;
