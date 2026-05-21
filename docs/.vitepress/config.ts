/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Kubby',
  description: 'A fast, keyboard-driven desktop app for managing Kubernetes clusters',
  base: '/',  // Use root-relative paths for local HTTP server

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    logo: {
      light: '/images/light/kubby_logo.png',
      dark: '/images/dark/kubby_logo.png',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Features', link: '/features/' },
      { text: 'Shortcuts', link: '/shortcuts' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Kubby', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
        ]
      },
      {
        text: 'Features',
        items: [
          { text: 'Overview', link: '/features/' },
          { text: 'Dashboard', link: '/features/dashboard' },
          { text: 'Resource List', link: '/features/resource-list' },
          { text: 'Resource Detail', link: '/features/resource-detail' },
          { text: 'Log Viewer', link: '/features/log-viewer' },
          { text: 'Actions', link: '/features/actions' },
          { text: 'AI Assistant', link: '/features/ai-assistant' },
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Navigation', link: '/navigation' },
          { text: 'Keyboard Shortcuts', link: '/shortcuts' },
          { text: 'Configuration', link: '/configuration' },
        ]
      }
    ],

    socialLinks: [
      // { icon: 'github', link: 'https://github.com/OneAdobe/kubby' }
    ],

    footer: {
      // message: 'Built with VitePress',
    },

    search: {
      provider: 'local'
    }
  }
})
