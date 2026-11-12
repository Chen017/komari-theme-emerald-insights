// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { RpcClient } from '../../src/utils/rpc'

function fakeWebSocket(t: TestContext) {
  const sockets: FakeWebSocket[] = []
  const originalWebSocket = globalThis.WebSocket

  class FakeWebSocket {
    static OPEN = 1
    static CLOSED = 3
    readyState = 0
    sent: { id: number, method: string }[] = []
    onopen: (() => void) | null = null
    onclose: ((event: { code: number, reason: string }) => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null

    constructor() {
      sockets.push(this)
    }

    open() {
      this.readyState = FakeWebSocket.OPEN
      this.onopen?.()
    }

    send(data: string) {
      this.sent.push(JSON.parse(data))
    }

    respond(id: number, result: string) {
      this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) })
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED
      this.onclose?.({ code: 1000, reason: '' })
    }
  }

  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
  const client = new RpcClient({ useWebSocket: true, timeout: 1_000 })
  t.after(() => {
    client.close()
    globalThis.WebSocket = originalWebSocket
  })
  return { client, sockets }
}

it('does not open a WebSocket for an already aborted RPC call', async (t) => {
  const { client, sockets } = fakeWebSocket(t)
  const reason = new Error('range changed')
  await assert.rejects(client.call('getMetrics', undefined, { signal: AbortSignal.abort(reason) }), error => error === reason)
  assert.equal(sockets.length, 0)
})

it('aborts one caller waiting on a shared connection without sending its request', async (t) => {
  const { client, sockets } = fakeWebSocket(t)
  const controller = new AbortController()
  const abandoned = client.call('getMetrics', undefined, { signal: controller.signal })
  const remaining = client.call('rpc.ping')
  controller.abort()
  await assert.rejects(abandoned, { name: 'AbortError' })

  assert.equal(sockets.length, 1)
  const socket = sockets[0]!
  socket.open()
  await setImmediate()
  assert.deepEqual(socket.sent.map(request => request.method), ['rpc.ping'])
  socket.respond(socket.sent[0]!.id, 'pong')
  assert.equal(await remaining, 'pong')
})

it('aborts a sent request and ignores its late response on a shared WebSocket', async (t) => {
  const { client, sockets } = fakeWebSocket(t)
  const controller = new AbortController()
  const abandoned = client.call('getMetrics', undefined, { signal: controller.signal })
  const remaining = client.call('rpc.ping')
  const socket = sockets[0]!
  socket.open()
  await setImmediate()
  assert.deepEqual(socket.sent.map(request => request.method), ['getMetrics', 'rpc.ping'])

  controller.abort('node changed')
  await assert.rejects(abandoned, { name: 'AbortError' })
  socket.respond(socket.sent[0]!.id, 'stale')
  socket.respond(socket.sent[1]!.id, 'pong')
  assert.equal(await remaining, 'pong')
  assert.equal(socket.readyState, WebSocket.OPEN)
})
