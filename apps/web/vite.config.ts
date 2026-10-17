import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Under `npm run dev`, scripts/dev.mjs passes the API server's launch token
// and address. The page gets the token the way the server would give it, and
// /api goes to the server.
const token = process.env.RT_TOKEN
const server = process.env.RT_SERVER

const launchToken = (): Plugin => ({
  name: 'reasontrace-launch-token',
  apply: 'serve',
  transformIndexHtml: (html) => (token ? html.replace('</head>', `<meta name="reasontrace-token" content="${token}"></head>`) : html),
})

export default defineConfig({
  plugins: [react(), launchToken()],
  server: server ? { proxy: { '/api': server } } : {},
})
