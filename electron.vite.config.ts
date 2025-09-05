import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react-swc";
import { builtinModules } from "module";

// Plugin to completely stub out electron module to prevent Node.js API access
const stubElectronPlugin = () => ({
  name: 'stub-electron',
  resolveId(source) {
    if (source === 'electron') {
      // Return a virtual module ID to prevent Vite from processing the real electron module
      return { id: '\0virtual:electron', external: false };
    }
    return null;
  },
  load(id) {
    if (id === '\0virtual:electron') {
      return `
export default {};
export const ipcRenderer = {
  invoke: () => Promise.reject(new Error('ipcRenderer not available in renderer')),
  on: () => {},
  send: () => {},
  removeAllListeners: () => {}
};
export const remote = {};
`;
    }
    return null;
  }
});

// Plugin to handle node:process externalization
const stubNodeProcessPlugin = () => ({
  name: 'stub-node-process',
  resolveId(source) {
    if (source === 'node:process') {
      return { id: source, external: false };
    }
    return null;
  },
  load(id) {
    if (id === 'node:process') {
      return `
export default {
  platform: '${process.platform}',
  env: {},
  versions: {}
};
`;
    }
    return null;
  }
});

// Plugin to handle fs module stubbing
const stubFsPlugin = () => ({
  name: 'stub-fs',
  resolveId(source) {
    if (source === 'fs' || source === 'node:fs') {
      return { id: '\0virtual:fs', external: false };
    }
    return null;
  },
  load(id) {
    if (id === '\0virtual:fs') {
      return `
export default {};
export const existsSync = () => false;
export const readFileSync = () => '';
export const writeFileSync = () => {};
export const readdirSync = () => [];
export const statSync = () => ({ isDirectory: () => false, isFile: () => false });
`;
    }
    return null;
  }
});

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@main": resolve("src/main"),
        "@shared": resolve("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
        // Browser polyfills for Node.js modules
        "path": "path-browserify",
        "process": "process/browser"
      },
    },
    plugins: [react(), stubElectronPlugin(), stubNodeProcessPlugin(), stubFsPlugin()],
    define: {
      'process.env': '{}',
      'process.platform': JSON.stringify('darwin'), // Use appropriate value for your OS
      'process.versions': JSON.stringify({ electron: '37.3.1' }), // Use your Electron version
      'global': 'window', // Polyfill global for browser environment
      'globalThis': 'window', // Ensure globalThis is available
      '__dirname': JSON.stringify('/'), // Polyfill __dirname
      '__filename': JSON.stringify('/index.js') // Polyfill __filename
    },
    optimizeDeps: {
      exclude: [
        '@modelcontextprotocol/sdk-client-stdio',
        '@modelcontextprotocol/sdk-client-sse', 
        '@modelcontextprotocol/sdk-client-streamable-http'
      ],
      include: [
        // Ensure browser polyfills are included
        'path-browserify',
        'process/browser'
      ]
    },
    build: {
      rollupOptions: {
        external: [
          // Node.js built-in modules
          ...builtinModules,
          ...builtinModules.map(module => `node:${module}`),
          
          // Common Node.js dependencies that should not be bundled for renderer
          'cross-spawn',
          'which', 
          'isexe',
          
          // MCP SDK and related packages - use regex patterns to catch all variations
          /^@modelcontextprotocol\/sdk/,
          /^@modelcontextprotocol\/sdk-client/,
          '@modelcontextprotocol/sdk',
          '@modelcontextprotocol/sdk-client-stdio',
          '@modelcontextprotocol/sdk-client-sse',
          '@modelcontextprotocol/sdk-client-streamable-http',
          
          // Electron should not be bundled for renderer
          'electron',
          '@electron-toolkit/preload',
          '@electron-toolkit/utils',
          'electron-store'
        ],
      },
    },
  },
});
