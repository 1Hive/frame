/* globals fetch */

import EventEmitter from 'events'
import Restore from 'react-restore'
import utils from 'web3-utils'

import link from '../link'
import * as actions from './actions'

const NATIVE = 'pollen'
const DISCOUNT = 'honey'
const HOME_ERC20_ADDRESS = '0xDfD1f311977c282c15F88686426E65062B20a87a'
const balanceOfSig = '70a08231'

export default (state, cb) => {
  const store = Restore.create(state, actions)
  store.events = new EventEmitter()

  // Feed for relaying state updates
  store.api.feed((state, actions, obscount) => {
    actions.forEach(action => {
      action.updates.forEach(update => {
        if (update.path.startsWith('main')) return
        link.send('tray:syncPath', update.path, update.value)
      })
    })
  })

  link.on('action', (action, ...args) => {
    if (store[action]) store[action](...args)
  })
  link.send('tray:ready') // turn on api

  const etherRates = () => {
    fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD')
      .then(res => res.json())
      .then(res => {
        if (res) store.updateExternalRates(res)
      })
      .catch(e => console.log('Unable to fetch exchange rate', e))
  }
  etherRates()
  setInterval(etherRates, 10000)

  link.send('tray:refreshMain')

  let monitor

  const refreshBalances = () => {
    monitor.forEach(address => {
      link.rpc(
        'providerSend',
        { jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 },
        res => {
          if (res.error) return
          const balance = utils.fromWei(utils.hexToNumberString(res.result))
          if (store('balances', address, NATIVE) !== balance) store.setBalance(address, NATIVE, balance)
        }
      )

      link.rpc(
        'providerSend',
        {
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            { to: HOME_ERC20_ADDRESS, data: `0x${balanceOfSig}${address.slice(2).padStart(64, '0')}` },
            'latest',
          ],
          id: 1,
        },
        res => {
          if (res.error) return

          const balance = utils.fromWei(utils.hexToNumberString(res.result))
          if (store('balances', address, DISCOUNT) !== balance) store.setBalance(address, DISCOUNT, balance)
        }
      )

      fetch('http://localhost:3001/0x').then(res => res.json())
      .then(res => console.log(res))
    })
  }

  store.observer(() => {
    monitor = []
    if (store('selected.current')) {
      const account = store('main.accounts', store('selected.current'))
      if (account) {
        if (store('selected.showAccounts')) {
          // When viewing accounts, refresh them all
          const startIndex = store('selected.accountPage') * 5
          if (account.addresses.length) monitor = account.addresses.slice(startIndex, startIndex + 10)
        } else {
          monitor = [account.addresses[account.index]]
        }
      } else {
        const accounts = store('main.accounts')
        monitor = Object.keys(accounts).map(id => {
          const account = accounts[id]
          return account.addresses[account.index]
        })
      }
    }
    refreshBalances()
  })

  setInterval(refreshBalances, 15 * 1000)

  return store
}
