import { ElNotification } from 'element-plus'

type NotificationType = 'success' | 'warning' | 'info' | 'error'

function openNotification(type: NotificationType, message: string) {
  ElNotification({
    type,
    message,
    position: 'bottom-left',
    showClose: false,
  })
}

export const notify = {
  success: (message: string) => openNotification('success', message),
  warning: (message: string) => openNotification('warning', message),
  info: (message: string) => openNotification('info', message),
  error: (message: string) => openNotification('error', message),
}
