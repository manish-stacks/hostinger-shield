module.exports = {
  apps: [
    {
      name: "hostinger-shield-backend",
      cwd: "/root/hostinger-shield/backend",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 6000
      }
    }
  ]
};