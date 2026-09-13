import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles.css'
import App from './App.vue'
import { loadInitialGlobalConfig } from './config'
import { LocalRepository } from './storage'

async function bootstrap() {
  try {
    const initialGlobalConfig = await loadInitialGlobalConfig()
    const repository = new LocalRepository(localStorage)
    const initialState = repository.load(initialGlobalConfig)
    createApp(App, { initialGlobalConfig, initialState, repository }).use(ElementPlus, { locale: zhCn }).mount('#app')
  } catch (error) {
    console.error('Failed to load runtime default config.', error)
    showConfigLoadError(error)
  }
}

function showConfigLoadError(error: unknown) {
  const root = document.querySelector('#app')

  if (!root) {
    return
  }

  const panel = document.createElement('main')
  const title = document.createElement('h1')
  const message = document.createElement('p')
  const retry = document.createElement('button')
  panel.className = 'startup-error'
  title.textContent = '数据或配置加载失败'
  message.textContent = `${error instanceof Error ? error.message : '请检查默认配置及浏览器存储。'}。原存档已保留，请勿清除浏览器数据。`
  retry.textContent = '重新加载'
  retry.addEventListener('click', () => window.location.reload())
  panel.append(title, message, retry)
  root.replaceChildren(panel)
}

void bootstrap()
