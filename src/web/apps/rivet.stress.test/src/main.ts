import { createApp } from 'vue'
import { createBackend } from '@rivet/shell/client'
import App from './App.vue'

createApp(App)
    .use(createBackend({ autoStart: false }))
    .mount('#app')
