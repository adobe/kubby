import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const config: WebdriverIO.Config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: 4445,
  maxInstances: 1,

  specs: [path.resolve(__dirname, 'specs/**/*.spec.ts')],

  capabilities: [
    {
      maxInstances: 1,
    },
  ],

  framework: 'mocha',
  reporters: ['spec'],

  logLevel: 'info',
  outputDir: path.resolve(__dirname, 'logs'),

  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000,
    retries: 0,
  },

  tsConfigPath: path.resolve(__dirname, 'tsconfig.json'),

  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 5,

  autoCompileOpts: {
    tsNodeOpts: {
      project: path.resolve(__dirname, 'tsconfig.json'),
      transpileOnly: true,
    },
  },

  beforeTest(test) {
    console.log(`\n>>> RUNNING: ${test.parent} > ${test.title}\n`)
  },
  afterTest(test, context, { passed, duration, error }) {
    const status = passed ? 'PASSED' : 'FAILED'
    const msg = `<<< ${status}: ${test.parent} > ${test.title} (${duration}ms)`
    console.log(error ? `${msg}\n    Error: ${error.message}\n` : `${msg}\n`)
  },
}
