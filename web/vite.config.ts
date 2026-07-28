import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

process.env.NODE_ENV = 'production';

export default defineConfig({
  plugins: [react()],
  envDir: __dirname,
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        'search-templates': path.resolve(__dirname, 'src/entrypoints/search-templates/index.tsx'),
        'search-tasks': path.resolve(__dirname, 'src/entrypoints/search-tasks/index.tsx')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'styles.css';
          }
          return 'assets/[name][extname]';
        }
      }
    }
  }
});
