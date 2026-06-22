module.exports = {
  apps: [
    {
      name: 'nexvo-wa-bot',
      script: '/usr/lib/node_modules/tsx/dist/cli.mjs',
      args: 'index.ts',
      cwd: '/home/nexvo/mini-services/wa-bot',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

