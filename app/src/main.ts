import { mount } from 'svelte'
import { initTheme } from './lib/theme'
import { initPwaUpdates } from './lib/pwaUpdate'
import './app.css'
import App from './App.svelte'

initTheme()
void initPwaUpdates()

export default mount(App, { target: document.getElementById('app')! })
