import { defineConfig } from 'vite';
// @ts-expect-error Local Vite server plugin, implemented in JavaScript.
import { ollamaPlugin } from './server/ollama.mjs';
export default defineConfig({ plugins: [ollamaPlugin()], server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] } });
