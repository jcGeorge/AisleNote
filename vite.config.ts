import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@mdxeditor-internal': path.resolve(__dirname, 'node_modules/@mdxeditor/editor/dist'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: 'toastui-editor',
              test: /node_modules[\\/]@toast-ui[\\/]editor[\\/]/,
              priority: 30,
              maxSize: 450 * 1024,
            },
            {
              name: 'codemirror-vendor',
              test: /node_modules[\\/](@codemirror|@lezer|codemirror|style-mod|w3c-keyname|crelt)[\\/]/,
              priority: 25,
            },
            {
              name: 'lexical-vendor',
              test: /node_modules[\\/](lexical|@lexical)[\\/]/,
              priority: 25,
            },
            {
              name: 'prosemirror',
              test: /node_modules[\\/]prosemirror-/,
              priority: 20,
              maxSize: 450 * 1024,
            },
            {
              name: 'markdown-vendor',
              test: /node_modules[\\/](react-markdown|remark-|micromark|mdast-|hast-|unified|unist-|vfile|devlop|decode-named-character-reference|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|trim-lines|zwitch|ccount|escape-string-regexp|markdown-table)[\\/]/,
              priority: 10,
            },
            {
              name: 'data-vendor',
              test: /node_modules[\\/](jszip|yaml)[\\/]/,
              priority: 10,
            },
            {
              name: 'app-editor',
              test: /[\\/]src[\\/]editor[\\/]/,
              priority: 5,
              maxSize: 450 * 1024,
            },
            {
              name: 'app-components',
              test: /[\\/]src[\\/]components[\\/]/,
              priority: 5,
              maxSize: 450 * 1024,
            },
            {
              name: 'app-state',
              test: /[\\/]src[\\/](state|storage|settings|import|notebook|platform)[\\/]/,
              priority: 5,
              maxSize: 450 * 1024,
            },
            {
              name: 'app-domain',
              test: /[\\/]src[\\/](notes|arrange|navigation|overlays|trash|frontmatter|hotkeys|app|markdown|media)[\\/]/,
              priority: 5,
              maxSize: 450 * 1024,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              maxSize: 450 * 1024,
            },
          ],
        },
      },
    },
  },
  plugins: [react()],
})
