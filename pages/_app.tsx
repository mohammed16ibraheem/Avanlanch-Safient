import { AppProps } from 'next/app';
import { useEffect } from 'react';
import { ensureLogDir } from '../lib/ensureLogDir';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Ensure log directory exists when app starts
    if (typeof window !== 'undefined') {
      ensureLogDir();
    }
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;