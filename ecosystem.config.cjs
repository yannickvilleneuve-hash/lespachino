// PM2 — process manager pour le dev server Next.
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 restart pacman      (après gros refactor / Turbopack cache corrompu)
//   pm2 logs pacman --lines 100
//
// Boot automatique: pm2 startup (une fois, suivre l'instruction sudo affichée).
module.exports = {
  apps: [
    {
      name: "pacman",
      script: "pnpm",
      args: "dev",
      cwd: "/home/hino1/pacman",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        PATH: "/home/hino1/.npm-global/bin:/usr/local/bin:/usr/bin:/bin",
      },
      error_file: "/home/hino1/.pm2/logs/pacman-error.log",
      out_file: "/home/hino1/.pm2/logs/pacman-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
