import { defineConfig } from 'vite';
// @ts-expect-error Local Vite server plugin, implemented in JavaScript.
import { ollamaPlugin } from './server/ollama.mjs';

const voiceStudioPort = Number(process.env.VOICESTUDIO_PORT || 3900);

export default defineConfig({
 plugins: [ollamaPlugin()],
 server: {
  host: '0.0.0.0',
  port: Number(process.env.PORT || 5173),
  allowedHosts: true,
  cors: true,
  proxy: {
   '/voicestudio': {
    target: `http://127.0.0.1:${voiceStudioPort}`,
    changeOrigin: true,
    rewrite: path => path.replace(/^\/voicestudio/, '')
   }
  },
  watch: {
   ignored: ['**/.runtime/**', '**/.tempo-data/**']
  }
 }
});
