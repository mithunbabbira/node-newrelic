/*
 * Copyright 2024 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// Based upon https://github.com/open-telemetry/opentelemetry-js/blob/8fc76896595aac912bf9e15d4f19c167317844c8/packages/opentelemetry-sdk-trace-base/test/common/Span.test.ts#L851

const test = require('node:test')
const assert = require('node:assert')

const { ROOT_CONTEXT, SpanKind } = require('@opentelemetry/api')
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base')
const { RulesEngine } = require('#agentlib/otel/traces/rules.js')

const tracer = new BasicTracerProvider().getTracer('default')

test('engine returns correct matching rule', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.SERVER }, ROOT_CONTEXT)
  span.setAttribute('http.request.method', 'GET')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'OtelHttpServer1_23')
})

test('consumer does not match fallback rule', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CONSUMER }, ROOT_CONTEXT)
  span.setAttribute('messaging.operation', 'create')
  span.setAttribute('messaging.system', 'rabbitmq')
  span.setAttribute('messaging.destination.name', 'test-queue')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'OtelMessagingConsumer1_24')
})

test('consumer matches fallback rule', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CONSUMER }, ROOT_CONTEXT)
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackConsumer')
})

test('fallback server rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.SERVER }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackServer')
})

test('fallback client rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackClient')
})

test('fallback producer rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.PRODUCER }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'FallbackProducer')
})

test('fallback internal rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.INTERNAL }, ROOT_CONTEXT)
  span.setAttribute('foo.bar', 'baz')
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'Fallback')
})

test('scope_name rule is met', () => {
  const engine = new RulesEngine()
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system.name', 'postgresql')
  span.instrumentationScope = { name: 'prisma' }
  span.end()

  const rule = engine.test(span)
  assert.notEqual(rule, undefined)
  assert.equal(rule.name, 'OtelDbClientPrisma1_40')
})

test('scope_version matching rule is met', () => {
  const rule = {
    name: 'test-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      scope_version: '^1.0.0'
    },
    attributes: [{
      key: 'db.system',
      target: 'segment',
      name: 'product'
    }]
  }
  const engine = new RulesEngine({ rules: [rule] })
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'test-db')
  span.instrumentationScope = { version: '1.2.3' }
  span.end()

  const foundRule = engine.test(span)
  assert.notEqual(foundRule, undefined)
  assert.equal(foundRule.name, rule.name)
})

test('scope_version does not satisfy', () => {
  const rule = {
    name: 'test-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      scope_version: '^1.0.0'
    },
    attributes: [{
      key: 'db.system',
      target: 'segment',
      name: 'product'
    }]
  }
  const engine = new RulesEngine({ rules: [rule] })
  const span = tracer.startSpan('test-span', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span.setAttribute('db.system', 'test-db')
  span.instrumentationScope = { version: '2.0.0' }
  span.end()

  const foundRule = engine.test(span)
  assert.equal(foundRule, undefined)
})

test('attribute_conditions canonicalization object matches expected values', () => {
  const rule = {
    name: 'test-sqlite-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      attribute_conditions: {
        'db.system': {
          expected: ['better-sqlite3', 'node:sqlite', 'sqlite3'],
          value: 'sqlite'
        }
      }
    },
    attributes: [{
      key: 'db.system',
      target: 'segment',
      name: 'product'
    }]
  }
  const engine = new RulesEngine({ rules: [rule] })

  // Each variant should match
  const span1 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span1.setAttribute('db.system', 'better-sqlite3')
  span1.end()
  assert.equal(engine.test(span1).name, 'test-sqlite-rule')

  const span2 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span2.setAttribute('db.system', 'node:sqlite')
  span2.end()
  assert.equal(engine.test(span2).name, 'test-sqlite-rule')

  const span3 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span3.setAttribute('db.system', 'sqlite3')
  span3.end()
  assert.equal(engine.test(span3).name, 'test-sqlite-rule')

  // Non-matching value should not match
  const span4 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span4.setAttribute('db.system', 'postgresql')
  span4.end()
  assert.equal(engine.test(span4), undefined)
})

test('getCanonicalAttributeValue returns canonical value for matching input', () => {
  const rule = {
    name: 'test-sqlite-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      attribute_conditions: {
        'db.system': {
          expected: ['better-sqlite3', 'node:sqlite', 'sqlite3'],
          value: 'sqlite'
        }
      }
    },
    attributes: []
  }
  const engine = new RulesEngine({ rules: [rule] })
  const ruleInstance = engine.test(
    tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  )

  assert.equal(ruleInstance.getCanonicalAttributeValue('db.system', 'better-sqlite3'), 'sqlite')
  assert.equal(ruleInstance.getCanonicalAttributeValue('db.system', 'node:sqlite'), 'sqlite')
  assert.equal(ruleInstance.getCanonicalAttributeValue('db.system', 'sqlite3'), 'sqlite')
  // Non-matching: returns original
  assert.equal(ruleInstance.getCanonicalAttributeValue('db.system', 'postgresql'), 'postgresql')
  // Non-matching key: returns original
  assert.equal(ruleInstance.getCanonicalAttributeValue('messaging.system', 'rabbitmq'), 'rabbitmq')
})

test('attribute_conditions supports array format (backwards compatible)', () => {
  const rule = {
    name: 'test-array-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      attribute_conditions: {
        'db.system': ['redis', 'memcached']
      }
    },
    attributes: []
  }
  const engine = new RulesEngine({ rules: [rule] })

  const span1 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span1.setAttribute('db.system', 'redis')
  span1.end()
  assert.equal(engine.test(span1).name, 'test-array-rule')

  const span2 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span2.setAttribute('db.system', 'memcached')
  span2.end()
  assert.equal(engine.test(span2).name, 'test-array-rule')

  const span3 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span3.setAttribute('db.system', 'postgresql')
  span3.end()
  assert.equal(engine.test(span3), undefined)
})

test('attribute_conditions supports scalar format (backwards compatible)', () => {
  const rule = {
    name: 'test-scalar-rule',
    type: 'db',
    matcher: {
      required_span_kinds: ['client'],
      required_attribute_keys: ['db.system'],
      attribute_conditions: {
        'db.system': 'mongodb'
      }
    },
    attributes: []
  }
  const engine = new RulesEngine({ rules: [rule] })

  const span1 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span1.setAttribute('db.system', 'mongodb')
  span1.end()
  assert.equal(engine.test(span1).name, 'test-scalar-rule')

  const span2 = tracer.startSpan('test', { kind: SpanKind.CLIENT }, ROOT_CONTEXT)
  span2.setAttribute('db.system', 'mongo')
  span2.end()
  assert.equal(engine.test(span2), undefined)
})
