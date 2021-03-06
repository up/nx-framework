'use strict'

const compiler = require('@risingstack/nx-compile')
const exposed = require('../core/symbols')

const limiterRegex = /(?:[^\&]|\&\&)+/g
const argsRegex = /\S+/g

module.exports = function code (node, state) {
  node.$using('code')
  node.$compileCode = $compileCode
}

function $compileCode (rawCode) {
  if (typeof rawCode !== 'string') {
    throw new TypeError('first argument must be a string')
  }
  const code = parseCode(this, rawCode)
  const contextState = this[exposed.contextState]
  const context = {}

  return function evaluateCode (expando) {
    const backup = createBackup(contextState, expando)
    let i = 0
    function next () {
      try {
        Object.assign(contextState, expando)
        Object.assign(context, expando)
        if (i < code.limiters.length) {
          const limiter = code.limiters[i++]
          const args = limiter.argExpressions.map(evaluateArgExpression)
          limiter.effect(next, context, ...args)
        } else {
          code.exec()
        }
      } finally {
        Object.assign(contextState, backup)
        Object.assign(context, backup)
      }
    }
    next()
  }
}

function parseCode (node, rawCode) {
  const tokens = rawCode.match(limiterRegex)
  const code = {
    exec: compiler.compileCode(tokens.shift(), node[exposed.contextState]),
    limiters: []
  }

  for (let limiterToken of tokens) {
    limiterToken = limiterToken.match(argsRegex) || []
    const limiterName = limiterToken.shift()
    if (!node[exposed.limiters] || !node[exposed.limiters].has(limiterName)) {
      throw new Error(`there is no limiter named ${limiterName} on ${node}`)
    }
    const effect = node[exposed.limiters].get(limiterName)
    const argExpressions = limiterToken.map(compileArgExpression, node)
    code.limiters.push({effect, argExpressions})
  }
  return code
}

function evaluateArgExpression (argExpression) {
  return argExpression()
}

function compileArgExpression (argExpression) {
  return compiler.compileExpression(argExpression, this[exposed.contextState])
}

function createBackup (state, expando) {
  if (!expando) return undefined

  const backup = {}
  for (let key in expando) {
    backup[key] = state[key]
  }
  return backup
}
