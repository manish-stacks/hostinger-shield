cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: "hostinger-shield-frontend",
      cwd: "/root/hostinger-shield/frontend",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3011
      }
    }
  ]
}
EOF