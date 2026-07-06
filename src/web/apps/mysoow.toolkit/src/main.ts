import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import { createBackend } from '@rivet/client'
import App from './App.vue'

createApp(App)
    .use(Antd)
    .use(createBackend({ autoStart: false, protocol: 'json' }))
    .mount('#app')
