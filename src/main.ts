import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles.css'
import App from './App.vue'
import { loadInitialGlobalConfig } from './config'

async function bootstrap() {
  try {
    const initialGlobalConfig = await loadInitialGlobalConfig()
    createApp(App, { initialGlobalConfig }).use(ElementPlus, { locale: zhCn }).mount('#app')
  } catch (error) {
    console.error('Failed to load runtime default config.', error)
    showConfigLoadError()
  }
}

function showConfigLoadError() {
  const root = document.querySelector('#app')

  if (!root) {
    return
  }

  const panel = document.createElement('main')
  const title = document.createElement('h1')
  const message = document.createElement('p')
  const retry = document.createElement('button')
  panel.className = 'startup-error'
  title.textContent = '默认配置加载失败'
  message.textContent = '请检查 config/default-config.json 是否存在且格式正确，然后重试。'
  retry.textContent = '重新加载'
  retry.addEventListener('click', () => window.location.reload())
  panel.append(title, message, retry)
  root.replaceChildren(panel)
}

void bootstrap()
