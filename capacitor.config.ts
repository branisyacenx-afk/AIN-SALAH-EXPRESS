import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dz.ain.salah.express',
  appName: 'عين صالح إكسبريس',
  webDir: 'dist',
  server: {
    // Keep the Android app connected to the same live platform and Supabase backend.
    url: 'https://ain-salah-express.vercel.app/',
    cleartext: false,
    allowNavigation: ['ain-salah-express.vercel.app', '*.supabase.co', 'tile.openstreetmap.org']
  },
  android: {
    allowMixedContent: false,
    captureInput: true
  }
};

export default config;
