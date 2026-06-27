import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
