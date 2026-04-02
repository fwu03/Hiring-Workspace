import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const endpoint = env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const deployment = env.AZURE_OPENAI_DEPLOYMENT;
  const apiKey = env.AZURE_OPENAI_API_KEY;

  const azureProxy =
    endpoint && deployment && apiKey
      ? {
          '/__proxy/azure-openai': {
            target: endpoint,
            changeOrigin: true,
            secure: true,
            rewrite: (path: string) =>
              path.replace(/^\/__proxy\/azure-openai/, `/openai/deployments/${deployment}`),
            configure(proxy) {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('api-key', apiKey);
              });
            },
          },
        }
      : {};

  const openaiKey = env.OPENAI_API_KEY?.trim();
  const openaiProxy = openaiKey
    ? {
        '/__proxy/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/__proxy\/openai/, ''),
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${openaiKey}`);
            });
          },
        },
      }
    : {};

  return {
    plugins: [react()],
    server: {
      proxy: { ...azureProxy, ...openaiProxy },
    },
  };
});
