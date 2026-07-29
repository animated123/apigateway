import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const getConfig = () => ({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localStorage.getItem('ENV_VITE_FIREBASE_API_KEY') || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localStorage.getItem('ENV_VITE_FIREBASE_AUTH_DOMAIN') || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localStorage.getItem('ENV_VITE_FIREBASE_PROJECT_ID') || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localStorage.getItem('ENV_VITE_FIREBASE_STORAGE_BUCKET') || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localStorage.getItem('ENV_VITE_FIREBASE_MESSAGING_SENDER_ID') || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || localStorage.getItem('ENV_VITE_FIREBASE_APP_ID') || ''
});

export const hasFirebaseConfig = () => {
  const c = getConfig();
  return Boolean(c.apiKey && c.projectId);
};

const c = getConfig();

if (!c.apiKey) {
  console.warn('Firebase credentials missing. Please set VITE_FIREBASE_* in your env or use the UI setup prompt.');
}

// Fallback to placeholders to prevent initialization crashes while missing credentials
const app = getApps().length === 0 ? initializeApp({
  apiKey: c.apiKey || 'placeholder-api-key',
  authDomain: c.authDomain || 'placeholder.firebaseapp.com',
  projectId: c.projectId || 'placeholder-project',
  storageBucket: c.storageBucket || 'placeholder.appspot.com',
  messagingSenderId: c.messagingSenderId || '123456789',
  appId: c.appId || '1:123456789:web:abcdef'
}) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

