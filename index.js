import { currentVersion } from './components/Changelog.js'

Bot.logger = logger

// 仅加载 Yunzai V3 adapter；不再暴露旧版 apps 命令加载入口。
const adapter = await import('./adapter/index.js')
export const atlas = adapter.atlas || {}

Bot.logger.info(`---------^_^---------`)
Bot.logger.info(`图鉴插件${currentVersion}初始化~`)

