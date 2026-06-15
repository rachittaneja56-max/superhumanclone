import { corsair } from './corsair'

async function run() {
  console.log('manage keys:', Object.keys(corsair.manage))
  console.log('manage.plugins keys:', Object.keys(corsair.manage.plugins))
  console.log('manage.tenants keys:', Object.keys(corsair.manage.tenants))
  console.log('manage.connectionStatus keys:', Object.keys(corsair.manage.connectionStatus))
}

run()
