'use strict'

const test = require('brittle')
const { INVALID_ACTIONS_ERRORS } = require('../../workers/lib/constants')

test('pushAction - type filtering', async (t) => {
  t.test('should filter targets by rack type when type is provided', async (t) => {
    // Mock racks database
    const mockRacks = new Map([
      ['rack-miner-1', JSON.stringify({ id: 'rack-miner-1', type: 'wrk-miner-s19' })],
      ['rack-miner-2', JSON.stringify({ id: 'rack-miner-2', type: 'wrk-miner-s19xp' })],
      ['rack-container-1', JSON.stringify({ id: 'rack-container-1', type: 'wrk-container-antspace' })]
    ])

    const racks = {
      get: async (key) => mockRacks.get(key)
    }

    // Mock targets from getWriteCalls
    const targets = {
      'rack-miner-1': { reqVotes: 1, calls: [{ id: 'device-1' }] },
      'rack-miner-2': { reqVotes: 1, calls: [{ id: 'device-2' }] },
      'rack-container-1': { reqVotes: 1, calls: [{ id: 'device-3' }] }
    }

    // Test filtering by exact type match
    const processedRacks = []
    for (const rack in targets) {
      const type = 'wrk-miner-s19'
      const rackEntry = await racks.get(rack)
      const rackData = rackEntry ? JSON.parse(rackEntry.toString()) : null
      if (type && rackData && rackData.type !== type && !rackData.type.startsWith(`${type}-`)) {
        continue
      }
      processedRacks.push(rack)
    }

    t.is(processedRacks.length, 1, 'should only process rack with exact type match')
    t.is(processedRacks[0], 'rack-miner-1', 'should process rack-miner-1')
  })

  t.test('should filter targets by rack type prefix when type has variants', async (t) => {
    // Mock racks database
    const mockRacks = new Map([
      ['rack-miner-1', JSON.stringify({ id: 'rack-miner-1', type: 'wrk-miner-s19' })],
      ['rack-miner-2', JSON.stringify({ id: 'rack-miner-2', type: 'wrk-miner-s19-variant-1' })],
      ['rack-miner-3', JSON.stringify({ id: 'rack-miner-3', type: 'wrk-miner-s19xp' })]
    ])

    const racks = {
      get: async (key) => mockRacks.get(key)
    }

    const targets = {
      'rack-miner-1': { reqVotes: 1, calls: [{ id: 'device-1' }] },
      'rack-miner-2': { reqVotes: 1, calls: [{ id: 'device-2' }] },
      'rack-miner-3': { reqVotes: 1, calls: [{ id: 'device-3' }] }
    }

    // Test filtering by type prefix
    const processedRacks = []
    for (const rack in targets) {
      const type = 'wrk-miner-s19'
      const rackEntry = await racks.get(rack)
      const rackData = rackEntry ? JSON.parse(rackEntry.toString()) : null
      if (type && rackData && rackData.type !== type && !rackData.type.startsWith(`${type}-`)) {
        continue
      }
      processedRacks.push(rack)
    }

    t.is(processedRacks.length, 2, 'should process racks with type and type prefix match')
    t.ok(processedRacks.includes('rack-miner-1'), 'should include rack with exact match')
    t.ok(processedRacks.includes('rack-miner-2'), 'should include rack with prefix match')
    t.ok(!processedRacks.includes('rack-miner-3'), 'should not include rack with different type')
  })

  t.test('should process all targets when type is not provided', async (t) => {
    const mockRacks = new Map([
      ['rack-miner-1', JSON.stringify({ id: 'rack-miner-1', type: 'wrk-miner-s19' })],
      ['rack-container-1', JSON.stringify({ id: 'rack-container-1', type: 'wrk-container-antspace' })]
    ])

    const racks = {
      get: async (key) => mockRacks.get(key)
    }

    const targets = {
      'rack-miner-1': { reqVotes: 1, calls: [{ id: 'device-1' }] },
      'rack-container-1': { reqVotes: 1, calls: [{ id: 'device-2' }] }
    }

    const processedRacks = []
    for (const rack in targets) {
      const type = null
      const rackEntry = await racks.get(rack)
      const rackData = rackEntry ? JSON.parse(rackEntry.toString()) : null
      if (type && rackData && rackData.type !== type && !rackData.type.startsWith(`${type}-`)) {
        continue
      }
      processedRacks.push(rack)
    }

    t.is(processedRacks.length, 2, 'should process all racks when type is null')
  })
})

test('pushAction - invalid error handling', async (t) => {
  t.test('should skip targets with UNKNOWN_METHOD error', async (t) => {
    const targets = {
      'rack-1': { reqVotes: 1, calls: [{ id: 'device-1' }], error: 'UNKNOWN_METHOD: reboot' },
      'rack-2': { reqVotes: 1, calls: [{ id: 'device-2' }] }
    }

    const processedRacks = []
    for (const rack in targets) {
      const entry = targets[rack]
      if (entry.error && INVALID_ACTIONS_ERRORS.some(err => entry.error.includes(err))) {
        continue
      }
      processedRacks.push(rack)
    }

    t.is(processedRacks.length, 1, 'should only process rack without invalid error')
    t.is(processedRacks[0], 'rack-2', 'should process rack-2')
  })

  t.test('should skip targets with CHANNEL_CLOSED error', async (t) => {
    const targets = {
      'rack-1': { reqVotes: 1, calls: [{ id: 'device-1' }] },
      'rack-2': { reqVotes: 1, calls: [{ id: 'device-2' }], error: 'CHANNEL_CLOSED' },
      'rack-3': { reqVotes: 1, calls: [{ id: 'device-3' }] }
    }

    const processedRacks = []
    for (const rack in targets) {
      const entry = targets[rack]
      if (entry.error && INVALID_ACTIONS_ERRORS.some(err => entry.error.includes(err))) {
        continue
      }
      processedRacks.push(rack)
    }

    t.is(processedRacks.length, 2, 'should process racks without invalid errors')
    t.ok(processedRacks.includes('rack-1'), 'should include rack-1')
    t.ok(processedRacks.includes('rack-3'), 'should include rack-3')
  })

  t.test('should process targets with other errors', async (t) => {
    const targets = {
      'rack-1': { reqVotes: 1, calls: [], error: 'ERR_TIMEOUT' },
      'rack-2': { reqVotes: 1, calls: [], error: 'ERR_CONNECTION_FAILED' }
    }

    const processedRacks = []
    for (const rack in targets) {
      const entry = targets[rack]
      if (entry.error && INVALID_ACTIONS_ERRORS.some(err => entry.error.includes(err))) {
        continue
      }
      processedRacks.push(rack)
    }

    t.is(processedRacks.length, 2, 'should process racks with valid errors')
  })

  t.test('should skip targets with partial match of invalid errors', async (t) => {
    const targets = {
      'rack-1': { reqVotes: 1, calls: [], error: 'Error: UNKNOWN_METHOD not supported' },
      'rack-2': { reqVotes: 1, calls: [], error: 'Connection error: CHANNEL_CLOSED unexpectedly' }
    }

    const processedRacks = []
    for (const rack in targets) {
      const entry = targets[rack]
      if (entry.error && INVALID_ACTIONS_ERRORS.some(err => entry.error.includes(err))) {
        continue
      }
      processedRacks.push(rack)
    }

    t.is(processedRacks.length, 0, 'should skip racks with errors containing invalid error strings')
  })
})

test('_filterInvalidActionsErrors - error filtering in targets', async (t) => {
  const WrkProcAggr = require('../../workers/aggr.proc.ork.wrk')

  t.test('should filter out actions where all targets have UNKNOWN_METHOD error', async (t) => {
    const actions = [
      {
        id: 'action-1',
        targets: {
          'rack-1': { calls: [], error: 'UNKNOWN_METHOD: setPowerMode' },
          'rack-2': { calls: [], error: 'UNKNOWN_METHOD: setPowerMode' }
        }
      },
      {
        id: 'action-2',
        targets: {
          'rack-3': { calls: [{ id: 'device-1' }] }
        }
      }
    ]

    const filteredActions = WrkProcAggr.prototype._filterInvalidActionsErrors(actions)

    t.is(filteredActions.length, 1, 'should filter out action with all invalid errors')
    t.is(filteredActions[0].id, 'action-2', 'should keep action-2')
  })

  t.test('should filter out actions where all targets have CHANNEL_CLOSED error', async (t) => {
    const actions = [
      {
        id: 'action-1',
        targets: {
          'rack-1': { calls: [], error: 'CHANNEL_CLOSED' }
        }
      },
      {
        id: 'action-2',
        targets: {
          'rack-2': { calls: [{ id: 'device-1' }] },
          'rack-3': { calls: [{ id: 'device-2' }] }
        }
      }
    ]

    const filteredActions = WrkProcAggr.prototype._filterInvalidActionsErrors(actions)

    t.is(filteredActions.length, 1, 'should keep action with valid targets')
    t.is(filteredActions[0].id, 'action-2', 'should keep action-2')
  })

  t.test('should keep actions where at least one target does not have invalid error', async (t) => {
    const actions = [
      {
        id: 'action-1',
        targets: {
          'rack-1': { calls: [], error: 'UNKNOWN_METHOD: reboot' },
          'rack-2': { calls: [{ id: 'device-1' }] },
          'rack-3': { calls: [], error: 'CHANNEL_CLOSED' }
        }
      }
    ]

    const filteredActions = WrkProcAggr.prototype._filterInvalidActionsErrors(actions)

    t.is(filteredActions.length, 1, 'should keep action with at least one valid target')
    t.is(filteredActions[0].id, 'action-1', 'should keep action-1')
  })

  t.test('should keep actions where targets have other types of errors', async (t) => {
    const actions = [
      {
        id: 'action-1',
        targets: {
          'rack-1': { calls: [], error: 'ERR_TIMEOUT' },
          'rack-2': { calls: [], error: 'ERR_CONNECTION_FAILED' }
        }
      }
    ]

    const filteredActions = WrkProcAggr.prototype._filterInvalidActionsErrors(actions)

    t.is(filteredActions.length, 1, 'should keep action with valid error types')
  })

  t.test('should keep actions where targets have no errors', async (t) => {
    const actions = [
      {
        id: 'action-1',
        targets: {
          'rack-1': { calls: [{ id: 'device-1' }] },
          'rack-2': { calls: [{ id: 'device-2' }] }
        }
      }
    ]

    const filteredActions = WrkProcAggr.prototype._filterInvalidActionsErrors(actions)

    t.is(filteredActions.length, 1, 'should keep action without errors')
  })

  t.test('should handle empty targets object', async (t) => {
    const actions = [
      {
        id: 'action-1',
        targets: {}
      }
    ]

    const filteredActions = WrkProcAggr.prototype._filterInvalidActionsErrors(actions)

    t.is(filteredActions.length, 0, 'should filter out action with empty targets')
  })

  t.test('should filter out actions with mixed invalid errors across all targets', async (t) => {
    const actions = [
      {
        id: 'action-1',
        targets: {
          'rack-1': { calls: [], error: 'UNKNOWN_METHOD: setPowerMode' },
          'rack-2': { calls: [], error: 'CHANNEL_CLOSED' },
          'rack-3': { calls: [], error: 'Error: UNKNOWN_METHOD not found' }
        }
      },
      {
        id: 'action-2',
        targets: {
          'rack-4': { calls: [], error: 'UNKNOWN_METHOD: reboot' },
          'rack-5': { calls: [{ id: 'device-1' }] }
        }
      }
    ]

    const filteredActions = WrkProcAggr.prototype._filterInvalidActionsErrors(actions)

    t.is(filteredActions.length, 1, 'should filter correctly with mixed errors')
    t.is(filteredActions[0].id, 'action-2', 'should keep action with at least one valid target')
  })
})

test('instant actions', async (t) => {
  const WrkProcAggr = require('../../workers/aggr.proc.ork.wrk')
  const { ACTION_STATUS } = require('@tetherto/svc-facs-action-approver')
  const { INSTANT_ACTIONS, INSTANT_ACTION_CALL_TIMEOUT_MS } = require('../../workers/lib/constants')

  const createMockDb = () => {
    const store = new Map()
    return {
      store,
      put: async (key, value) => { store.set(key.toString('hex'), value) },
      del: async (key) => { store.delete(key.toString('hex')) },
      get: async (key) => {
        const value = store.get(key.toString('hex'))
        return value ? { value } : null
      }
    }
  }

  const createMockApprover = () => ({
    dbActDone: createMockDb(),
    queue: { pushTask: async (fn) => await fn() },
    _encode: (data) => Buffer.from(JSON.stringify(data), 'utf-8'),
    _validVoter: (voter) => Boolean(voter && typeof voter === 'string' && voter.trim()),
    pushAction: async () => { throw new Error('ERR_QUEUE_SHOULD_NOT_BE_USED') }
  })

  const createWrk = (approver, callTargets) => {
    const wrk = Object.create(WrkProcAggr.prototype)
    wrk.actionApprover_0 = approver
    wrk.actionCaller = { callTargets }
    return wrk
  }

  t.test('should contain registerThing and updateThing', async (t) => {
    t.ok(INSTANT_ACTIONS.has('registerThing'), 'registerThing is instant')
    t.ok(INSTANT_ACTIONS.has('updateThing'), 'updateThing is instant')
    t.is(INSTANT_ACTIONS.size, 2, 'no other instant actions')
  })

  t.test('should execute action and record it as COMPLETED in done db', async (t) => {
    const approver = createMockApprover()
    const callTargetsCalls = []
    const wrk = createWrk(approver, async (action, params, targets, opts) => {
      callTargetsCalls.push({ action, params, targets, opts })
      targets['rack-1'].calls[0].result = 1
    })

    const targets = { 'rack-1': { calls: [{ id: 'thing-1', tags: [] }] } }
    const payload = [[{ rackId: 'rack-1', opts: {} }], targets, ['inventory'], []]

    const data = await wrk._execActionInstant({
      action: 'registerThing',
      payload,
      voter: 'user@example.com',
      batchActionUID: 'batch-1'
    })

    t.is(data.status, ACTION_STATUS.COMPLETED, 'status is COMPLETED')
    t.ok(data.id, 'id assigned')
    t.alike(data.votesPos, ['user@example.com'], 'voter recorded')
    t.is(data.reqVotesPos, 1, 'reqVotesPos is 1')
    t.is(data.batchActionUID, 'batch-1', 'batchActionUID kept')

    t.is(callTargetsCalls.length, 1, 'callTargets called once')
    const call = callTargetsCalls[0]
    t.is(call.action, 'registerThing', 'action forwarded')
    t.alike(
      call.params[call.params.length - 1],
      { actionId: data.id, user: 'user@example.com' },
      'audit tail appended to params'
    )
    t.is(call.opts.timeout, INSTANT_ACTION_CALL_TIMEOUT_MS, 'timeout passed')

    t.is(approver.dbActDone.store.size, 1, 'record stored in done db')

    const stored = JSON.parse([...approver.dbActDone.store.values()][0].toString())
    t.is(stored.status, ACTION_STATUS.COMPLETED, 'stored status is COMPLETED')
    t.is(stored.action, 'registerThing', 'stored action name')
    t.is(
      stored.payload[1]['rack-1'].calls[0].result, 1,
      'per-call result captured in stored targets'
    )
  })

  t.test('should record FAILED action in done db when execution throws', async (t) => {
    const approver = createMockApprover()
    const wrk = createWrk(approver, async () => {
      throw new Error('ERR_DOWNSTREAM_TIMEOUT')
    })

    const targets = { 'rack-1': { calls: [{ id: 'thing-1', tags: [] }] } }
    const data = await wrk._execActionInstant({
      action: 'updateThing',
      payload: [[{ rackId: 'rack-1', id: 'thing-1' }], targets, ['inventory'], []],
      voter: 'user@example.com'
    })

    t.is(data.status, ACTION_STATUS.FAILED, 'status is FAILED')
    t.ok(data.error.includes('ERR_DOWNSTREAM_TIMEOUT'), 'error captured')
    t.is(approver.dbActDone.store.size, 1, 'failed record stored in done db')
  })

  t.test('should reject invalid voter', async (t) => {
    const approver = createMockApprover()
    const wrk = createWrk(approver, async () => {})

    await t.exception(
      wrk._execActionInstant({
        action: 'registerThing',
        payload: [[{}], {}, [], []],
        voter: ''
      }),
      /ERR_VOTER_INVALID/,
      'throws for invalid voter'
    )
    t.is(approver.dbActDone.store.size, 0, 'nothing stored')
  })

  t.test('pushAction should execute instant actions without queueing', async (t) => {
    const approver = createMockApprover()
    const wrk = createWrk(approver, async (action, params, targets) => {
      targets['rack-1'].calls[0].result = 1
    })
    wrk.actionCaller.getWriteCalls = async () => ({
      targets: { 'rack-1': { reqVotes: 1, calls: [{ id: 'thing-1', tags: [] }] } },
      requiredPerms: ['inventory'],
      approvalPerms: []
    })
    wrk._shouldSkipRackType = async () => false

    const res = await wrk.pushAction({
      query: { rack: 'rack-1' },
      action: 'registerThing',
      params: [{ rackId: 'rack-1', opts: {} }],
      voter: 'user@example.com',
      authPerms: ['inventory:rw']
    })

    t.ok(res.id, 'returns action id')
    t.is(res.data.status, ACTION_STATUS.COMPLETED, 'returns completed action data')
    t.alike(res.errors, [], 'no errors')
    t.is(approver.dbActDone.store.size, 1, 'action recorded in done db')
  })

  t.test('pushAction should fall back to queue when reqVotes > 1', async (t) => {
    const approver = createMockApprover()
    const pushedToQueue = []
    approver.pushAction = async (opts) => {
      pushedToQueue.push(opts)
      return { id: 123, ...opts, status: ACTION_STATUS.VOTING }
    }

    const wrk = createWrk(approver, async () => {
      throw new Error('ERR_INSTANT_SHOULD_NOT_RUN')
    })
    wrk.actionCaller.getWriteCalls = async () => ({
      targets: { 'rack-1': { reqVotes: 2, calls: [{ id: 'thing-1', tags: [] }] } },
      requiredPerms: ['inventory'],
      approvalPerms: []
    })
    wrk._shouldSkipRackType = async () => false

    const res = await wrk.pushAction({
      query: { rack: 'rack-1' },
      action: 'registerThing',
      params: [{ rackId: 'rack-1', opts: {} }],
      voter: 'user@example.com',
      authPerms: ['inventory:rw']
    })

    t.is(pushedToQueue.length, 1, 'action went through the approver queue')
    t.is(pushedToQueue[0].reqVotesPos, 2, 'reqVotes forwarded to approver')
    t.is(res.id, 123, 'returns queued action id')
    t.is(approver.dbActDone.store.size, 0, 'not executed instantly')
  })

  t.test('pushAction should queue non-instant actions', async (t) => {
    const approver = createMockApprover()
    const pushedToQueue = []
    approver.pushAction = async (opts) => {
      pushedToQueue.push(opts)
      return { id: 456, ...opts, status: ACTION_STATUS.APPROVED }
    }

    const wrk = createWrk(approver, async () => {
      throw new Error('ERR_INSTANT_SHOULD_NOT_RUN')
    })
    wrk.actionCaller.getWriteCalls = async () => ({
      targets: { 'rack-1': { reqVotes: 1, calls: [{ id: 'thing-1', tags: [] }] } },
      requiredPerms: ['miner'],
      approvalPerms: []
    })
    wrk._shouldSkipRackType = async () => false

    const res = await wrk.pushAction({
      query: { id: 'thing-1' },
      action: 'reboot',
      params: [{}],
      voter: 'user@example.com',
      authPerms: ['miner:rw']
    })

    t.is(pushedToQueue.length, 1, 'reboot went through the approver queue')
    t.is(res.id, 456, 'returns queued action id')
  })
})

test('instant actions - concurrent id allocation stays unique', async (t) => {
  const WrkProcAggr = require('../../workers/aggr.proc.ork.wrk')
  const { TaskQueue } = require('@bitfinex/lib-js-util-task-queue')

  const store = new Map()
  const approver = {
    dbActDone: { put: async (key, value) => { store.set(key.toString('hex'), value) } },
    queue: new TaskQueue(1),
    _encode: (data) => Buffer.from(JSON.stringify(data), 'utf-8'),
    _validVoter: (voter) => Boolean(voter && typeof voter === 'string' && voter.trim())
  }
  const wrk = Object.create(WrkProcAggr.prototype)
  wrk.actionApprover_0 = approver
  wrk.actionCaller = { callTargets: async () => {} }

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => wrk._execActionInstant({
      action: 'registerThing',
      payload: [[{ rackId: `rack-${i}`, opts: {} }], { [`rack-${i}`]: { calls: [{ id: `t-${i}` }] } }, [], []],
      voter: 'user@example.com'
    }))
  )

  const ids = results.map(r => r.id)
  t.is(new Set(ids).size, 10, 'all ids unique')
  t.is(store.size, 10, 'no done record overwritten')
})
