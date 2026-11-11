import { defineConfig } from 'vite';
// @ts-expect-error Local Vite server plugin, implemented in JavaScript.
import { ollamaPlugin } from './server/ollama.mjs';

const voiceStudioPort = Number(process.env.VOICESTUDIO_PORT || 3900);
const comfyUiPort = Number(process.env.COMFYUI_PORT || 8188);
const shortVideoPort = Number(process.env.SHORT_VIDEO_MAKER_PORT || 3123);
const moneyPrinterPort = Number(process.env.MONEY_PRINTER_PORT || 8080);

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
   },
   '/comfyui': {
    target: `http://127.0.0.1:${comfyUiPort}`,
    changeOrigin: true,
    rewrite: path => path.replace(/^\/comfyui/, '')
   },
   '/shortvideomaker': {
    target: `http://127.0.0.1:${shortVideoPort}`,
    changeOrigin: true,
    rewrite: path => path.replace(/^\/shortvideomaker/, '')
   },
   '/moneyprinter': {
    target: `http://127.0.0.1:${moneyPrinterPort}`,
    changeOrigin: true,
    rewrite: path => path.replace(/^\/moneyprinter/, '')
   }
  },
  watch: {
   ignored: ['**/.runtime/**', '**/.tempo-data/**']
  }
 }
});
