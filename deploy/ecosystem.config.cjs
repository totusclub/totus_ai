// PM2: два процесса Милы. Запускаются из папки релиза, где лежит этот файл
// (deploy/deploy.sh: `pm2 start deploy/ecosystem.config.cjs --only <имя>`).
// Команды те же, что были вручную: `npm run server` и `npm run start:web`.
const path = require('node:path')

const cwd = path.resolve(__dirname, '..')

module.exports = {
  apps: [
    { name: 'totus-ai-api', cwd, script: 'npm', args: 'run server', autorestart: true },
    { name: 'totus-ai-web', cwd, script: 'npm', args: 'run start:web', autorestart: true },
  ],
}
