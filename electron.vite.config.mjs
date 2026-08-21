import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { obfuscator as obfuscatorPlugin } from 'rollup-obfuscator'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      obfuscatorPlugin({
        // === Control Flow ===
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,

        // === String Protection ===
        stringArray: true,
        stringArrayThreshold: 0.8,
        stringArrayEncoding: ['rc4'],
        stringArrayWrappersCount: 3,
        stringArrayWrappersChainedCalls: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        splitStrings: true,
        splitStringsChunkLength: 5,
        unicodeEscapeSequence: true,

        // === Identifier Mangling ===
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,

        // === Anti-Debug ===
        selfDefending: false,
        debugProtection: false,
        disableConsoleOutput: false,

        // === Transform ===
        transformObjectKeys: true,
        numbersToExpressions: true,

        // === Performance ===
        compact: true,
        simplify: true,

        // Target Node.js
        target: 'node',

        // Không obfuscate node_modules
        exclude: ['node_modules/**']
      })
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    publicDir: 'src/renderer/assets',
    plugins: [
      obfuscatorPlugin({
        // === Control Flow ===
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: false,

        // === String Protection ===
        stringArray: true,
        stringArrayThreshold: 0.8,
        stringArrayEncoding: ['rc4'],
        stringArrayWrappersCount: 2,
        stringArrayWrappersChainedCalls: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        splitStrings: true,
        splitStringsChunkLength: 5,
        unicodeEscapeSequence: true,

        // === Identifier Mangling ===
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,

        // === Anti-Debug ===
        selfDefending: false,
        debugProtection: false,
        disableConsoleOutput: false,

        // === Transform ===
        transformObjectKeys: true,
        numbersToExpressions: true,

        // === Performance ===
        compact: true,
        simplify: true,

        target: 'browser'
      })
    ]
  }
})
