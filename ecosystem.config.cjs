// PM2 — process manager pour Next en mode PROD (next start).
// Workflow:
//   pnpm build && pm2 reload pacman   (après changement de code)
//   pm2 logs pacman --lines 100
//
// Pourquoi prod et pas `next dev`: en 16.2.4 le dev+Turbopack n'hydrate pas
// les Client Components dans le browser (form leads, toggles, dropdowns) →
// `next start` lit le .next build et l'hydration est fiable.
//
// Boot automatique: pm2 startup (une fois, suivre l'instruction sudo affichée).
module.exports = {
  apps: [
    {
      name: "pacman",
      script: "pnpm",
      args: "start",
      cwd: "/home/hino1/pacman",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PATH: "/home/hino1/.npm-global/bin:/usr/local/bin:/usr/bin:/bin",
      },
      error_file: "/home/hino1/.pm2/logs/pacman-error.log",
      out_file: "/home/hino1/.pm2/logs/pacman-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "pacman-bot",
      script: "worker/dist/worker/index.js",
      cwd: "/home/hino1/pacman",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PATH: "/home/hino1/.npm-global/bin:/usr/local/bin:/usr/bin:/bin",
      },
      error_file: "/home/hino1/.pm2/logs/pacman-bot-error.log",
      out_file: "/home/hino1/.pm2/logs/pacman-bot-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
