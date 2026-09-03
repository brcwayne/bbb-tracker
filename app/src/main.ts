import { mount } from 'svelte'
import { initTheme } from './lib/theme'
import './app.css'
import App from './App.svelte'

initTheme()

export default mount(App, { target: document.getElementById('app')! })
